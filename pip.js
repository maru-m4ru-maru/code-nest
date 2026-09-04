// Code Nest - pip.js
// V0.3.2
// Pyodide / micropip / ScratchAttach browser compatibility.

(() => {
    "use strict";

    const PYODIDE_VERSION = "0.27.7";
    const SCRATCHATTACH_VERSION = "2.2.3";
    const WORKER_URL =
        "https://code-nest-worker.maru-0727.workers.dev";

    let pipReady = false;
    let scratchAttachReady = false;
    let loadingCount = 0;

    function log(message) {
        console.log("[Code Nest pip]", message);
    }

    // ------------------------------------------------------------
    // Loading guard
    // ------------------------------------------------------------

    function ensureLoadingUI() {
        let el = document.getElementById("codeNestLoading");

        if (el) return el;

        el = document.createElement("div");
        el.id = "codeNestLoading";
        el.innerHTML = `
            <div class="cn-loading-card">
                <div class="cn-spinner"></div>
                <strong id="codeNestLoadingTitle">読み込み中…</strong>
                <span id="codeNestLoadingText">
                    しばらくお待ちください
                </span>
            </div>
        `;

        Object.assign(el.style, {
            position: "fixed",
            inset: "0",
            zIndex: "99999",
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(9, 12, 18, .34)",
            backdropFilter: "blur(4px)",
            pointerEvents: "all"
        });

        const style = document.createElement("style");
        style.textContent = `
            #codeNestLoading .cn-loading-card {
                min-width: 220px;
                max-width: calc(100vw - 40px);
                padding: 22px 24px;
                border: 1px solid rgba(127, 135, 155, .22);
                border-radius: 16px;
                background: rgba(255,255,255,.96);
                color: #171a21;
                box-shadow: 0 20px 70px rgba(0,0,0,.18);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                text-align: center;
            }

            body.dark #codeNestLoading .cn-loading-card {
                background: rgba(18,23,32,.97);
                color: #f3f5f8;
            }

            #codeNestLoading strong {
                font-size: 14px;
            }

            #codeNestLoading span {
                color: #737b89;
                font-size: 11px;
            }

            #codeNestLoading .cn-spinner {
                width: 27px;
                height: 27px;
                border-radius: 50%;
                border: 3px solid rgba(91,92,226,.18);
                border-top-color: #5b5ce2;
                animation: cnSpin .75s linear infinite;
            }

            @keyframes cnSpin {
                to { transform: rotate(360deg); }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(el);

        return el;
    }

    function setLoading(loading, title = "読み込み中…", text = "しばらくお待ちください") {
        if (!document.body) return;

        const el = ensureLoadingUI();

        if (loading) {
            loadingCount++;
            el.querySelector("#codeNestLoadingTitle").textContent = title;
            el.querySelector("#codeNestLoadingText").textContent = text;
            el.style.display = "flex";
            document.body.dataset.codeNestBusy = "true";
        } else {
            loadingCount = Math.max(0, loadingCount - 1);

            if (loadingCount === 0) {
                el.style.display = "none";
                delete document.body.dataset.codeNestBusy;
            }
        }
    }

    globalThis.codeNestSetLoading = setLoading;

    // loadPyodide が実行されるときにもロード中UIを出す。
    function wrapPyodideLoader() {
        if (
            typeof globalThis.loadPyodide !== "function" ||
            globalThis.__codeNestLoadPyodideWrapped
        ) {
            return;
        }

        const original = globalThis.loadPyodide;

        globalThis.loadPyodide = async function (...args) {
            setLoading(
                true,
                "Pythonを読み込み中…",
                "初回起動では少し時間がかかります"
            );

            try {
                return await original.apply(this, args);
            } finally {
                setLoading(false);
            }
        };

        globalThis.__codeNestLoadPyodideWrapped = true;
    }

    function escapePythonString(value) {
        return JSON.stringify(String(value));
    }

    async function ensurePyodide() {
        wrapPyodideLoader();

        if (globalThis.__codeNestPyodide) {
            return globalThis.__codeNestPyodide;
        }

        if (typeof globalThis.codeNestLoadPython === "function") {
            return await globalThis.codeNestLoadPython();
        }

        if (typeof globalThis.loadPyodide !== "function") {
            throw new Error(
                "Pythonランタイムを起動できません。ページを再読み込みしてもう一度お試しください。"
            );
        }

        const pyodide = await globalThis.loadPyodide({
            indexURL:
                `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
        });

        globalThis.__codeNestPyodide = pyodide;
        return pyodide;
    }

    async function ensureMicropip(pyodide) {
        if (pipReady) return;

        setLoading(
            true,
            "Pythonパッケージを準備中…",
            "micropip を読み込んでいます"
        );

        try {
            await pyodide.loadPackage("micropip");

            await pyodide.runPythonAsync(`
import micropip
print("micropip OK")
`);

            pipReady = true;
        } finally {
            setLoading(false);
        }
    }

    async function installPackage(pyodide, packageSpec) {
        await ensureMicropip(pyodide);

        setLoading(
            true,
            "パッケージをインストール中…",
            packageSpec
        );

        try {
            await pyodide.runPythonAsync(`
import micropip

package_name = ${escapePythonString(packageSpec)}

print(f"Installing: {package_name}")

await micropip.install(package_name)

print(f"Successfully installed: {package_name}")
`);
        } finally {
            setLoading(false);
        }

        return `Successfully installed: ${packageSpec}`;
    }

    // ------------------------------------------------------------
    // ScratchAttach
    // ------------------------------------------------------------

    async function setupScratchAttach(pyodide) {
        if (scratchAttachReady) return;

        await ensureMicropip(pyodide);

        setLoading(
            true,
            "ScratchAttachを準備中…",
            "ブラウザ互換レイヤーを構築しています"
        );

        try {
            // ScratchAttach 2.2.3 は requests / SSL / WebSocket 系を
            // 利用するため、ブラウザで問題になる部分を先に準備する。

            try {
                await pyodide.loadPackage("ssl");
                log("ssl OK");
            } catch (error) {
                log("ssl package is unavailable; continuing with browser mode");
            }

            await pyodide.runPythonAsync(`
import sys
import types

# ------------------------------------------------------------
# SimpleWebSocketServer
# ------------------------------------------------------------

class _CodeNestWebSocketServer:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(
            "Local WebSocket servers are not supported in "
            "Code Nest browser mode."
        )

    def serveforever(self, *args, **kwargs):
        raise RuntimeError(
            "Local WebSocket servers are not supported in "
            "Code Nest browser mode."
        )

_simple_ws = types.ModuleType("SimpleWebSocketServer")
_simple_ws.WebSocket = object
_simple_ws.SimpleWebSocketServer = _CodeNestWebSocketServer
_simple_ws.SimpleSSLWebSocketServer = _CodeNestWebSocketServer

sys.modules["SimpleWebSocketServer"] = _simple_ws

# ------------------------------------------------------------
# browser_cookie3
# ------------------------------------------------------------

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
`);

            // --------------------------------------------------------
            // Install scratchattach
            // --------------------------------------------------------

            await pyodide.runPythonAsync(`
import micropip

await micropip.install(
    "scratchattach==${SCRATCHATTACH_VERSION}"
)

print("Successfully installed: scratchattach ${SCRATCHATTACH_VERSION}")
`);

            // --------------------------------------------------------
            // Import
            // --------------------------------------------------------

            await pyodide.runPythonAsync(`
import scratchattach
print("Import check: scratchattach OK")
`);

            // --------------------------------------------------------
            // Browser HTTP bridge
            //
            // Important:
            // Do NOT replace scratchattach.utils.requests.get directly.
            // ScratchAttach 2.x uses requests.Session underneath.
            //
            // We rewrite Scratch URLs to the Code Nest Worker BEFORE
            // requests performs the actual browser request.
            // This keeps the normal synchronous requests API intact.
            // --------------------------------------------------------

            await pyodide.runPythonAsync(`
import urllib.parse
import requests

_CODE_NEST_WORKER = ${escapePythonString(WORKER_URL)}

_ALLOWED_SCRATCH_HOSTS = {
    "api.scratch.mit.edu",
    "scratch.mit.edu",
    "clouddata.scratch.mit.edu"
}

_original_session_request = requests.sessions.Session.request

def _code_nest_request(self, method, url, *args, **kwargs):
    try:
        parsed = urllib.parse.urlparse(str(url))

        if (
            parsed.scheme == "https"
            and parsed.hostname in _ALLOWED_SCRATCH_HOSTS
        ):
            encoded = urllib.parse.quote(
                str(url),
                safe=""
            )

            url = (
                f"{_CODE_NEST_WORKER}/scratch-proxy"
                f"?url={encoded}"
            )

    except Exception:
        # If URL parsing fails, preserve requests' normal behaviour.
        pass

    return _original_session_request(
        self,
        method,
        url,
        *args,
        **kwargs
    )

requests.sessions.Session.request = _code_nest_request

print("Code Nest Scratch API bridge enabled")
`);

            // --------------------------------------------------------
            // Final import check
            // --------------------------------------------------------

            await pyodide.runPythonAsync(`
import scratchattach
print("ScratchAttach browser compatibility ready")
`);

            scratchAttachReady = true;
        } finally {
            setLoading(false);
        }
    }

    async function pipInstall(packageSpec) {
        const pyodide = await ensurePyodide();

        // app.js currently passes an array for arguments.
        // Normalize it here so both strings and arrays work.
        let normalized;

        if (Array.isArray(packageSpec)) {
            normalized = packageSpec.join(" ").trim();
        } else {
            normalized = String(packageSpec ?? "").trim();
        }

        if (!normalized) {
            throw new Error("pip: package name is missing");
        }

        const lower = normalized.toLowerCase();

        if (
            lower === "scratchattach" ||
            lower.startsWith("scratchattach ") ||
            lower.startsWith("scratchattach==") ||
            lower.startsWith("scratchattach>=")
        ) {
            await setupScratchAttach(pyodide);

            return (
                `Successfully installed: ${normalized}\n` +
                "Import check: scratchattach OK\n" +
                "Browser compatibility mode enabled"
            );
        }

        return await installPackage(
            pyodide,
            normalized
        );
    }

    globalThis.codeNestPipInstall = pipInstall;

    globalThis.setupCodeNestScratchAttach = async () => {
        const pyodide = await ensurePyodide();
        await setupScratchAttach(pyodide);
        return true;
    };

    // Pyodide may already have been loaded before this module executes.
    wrapPyodideLoader();

    log("pip.js loaded — V0.3.2");
})();
