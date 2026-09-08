/* Code Nest Bash pip bridge V0.4.5.2 */
(() => {
  'use strict';

  const PREFIX = '[Code Nest Bash pip]';
  const log = (...args) => console.log(PREFIX, ...args);
  const PIP_SRC = 'pip.js?v=52';
  let bridgePromise = null;

  function isPipInstall(command) {
    return /^(?:pip|python\s+-m\s+pip|python3\s+-m\s+pip|py\s+-m\s+pip)\s+install\s+(.+)$/i.exec(command.trim());
  }

  function print(text, cls = '') {
    const root = document.getElementById('bashOutput');
    if (!root) return;
    const line = document.createElement('div');
    line.className = 'bash-line ' + cls;
    line.textContent = String(text);
    root.appendChild(line);
    root.scrollTop = root.scrollHeight;
  }

  function ensurePipBridge() {
    if (typeof globalThis.codeNestPipInstall === 'function') {
      return Promise.resolve(globalThis.codeNestPipInstall);
    }

    if (bridgePromise) return bridgePromise;

    bridgePromise = new Promise((resolve, reject) => {
      log('BRIDGE missing; loading pip.js directly');

      const existing = document.querySelector('script[data-code-nest-pip-runtime]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (typeof globalThis.codeNestPipInstall === 'function') resolve(globalThis.codeNestPipInstall);
          else reject(new Error('pip.js loaded but codeNestPipInstall is unavailable'));
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('pip.js failed to load')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = PIP_SRC;
      script.async = false;
      script.dataset.codeNestPipRuntime = '1';
      script.onload = () => {
        if (typeof globalThis.codeNestPipInstall === 'function') resolve(globalThis.codeNestPipInstall);
        else reject(new Error('pip.js loaded but codeNestPipInstall is unavailable'));
      };
      script.onerror = () => reject(new Error('pip.js failed to load'));
      document.head.appendChild(script);
    }).finally(() => {
      if (typeof globalThis.codeNestPipInstall !== 'function') bridgePromise = null;
    });

    return bridgePromise;
  }

  async function runPip(command, input) {
    const match = isPipInstall(command);
    if (!match) return false;

    const spec = match[1].trim();
    log('INTERCEPT', command);
    print('coder@code-nest:/ $ ' + command, 'bash-command');

    try {
      const pipInstall = await ensurePipBridge();
      if (input) input.value = '';
      log('INSTALL', spec);
      const result = await pipInstall(spec.split(/\s+/));
      if (result) print(result);
      log('DONE', spec);
    } catch (error) {
      log('FAILED', error);
      print(String(error && error.message || error), 'bash-error');
    }
    return true;
  }

  async function handleSubmit(event) {
    const input = document.getElementById('bashInput');
    if (!input) return;
    const command = String(input.value || '').trim();
    if (!isPipInstall(command)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    await runPip(command, input);
  }

  async function handleKeydown(event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    const input = event.target?.closest?.('#bashInput');
    if (!input) return;

    const command = String(input.value || '').trim();
    if (!isPipInstall(command)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    await runPip(command, input);
  }

  function init() {
    const form = document.getElementById('bashForm');
    const input = document.getElementById('bashInput');
    if (!form || !input || form.dataset.codeNestPipFix === '1') return;

    form.dataset.codeNestPipFix = '1';
    form.addEventListener('submit', handleSubmit, true);
    input.addEventListener('keydown', handleKeydown, true);
    log('READY V0.4.5.2');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  setTimeout(init, 0);
  setTimeout(init, 250);
})();