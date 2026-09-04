# Code Nest 🪺

**Code Nest** is a local-first browser notebook inspired by modern coding workspaces.

## ✨ Current release

The UI is designed like a small premium developer app while staying deployable on GitHub Pages.

- 🐍 Python cells with Pyodide
- 📝 Markdown cells with live preview
- 🖥️ Browser Terminal / Bash-like shell
- ▶ Run one cell or run every Python cell
- 💾 Automatic local saving
- 🌙 Light / dark theme
- ⌘K command palette
- ⇧Enter / ⌘Enter run shortcuts
- ⇩ Export the notebook as JSON
- 📱 Responsive mobile layout
- 🧩 Local browser filesystem for Terminal cells

## Terminal note

The Terminal in the current GitHub Pages build is a **browser-only Bash-like mini shell**, not a real Linux process. It provides a safe simulated filesystem and useful shell-style commands without requiring a server.

Supported commands include `help`, `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo`, `rm`, `clear`, `uname`, `whoami`, `date`, and `python`.

## Python runtime

Python execution is performed locally in the browser with Pyodide. The first Python run may take a little longer because the runtime is downloaded into the browser.

## Deploy

This project is designed for GitHub Pages using **main / (root)**.

Repository: https://github.com/maru-m4ru-maru/code-nest
