(() => {
  "use strict";

  // Code Nest Bash bridge.
  // Loads the browser-side WebAssembly shell lazily so the main Studio can boot
  // even when the runtime CDN is unavailable.
  const state = {
    ready: false,
    loading: false,
    terminal: null,
    history: [],
    historyIndex: -1
  };

  const output = () => document.getElementById("bashOutput");
  const input = () => document.getElementById("bashInput");
  const status = (text) => {
    const el = document.getElementById("bashPrompt");
    if (el) el.textContent = text || "coder@code-nest:/ $";
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

  async function loadRuntime() {
    if (state.ready) return state.terminal;
    if (state.loading) return state.terminalPromise;

    state.loading = true;
    state.terminalPromise = (async () => {
      /*
       * WebContainer/Wasmer-style browser runtimes cannot be safely assumed
       * to exist globally. Keep this bridge deliberately small: if a runtime
       * is supplied by a later bundle, Code Nest can attach it through
       * window.CodeNestBashRuntime.
       */
      if (window.CodeNestBashRuntime &&
          typeof window.CodeNestBashRuntime.create === "function") {
        state.terminal = await window.CodeNestBashRuntime.create();
        state.ready = true;
        return state.terminal;
      }

      // No runtime bundle installed yet. Provide a real shell-compatible
      // command layer for the browser filesystem instead of pretending that
      // arbitrary host commands are executable.
      state.terminal = new BrowserShell();
      state.ready = true;
      return state.terminal;
    })();

    return state.terminalPromise;
  }

  class BrowserShell {
    constructor() {
      this.cwd = "/";
      this.files = new Map([
        ["/README.txt", "Code Nest browser filesystem\n"]
      ]);
    }

    normalize(path) {
      const raw = path.startsWith("/")
        ? path
        : this.cwd.replace(/\/$/, "") + "/" + path;
      const parts = [];
      for (const part of raw.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
      }
      return "/" + parts.join("/");
    }

    async exec(command) {
      const tokens = command.trim().split(/\\s+/);
      const cmd = tokens.shift() || "";
      const arg = tokens.join(" ");

      switch (cmd) {
        case "": return "";
        case "echo": return arg;
        case "pwd": return this.cwd;
        case "whoami": return "coder";
        case "uname": return "Code Nest WASM browser environment";
        case "ls": {
          const prefix = this.cwd.replace(/\/$/, "") + "/";
          const names = new Set();
          for (const key of this.files.keys()) {
            if (key.startsWith(prefix)) {
              const rest = key.slice(prefix.length);
              if (rest && !rest.includes("/")) names.add(rest);
            }
          }
          return [...names].sort().join("  ");
        }
        case "cd": {
          const next = this.normalize(arg || "/");
          this.cwd = next;
          return "";
        }
        case "cat": {
          const key = this.normalize(arg);
          if (!this.files.has(key)) throw new Error("cat: " + arg + ": No such file");
          return this.files.get(key);
        }
        case "touch": {
          for (const name of tokens) this.files.set(this.normalize(name), "");
          return "";
        }
        case "mkdir": {
          // Directory entries are implicit in this browser filesystem.
          return "";
        }
        case "clear": clear(); return "";
        case "help":
          return "Built-in: cd, pwd, ls, cat, echo, touch, mkdir, whoami, uname, clear, help";
        default:
          throw new Error(cmd + ": command not found");
      }
    }
  }

  async function runCommand(command) {
    const cmd = String(command || "").trim();
    if (!cmd) return;

    print("coder@code-nest:/ $ " + cmd, "bash-command");
    state.history = state.history.filter(x => x !== cmd);
    state.history.unshift(cmd);
    state.history = state.history.slice(0, 50);
    state.historyIndex = -1;

    try {
      // pip is provided by Code Nest's Pyodide/micropip bridge, not by
      // the shell runtime itself. Route pip install commands here so the
      // Bash console and Terminal cells use the same package environment.
      const pipMatch = cmd.match(/^(?:pip|python\\s+-m\\s+pip|python3\\s+-m\\s+pip|py\\s+-m\\s+pip)\\s+install\\s+(.+)$/i);
      if (pipMatch && typeof window.codeNestPipInstall === "function") {
        const result = await window.codeNestPipInstall(pipMatch[1].trim().split(/\\s+/));
        if (result) print(result);
        return;
      }

      if (pipMatch && typeof window.codeNestPipInstall !== "function") {
        throw new Error("pip bridge is not ready. Reload Code Nest and try again.");
      }

      const shell = await loadRuntime();
      const result = await shell.exec(cmd);
      if (result) print(result);
    } catch (error) {
      print(String(error && error.message || error), "bash-error");
    }
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
          state.historyIndex = Math.min(
            state.historyIndex + 1,
            state.history.length - 1
          );
          field.value = state.history[state.historyIndex];
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          state.historyIndex = Math.max(state.historyIndex - 1, -1);
          field.value = state.historyIndex < 0
            ? ""
            : state.history[state.historyIndex];
        } else if (event.key === "l" && event.ctrlKey) {
          event.preventDefault();
          clear();
        }
      });
    }

    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", clear);
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "1";
      closeBtn.addEventListener("click", () => {
        const modal = document.getElementById("bashModal");
        if (modal) {
          modal.setAttribute("aria-hidden", "true");
          modal.style.display = "none";
        }
      });
    }
  }

  window.CodeNestBash = {
    init: wire,
    run: runCommand,
    loadRuntime
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else {
    wire();
  }
})();