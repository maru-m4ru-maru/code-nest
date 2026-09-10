(() => {
  const runs = new WeakMap();
  let worker = null;
  let workerReady = false;

  const getButton = cell => cell.querySelector('button[data-act="run"]');

  const setButton = (cell, running) => {
    const button = getButton(cell);
    if (!button) return;

    if (running) {
      button.title = '停止';
      button.setAttribute('aria-label', '停止');
      button.classList.add('is-stop');
      button.innerHTML = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>';
    } else {
      button.title = '実行';
      button.setAttribute('aria-label', '実行');
      button.classList.remove('is-stop');
      button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  };

  const resetRunning = cell => {
    const state = runs.get(cell);
    if (!state) return;
    state.running = false;
    setButton(cell, false);
    runs.delete(cell);
  };

  const ensureWorker = () => {
    if (worker) return;

    worker = new Worker('./python-worker.js');
    workerReady = false;

    worker.onmessage = event => {
      const msg = event.data || {};

      if (msg.type === 'ready') {
        workerReady = true;
        return;
      }

      if (msg.type === 'boot-error') {
        const cell = worker?.__cell;
        if (cell) {
          const out = cell.querySelector('.output');
          if (out) {
            out.textContent = 'Pythonの起動に失敗しました\n' + msg.error;
            out.classList.add('error', 'visible');
          }
          resetRunning(cell);
        }
        worker.terminate();
        worker = null;
        workerReady = false;
        return;
      }

      const cell = worker?.__cell;
      if (!cell) return;

      const state = runs.get(cell);
      if (!state) return;

      if (msg.type === 'stdout' || msg.type === 'stderr') {
        state.output += msg.data || '';
        const out = cell.querySelector('.output');
        if (out) {
          out.textContent = state.output;
          out.classList.add('visible');
          out.classList.toggle('error', msg.type === 'stderr');
        }
        return;
      }

      if (msg.type === 'done') {
        const out = cell.querySelector('.output');
        if (out) {
          out.textContent = state.output.trimEnd() || '(出力なし)';
          out.classList.remove('error');
          out.classList.add('visible');
        }
        resetRunning(cell);
        scheduleSave();
        return;
      }

      if (msg.type === 'error') {
        const out = cell.querySelector('.output');
        if (out) {
          out.textContent = (state.output ? state.output + '\n' : '') + msg.error;
          out.classList.add('error', 'visible');
        }
        resetRunning(cell);
        scheduleSave();
      }
    };

    worker.onerror = error => {
      const cell = worker?.__cell;
      if (cell) {
        const out = cell.querySelector('.output');
        if (out) {
          out.textContent = 'Python実行エラー\n' + String(error.message || error);
          out.classList.add('error', 'visible');
        }
        resetRunning(cell);
      }
      worker = null;
      workerReady = false;
    };
  };

  const scheduleSave = () => {
    if (typeof window.scheduleSave === 'function') window.scheduleSave();
  };

  const isPythonCell = cell => {
    const name = (cell.querySelector('.cell-name')?.value || 'cell.py').trim().toLowerCase();
    return !(/\.(html?|css|m?js|json|ts)$/i.test(name));
  };

  const needsInterruptibleRuntime = source =>
    /\bwhile\s+(true|1)\s*:|\bwhile\s*\(\s*true\s*\)|\bfor\s+_\s+in\s+iter\(\s*int\s*,\s*1\s*\)/i.test(source) ||
    (/\bwhile\b/i.test(source) && /\btime\.sleep\s*\(/i.test(source));

  const stopCell = cell => {
    const state = runs.get(cell);
    if (!state) return;

    const out = cell.querySelector('.output');
    if (out) {
      out.textContent = (state.output ? state.output + '\n' : '') + '実行を停止しました';
      out.classList.add('visible');
      out.classList.remove('error');
    }

    if (worker) {
      worker.terminate();
      worker = null;
      workerReady = false;
    }

    resetRunning(cell);
    scheduleSave();
  };

  const runCell = cell => {
    if (!isPythonCell(cell)) return false;

    const source = cell.querySelector('textarea')?.value || '';
    if (!needsInterruptibleRuntime(source)) {
      if (typeof window.runCodeCell === 'function') {
        window.runCodeCell(cell);
        return true;
      }
      return false;
    }

    const existing = runs.get(cell);
    if (existing?.running) {
      stopCell(cell);
      return true;
    }

    ensureWorker();

    const out = cell.querySelector('.output');
    if (out) {
      out.className = 'output visible';
      out.textContent = 'Pythonを起動中…';
    }

    const state = {
      running: true,
      output: ''
    };

    runs.set(cell, state);
    setButton(cell, true);

    const wait = () => {
      if (!worker || runs.get(cell) !== state) return;
      if (!workerReady) {
        setTimeout(wait, 20);
        return;
      }

      worker.__cell = cell;
      if (out) out.textContent = '実行中…';
      worker.postMessage({ type: 'run', source });
    };

    wait();
    return true;
  };

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-act="run"]');
    if (!button) return;

    const cell = button.closest('.cell[data-type="code"]');
    if (!cell) return;

    if (!runCell(cell)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('beforeunload', () => {
    if (worker) worker.terminate();
  });
})();
