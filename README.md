# ChatGPT Library Fast Cleaner

A browser script that moves your ChatGPT Library files to Trash. It skips folders and connected files.

## Install and run

Tampermonkey is a browser extension that runs small scripts on websites.

1. [Install Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Click its browser icon and choose **Create a new script**.
3. Open [the cleaner script](chatgpt-library-cleaner.user.js), click **Raw**, and copy all the code. Replace everything in Tampermonkey's editor with it, then save.
4. Open [ChatGPT Library](https://chatgpt.com/library?tab=all&storage_cleanup=true) and refresh the page. A **Library fast cleaner** box should appear at the bottom right.
5. Click **Scan and delete all files**, check the file count, and confirm.

No box? Check that the script is enabled in Tampermonkey, then refresh the page.

**Stop** prevents new batches, though requests already running may finish. Files go to Trash; the script does not empty it.

The cleaner uses an undocumented ChatGPT API, which may change.

No account token is bundled with the script. It reads your session when you run it and sends requests only to ChatGPT.

## License

MIT
