// Code Nest V0.3
// Browser Pyodide package bridge
// Supports:
//   pip install <package>
//   python -m pip install <package>

const PIP_INSTALL_RE =
  /^(?:python\s+-m\s+pip|python3\s+-m\s+pip|py\s+-m\s+pip|pip)\s+install(?:\s+--[^\s]+)*\s+(.+)$/i;

const SCRATCHATTACH_VERSION = "2.2.3";

const SCRATCHATTACH_DEPS = [
  "websocket-client",
  "requests",
  "bs4",
  "typing-extensions",
  "aiohttp",
  "rich"
];

function parsePipInstall(input) {
  const match = input.trim().match(PIP_INSTALL_RE);
  if (!match) return null;

  const parts =
    match[1].match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];

  const specs = parts
    .filter(x => x && !x.startsWith("-"))
    .map(x => x.replace(/^['"]|['"]$/g, ""));

  return specs.length ? specs : null;
}

function isScratchattach(spec) {
  return /^scratchattach(?:[<>=!~\[]|$)/i.test(spec.trim());
}

function packageImportName(spec) {
  return spec
    .split(/[<>=!~\[]/, 1)[0]
    .trim()
    .replace(/-/g, "_");
}

async function getPyodide() {
  if (globalThis.__codeNestPyodide) {
    return globalThis.__codeNestPyodide;
  }

  const addButton = document.querySelector("#addCodeBtn");

  if (!addButton) {
    throw new Error("Code Nest: Codeセルを作成できません");
  }

  addButton.click();

  await new Promise(resolve => setTimeout(resolve, 50));

  const cells = [
    ...document.querySelectorAll('.cell[data-type="code"]')
  ];

  const cell = cells[cells.length - 1];

  if (!cell) {
    throw new Error("Code Nest: Pythonセルを作成できません");
  }

  const textarea = cell.querySelector("textarea");
  const runButton = cell.querySelector('button[data-act="run"]');
  const output = cell.querySelector(".output");

  textarea.value =
    'print("__CODE_NEST_PYODIDE_READY__")';

  runButton.click();

  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));

    if (globalThis.__codeNestPyodide) {
      return globalThis.__codeNestPyodide;
    }

    if (
      output &&
      output.textContent &&
      output.textContent !== "実行中…"
    ) {
      break;
    }
  }

  throw new Error(
    "Code Nest: Pyodide runtimeを取得できませんでした"
  );
}

async function loadScratchattachEnvironment(py) {
  // Pyodideではsslが遅延ロードされるため、
  // scratchattach importの前に明示的にロードする。
  try {
    await py.loadPackage("ssl");
  } catch (error) {
    throw new Error(
      "Code Nest: sslのロードに失敗しました\n" +
      String(error)
    );
  }

  // scratchattachが要求するSimpleWebSocketServerを
  // ブラウザ用の最低限の互換モジュールとして用意。
  await py.runPythonAsync(`
import sys
import types

if "SimpleWebSocketServer" not in sys.modules:
    module = types.ModuleType("SimpleWebSocketServer")

    class WebSocket:
        def __init__(self, *args, **kwargs):
            self.data = ""
            self.address = ("browser", 0)

        def sendMessage(self, *args, **kwargs):
            raise RuntimeError(
                "SimpleWebSocketServer is unavailable in Code Nest browser runtime"
            )

        def close(self, *args, **kwargs):
            return None

    class SimpleWebSocketServer:
        def __init__(self, *args, **kwargs):
            self.hostname = (
                args[0]
                if args
                else kwargs.get("hostname", "")
            )

            self.port = (
                args[1]
                if len(args) > 1
                else kwargs.get("port", 0)
            )

            self.websocketclass = kwargs.get(
                "websocketclass"
            )

        def serveforever(self):
            raise RuntimeError(
                "SimpleWebSocketServer is unavailable in Code Nest browser runtime"
            )

        def close(self):
            return None

    module.WebSocket = WebSocket
    module.SimpleWebSocketServer = SimpleWebSocketServer

    sys.modules["SimpleWebSocketServer"] = module
`);

  // browser_cookie3はブラウザ内から
  // デスクトップブラウザのCookie DBを読む用途なので不要。
  // ただしscratchattach側が参照しても落ちないよう最低限のstubを用意。
  await py.runPythonAsync(`
import sys
import types

if "browser_cookie3" not in sys.modules:
    browser_cookie3 = types.ModuleType("browser_cookie3")

    def _unsupported(*args, **kwargs):
        raise RuntimeError(
            "browser_cookie3 is unavailable in Code Nest browser runtime"
        )

    browser_cookie3.load = _unsupported
    browser_cookie3.chrome = _unsupported
    browser_cookie3.chromium = _unsupported
    browser_cookie3.firefox = _unsupported
    browser_cookie3.edge = _unsupported
    browser_cookie3.safari = _unsupported
    browser_cookie3.vivaldi = _unsupported

    sys.modules["browser_cookie3"] = browser_cookie3
`);
}

async function installScratchattach(py) {
  await loadScratchattachEnvironment(py);

  // scratchattach本体をインストール
  await py.runPythonAsync(`
import micropip

await micropip.install(
    ${JSON.stringify(
      `scratchattach==${SCRATCHATTACH_VERSION}`
    )},
    deps=False
)
`);

  // 通常依存をインストール
  await py.runPythonAsync(`
import micropip

await micropip.install(
    ${JSON.stringify(SCRATCHATTACH_DEPS)}
)
`);

  // 最終import確認
  await py.runPythonAsync(`
import ssl
import scratchattach

print(
    "Successfully installed: "
    "scratchattach ${SCRATCHATTACH_VERSION}"
)

print("Import check: scratchattach OK")
print("Import check: ssl OK")
`);
}

async function installNormalPackages(py, specs) {
  if (!specs.length) return "";

  const imports =
    specs.map(packageImportName);

  const code = `
import micropip

await micropip.install(
    ${JSON.stringify(specs)}
)

modules = ${JSON.stringify(imports)}

loaded = []

for name in modules:
    try:
        __import__(name)
        loaded.append(name)
    except Exception as exc:
        raise RuntimeError(
            f"Installed but import failed for {name}: {exc}"
        ) from exc

print(
    "Successfully installed: "
    + ", ".join(${JSON.stringify(specs)})
)

print(
    "Import check: "
    + ", ".join(loaded)
)
`;

  let output = "";

  py.setStdout({
    batched: text => {
      output += text + "\n";
    }
  });

  py.setStderr({
    batched: text => {
      output += text + "\n";
    }
  });

  await py.runPythonAsync(code);

  return output.trimEnd();
}

async function runPipInstall(specs) {
  const py = await getPyodide();

  await py.loadPackage("micropip");

  const scratchPackages =
    specs.filter(isScratchattach);

  const normalPackages =
    specs.filter(spec => !isScratchattach(spec));

  const results = [];

  if (normalPackages.length) {
    results.push(
      await installNormalPackages(
        py,
        normalPackages
      )
    );
  }

  if (scratchPackages.length) {
    await installScratchattach(py);

    results.push(
      `Successfully installed: scratchattach ${SCRATCHATTACH_VERSION}`,
      "Import check: scratchattach OK",
      "Import check: ssl OK",
      "Browser compatibility mode enabled"
    );
  }

  return results
    .filter(Boolean)
    .join("\n");
}

function appendBashOutput(
  command,
  result,
  error = false
) {
  const output =
    document.querySelector("#bashOutput");

  if (!output) return;

  const line =
    document.createElement("div");

  line.className =
    "bash-line" +
    (error ? " error" : "");

  const prompt =
    document.createElement("span");

  prompt.className = "prompt";
  prompt.textContent = "$ ";

  const commandEl =
    document.createElement("span");

  commandEl.className = "command";
  commandEl.textContent = command;

  const resultEl =
    document.createElement("div");

  resultEl.className = "result";
  resultEl.textContent = String(result);

  line.appendChild(prompt);
  line.appendChild(commandEl);
  line.appendChild(resultEl);

  output.appendChild(line);

  output.scrollTop =
    output.scrollHeight;
}

async function handlePipCommand(
  command,
  context,
  terminalCell = null
) {
  const specs =
    parsePipInstall(command);

  if (!specs) {
    return false;
  }

  if (
    context === "terminal" &&
    terminalCell
  ) {
    const output =
      terminalCell.querySelector(
        ".terminal-output"
      );

    try {
      const result =
        await runPipInstall(specs);

      if (output) {
        output.textContent =
          `$ ${command}\n${result}`;

        output.classList.add(
          "visible"
        );

        output.dataset.history =
          output.textContent;
      }
    } catch (error) {
      if (output) {
        output.textContent =
          `$ ${command}\nERROR: ${error}`;

        output.classList.add(
          "visible"
        );

        output.dataset.history =
          output.textContent;
      }
    }

    return true;
  }

  if (context === "bash") {
    try {
      const result =
        await runPipInstall(specs);

      appendBashOutput(
        command,
        result,
        false
      );
    } catch (error) {
      appendBashOutput(
        command,
        "ERROR: " +
          String(error),
        true
      );
    }

    return true;
  }

  return false;
}

// Terminalセル対応
document.addEventListener(
  "keydown",
  async event => {
    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

    const textarea =
      event.target.closest?.(
        ".terminal-input"
      );

    if (!textarea) return;

    const command =
      textarea.value.trim();

    if (!parsePipInstall(command)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    await handlePipCommand(
      command,
      "terminal",
      textarea.closest(".cell")
    );
  },
  true
);

// Bashコンソール対応
document.addEventListener(
  "submit",
  async event => {
    if (
      event.target?.id !==
      "bashForm"
    ) {
      return;
    }

    const input =
      document.querySelector(
        "#bashInput"
      );

    const command =
      input?.value.trim() || "";

    if (!parsePipInstall(command)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (input) {
      input.value = "";
    }

    await handlePipCommand(
      command,
      "bash"
    );
  },
  true
);

// app.jsからも使えるよう公開
globalThis.codeNestPipInstall =
  async specs => {
    return runPipInstall(
      Array.isArray(specs)
        ? specs
        : [specs]
    );
  };

console.log(
  "Code Nest V0.3 Pip bridge loaded"
);
