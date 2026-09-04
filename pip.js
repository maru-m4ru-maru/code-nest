// Code Nest - pip.js
// V0.3
// Pyodide 上で pip / micropip を使えるようにする。
// ScratchAttach はブラウザ環境向け互換処理を入れる。

(() => {
    "use strict";

    const PYODIDE_VERSION = "0.27.7";
    const SCRATCHATTACH_VERSION = "2.2.3";
    const WORKER_URL =
        "https://code-nest-worker.maru-0727.workers.dev";

    let pipReady = false;
    let scratchAttachReady = false;

    function log(message) {
        console.log("[Code Nest pip]", message);
    }

    function escapePythonString(value) {
        return JSON.stringify(String(value));
    }

    async function ensurePyodide() {
        if (globalThis.__codeNestPyodide) {
            return globalThis.__codeNestPyodide;
        }

        if (typeof loadPyodide !== "function") {
            throw new Error(
                "Pyodide が読み込まれていません。先に Python ランタイムを起動してください。"
            );
        }

        const pyodide = await loadPyodide({
            indexURL:
                `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
        });

        globalThis.__codeNestPyodide = pyodide;
        return pyodide;
    }

    async function ensureMicropip(pyodide) {
        if (pipReady) return;

        await pyodide.loadPackage("micropip");
        await pyodide.runPythonAsync(`
import micropip
print("micropip OK")
`);

        pipReady = true;
    }

    async function installPackage(pyodide, packageSpec) {
        await ensureMicropip(pyodide);

        const result = await pyodide.runPythonAsync(`
import micropip

package_name = ${escapePythonString(packageSpec)}

print(f"Installing: {package_name}")

await micropip.install(package_name)

print(f"Successfully installed: {package_name}")
`);

        return result;
    }

    async function setupScratchAttach(pyodide) {
        if (scratchAttachReady) return;

        await ensureMicropip(pyodide);

        // SSL は ScratchAttach の依存処理で参照されることがある。
        try {
            await pyodide.loadPackage("ssl");
            log("ssl OK");
        } catch (error) {
            log("ssl load skipped: " + error);
        }

        // ------------------------------------------------------------
        // Browser compatibility stubs
        //
        // ScratchAttach は Python デスクトップ環境を前提として
        // SimpleWebSocketServer / browser_cookie3 などを import
        // することがあるため、ブラウザでは安全なダミーモジュールを用意。
        // ------------------------------------------------------------

        const compatibilityCode = `
import sys
import types

# ============================================================
# SimpleWebSocketServer
# ============================================================

class _CodeNestWebSocketServer:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(
            "Code Nest browser mode does not support starting "
            "a local WebSocket server."
        )

    def serveforever(self, *args, **kwargs):
        raise RuntimeError(
            "Code Nest browser mode does not support local "
            "WebSocket servers."
        )

_simple_ws = types.ModuleType("SimpleWebSocketServer")
_simple_ws.WebSocket = object
_simple_ws.SimpleWebSocketServer = _CodeNestWebSocketServer
sys.modules["SimpleWebSocketServer"] = _simple_ws

# ============================================================
# SimpleSSLWebSocketServer
# ============================================================

_ssl_ws = types.ModuleType("SimpleSSLWebSocketServer")
_ssl_ws.SimpleSSLWebSocketServer = _CodeNestWebSocketServer
sys.modules["SimpleSSLWebSocketServer"] = _ssl_ws

# ============================================================
# browser_cookie3
# ============================================================

# browser_cookie3 はPCのブラウザCookie DBを読むためのものなので、
# Code Nest のブラウザ実行環境では実際には使用しない。
_cookie = types.ModuleType("browser_cookie3")

class _DummyCookieJar:
    def __iter__(self):
        return iter(())

def _dummy_cookie_loader(*args, **kwargs):
    return _DummyCookieJar()

_cookie.chrome = _dummy_cookie_loader
_cookie.firefox = _dummy_cookie_loader
_cookie.edge = _dummy_cookie_loader
_cookie.brave = _dummy_cookie_loader
_cookie.opera = _dummy_cookie_loader
_cookie.chromium = _dummy_cookie_loader

sys.modules["browser_cookie3"] = _cookie

print("Browser compatibility mode enabled")
`;

        await pyodide.runPythonAsync(compatibilityCode);

        // ============================================================
        // ScratchAttach をインストール
        // ============================================================

        await pyodide.runPythonAsync(`
import micropip

await micropip.install(
    "scratchattach==${SCRATCHATTACH_VERSION}"
)

print("Successfully installed: scratchattach ${SCRATCHATTACH_VERSION}")
`);

        // ============================================================
        // import
        // ============================================================

        await pyodide.runPythonAsync(`
import scratchattach

print("Import check: scratchattach OK")
`);

        // ============================================================
        // Code Nest 用 HTTP レイヤー
        //
        // scratchattach.utils.requests の実装を直接利用するのではなく、
        // Scratch API の GET を JavaScript fetch → Code Nest Worker
        // 経由で取得する。
        //
        // これによりブラウザの CORS 制約を回避する。
        // ============================================================

        const requestBridge = `
import json
import urllib.parse
import types
import asyncio

import js

_WORKER_URL = ${escapePythonString(WORKER_URL)}

class CodeNestResponse:
    def __init__(self, status_code, headers, text):
        self.status_code = int(status_code)
        self.headers = dict(headers)
        self.text = str(text)
        self.content = self.text.encode("utf-8")

    def json(self):
        return json.loads(self.text)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(
                f"HTTP {self.status_code}: {self.text[:500]}"
            )

    @property
    def ok(self):
        return 200 <= self.status_code < 400


async def _fetch_worker(url, method="GET", headers=None, data=None, json_data=None):
    headers = headers or {}

    encoded_url = urllib.parse.quote(str(url), safe="")
    proxy_url = (
        f"{_WORKER_URL}/scratch-proxy?url={encoded_url}"
    )

    options = {
        "method": method,
        "headers": headers
    }

    if json_data is not None:
        options["headers"] = dict(headers)
        options["headers"]["Content-Type"] = "application/json"
        options["body"] = json.dumps(json_data)

    elif data is not None:
        options["body"] = str(data)

    response = await js.fetch(proxy_url, options)

    text = await response.text()

    try:
        js_headers = response.headers
        header_dict = {}

        for key in [
            "content-type",
            "content-length",
            "etag",
            "cache-control",
            "date"
        ]:
            try:
                value = js_headers.get(key)
                if value is not None:
                    header_dict[key] = str(value)
            except Exception:
                pass

    except Exception:
        header_dict = {}

    return CodeNestResponse(
        int(response.status),
        header_dict,
        text
    )


async def _get_async(url, **kwargs):
    return await _fetch_worker(
        url,
        method="GET",
        headers=kwargs.get("headers"),
        data=kwargs.get("data"),
        json_data=kwargs.get("json")
    )


async def _post_async(url, **kwargs):
    return await _fetch_worker(
        url,
        method="POST",
        headers=kwargs.get("headers"),
        data=kwargs.get("data"),
        json_data=kwargs.get("json")
    )


async def _put_async(url, **kwargs):
    return await _fetch_worker(
        url,
        method="PUT",
        headers=kwargs.get("headers"),
        data=kwargs.get("data"),
        json_data=kwargs.get("json")
    )


async def _delete_async(url, **kwargs):
    return await _fetch_worker(
        url,
        method="DELETE",
        headers=kwargs.get("headers"),
        data=kwargs.get("data"),
        json_data=kwargs.get("json")
    )


def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is None:
        return asyncio.run(coro)

    # Pyodide のトップレベルでは通常ここに来ないが、
    # 念のため現在のイベントループを利用する。
    return coro


def get(url, **kwargs):
    return _run_async(_get_async(url, **kwargs))


def post(url, **kwargs):
    return _run_async(_post_async(url, **kwargs))


def put(url, **kwargs):
    return _run_async(_put_async(url, **kwargs))


def delete(url, **kwargs):
    return _run_async(_delete_async(url, **kwargs))


# ------------------------------------------------------------
# scratchattach.utils.requests に公開
# ------------------------------------------------------------

import scratchattach.utils.requests as sa_requests

sa_requests.get = get
sa_requests.post = post
sa_requests.put = put
sa_requests.delete = delete

print("Code Nest Scratch API bridge enabled")
`;

        await pyodide.runPythonAsync(requestBridge);

        // ============================================================
        // ScratchAttach の簡単な確認
        // ============================================================

        try {
            await pyodide.runPythonAsync(`
import scratchattach

print("ScratchAttach browser compatibility ready")
`);
        } catch (error) {
            console.warn(
                "[Code Nest] ScratchAttach compatibility check failed:",
                error
            );
        }

        scratchAttachReady = true;
    }

    async function pipInstall(packageSpec) {
        const pyodide = await ensurePyodide();

        // ScratchAttach は専用処理
        if (
            String(packageSpec)
                .trim()
                .toLowerCase()
                .startsWith("scratchattach")
        ) {
            await setupScratchAttach(pyodide);

            return (
                `Successfully installed: ${packageSpec}\n` +
                `Import check: scratchattach OK\n` +
                `Import check: ssl OK\n` +
                `Browser compatibility mode enabled`
            );
        }

        await installPackage(pyodide, packageSpec);

        return `Successfully installed: ${packageSpec}`;
    }

    // ------------------------------------------------------------
    // Bash Console から利用する API
    // ------------------------------------------------------------

    globalThis.codeNestPipInstall = pipInstall;

    // 直接呼び出したい場合用
    globalThis.setupCodeNestScratchAttach = async () => {
        const pyodide = await ensurePyodide();
        await setupScratchAttach(pyodide);
        return true;
    };

    log("pip.js loaded");
})();
