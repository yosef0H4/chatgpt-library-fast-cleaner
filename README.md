# ChatGPT Library Fast Cleaner

A Tampermonkey script that moves your own ChatGPT Library files to Trash in batches of 20. It skips folders and connected files.

## Install and run

1. Create a new Tampermonkey script and replace its contents with [chatgpt-library-cleaner.user.js](chatgpt-library-cleaner.user.js).
2. Open [ChatGPT Library](https://chatgpt.com/library?tab=all&storage_cleanup=true) and reload the page.
3. Click **Scan and delete all files**, review the count, and confirm.

Three requests run at once. **Stop** prevents new batches, but requests already in flight may finish.

The script uses an undocumented ChatGPT API, which may change. It does not empty Trash.

No account token is bundled with the script. It reads your session when you run it and sends requests only to ChatGPT.

## License

MIT
