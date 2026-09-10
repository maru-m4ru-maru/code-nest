let pyodide = null;
let busy = false;

async function boot() {
  if (pyodide) return pyodide;
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.28.0/full/pyodide.js');
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: s => postMessage({ type: 'stdout', data: s }) });
  pyodide.setStderr({ batched: s => postMessage({ type: 'stderr', data: s }) });
  return pyodide;
}

boot()
  .then(() => postMessage({ type: 'ready' }))
  .catch(error => postMessage({ type: 'boot-error', error: String(error) }));

self.onmessage = async event => {
  const msg = event.data || {};
  if (msg.type !== 'run' || busy) return;

  busy = true;
  try {
    const py = await boot();
    await py.runPythonAsync(String(msg.source || ''));
    postMessage({ type: 'done' });
  } catch (error) {
    postMessage({ type: 'error', error: String(error) });
  } finally {
    busy = false;
  }
};
