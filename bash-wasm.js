(() => {
  "use strict";

  /*
   * Code Nest Bash Console
   * Browser shell + Pyodide bridge.
   *
   * This is intentionally a sandboxed browser terminal. It never executes
   * commands on the user's real OS.
   */

  const state = {
    ready: false,
    loading: false,
    terminal: null,
    terminalPromise: null,
    history: [],
    historyIndex: -1,
    running: false,
    currentAbort: null,
    session: {
      cwd: "/",
      files: new Map([
        ["/README.txt", "Code Nest browser filesystem\\n"],
      ]),
      dirs: new Set(["/"]),
    },
  };

  const output = () => document.getElementById("bashOutput");
  const input = () => document.getElementById("bashInput");
  const modal = () => document.getElementById("bashModal");
  const prompt = () => document.getElementById("bashPrompt");

  const setPrompt = () => {
    const el = prompt();
    if (el) el.textContent = "coder@code-nest:" + state.session.cwd + " $";
  };

  function print(text, cls = "") {
    const root = output();
    if (!root) return;
    const line = document.createElement("div");
    line.className = "bash-line " + cls;
    line.textContent = String(text);
    root.appendChild(line);
    root.scrollTop = root.scrollHeight;
  }

  function clear() {
    const root = output();
    if (root) root.textContent = "";
  }

  function openConsole() {
    const m = modal();
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    setPrompt();
    setTimeout(() => input()?.focus(), 20);
  }

  function closeConsole() {
    const m = modal();
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  }

  function normalize(path) {
    path = String(path || ".");
    const raw = path.startsWith("/")
      ? path
      : state.session.cwd.replace(/\/$/, "") + "/" + path;
    const parts = [];
    for (const part of raw.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return "/" + parts.join("/");
  }

  function parentOf(path) {
    const n = normalize(path);
    if (n === "/") return "/";
    const i = n.lastIndexOf("/");
    return i <= 0 ? "/" : n.slice(0, i);
  }

  function baseName(path) {
    const n = normalize(path);
    return n === "/" ? "/" : n.slice(n.lastIndexOf("/") + 1);
  }

  function ensureDir(path) {
    const n = normalize(path);
    const parts = n.split("/").filter(Boolean);
    let cur = "";
    state.session.dirs.add("/");
    for (const p of parts) {
      cur += "/" + p;
      state.session.dirs.add(cur);
    }
    return n;
  }

  function isDir(path) {
    return state.session.dirs.has(normalize(path));
  }

  function isFile(path) {
    return state.session.files.has(normalize(path));
  }

  function listNames(path = state.session.cwd) {
    const dir = normalize(path).replace(/\/$/, "") || "/";
    const prefix = dir === "/" ? "/" : dir + "/";
    const names = new Set();

    for (const d of state.session.dirs) {
      if (!d.startsWith(prefix) || d === dir) continue;
      const rest = d.slice(prefix.length);
      if (rest && !rest.includes("/")) names.add(rest + "/");
    }
    for (const f of state.session.files.keys()) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      if (rest && !rest.includes("/")) names.add(rest);
    }
    return [...names].sort();
  }

  function removePath(path, recursive = false) {
    const n = normalize(path);
    if (n === "/") throw new Error("rm: cannot remove root");

    if (isFile(n)) {
      state.session.files.delete(n);
      return;
    }

    if (isDir(n)) {
      const children = [
        ...[...state.session.files.keys()].filter(x => x === n || x.startsWith(n + "/")),
        ...[...state.session.dirs].filter(x => x !== n && x.startsWith(n + "/")),
      ];
      if (children.length && !recursive) {
        throw new Error("rm: " + path + ": Directory not empty");
      }
      for (const f of [...state.session.files.keys()]) {
        if (f === n || f.startsWith(n + "/")) state.session.files.delete(f);
      }
      for (const d of [...state.session.dirs]) {
        if (d === n || d.startsWith(n + "/")) state.session.dirs.delete(d);
      }
      return;
    }

    throw new Error("rm: " + path + ": No such file or directory");
  }

  function copyPath(src, dest) {
    const s = normalize(src);
    let d = normalize(dest);

    if (isFile(s)) {
      if (isDir(d)) d = normalize(d + "/" + baseName(s));
      ensureDir(parentOf(d));
      state.session.files.set(d, state.session.files.get(s));
      return;
    }

    if (isDir(s)) {
      if (isDir(d)) d = normalize(d + "/" + baseName(s));
      ensureDir(d);
      for (const [path, value] of state.session.files) {
        if (path.startsWith(s + "/")) {
          const suffix = path.slice(s.length);
          ensureDir(parentOf(d + suffix));
          state.session.files.set(d + suffix, value);
        }
      }
      for (const dir of [...state.session.dirs]) {
        if (dir.startsWith(s + "/")) ensureDir(d + dir.slice(s.length));
      }
      return;
    }

    throw new Error("cp: " + src + ": No such file or directory");
  }

  function movePath(src, dest) {
    const s = normalize(src);
    const d0 = normalize(dest);
    let d = d0;

    if (isFile(s)) {
      if (isDir(d)) d = normalize(d + "/" + baseName(s));
      ensureDir(parentOf(d));
      state.session.files.set(d, state.session.files.get(s));
      state.session.files.delete(s);
      return;
    }

    if (isDir(s)) {
      if (isDir(d)) d = normalize(d + "/" + baseName(s));
      copyPath(s, d);
      removePath(s, true);
      return;
    }

    throw new Error("mv: " + src + ": No such file or directory");
  }

  function tokenize(command) {
    const out = [];
    const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\\S+)/g;
    let m;
    while ((m = re.exec(command))) {
      out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
    }
    return out;
  }

  function splitRedirection(command) {
    let quote = null;
    for (let i = 0; i < command.length; i++) {
      const ch = command[i];
      if ((ch === "'" || ch === '"')) {
        quote = quote === ch ? null : quote || ch;
        continue;
      }
      if (!quote && (command.slice(i, i + 2) === ">>" || ch === ">")) {
        const append = command.slice(i, i + 2) === ">>";
        return {
          command: command.slice(0, i).trim(),
          target: command.slice(i + (append ? 2 : 1)).trim(),
          append,
        };
      }
    }
    return { command: command.trim(), target: null, append: false };
  }

  async function loadRuntime() {
    if (state.ready) return state.terminal;
    if (state.loading) return state.terminalPromise;

    state.loading = true;
    state.terminalPromise = (async () => {
      if (
        window.CodeNestBashRuntime &&
        typeof window.CodeNestBashRuntime.create === "function"
      ) {
        state.terminal = await window.CodeNestBashRuntime.create();
      } else {
        state.terminal = new BrowserShell();
      }
      state.ready = true;
      state.loading = false;
      return state.terminal;
    })().catch(error => {
      state.loading = false;
      throw error;
    });

    return state.terminalPromise;
  }

  async function runPython(source, filename = "<exec>") {
    const pyodide = globalThis.__codeNestPyodide;
    if (!pyodide || typeof pyodide.runPythonAsync !== "function") {
      throw new Error("Python runtime is not ready. Run a Python command after Pyodide finishes loading.");
    }

    const wrapped = [
      "import sys, io, contextlib",
      "_cn_out = io.StringIO()",
      "try:",
      "    with contextlib.redirect_stdout(_cn_out), contextlib.redirect_stderr(_cn_out):",
      "        exec(compile(" + JSON.stringify(String(source)) + ", " + JSON.stringify(filename) + ", " + JSON.stringify("exec") + "), globals())",
      "except SystemExit as _cn_e:",
      "    _cn_out.write(str(_cn_e))",
      "except BaseException as _cn_e:",
      "    import traceback",
      "    traceback.print_exc(file=_cn_out)",
      "_cn_result = _cn_out.getvalue()",
      "_cn_result",
    ].join("\\n");

    const result = await pyodide.runPythonAsync(wrapped);
    return String(result ?? "");
  }

  class BrowserShell {
    async exec(command) {
      const parsed = splitRedirection(command);
      const tokens = tokenize(parsed.command);
      const cmd = tokens.shift() || "";
      const args = tokens;

      if (!cmd) return "";

      switch (cmd) {
        case "echo":
          return args.join(" ");

        case "printf":
          return args.join(" ");

        case "pwd":
          return state.session.cwd;

        case "whoami":
          return "coder";

        case "uname":
          return "Code Nest WASM browser environment";

        case "ls": {
          const target = args.find(x => !x.startsWith("-")) || state.session.cwd;
          return listNames(target).join("  ");
        }

          case "cd": {
          const next = normalize(args[0] || "/");
          if (!isDir(next)) throw new Error("cd: " + (args[0] || "/") + ": No such file or directory");
          state.session.cwd = next;
          this.persist();
          setPrompt();
          return "";
        }

        case "cat": {
          if (!args.length) throw new Error("cat: missing operand");
          return args.map(name => {
            const key = normalize(name);
            if (!isFile(key)) throw new Error("cat: " + name + ": No such file or directory");
            return state.session.files.get(key);
          }).join("");
        }

        case "touch":
          if (!args.length) throw new Error("touch: missing file operand");
          for (const name of args.filter(x => !x.startsWith("-"))) {
            ensureDir(parentOf(name));
            if (!isFile(name)) state.session.files.set(normalize(name), "");
          }
          this.persist();
          return "";

        case "mkdir": {
          const recursive = args.includes("-p");
          const names = args.filter(x => !x.startsWith("-"));
          if (!names.length) throw new Error("mkdir: missing operand");
          for (const name of names) {
            const n = normalize(name);
            if (!recursive && !isDir(parentOf(n))) {
              throw new Error("mkdir: cannot create directory '" + name + "': No such file or directory");
            }
            ensureDir(n);
          }
          this.persist();
          return "";
        }

        case "rm": {
          const recursive = args.includes("-r") || args.includes("-R") || args.includes("-rf");
          const names = args.filter(x => !x.startsWith("-"));
          if (!names.length) throw new Error("rm: missing operand");
          for (const name of names) removePath(name, recursive);
          this.persist();
          return "";
        }

        case "cp": {
          if (args.length < 2) throw new Error("cp: missing destination file operand");
          copyPath(args[0], args[1]);
          this.persist();
          return "";
        }

        case "mv": {
          if (args.length < 2) throw new Error("mv: missing destination file operand");
          movePath(args[0], args[1]);
          this.persist();
          return "";
        }

        case "clear":
        case "cls":
          clear();
          return "";

        case "python":
        case "python3":
        case "py": {
          if (!args.length) {
            return "Python is provided by Pyodide. Run Python code directly in a .py file or use: python -c \"print(123)\"";
          }

          if (args[0] === "-m" && args[1] === "pip") {
            const pipArgs = args.slice(2);
            if (typeof window.codeNestPipInstall !== "function") {
              throw new Error("pip bridge is not ready. Reload Code Nest and try again.");
            }
            if (pipArgs[0] === "install") return await window.codeNestPipInstall(pipArgs.slice(1));
            if (pipArgs[0] === "list") return await runPython("import importlib.metadata\nfor d in sorted(importlib.metadata.distributions(), key=lambda x: x.metadata.get('Name','').lower()):\n print(f\"{d.metadata.get('Name','')} {d.version}\")");
            throw new Error("python -m pip: unsupported command '" + (pipArgs[0] || "") + "'");
          }

          if (args[0] === "-c") {
            const code = args.slice(1).join(" ");
            if (!code) throw new Error("python: option -c requires an argument");
            return await runPython(code, "<string>");
          }

          const file = normalize(args[0]);
          if (!isFile(file)) throw new Error(cmd + ": can't open file '" + args[0] + "': No such file or directory");
          return await runPython(state.session.files.get(file), file);
        }

        case "pip": {
          if (!args.length) return "Usage: pip install <package>";
          if (args[0] === "install") {
            if (typeof window.codeNestPipInstall !== "function") {
              throw new Error("pip bridge is not ready. Reload Code Nest and try again.");
            }
            return await window.codeNestPipInstall(args.slice(1));
          }
          if (args[0] === "list") {
            const pyodide = globalThis.__codeNestPyodide;
            if (!pyodide) throw new Error("Python runtime is not ready.");
            return await runPython("import importlib.metadata\\nfor d in sorted(importlib.metadata.distributions(), key=lambda x: x.metadata.get('Name','').lower()):\\n    print(f\\"{d.metadata.get('Name','')} {d.version}\\")");
          }
          if (args[0] === "show" && args[1]) {
            return await runPython("import importlib.metadata\\ntry:\\n print(importlib.metadata.version(" + JSON.stringify(args[1]) + "))\\nexcept importlib.metadata.PackageNotFoundError:\\n print('WARNING: Package not found')");
          }
          throw new Error("pip: unsupported command '" + args[0] + "'");
        }

        case "npm":
          if (args[0] === "install" || args[0] === "i") {
            throw new Error("npm install is not available in the browser sandbox. Use Python/pip for Python packages.");
          }
          return "npm: browser package manager is not installed";

        case "help":
          return [
            "Code Nest Bash Console",
            "",
            "Shell: cd, pwd, ls, cat, echo, printf, touch, mkdir, rm, cp, mv, clear, cls",
            "Python: python, python3, py, python -c",
            "Packages: pip install, pip list, pip show",
            "History: ↑ / ↓",
            "Cancel: Ctrl+C (best effort)",
          ].join("\\n");

        default:
          throw new Error(cmd + ": command not found");
      }
    }
  }

  async function runCommand(command) {
    const raw = String(command || "").trim();
    if (!raw) return;

    print("coder@code-nest:" + state.session.cwd + " $ " + raw, "bash-command");

    state.history = state.history.filter(x => x !== raw);
    state.history.unshift(raw);
    state.history = state.history.slice(0, 100);
    state.historyIndex = -1;

    const redir = splitRedirection(raw);
    state.running = true;
    state.currentAbort = { cancelled: false };

    try {
      const shell = await loadRuntime();
      let result;

      if (shell && typeof shell.exec === "function") {
        result = await shell.exec(redir.command);
      }

      if (redir.target) {
        const target = normalize(redir.target.replace(/^["']|["']$/g, ""));
        ensureDir(parentOf(target));
        const old = state.session.files.get(target) || "";
        state.session.files.set(target, redir.append ? old + String(result || "") : String(result || ""));
        if (result) print(result);
      } else if (result) {
        print(result);
      }
    } catch (error) {
      if (state.currentAbort?.cancelled) {
        print("^C", "bash-error");
      } else {
        print(String(error?.message || error), "bash-error");
      }
    } finally {
      state.running = false;
      state.currentAbort = null;
      setPrompt();
    }
  }

  function cancelCurrentCommand() {
    if (!state.running) return;
    if (state.currentAbort) state.currentAbort.cancelled = true;

    // Pyodide can be interrupted through its interrupt buffer when the page
    // is cross-origin isolated. We cannot manufacture the buffer safely here,
    // so Ctrl+C is guaranteed to stop Code Nest's command state and is best
    // effort for a currently-running Python computation.
    print("^C", "bash-error");
  }

  function wire() {
    const form = document.getElementById("bashForm");
    const field = input();
    const clearBtn = document.getElementById("bashClearBtn");
    const closeBtn = document.getElementById("bashCloseBtn");

    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const value = field.value;
        field.value = "";
        await runCommand(value);
        field.focus();
      });
    }

    if (field && !field.dataset.bound) {
      field.dataset.bound = "1";
      field.addEventListener("keydown", event => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!state.history.length) return;
          state.historyIndex = Math.min(state.historyIndex + 1, state.history.length - 1);
          field.value = state.history[state.historyIndex];
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          state.historyIndex = Math.max(state.historyIndex - 1, -1);
          field.value = state.historyIndex < 0 ? "" : state.history[state.historyIndex];
        } else if (event.key === "l" && event.ctrlKey) {
          event.preventDefault();
          clear();
        } else if (event.key === "c" && event.ctrlKey) {
          if (field.value) {
            field.value = "";
          } else {
            cancelCurrentCommand();
          }
          event.preventDefault();
        } else if (event.key === "Tab") {
          const value = field.value;
          const parts = value.split(/\\s+/);
          const last = parts[parts.length - 1] || "";
          const candidates = listNames(state.session.cwd).filter(x => x.startsWith(last));
          if (candidates.length === 1) {
            parts[parts.length - 1] = candidates[0];
            field.value = parts.join(" ");
          }
          event.preventDefault();
        }
      });
    }

    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", clear);
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "1";
      closeBtn.addEventListener("click", closeConsole);
    }

    // The main Studio may recreate/replace modal contents. Keep the bridge
    // available for it and avoid duplicate listeners through dataset.bound.
    setPrompt();
  }

  window.CodeNestBash = {
    init: wire,
    open: openConsole,
    close: closeConsole,
    run: runCommand,
    cancel: cancelCurrentCommand,
    loadRuntime,
    clear,
    getState: () => ({
      cwd: state.session.cwd,
      files: [...state.session.files.keys()],
      dirs: [...state.session.dirs],
      history: [...state.history],
      running: state.running,
    }),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else {
    wire();
  }
})();