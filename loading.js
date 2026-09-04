// Code Nest loading guard V0.3.2
(() => {
  "use strict";

  const state = { count: 0 };

  function getUI() {
    let root = document.getElementById("codeNestLoading");
    if (root) return root;

    root = document.createElement("div");
    root.id = "codeNestLoading";
    root.innerHTML = `
      <div class="cn-loading-card" role="status" aria-live="polite">
        <div class="cn-spinner"></div>
        <strong id="codeNestLoadingTitle">読み込み中…</strong>
        <span id="codeNestLoadingText">しばらくお待ちください</span>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #codeNestLoading {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(9,12,18,.34);
        backdrop-filter: blur(4px);
        pointer-events: all;
      }
      #codeNestLoading .cn-loading-card {
        min-width: 220px;
        max-width: calc(100vw - 40px);
        padding: 22px 24px;
        border: 1px solid rgba(127,135,155,.22);
        border-radius: 16px;
        background: rgba(255,255,255,.97);
        color: #171a21;
        box-shadow: 0 20px 70px rgba(0,0,0,.18);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        text-align: center;
      }
      body.dark #codeNestLoading .cn-loading-card {
        background: rgba(18,23,32,.98);
        color: #f3f5f8;
      }
      #codeNestLoading strong { font-size: 14px; }
      #codeNestLoading span { color: #737b89; font-size: 11px; }
      #codeNestLoading .cn-spinner {
        width: 27px;
        height: 27px;
        border-radius: 50%;
        border: 3px solid rgba(91,92,226,.18);
        border-top-color: #5b5ce2;
        animation: cnSpin .75s linear infinite;
      }
      @keyframes cnSpin { to { transform: rotate(360deg); } }
    `;

    document.head.appendChild(style);
    document.body.appendChild(root);
    return root;
  }

  function setLoading(on, title, text) {
    const root = getUI();
    if (on) {
      state.count++;
      root.querySelector("#codeNestLoadingTitle").textContent =
        title || "読み込み中…";
      root.querySelector("#codeNestLoadingText").textContent =
        text || "しばらくお待ちください";
      root.style.display = "flex";
      document.body.dataset.codeNestBusy = "true";
    } else {
      state.count = Math.max(0, state.count - 1);
      if (!state.count) {
        root.style.display = "none";
        delete document.body.dataset.codeNestBusy;
      }
    }
  }

  globalThis.codeNestSetLoading = setLoading;

  // Python runtime is loaded dynamically by app.js.
  // Watch for pyodide.js so the overlay appears before the browser
  // starts the potentially slow runtime download.
  const originalAppendChild = Node.prototype.appendChild;
  if (!globalThis.__codeNestAppendGuard) {
    Node.prototype.appendChild = function(node) {
      try {
        if (
          node &&
          node.tagName === "SCRIPT" &&
          typeof node.src === "string" &&
          node.src.includes("/pyodide/")
        ) {
          setLoading(
            true,
            "Pythonを読み込み中…",
            "初回起動では少し時間がかかります"
          );

          const done = () => setLoading(false);
          node.addEventListener("load", done, { once: true });
          node.addEventListener("error", done, { once: true });
        }
      } catch (_) {}
      return originalAppendChild.call(this, node);
    };

    globalThis.__codeNestAppendGuard = true;
  }

  // Prevent accidental clicks while the runtime/package is loading.
  document.addEventListener("click", event => {
    if (!document.body.dataset.codeNestBusy) return;
    const target = event.target.closest("button, a, input, textarea, select");
    if (target && !target.closest("#codeNestLoading")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  console.log("[Code Nest] loading guard ready");
})();