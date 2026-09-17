/* Code Nest TypeScript Runtime V1.0 */
(() => {
  'use strict';

  const PREFIX = '[Code Nest TypeScript]';
  const ESBUILD_VERSION = '0.24.0';
  const ESBUILD_JS = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD_VERSION}/lib/browser.min.js`;
  const ESBUILD_WASM = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;
  const RUN_TIMEOUT_MS = 8000;

  let esbuildReady = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`スクリプトの読み込みに失敗しました: ${src}`));
      document.head.appendChild(script);
    });
  }

  // esbuild-wasm はグローバルインスタンスを1つだけ初期化する。
  // 二重に initialize() すると例外になるため、Promiseをキャッシュして共有する。
  async function ensureEsbuild() {
    if (esbuildReady) return esbuildReady;

    esbuildReady = (async () => {
      if (!globalThis.esbuild) {
        await loadScript(ESBUILD_JS);
      }
      if (!globalThis.esbuild) {
        throw new Error('esbuild-wasmの読み込みに失敗しました');
      }
      if (!globalThis.__codeNestEsbuildInitialized) {
        await globalThis.esbuild.initialize({ wasmURL: ESBUILD_WASM });
        globalThis.__codeNestEsbuildInitialized = true;
      }
      return globalThis.esbuild;
    })();

    try {
      return await esbuildReady;
    } catch (error) {
      esbuildReady = null; // 失敗したら次回再試行できるようにする
      throw error;
    }
  }

  /**
   * TypeScript / TSX のソースをJavaScriptへトランスパイルする。
   * @param {string} source
   * @param {boolean} isTsx
   * @returns {Promise<string>}
   */
  async function transpileTypeScript(source, isTsx) {
    const esbuild = await ensureEsbuild();
    try {
      const result = await esbuild.transform(source, {
        loader: isTsx ? 'tsx' : 'ts',
        target: 'es2020',
        sourcefile: isTsx ? 'cell.tsx' : 'cell.ts'
      });
      return result.code;
    } catch (error) {
      // esbuildのエラーは detail 情報を持つことが多いので、分かりやすい形に整形する
      const detail = Array.isArray(error?.errors) && error.errors.length
        ? error.errors.map((e) => e.text).join('\n')
        : String(error?.message || error);
      const wrapped = new Error(detail);
      wrapped.isTranspileError = true;
      throw wrapped;
    }
  }

  /**
   * コンパイル済みJSをWorker内で実行し、console出力をキャプチャして返す。
   * メインスレッドを一切ブロックせず、タイムアウトで必ず終了する。
   * @param {string} js
   * @returns {Promise<string>}
   */
  function runScriptCaptured(js) {
    return new Promise((resolve) => {
      const runner = `
        let __out = '';
        const __push = (...args) => {
          __out += args.map((a) => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch (_) { return String(a); }
          }).join(' ') + '\\n';
        };
        self.console = { log: __push, info: __push, warn: __push, error: __push, debug: __push };
        self.onerror = (message) => { __push('Uncaught: ' + message); postMessage(__out); close(); return true; };
        try {
          ${js}
        } catch (error) {
          __push((error && error.stack) || (error && error.message) || String(error));
        }
        postMessage(__out);
        close();
      `;

      let settled = false;
      const blob = new Blob([runner], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        try { worker.terminate(); } catch (_) {}
        resolve(value);
      };

      const timer = setTimeout(() => {
        finish('実行がタイムアウトしました（無限ループしていないか確認してください）');
      }, RUN_TIMEOUT_MS);

      worker.onmessage = (event) => finish(typeof event.data === 'string' ? event.data : '');
      worker.onerror = (event) => finish('Error: ' + (event?.message || 'スクリプトの実行に失敗しました'));
    });
  }

  globalThis.codeNestTranspileTS = transpileTypeScript;
  globalThis.codeNestRunScriptCaptured = runScriptCaptured;
  console.log(PREFIX, 'runtime loader ready');
})();
