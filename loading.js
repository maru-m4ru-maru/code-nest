// Code Nest loading/runtime guard V0.3.7
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

  // share.js is part of Studio's normal runtime. Load it synchronously while
  // this parser-blocking script is executing so the Share button always binds.
  if (!document.querySelector('script[data-code-nest-share-loader]')) {
    document.write('<script src="share.js?v=8" data-code-nest-share-loader="true"><\\/script>');
  }

  function hardenPreviewFrame() {
    const frame = document.getElementById("previewFrame");
    if (!frame) return;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("allow", "");
  }

  // Reliable Run/Preview bridge. It is registered before app.js and uses
  // capture phase, so app.js's older per-cell click handler cannot swallow it.
  function getCellFromAction(event) {
    const button = event.target.closest?.('button[data-act="run"],button[data-act="preview"]');
    return button ? { button, cell: button.closest(".cell"), action: button.dataset.act } : null;
  }

  function fileName(cell) {
    return (cell?.querySelector(".cell-name")?.value || "cell.py").trim().toLowerCase();
  }

  function isWebFile(name) {
    return /\.(?:html?|css|m?js)$/i.test(name);
  }

  function sourceOf(cell) {
    return cell?.querySelector("textarea")?.value || "";
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",\"":"&quot;","'":"&#39;"}[c]));
  }

  function projectFiles() {
    const map = new Map();
    for (const cell of document.querySelectorAll('.cell[data-type="code"]')) {
      const raw = (cell.querySelector(".cell-name")?.value || "").trim().replace(/^\/+/, "");
      if (!raw) continue;
      const parts = [];
      for (const part of ("/" + raw).split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") { parts.pop(); continue; }
        parts.push(part);
      }
      const path = "/" + parts.join("/");
      map.set(path, { path, source: sourceOf(cell) });
    }
    return map;
  }

  function filePathFromHtml(basePath, target) {
    if (!target) return null;
    const t = target.trim();
    if (!t || t.startsWith("#") || /^(?:[a-z]+:|\/\/)/i.test(t) || /^(?:data|blob):/i.test(t)) return null;
    const clean = t.split("#")[0].split("?")[0];
    const baseParts = basePath.split("/").filter(Boolean);
    baseParts.pop();
    for (const part of (clean.startsWith("/") ? clean : "/" + baseParts.join("/") + "/" + clean).split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") baseParts.pop(); else baseParts.push(part);
    }
    return "/" + baseParts.join("/");
  }

  function buildProjectPreview() {
    const files = projectFiles();
    let htmlFile = [...files.values()].find(f => /\.html?$/i.test(f.path));
    if (!htmlFile) {
      return `<!doctype html><html><body><h2>Code Nest preview</h2><p>index.html などのHTMLセルを追加してください。</p></body></html>`;
    }

    const doc = new DOMParser().parseFromString(htmlFile.source, "text/html");

    for (const link of doc.querySelectorAll('link[rel~="stylesheet" i][href]')) {
      const path = filePathFromHtml(htmlFile.path, link.getAttribute("href"));
      const file = path && files.get(path);
      if (file && /\.css$/i.test(file.path)) {
        const style = doc.createElement("style");
        style.setAttribute("data-code-nest-file", file.path);
        style.textContent = file.source;
        link.replaceWith(style);
      }
    }

    for (const script of doc.querySelectorAll("script[src]")) {
      const path = filePathFromHtml(htmlFile.path, script.getAttribute("src"));
      const file = path && files.get(path);
      if (file && /\.m?js$/i.test(file.path)) {
        const inline = doc.createElement("script");
        if (/\.mjs$/i.test(file.path)) inline.type = "module";
        inline.setAttribute("data-code-nest-file", file.path);
        inline.textContent = file.source.replace(/<\/(script)/gi, "<\\/$1");
        script.replaceWith(inline);
      }
    }

    // Legacy convenience: CSS/JS cells are still included automatically when
    // an existing notebook doesn't have explicit file links.
    if (!doc.querySelector("style") && !doc.querySelector('link[rel~="stylesheet" i]')) {
      const css = [...files.values()].filter(f => /\.css$/i.test(f.path));
      if (css.length) {
        const style = doc.createElement("style");
        style.textContent = css.map(f => f.source).join("\n");
        doc.head.appendChild(style);
      }
    }
    if (!doc.querySelector("script")) {
      const js = [...files.values()].filter(f => /\.m?js$/i.test(f.path));
      for (const file of js) {
        const script = doc.createElement("script");
        if (/\.mjs$/i.test(file.path)) script.type = "module";
        script.textContent = file.source.replace(/<\/(script)/gi, "<\\/$1");
        doc.body.appendChild(script);
      }
    }

    return "<!doctype html>" + doc.documentElement.outerHTML;
  }

  let activePreviewUrl = null;

  function openProjectPreview() {
    const frame = document.getElementById("previewFrame");
    const modal = document.getElementById("previewModal");
    if (!frame || !modal) return false;
    try {
      if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
    } catch (_) {}
    const blob = new Blob([buildProjectPreview()], { type: "text/html" });
    activePreviewUrl = URL.createObjectURL(blob);
    frame.src = activePreviewUrl;
    frame.dataset.previewUrl = activePreviewUrl;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    const label = document.getElementById("previewLabel");
    if (label) label.textContent = "ブラウザプレビュー";
    const newTab = document.getElementById("previewNewTab");
    if (newTab) {
      newTab.disabled = true;
      newTab.textContent = "サンドボックス内で実行";
    }
    return true;
  }

  document.addEventListener("click", event => {
    const info = getCellFromAction(event);
    if (!info) return;
    const { cell, action } = info;
    if (!cell || cell.dataset.type !== "code") return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const name = fileName(cell);
    if (action === "preview") {
      if (!isWebFile(name)) {
        if (typeof globalThis.showToast === "function") globalThis.showToast("このファイル形式はプレビュー対象ではありません");
        return;
      }
      openProjectPreview();
      return;
    }

    if (isWebFile(name)) {
      openProjectPreview();
      return;
    }

    if (typeof globalThis.runPythonCell === "function") {
      globalThis.runPythonCell(cell);
    } else if (typeof globalThis.showToast === "function") {
      globalThis.showToast("Python実行環境を読み込めませんでした");
    }
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hardenPreviewFrame, { once:true });
  } else {
    hardenPreviewFrame();
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("#previewClose") || event.target.closest?.('[data-close="previewModal"]')) {
      const modal = document.getElementById("previewModal");
      if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
      }
      if (activePreviewUrl) {
        try { URL.revokeObjectURL(activePreviewUrl); } catch (_) {}
        activePreviewUrl = null;
      }
    }
  });

  console.log("[Code Nest] reliable runtime guard ready");
})();
