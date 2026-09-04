# Code Nest 🪺

**Code Nest** is a local-first browser notebook inspired by modern coding workspaces.

## ✨ Current release

The UI is designed like a small premium developer app while staying deployable on GitHub Pages.

- 🐍 Python cells with Pyodide
- 📝 Markdown cells with live preview
- 🖥️ Browser Terminal / Bash-like shell
- ⌁ Interactive Bash Console with command history and tab completion
- ▶ Run one cell or run every Python cell
- 💾 Automatic local saving
- 🌙 Light / dark theme
- 🔎 Command search
- ⇩ Export the notebook as JSON
- 📱 Responsive mobile layout
- 🧩 Local browser filesystem for Terminal cells

## Bash Console note

The Bash Console in the current GitHub Pages build is a **browser-only Bash-like shell**, not a real Linux process. It shares the browser filesystem with Terminal cells and provides common shell commands without requiring a server.

Supported commands include `help`, `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo`, `rm`, `clear`, `uname`, `whoami`, `date`, and `python`.

Use **↑ / ↓** to move through command history, **Tab** for basic completion, and **Ctrl+L** to clear the console.

For a future real Linux Bash environment, Code Nest would need a server/container runtime. WebContainers are another browser-based option for Node.js and shell-like workloads, but they require cross-origin isolation headers such as COOP/COEP. See the WebContainers docs for deployment requirements.

## Python runtime

Python execution is performed locally in the browser with Pyodide. The first Python run may take a little longer because the runtime is downloaded into the browser.

## Deploy

This project is designed for GitHub Pages using **main / (root)**.

Repository: https://github.com/maru-m4ru-maru/code-nest
