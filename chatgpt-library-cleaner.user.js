// ==UserScript==
// @name         ChatGPT Library fast cleaner
// @namespace    local.chatgpt.library.cleaner
// @version      0.2.2
// @description  Move owned Library files to Trash using ChatGPT's batch endpoint.
// @match        https://chatgpt.com/library*
// @sandbox      JavaScript
// @grant        GM_info
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  if (window.__chatgptLibraryCleaner) return;
  window.__chatgptLibraryCleaner = true;

  const queryOptions = {
    include_hidden_files: 'true',
    include_files: 'true',
    include_saved_entities: 'true',
    include_sites: 'false',
    include_folder_counts: 'true',
    include_onedrive: 'true',
    hydrate_folder_thumbnails: 'true',
  };
  const batchSize = 20; // 40 was rejected (HTTP 422); 20 succeeded.
  const workers = 3;    // Three simultaneous batches succeeded in live testing.
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let running = false;
  let stopped = false;
  let moved = 0;

  const panel = document.createElement('div');
  panel.id = 'chatgpt-library-cleaner';
  panel.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;width:310px;padding:14px;border:1px solid #777;border-radius:12px;background:#202020;color:white;font:14px system-ui;box-shadow:0 8px 30px #0008';
  panel.innerHTML = '<strong>Library fast cleaner</strong><div id="cglc-status" style="margin:8px 0">Ready</div><button id="cglc-start" style="padding:6px 10px;margin-right:8px;cursor:pointer">Scan and delete all files</button><button id="cglc-stop" style="padding:6px 10px;cursor:pointer" disabled>Stop</button>';
  document.body.append(panel);
  const start = panel.querySelector('#cglc-start');
  const stop = panel.querySelector('#cglc-stop');
  const status = panel.querySelector('#cglc-status');
  const say = message => { status.textContent = message; console.info('[Library cleaner]', message); };

  async function getAuth() {
    const response = await fetch('/api/auth/session', { credentials: 'include' });
    if (!response.ok) throw new Error(`Session request failed (HTTP ${response.status}).`);
    const auth = await response.json();
    if (!auth.accessToken || !auth.account?.id) throw new Error('Sign in to ChatGPT and reload.');
    return auth;
  }

  function headers(auth, json = false) {
    return {
      Authorization: `Bearer ${auth.accessToken}`,
      'ChatGPT-Account-Id': auth.account.id,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async function scan(auth) {
    const found = new Map();
    const cursors = new Set();
    let cursor = null;
    for (let page = 1; page <= 500; page++) {
      if (stopped) throw new Error('Stopped during scan.');
      const query = new URLSearchParams(queryOptions);
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/backend-api/files/library/nodes?${query}`, {
        credentials: 'include', headers: headers(auth),
      });
      if (!response.ok) throw new Error(`Library scan failed (HTTP ${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Unexpected Library list response.');
      for (const item of data.items) {
        if (item.kind === 'file' && item.access_kind === 'owned' && item.id && !item.trashed_at) {
          found.set(item.id, item);
        }
      }
      say(`Scanning page ${page}: ${found.size} owned files found…`);
      cursor = data.cursor || null;
      if (!cursor) return [...found.values()];
      if (cursors.has(cursor)) throw new Error('Library returned a repeated page cursor.');
      cursors.add(cursor);
    }
    throw new Error('Stopped at the 500-page scan limit.');
  }

  async function deleteBatch(auth, batch) {
    const files = batch.map(item => ({
      library_file_id: item.id,
      file_id: item.file_id,
      parent_directory_id: item.parent_directory_id,
      file_name: item.name,
    }));
    for (let attempt = 0; attempt < 5; attempt++) {
      let response;
      try {
        response = await fetch('/backend-api/files/library/files/delete-batch', {
          method: 'POST', credentials: 'include', headers: headers(auth, true),
          body: JSON.stringify({ files }),
        });
      } catch (error) {
        if (attempt === 4) throw error;
        await sleep(800 * 2 ** attempt);
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 4) throw new Error(`Delete request failed (HTTP ${response.status}).`);
        const seconds = Number(response.headers.get('Retry-After'));
        await sleep(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 800 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Delete request failed (HTTP ${response.status}).`);
      const result = await response.json();
      if (!Array.isArray(result.files)) throw new Error('Unexpected delete response.');
      return result.files.filter(item => item.success === true).length;
    }
  }

  async function deleteAll(auth, files) {
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) batches.push(files.slice(i, i + batchSize));
    let next = 0;
    let failedBatches = 0;
    const worker = async () => {
      while (!stopped && next < batches.length) {
        const batch = batches[next++];
        try {
          const count = await deleteBatch(auth, batch);
          moved += count;
          if (count < batch.length) failedBatches++;
        }
        catch (error) {
          failedBatches++;
          console.error('[Library cleaner] Batch failed:', error);
        }
        say(`${moved} moved to Trash; ${next}/${batches.length} batches started, ${failedBatches} failed.`);
      }
    };
    await Promise.all(Array.from({ length: workers }, worker));
    return failedBatches;
  }

  async function run() {
    if (location.pathname !== '/library') throw new Error('Open ChatGPT Library first.');
    const auth = await getAuth();
    let files = await scan(auth);
    if (!files.length) { say('No owned Library files remain.'); return; }
    const gigabytes = (files.reduce((sum, item) => sum + (item.file_size_bytes || 0), 0) / 1024 ** 3).toFixed(2);
    if (!window.confirm(`Move ${files.length} owned Library files (about ${gigabytes} GB) to Trash? Folders and connected files are skipped.`)) {
      say('Canceled before deletion.');
      return;
    }
    for (let pass = 1; pass <= 3 && files.length && !stopped; pass++) {
      say(`Pass ${pass}: deleting ${files.length} files…`);
      await deleteAll(auth, files);
      if (stopped) break;
      const remaining = await scan(auth);
      if (remaining.length >= files.length) {
        say(`Stopped: ${remaining.length} files remain; no progress on pass ${pass}.`);
        return;
      }
      files = remaining;
    }
    say(stopped
      ? `Stopped: ${moved} moved to Trash. In-flight batches may have finished.`
      : files.length
        ? `Finished with ${files.length} files remaining; ${moved} moved to Trash.`
        : `Finished: ${moved} moved to Trash. Reload Library to see the empty list.`);
  }

  start.addEventListener('click', async () => {
    if (running) return;
    running = true;
    stopped = false;
    moved = 0;
    start.disabled = true;
    stop.disabled = false;
    try { await run(); }
    catch (error) { say(`${error.message} ${moved} moved to Trash.`); console.error('[Library cleaner]', error); }
    finally { running = false; start.disabled = false; stop.disabled = true; }
  });
  stop.addEventListener('click', () => {
    stopped = true;
    say(`Stopping after in-flight batches. ${moved} moved to Trash.`);
  });
})();
