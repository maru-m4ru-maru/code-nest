/* Code Nest Cells Sandbox V0.4.7 */
(() => {
  'use strict';

  const KEY = 'codeNest.cells.sandbox';
  const PREFIX = '[Code Nest Cells Sandbox]';
  const log = (...args) => console.log(PREFIX, ...args);

  let sandboxEnabled = localStorage.getItem(KEY) !== 'off';

  function isPreviewFrame(frame) {
    return !!frame && (
      frame.id === 'previewFrame' ||
      frame.id === 'codeNestPreviewFrameV4'
    );
  }

  function applyToFrame(frame) {
    if (!isPreviewFrame(frame)) return;
    if (sandboxEnabled) {
      if (!frame.hasAttribute('sandbox')) {
        frame.setAttribute('sandbox', 'allow-scripts');
      }
    } else {
      frame.removeAttribute('sandbox');
    }
  }

  function applyAll() {
    document.querySelectorAll('#previewFrame, #codeNestPreviewFrameV4').forEach(applyToFrame);
    globalThis.__codeNestCellsSandbox = sandboxEnabled;
  }

  // Preview V0.4 re-applies sandbox="allow-scripts" when it opens.
  // Intercept only the two Code Nest preview frames so the user's setting wins.
  if (!globalThis.__codeNestCellsSandboxPatched) {
    const originalSetAttribute = HTMLIFrameElement.prototype.setAttribute;
    const originalRemoveAttribute = HTMLIFrameElement.prototype.removeAttribute;

    HTMLIFrameElement.prototype.setAttribute = function(name, value) {
      if (String(name).toLowerCase() === 'sandbox' && isPreviewFrame(this) && !sandboxEnabled) {
        log('BLOCK sandbox attribute because Cells Sandbox is OFF');
        return;
      }
      return originalSetAttribute.call(this, name, value);
    };

    HTMLIFrameElement.prototype.removeAttribute = function(name) {
      return originalRemoveAttribute.call(this, name);
    };

    globalThis.__codeNestCellsSandboxPatched = true;
  }

  function label() {
    return sandboxEnabled ? '🔒 Cells Sandbox ON' : '⚠️ Cells Sandbox OFF';
  }

  function updateButton() {
    const button = document.getElementById('cellSandboxToggle');
    if (!button) return;
    button.textContent = label();
    button.dataset.sandbox = sandboxEnabled ? 'on' : 'off';
    button.setAttribute('aria-pressed', String(!sandboxEnabled));
    button.title = sandboxEnabled
      ? 'CodeセルのPreviewをSandbox内で実行中。クリックすると警告を表示してOFFにできます'
      : 'Cells Sandbox OFF。クリックすると安全モードに戻します';
  }

  function setSandbox(enabled, announce = true) {
    sandboxEnabled = !!enabled;
    localStorage.setItem(KEY, sandboxEnabled ? 'on' : 'off');
    globalThis.__codeNestCellsSandbox = sandboxEnabled;
    applyAll();
    updateButton();

    if (announce) {
      const output = document.getElementById('bashOutput');
      if (output) {
        const line = document.createElement('div');
        line.className = sandboxEnabled ? 'bash-line bash-system' : 'bash-line bash-error';
        line.textContent = sandboxEnabled
          ? '[Cells Sandbox] ON — Preview iframe sandbox is enabled.'
          : '[Cells Sandbox] OFF — Preview iframe sandbox is disabled. Browser/OS security boundaries still apply.';
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
      }
    }
  }

  function toggle() {
    if (sandboxEnabled) {
      const confirmed = window.confirm(
        'Cells SandboxをOFFにしますか？\n\n' +
        '注意：OFFにすると、HTML/CSS/JavaScriptセルのブラウザPreviewからiframeのSandbox制限が外れます。' +
        '信頼できないコードを実行しないでください。\n\n' +
        '※ これはChromeやOSそのもののセキュリティ機構を無効化するものではありません。'
      );
      if (!confirmed) return;
    }
    setSandbox(!sandboxEnabled);
  }

  function ensureButton() {
    if (document.getElementById('cellSandboxToggle')) {
      updateButton();
      return;
    }

    const right = document.querySelector('.toolbar-right');
    if (!right) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'cellSandboxToggle';
    button.className = 'tool-btn';
    button.addEventListener('click', toggle);
    right.insertBefore(button, right.firstChild);
    updateButton();
  }

  globalThis.CodeNestCellsSandbox = {
    isEnabled: () => sandboxEnabled,
    setEnabled: (enabled) => setSandbox(enabled),
    toggle,
    apply: applyAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureButton();
      applyAll();
    }, { once: true });
  } else {
    ensureButton();
    applyAll();
  }

  const observer = new MutationObserver(() => {
    ensureButton();
    applyAll();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  applyAll();
  log('READY', sandboxEnabled ? 'ON' : 'OFF');
})();
