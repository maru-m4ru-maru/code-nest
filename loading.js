// Code Nest loading/runtime guard V0.3.6
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
      </div>`;
    const style = document.createElement("style");
    style.textContent = `
      #codeNestLoading{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(9,12,18,.34);backdrop-filter:blur(4px);pointer-events:all}
      #codeNestLoading .cn-loading-card{min-width:220px;max-width:calc(100vw - 40px);padding:22px 24px;border:1px solid rgba(127,135,155,.22);border-radius:16px;background:rgba(255,255,255,.97);color:#171a21;box-shadow:0 20px 70px rgba(0,0,0,.18);display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
      body.dark #codeNestLoading .cn-loading-card{background:rgba(18,23,32,.98);color:#f3f5f8}
      #codeNestLoading strong{font-size:14px}#codeNestLoading span{color:#737b89;font-size:11px}
      #codeNestLoading .cn-spinner{width:27px;height:27px;border-radius:50%;border:3px solid rgba(91,92,226,.18);border-top-color:#5b5ce2;animation:cnSpin .75s linear infinite}
      @keyframes cnSpin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);
    document.body.appendChild(root);
    return root;
  }

  function setLoading(on, title, text) {
    const root = getUI();
    if (on) {
      state.count++;
      root.querySelector("#codeNestLoadingTitle").textContent = title || "読み込み中…";
      root.querySelector("#codeNestLoadingText").textContent = text || "しばらくお待ちください";
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

  const originalAppendChild = Node.prototype.appendChild;
  if (!globalThis.__codeNestAppendGuard) {
    Node.prototype.appendChild = function(node) {
      try {
        if (node && node.tagName === "SCRIPT" && typeof node.src === "string" && node.src.includes("/pyodide/")) {
          setLoading(true, "Pythonを読み込み中…", "初回起動では少し時間がかかります");
          const done = () => setLoading(false);
          node.addEventListener("load", done, { once:true });
          node.addEventListener("error", done, { once:true });
          setTimeout(done, 45000);
        }
      } catch (_) {}
      return originalAppendChild.call(this, node);
    };
    globalThis.__codeNestAppendGuard = true;
  }

  // Load the click bridge synchronously while the HTML parser is still active.
  // This guarantees Run/Preview interception is registered before app.js attaches
  // its per-cell click handlers.
  if (!document.querySelector('script[data-code-nest-action-fix]')) {
    document.write('<script src="action-fix.js?v=6" data-code-nest-action-fix="true"><\\/script>');
  }

  function hardenPreviewFrame() {
    const frame = document.getElementById("previewFrame");
    if (!frame) return;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("allow", "");
  }

  function loadPreviewFix() {
    if (document.querySelector('script[data-code-nest-preview-fix]')) return;
    const script = document.createElement("script");
    script.src = "preview-fixes.js?v=6";
    script.dataset.codeNestPreviewFix = "true";
    document.body.appendChild(script);
  }

  // preview-fixes.js needs the fully-created Studio DOM. Load it after parsing.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      hardenPreviewFrame();
      loadPreviewFix();
    }, { once:true });
  } else {
    hardenPreviewFrame();
    loadPreviewFix();
  }

  const previewObserver = new MutationObserver(hardenPreviewFrame);
  previewObserver.observe(document.documentElement, { childList:true, subtree:true });

  console.log("[Code Nest] loading/runtime guard ready");
})();
