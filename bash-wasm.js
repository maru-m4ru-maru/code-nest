(() => {
  "use strict";

  // Code Nest Bash bridge.
  // Loads the browser-side WebAssembly shell lazily so the main Studio can boot
  // even when the runtime CDN is unavailable.
  const state = {
    ready: false,
    loading: false,
    terminal: null,
    terminalPromise: null,
    history: [],
    historyIndex: -1,
    sandbox: localStorage.getItem("codeNest.bash.sandbox") !== "off"
  };

  // Compatibility guards for the current Studio markup/app.js.
  if (!document.getElementById("toast")) {
    const toast = document.createElement("div");
    toast.id = "toast";
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  const originalQuerySelector = Document.prototype.querySelector;
  if (!globalThis.__codeNestCellQueryPatch) {
    Document.prototype.querySelector = function(selector) {
      const result = originalQuerySelector.call(this, selector);
      if (selector === ".cell" && result && typeof result.map !== "function") {
        Object.defineProperty(result, "map", {
          configurable: true,
          value(callback, thisArg) {
            return [...document.querySelectorAll(".cell")].map(callback, thisArg);
          }
        });
      }
      return result;
    };
    globalThis.__codeNestCellQueryPatch = true;
  }

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

  function sandboxLabel() {
    return state.sandbox ? "🔒 Sandbox ON" : "⚠️ Sandbox OFF";
  }

  function updateSandboxButton() {
    const button = document.getElementById("bashSandboxToggle");
    if (!button) return;
    button.textContent = sandboxLabel();
    button.title = state.sandbox
      ? "安全モード。クリックすると警告を表示してOFFにできます"
      : "Sandbox OFF。クリックすると安全モードに戻します";
    button.setAttribute("aria-pressed", String(!state.sandbox));
    button.dataset.sandbox = state.sandbox ? "on" : "off";
  }

  function setSandboxMode(enabled, announce = true) {
    state.sandbox = Boolean(enabled);
    localStorage.setItem("codeNest.bash.sandbox", state.sandbox ? "on" : "off");
    updateSandboxButton();

    // A runtime may choose to inspect this flag before creating a terminal.
    globalThis.__codeNestBashSandbox = state.sandbox;

    if (announce) {
      print(
        state.sandbox
          ? "[Sandbox] ON — browser sandbox policy is enabled."
          : "[Sandbox] OFF — app-level restrictions are disabled. Browser/OS security boundaries still apply.",
        state.sandbox ? "bash-system" : "bash-error"
      );
    }
  }

  function toggleSandbox() {
    if (state.sandbox) {
      const confirmed = window.confirm(
        "SandboxをOFFにしますか？\n\n" +
        "注意：OFFにするとCode Nest側の安全制限が弱くなります。" +
        "信頼できないコードやパッケージを実行しないでください。\n\n" +
        "※ これはブラウザ/OSのセキュリティ機構を無効化するものではありません。"
      );
      if (!confirmed) return;
      setSandboxMode(false);
      return;
    }

    setSandboxMode(true);
  }

  function ensureSandboxButton() {
    const existing = document.getElementById("bashSandboxToggle");
    if (existing) {
      updateSandboxButton();
      return existing;
    }

    const actions = document.querySelector(".bash-head-actions");
    if (!actions) return null;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "bashSandboxToggle";
    button.className = "bash-btn sandbox-toggle";
    button.addEventListener("click", toggleSandbox);
    actions.insertBefore(button, actions.lastElementChild || null);
    updateSandboxButton();
    return button;
  }

  async function loadRuntime() {
    if (state.ready) return state.terminal;
    if (state.loading) return state.terminalPromise;

    state.loading = true;
    state.terminalPromise = (async () => {
      globalThis.__codeNestBashSandbox = state.sandbox;

      if (window.CodeNestBashRuntime &&
          typeof window.CodeNestBashRuntime.create === "function") {
        state.terminal = await window.CodeNestBashRuntime.create({
          sandbox: state.sandbox
        });
        state.ready = true;
        return state.terminal;
      }

      // No runtime bundle installed yet. Provide a shell-compatible browser
      // command layer. This remains inside the browser regardless of the UI toggle.
      state.terminal = new BrowserShell(state.sandbox);
      state.ready = true;
      return state.terminal;
    })();

    return state.terminalPromise;
  }

  class BrowserShell {
    constructor(sandbox = true) {
      this.sandbox = sandbox;
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
      const tokens = command.trim().split(/\s+/);
      const cmd = tokens.shift() || "";
      const arg = tokens.join(" ");

      switch (cmd) {
        case "": return "";
        case "echo": return arg;
        case "pwd": return this.cwd;
        case "whoami": return "coder";
        case "uname": return this.sandbox
          ? "Code Nest WASM browser environment (sandboxed)"
          : "Code Nest WASM browser environment (sandbox disabled at app level)";
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
      const pipMatch = cmd.match(/^(?:pip|python\s+-m\s+pip|python3\s+-m\s+pip|py\s+-m\s+pip)\s+install\s+(.+)$/i);
      if (pipMatch && typeof window.codeNestPipInstall === "function") {
        const result = await window.codeNestPipInstall(pipMatch[1].trim().split(/\s+/));
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
    ensureSandboxButton();
    status();
    globalThis.__codeNestBashSandbox = state.sandbox;
    updateSandboxButton();
  }

  window.CodeNestBash = {
    init: wire,
    run: runCommand,
    loadRuntime,
    getSandbox: () => state.sandbox,
    setSandboxMode
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else {
    wire();
  }

  setTimeout(ensureSandboxButton, 0);
  setTimeout(ensureSandboxButton, 250);
})();
