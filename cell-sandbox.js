/* Code Nest Cells Sandbox V0.4.8 */
(() => {
  'use strict';

  const KEY = 'codeNest.cells.sandbox';
  const WARNING =
    '意味の分からないコードは「絶対に」SandboxOFFで実行しないでください。\n\n' +
    '悪意あるコードだった場合、パスワードなどが流出などの悪影響が生じる可能性が高いです。\n\n' +
    'CodeNest開発者は、そのような行為で生じるいかなる問題の責任を一切負いません。';
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
      if (!frame.hasAttribute('sandbox')) frame.setAttribute('sandbox', 'allow-scripts');
    } else {
      frame.removeAttribute('sandbox');
    }
  }

  function applyAll() {
    document.querySelectorAll('#previewFrame, #codeNestPreviewFrameV4').forEach(applyToFrame);
    globalThis.__codeNestCellsSandbox = sandboxEnabled;
  }

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
    return sandboxEnabled ? 'Cell Sandbox ON' : 'Cell Sandbox OFF';
  }

  function updateButton() {
    const button = document.getElementById('cellSandboxToggle');
    if (!button) return;
    // textContent への代入は値が同じでも childList の変更として記録される。
    // 下の MutationObserver がこれを拾って無限ループになるため、
    // 実際に変わるときだけ書き換える。
    const text = label();
    if (button.textContent !== text) button.textContent = text;
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
        'Cells SandboxをOFFにしますか？\n\n' + WARNING + '\n\n' +
        '※ Sandbox OFFでもブラウザやOSそのもののセキュリティ機構を無効化するものではありません。'
      );
      if (!confirmed) return;
    }
    setSandbox(!sandboxEnabled);
  }

  function ensureButton() {
    // Remove the legacy toggle created by preview-v4.js. The Cells Sandbox
    // control is owned by this module, so there must be exactly one.
    document.querySelectorAll('#cellsSandboxToggle').forEach((button) => button.remove());

    const existing = document.getElementById('cellSandboxToggle');
    if (existing) {
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
    apply: applyAll,
    warning: WARNING
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

  // 監視中に自分でDOMを変更すると再度コールバックが呼ばれる。
  // 念のため監視を外してから処理し、終わってから再開する。
  let reacting = false;
  const observer = new MutationObserver(() => {
    if (reacting) return;
    reacting = true;
    observer.disconnect();
    try {
      ensureButton();
      applyAll();
    } finally {
      observer.takeRecords();
      observer.observe(document.documentElement, { childList: true, subtree: true });
      reacting = false;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  applyAll();
  log('READY', sandboxEnabled ? 'ON' : 'OFF');
})();
