(() => {
  'use strict';

  const PREFIX = '[Code Nest Bash Python]';
  const PYODIDE_SRC = 'https://cdn.jsdelivr.net/pyodide/v0.314.0.7/full/pyodide.js';
  const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.314.0.7/full/';
  let pyodidePromise = null;
  let initDone = false;

  const log = (...args) => console.log(PREFIX, ...args);

  function print(text, cls = '') {
    const root = document.getElementById('bashOutput');
    if (!root) return;
    const line = document.createElement('div');
    line.className = 'bash-line ' + cls;
    line.textContent = String(text);
    root.appendChild(line);
    root.scrollTop = root.scrollHeight;
  }

  function isPipInstall(command) {
    return /^(?:pip|python\s+-m\s+pip|python3\s+-m\s+pip|py\s+-m\s+pip)\s+install(?:\s+(.+))?$/i.exec(command.trim());
  }

  function isPythonCommand(command) {
    return /^(?:python|python3|py)(?:\s+.*)?$/i.test(command.trim());
  }

  function splitArgs(command) {
    const tokens = [];
    let current = '';
    let quote = '';
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
      const ch = command[i];

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\' && quote !== "'") {
        escaped = true;
        continue;
      }

      if (quote) {
        if (ch === quote) {
          quote = '';
        } else {
          current += ch;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }

      if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += ch;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
  }

  async function ensurePyodide() {
    if (
      globalThis.__codeNestBashPyodide &&
      typeof globalThis.__codeNestBashPyodide.runPythonAsync === 'function'
    ) {
      return globalThis.__codeNestBashPyodide;
    }

    if (pyodidePromise) {
      return pyodidePromise;
    }

    pyodidePromise = (async () => {
      if (typeof globalThis.loadPyodide !== 'function') {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-code-nest-bash-pyodide]'
          );

          if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener(
              'error',
              () => reject(new Error('Pyodideの読み込みに失敗しました。')),
              { once: true }
            );
            return;
          }

          const script = document.createElement('script');
          script.src = PYODIDE_SRC;
          script.async = true;
          script.dataset.codeNestBashPyodide = '1';
          script.onload = resolve;
          script.onerror = () =>
            reject(new Error('Pyodideの読み込みに失敗しました。'));
          document.head.appendChild(script);
        });
      }

      const runtime = await globalThis.loadPyodide({
        indexURL: PYODIDE_INDEX
      });

      globalThis.__codeNestBashPyodide = runtime;
      await runtime.loadPackage('micropip');

      return runtime;
    })();

    try {
      return await pyodidePromise;
    } catch (error) {
      pyodidePromise = null;
      throw error;
    }
  }

  function getShell() {
    if (
      globalThis.CodeNestBash &&
      typeof globalThis.CodeNestBash.loadRuntime === 'function'
    ) {
      return globalThis.CodeNestBash.loadRuntime();
    }

    throw new Error('Code Nest Bash runtime is not ready.');
  }

  async function readShellFile(path) {
    const shell = await getShell();
    const result = await shell.exec('cat ' + shellQuote(path));

    if (typeof result === 'string') {
      return result;
    }

    const code =
      Number.isFinite(result?.code)
        ? result.code
        : Number.isFinite(result?.exitCode)
          ? result.exitCode
          : 0;

    const stderr = String(result?.stderr || '');

    if (code !== 0 || stderr) {
      throw new Error(
        stderr || `python: cannot read ${path}`
      );
    }

    return String(result?.stdout || '');
  }

  function missingModuleName(errorText) {
    const match = String(errorText).match(
      /ModuleNotFoundError:\s+No module named ['"]([^'"]+)['"]/
    );

    if (!match) return '';

    const moduleName = match[1].split('.')[0];

    const aliases = {
      PIL: 'pillow',
      bs4: 'beautifulsoup4',
      cv2: 'opencv-python',
      yaml: 'pyyaml',
      skimage: 'scikit-image'
    };

    return aliases[moduleName] || moduleName;
  }

  async function installPythonPackage(spec) {
    const pyodide = await ensurePyodide();
    const packageSpec = String(spec || '').trim();

    if (!packageSpec) {
      throw new Error('pip: missing package specification');
    }

    const escaped = JSON.stringify(packageSpec);

    await pyodide.runPythonAsync(`
import micropip
await micropip.install(${escaped})
`);

    return packageSpec;
  }

  async function runPythonSource(source, filename, args = []) {
    const pyodide = await ensurePyodide();
    const scriptName = String(filename || '<string>');
    const cwd =
      globalThis.__codeNestPythonCwd ||
      '/home/coder';

    pyodide.globals.set(
      '__code_nest_argv_json',
      JSON.stringify([scriptName, ...args])
    );

    pyodide.globals.set(
      '__code_nest_source',
      String(source)
    );

    pyodide.globals.set(
      '__code_nest_filename',
      scriptName
    );

    pyodide.globals.set(
      '__code_nest_cwd',
      cwd
    );

    try {
      await pyodide.runPythonAsync(`
import io
import json
import os
import sys

os.makedirs(__code_nest_cwd, exist_ok=True)
os.chdir(__code_nest_cwd)

_cn_old_stdout = sys.stdout
_cn_old_stderr = sys.stderr
_cn_stdout = io.StringIO()
_cn_stderr = io.StringIO()
sys.stdout = _cn_stdout
sys.stderr = _cn_stderr

try:
    sys.argv = json.loads(__code_nest_argv_json)
    exec(
        compile(
            __code_nest_source,
            __code_nest_filename,
            "exec"
        ),
        globals(),
        globals()
    )
finally:
    sys.stdout = _cn_old_stdout
    sys.stderr = _cn_old_stderr

__code_nest_stdout = _cn_stdout.getvalue()
__code_nest_stderr = _cn_stderr.getvalue()
`);

      const stdout = pyodide.globals
        .get('__code_nest_stdout')
        .toJs();

      const stderr = pyodide.globals
        .get('__code_nest_stderr')
        .toJs();

      return {
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        code: 0
      };
    } catch (error) {
      let message =
        error?.message ||
        String(error);

      return {
        stdout: '',
        stderr:
          String(message).replace(
            /\n?$/,
            '\n'
          ),
        code: 1
      };
    }
  }

  async function runPythonWithAutoInstall(
    source,
    filename,
    args = []
  ) {
    let result = await runPythonSource(
      source,
      filename,
      args
    );

    if (result.code === 0) {
      return result;
    }

    const packageName =
      missingModuleName(result.stderr);

    if (!packageName) {
      return result;
    }

    print(
      `Installing missing Python package: ${packageName}`,
      'bash-system'
    );

    try {
      await installPythonPackage(
        packageName
      );

      print(
        `Installed: ${packageName}`,
        'bash-system'
      );

      result = await runPythonSource(
        source,
        filename,
        args
      );
    } catch (error) {
      result.stderr +=
        String(
          error?.message ||
          error
        ).replace(/\n?$/, '\n');
    }

    return result;
  }

  async function runPython(
    command,
    input
  ) {
    const args = splitArgs(command);

    if (
      !args.length ||
      !/^(?:python|python3|py)$/i.test(args[0])
    ) {
      return false;
    }

    if (input) {
      input.value = '';
    }

    print(
      'coder@code-nest:/ $ ' + command,
      'bash-command'
    );

    try {
      if (
        args[1] === '--version' ||
        args[1] === '-V'
      ) {
        const pyodide = await ensurePyodide();
        const version = pyodide.runPython(
          'import sys; sys.version.split()[0]'
        );
        print(
          `Python ${version} (Pyodide)`
        );
        return true;
      }

      if (!args[1]) {
        const pyodide = await ensurePyodide();
        const version = pyodide.runPython(
          'import sys; sys.version'
        );

        print(
          String(version)
        );

        return true;
      }

      if (
        args[1] === '-c' ||
        args[1] === '--command'
      ) {
        const source =
          args.slice(2).join(' ');

        if (!source) {
          print(
            'python: option -c requires an argument',
            'bash-error'
          );
          return true;
        }

        const result =
          await runPythonWithAutoInstall(
            source,
            '<string>',
            []
          );

        if (result.stdout) {
          print(result.stdout);
        }

        if (result.stderr) {
          print(
            result.stderr,
            'bash-error'
          );
        }

        return true;
      }

      if (args[1] === '-m') {
        const module =
          args[2];

        if (!module) {
          print(
            'python: option -m requires an argument',
            'bash-error'
          );
          return true;
        }

        if (module === 'pip') {
          const pipCommand =
            ['pip', ...args.slice(3)].join(' ');

          await runPip(
            pipCommand,
            input
          );

          return true;
        }

        const moduleArgs =
          args.slice(3);

        const code = `
import runpy
import sys
sys.argv = ${JSON.stringify([module, ...moduleArgs])}
runpy.run_module(
    ${JSON.stringify(module)},
    run_name="__main__"
)
`;

        const result =
          await runPythonWithAutoInstall(
            code,
            `-m ${module}`,
            moduleArgs
          );

        if (result.stdout) {
          print(result.stdout);
        }

        if (result.stderr) {
          print(
            result.stderr,
            'bash-error'
          );
        }

        return true;
      }

      const script = args[1];
      const scriptArgs = args.slice(2);
      const source = await readShellFile(script);

      globalThis.__codeNestPythonCwd =
        '/home/coder';

      const result =
        await runPythonWithAutoInstall(
          source,
          script,
          scriptArgs
        );

      if (result.stdout) {
        print(result.stdout);
      }

      if (result.stderr) {
        print(
          result.stderr,
          'bash-error'
        );
      }

      return true;
    } catch (error) {
      print(
        String(
          error?.message ||
          error
        ),
        'bash-error'
      );

      return true;
    }
  }

  async function runPip(
    command,
    input
  ) {
    const match =
      isPipInstall(command);

    if (!match) {
      return false;
    }

    const spec =
      String(
        match[1] || ''
      ).trim();

    if (input) {
      input.value = '';
    }

    print(
      'coder@code-nest:/ $ ' + command,
      'bash-command'
    );

    try {
      if (!spec) {
        throw new Error(
          'pip: missing package specification'
        );
      }

      const installed =
        await installPythonPackage(
          spec
        );

      print(
        `Installed: ${installed}`,
        'bash-system'
      );
    } catch (error) {
      print(
        String(
          error?.message ||
          error
        ),
        'bash-error'
      );
    }

    return true;
  }

  async function handleSubmit(event) {
    const input =
      document.getElementById(
        'bashInput'
      );

    if (!input) return;

    const command =
      String(
        input.value || ''
      ).trim();

    if (
      isPipInstall(command) ||
      isPythonCommand(command)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (isPipInstall(command)) {
        await runPip(
          command,
          input
        );
      } else {
        await runPython(
          command,
          input
        );
      }
    }
  }

  async function handleKeydown(event) {
    if (
      event.key !== 'Enter' ||
      event.isComposing
    ) {
      return;
    }

    const input =
      event.target?.closest?.(
        '#bashInput'
      );

    if (!input) return;

    const command =
      String(
        input.value || ''
      ).trim();

    if (
      !isPipInstall(command) &&
      !isPythonCommand(command)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (isPipInstall(command)) {
      await runPip(
        command,
        input
      );
    } else {
      await runPython(
        command,
        input
      );
    }
  }

  function init() {
    const form =
      document.getElementById(
        'bashForm'
      );

    const input =
      document.getElementById(
        'bashInput'
      );

    if (
      !form ||
      !input ||
      initDone
    ) {
      return;
    }

    initDone = true;

    form.addEventListener(
      'submit',
      handleSubmit,
      true
    );

    input.addEventListener(
      'keydown',
      handleKeydown,
      true
    );

    log(
      'READY V0.5.0 PYTHON'
    );
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );
  } else {
    init();
  }

  setTimeout(
    init,
    0
  );

  setTimeout(
    init,
    250
  );
})();
