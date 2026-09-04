# Code Nest 🪺

A tiny browser-based notebook inspired by Google Colab.

## v0.1.1

- Code / Markdown / Terminal cells
- Run Python in the browser with Pyodide
- Bash-like terminal commands in the browser
- Run all Python cells
- Move and delete cells
- Light / dark mode
- LocalStorage autosave
- GitHub Pages friendly — no server required for the first version

### Terminal commands

The Terminal cell includes a small browser-only shell with `help`, `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo`, `rm`, `clear`, `uname`, `whoami`, `date`, and `python`.

This is **Bash-like**, not a real host Linux shell. Its files live in the browser's local storage, and it cannot access your computer's real filesystem or run arbitrary native programs.

## GitHub Pages

Repository: https://github.com/maru-m4ru-maru/code-nest

Enable Settings → Pages → Deploy from a branch → main → / (root).

Python execution happens locally in the browser in v0.1.1; code is not sent to a Code Nest server.