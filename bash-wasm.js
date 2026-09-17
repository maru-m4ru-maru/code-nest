(() => {
  "use strict";

  const state = {
    ready: false,
    loading: false,
    terminal: null,
    terminalPromise: null,
    history: [],
    historyIndex: -1,
    sandbox: localStorage.getItem("codeNest.bash.sandbox") !== "off"
  };

  let pyodidePromise = null;

  if (!document.getElementById("toast")) {
    const toast = document.createElement("div");
    toast.id = "toast";
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  const originalQuerySelector = Document.prototype.querySelector;

  if (!globalThis.__codeNestCellQueryPatch) {
    Document.prototype.querySelector = function(selector) {
      const result = originalQuerySelector.call(this, selector);

      if (
        selector === ".cell" &&
        result &&
        typeof result.map !== "function"
      ) {
        Object.defineProperty(result, "map", {
          configurable: true,
          value(callback, thisArg) {
            return [...document.querySelectorAll(".cell")].map(
              callback,
              thisArg
            );
          }
        });
      }

      return result;
    };

    globalThis.__codeNestCellQueryPatch = true;
  }

  const output = () =>
    document.getElementById("bashOutput");

  const input = () =>
    document.getElementById("bashInput");

  const status = text => {
    const el = document.getElementById("bashPrompt");

    if (el) {
      el.textContent =
        text || "coder@code-nest:/ $";
    }
  };

  function print(text, cls = "") {
    const root = output();

    if (!root) return;

    const line = document.createElement("div");
    line.className = "bash-line " + cls;
    line.textContent = String(text);

    root.appendChild(line);
    root.scrollTop = root.scrollHeight;
  }

  function clear() {
    const root = output();
    if (root) root.textContent = "";
  }

  function sandboxLabel() {
    return state.sandbox
      ? "Sandbox ON"
      : "Sandbox OFF";
  }

  function updateSandboxButton() {
    const button =
      document.getElementById(
        "bashSandboxToggle"
      );

    if (!button) return;

    button.textContent =
      sandboxLabel();

    button.title =
      state.sandbox
        ? "安全モード。クリックするとOFFにできます"
        : "Sandbox OFF。クリックすると安全モードに戻します";

    button.setAttribute(
      "aria-pressed",
      String(!state.sandbox)
    );

    button.dataset.sandbox =
      state.sandbox
        ? "on"
        : "off";
  }

  function setSandboxMode(
    enabled,
    announce = true
  ) {
    state.sandbox =
      Boolean(enabled);

    localStorage.setItem(
      "codeNest.bash.sandbox",
      state.sandbox
        ? "on"
        : "off"
    );

    updateSandboxButton();

    globalThis.__codeNestBashSandbox =
      state.sandbox;

    if (announce) {
      print(
        state.sandbox
          ? "[Sandbox] ON"
          : "[Sandbox] OFF",
        state.sandbox
          ? "bash-system"
          : "bash-error"
      );
    }
  }

  function toggleSandbox() {
    if (state.sandbox) {
      const confirmed =
        window.confirm(
          "SandboxをOFFにしますか？\n\n" +
          "Code Nest側の安全制限が弱くなります。" +
          "信頼できないコードやパッケージを実行しないでください。\n\n" +
          "ブラウザやOSのセキュリティ機構は無効になりません。"
        );

      if (!confirmed) return;

      setSandboxMode(false);
      return;
    }

    setSandboxMode(true);
  }

  function ensureSandboxButton() {
    const existing =
      document.getElementById(
        "bashSandboxToggle"
      );

    if (existing) {
      updateSandboxButton();
      return existing;
    }

    const actions =
      document.querySelector(
        ".bash-head-actions"
      );

    if (!actions) return null;

    const button =
      document.createElement(
        "button"
      );

    button.type = "button";
    button.id =
      "bashSandboxToggle";
    button.className =
      "bash-btn sandbox-toggle";

    button.addEventListener(
      "click",
      toggleSandbox
    );

    actions.insertBefore(
      button,
      actions.lastElementChild || null
    );

    updateSandboxButton();

    return button;
  }

  function loadScript(src) {
    return new Promise(
      (resolve, reject) => {
        const existing =
          document.querySelector(
            `script[src="${src}"]`
          );

        if (existing) {
          if (
            typeof globalThis.loadPyodide ===
            "function"
          ) {
            resolve();
            return;
          }

          existing.addEventListener(
            "load",
            resolve,
            { once: true }
          );

          existing.addEventListener(
            "error",
            reject,
            { once: true }
          );

          return;
        }

        const script =
          document.createElement(
            "script"
          );

        script.src = src;
        script.async = true;

        script.onload = () =>
          resolve();

        script.onerror = () =>
          reject(
            new Error(
              "Pyodideの読み込みに失敗しました。"
            )
          );

        document.head.appendChild(
          script
        );
      }
    );
  }

  async function loadPyodideRuntime() {
    if (
      globalThis.__codeNestPyodide &&
      typeof globalThis.__codeNestPyodide.runPythonAsync ===
        "function"
    ) {
      return globalThis.__codeNestPyodide;
    }

    if (
      globalThis.pyodide &&
      typeof globalThis.pyodide.runPythonAsync ===
        "function"
    ) {
      globalThis.__codeNestPyodide =
        globalThis.pyodide;

      return globalThis.pyodide;
    }

    if (
      !pyodidePromise
    ) {
      pyodidePromise =
        (async () => {
          if (
            typeof globalThis.loadPyodide !==
            "function"
          ) {
            await loadScript(
              "https://cdn.jsdelivr.net/pyodide/v0.314.0.7/full/pyodide.js"
            );
          }

          const runtime =
            await globalThis.loadPyodide({
              indexURL:
                "https://cdn.jsdelivr.net/pyodide/v0.314.0.7/full/"
            });

          globalThis.__codeNestPyodide =
            runtime;

          return runtime;
        })();
    }

    return pyodidePromise;
  }

  async function syncShellToPython(
    shell
  ) {
    const pyodide =
      await loadPyodideRuntime();

    const pythonRoot =
      "/home/coder";

    try {
      pyodide.FS.mkdirTree(
        pythonRoot
      );
    } catch {}

    for (
      const dir of shell.dirs
    ) {
      if (
        dir === "/" ||
        dir === "/home" ||
        dir === "/home/coder"
      ) {
        continue;
      }

      if (
        dir.startsWith(
          "/home/coder/"
        )
      ) {
        try {
          pyodide.FS.mkdirTree(
            dir
          );
        } catch {}
      }
    }

    for (
      const [path, value] of shell.files
    ) {
      if (
        !path.startsWith(
          "/home/coder/"
        )
      ) {
        continue;
      }

      const parent =
        path.slice(
          0,
          path.lastIndexOf("/")
        );

      try {
        pyodide.FS.mkdirTree(
          parent
        );
      } catch {}

      pyodide.FS.writeFile(
        path,
        String(value),
        {
          encoding:
            "utf8"
        }
      );
    }

    shell.syncEnv();

    const cwd =
      shell.cwd.startsWith(
        "/home/coder"
      )
        ? shell.cwd
        : "/home/coder";

    pyodide.runPython(
      `
import os
import sys
os.makedirs(${JSON.stringify(cwd)}, exist_ok=True)
os.chdir(${JSON.stringify(cwd)})
sys.path.insert(0, ${JSON.stringify(cwd)})
`
    );
  }

  function syncDirectoryFromPython(
    shell,
    path
  ) {
    const pyodide =
      globalThis.__codeNestPyodide;

    if (!pyodide) return;

    let entries;

    try {
      entries =
        pyodide.FS.readdir(path);
    } catch {
      return;
    }

    for (
      const name of entries
    ) {
      if (
        name === "." ||
        name === ".."
      ) {
        continue;
      }

      const full =
        path === "/"
          ? "/" + name
          : path + "/" + name;

      let stat;

      try {
        stat =
          pyodide.FS.stat(
            full
          );
      } catch {
        continue;
      }

      if (
        pyodide.FS.isDir(
          stat.mode
        )
      ) {
        shell.dirs.add(
          full
        );

        syncDirectoryFromPython(
          shell,
          full
        );

        continue;
      }

      if (
        pyodide.FS.isFile(
          stat.mode
        )
      ) {
        if (
          full.endsWith(
            ".pyc"
          ) ||
          full.includes(
            "/__pycache__/"
          )
        ) {
          continue;
        }

        try {
          const data =
            pyodide.FS.readFile(
              full,
              {
                encoding:
                  "utf8"
              }
            );

          shell.files.set(
            full,
            String(data)
          );

          shell.ensureParents(
            full
          );
        } catch {}
      }
    }
  }

  async function syncPythonToShell(
    shell
  ) {
    const pyodide =
      await loadPyodideRuntime();

    syncDirectoryFromPython(
      shell,
      "/home/coder"
    );

    shell.save();
  }

  async function executePython(
    shell,
    args
  ) {
    const pyodide =
      await loadPyodideRuntime();

    await syncShellToPython(
      shell
    );

    let stdout = "";
    let stderr = "";

    pyodide.setStdout({
      batched(text) {
        stdout +=
          String(text) +
          "\n";
      }
    });

    pyodide.setStderr({
      batched(text) {
        stderr +=
          String(text) +
          "\n";
      }
    });

    const cwd =
      shell.cwd.startsWith(
        "/home/coder"
      )
        ? shell.cwd
        : "/home/coder";

    const pythonArgs =
      args.slice();

    const first =
      pythonArgs[0] || "";

    try {
      if (
        first ===
          "--version" ||
        first ===
          "-V"
      ) {
        const version =
          pyodide.runPython(
            "import sys; sys.version"
          );

        return {
          stdout:
            version +
            "\n",
          stderr,
          code: 0
        };
      }

      if (
        first ===
        "-c"
      ) {
        const source =
          pythonArgs
            .slice(1)
            .join(" ");

        pyodide.globals.set(
          "__code_nest_argv",
          pythonArgs
            .slice(1)
        );

        await pyodide.runPythonAsync(
          `
import os
import sys

os.chdir(${JSON.stringify(cwd)})
sys.argv = ["-c"] + list(__code_nest_argv)

exec(
    compile(
        ${JSON.stringify(source)},
        "<string>",
        "exec"
    ),
    globals(),
    globals()
)
`
        );

        return {
          stdout,
          stderr,
          code: 0
        };
      }

      if (
        first ===
        "-m"
      ) {
        const module =
          pythonArgs[1];

        if (!module) {
          return {
            stdout,
            stderr:
              "python: option -m requires an argument\n",
            code: 2
          };
        }

        pyodide.globals.set(
          "__code_nest_module_args",
          pythonArgs
            .slice(2)
        );

        await pyodide.runPythonAsync(
          `
import os
import sys
import runpy

os.chdir(${JSON.stringify(cwd)})
sys.argv = [${JSON.stringify(module)}] + list(__code_nest_module_args)

runpy.run_module(
    ${JSON.stringify(module)},
    run_name="__main__"
)
`
        );

        return {
          stdout,
          stderr,
          code: 0
        };
      }

      if (
        !first ||
        first === "-"
      ) {
        const result =
          pyodide.runPython(
            "import sys; sys.version"
          );

        return {
          stdout:
            result +
            "\n",
          stderr,
          code: 0
        };
      }

      const scriptPath =
        shell.normalize(
          first
        );

      if (
        !shell.files.has(
          scriptPath
        )
      ) {
        return {
          stdout,
          stderr:
            `python: can't open file '${first}': [Errno 2] No such file or directory\n`,
          code: 2
        };
      }

      pyodide.globals.set(
        "__code_nest_script_args",
        pythonArgs
          .slice(1)
      );

      await pyodide.runPythonAsync(
        `
import os
import sys
import runpy

os.chdir(${JSON.stringify(cwd)})
sys.argv = [${JSON.stringify(scriptPath)}] + list(__code_nest_script_args)

runpy.run_path(
    ${JSON.stringify(scriptPath)},
    run_name="__main__"
)
`
      );

      await syncPythonToShell(
        shell
      );

      return {
        stdout,
        stderr,
        code: 0
      };
    } catch (error) {
      let message =
        error &&
        error.message
          ? String(error.message)
          : String(error);

      if (
        message &&
        !message.endsWith(
          "\n"
        )
      ) {
        message += "\n";
      }

      stderr +=
        message;

      try {
        await syncPythonToShell(
          shell
        );
      } catch {}

      return {
        stdout,
        stderr,
        code: 1
      };
    } finally {
      pyodide.setStdout({
        batched() {}
      });

      pyodide.setStderr({
        batched() {}
      });
    }
  }

  class BrowserShell {
    constructor(sandbox = true) {
      this.sandbox =
        sandbox;

      this.cwd = "/";

      this.dirs = new Set([
        "/",
        "/home",
        "/home/coder"
      ]);

      this.files = new Map([
        [
          "/README.txt",
          "Code Nest browser filesystem\n"
        ]
      ]);

      this.env = {
        HOME: "/home/coder",
        USER: "coder",
        SHELL: "/bin/bash",
        PWD: "/"
      };

      this.load();
    }

    load() {
      try {
        const raw =
          localStorage.getItem(
            "codeNest.bash.fs.v2"
          );

        if (!raw) {
          this.syncEnv();
          return;
        }

        const data =
          JSON.parse(raw);

        if (
          Array.isArray(
            data.dirs
          )
        ) {
          this.dirs =
            new Set(
              data.dirs
            );
        }

        if (
          Array.isArray(
            data.files
          )
        ) {
          this.files =
            new Map(
              data.files
            );
        }

        if (
          typeof data.cwd ===
          "string"
        ) {
          this.cwd =
            this.normalize(
              data.cwd
            );
        }

        if (
          data.env &&
          typeof data.env ===
          "object"
        ) {
          this.env = {
            ...this.env,
            ...data.env
          };
        }
      } catch {}

      this.dirs.add("/");
      this.dirs.add("/home");
      this.dirs.add("/home/coder");

      this.syncEnv();
    }

    save() {
      try {
        localStorage.setItem(
          "codeNest.bash.fs.v2",
          JSON.stringify({
            cwd: this.cwd,
            dirs: [...this.dirs],
            files: [...this.files],
            env: this.env
          })
        );
      } catch {}
    }

    syncEnv() {
      this.env.PWD =
        this.cwd;
    }

    normalize(path) {
      let value =
        String(
          path ?? ""
        ).trim();

      if (!value) {
        return this.cwd;
      }

      if (
        value === "~" ||
        value.startsWith("~/")
      ) {
        value =
          this.env.HOME +
          value.slice(1);
      }

      const raw =
        value.startsWith("/")
          ? value
          : this.cwd.replace(
              /\/$/,
              ""
            ) +
            "/" +
            value;

      const parts = [];

      for (
        const part of raw.split("/")
      ) {
        if (
          !part ||
          part === "."
        ) {
          continue;
        }

        if (
          part === ".."
        ) {
          parts.pop();
        } else {
          parts.push(part);
        }
      }

      return "/" +
        parts.join("/");
    }

    parent(path) {
      const value =
        this.normalize(path);

      if (value === "/") {
        return "/";
      }

      const index =
        value.lastIndexOf("/");

      if (index <= 0) {
        return "/";
      }

      return value.slice(
        0,
        index
      );
    }

    base(path) {
      const value =
        this.normalize(path);

      if (value === "/") {
        return "/";
      }

      return value.slice(
        value.lastIndexOf("/") + 1
      );
    }

    exists(path) {
      const value =
        this.normalize(path);

      return (
        this.dirs.has(value) ||
        this.files.has(value)
      );
    }

    isDir(path) {
      return this.dirs.has(
        this.normalize(path)
      );
    }

    isFile(path) {
      return this.files.has(
        this.normalize(path)
      );
    }

    ensureParents(path) {
      const value =
        this.normalize(path);

      if (value === "/") {
        return;
      }

      const parts =
        value.split(
          "/"
        ).filter(Boolean);

      let current = "";

      for (
        const part of parts
      ) {
        current +=
          "/" + part;

        if (
          !this.dirs.has(
            current
          )
        ) {
          this.dirs.add(
            current
          );
        }
      }
    }

    createDir(path) {
      const value =
        this.normalize(path);

      this.ensureParents(
        value
      );

      this.dirs.add(
        value
      );

      this.save();
    }

    writeFile(
      path,
      content,
      append = false
    ) {
      const value =
        this.normalize(path);

      const parent =
        this.parent(value);

      if (
        !this.dirs.has(parent)
      ) {
        throw new Error(
          `${parent}: No such directory`
        );
      }

      const old =
        this.files.get(value) ||
        "";

      this.files.set(
        value,
        append
          ? old + content
          : content
      );

      this.save();
    }

    readFile(path) {
      const value =
        this.normalize(path);

      if (
        !this.files.has(value)
      ) {
        throw new Error(
          `cat: ${path}: No such file`
        );
      }

      return this.files.get(
        value
      );
    }

    remove(
      path,
      recursive = false,
      force = false
    ) {
      const value =
        this.normalize(path);

      if (value === "/") {
        if (!force) {
          throw new Error(
            "rm: cannot remove root"
          );
        }

        return;
      }

      if (
        this.files.has(value)
      ) {
        this.files.delete(
          value
        );

        this.save();

        return;
      }

      if (
        !this.dirs.has(value)
      ) {
        if (force) return;

        throw new Error(
          `rm: ${path}: No such file or directory`
        );
      }

      const prefix =
        value.replace(
          /\/$/,
          ""
        ) + "/";

      const children = [
        ...this.files.keys()
      ].filter(
        key =>
          key.startsWith(
            prefix
          )
      );

      const dirs = [
        ...this.dirs
      ].filter(
        key =>
          key !== value &&
          key.startsWith(prefix)
      );

      if (
        !recursive &&
        (
          children.length ||
          dirs.length
        )
      ) {
        throw new Error(
          `rm: ${path}: Is a directory`
        );
      }

      for (
        const key of children
      ) {
        this.files.delete(
          key
        );
      }

      for (
        const key of dirs
      ) {
        this.dirs.delete(
          key
        );
      }

      this.dirs.delete(
        value
      );

      this.save();
    }

    copyTree(
      source,
      destination
    ) {
      const src =
        this.normalize(
          source
        );

      const dest =
        this.normalize(
          destination
        );

      if (
        this.files.has(src)
      ) {
        const parent =
          this.parent(dest);

        if (
          !this.dirs.has(parent)
        ) {
          throw new Error(
            `cp: ${destination}: No such directory`
          );
        }

        this.files.set(
          dest,
          this.files.get(src)
        );

        this.save();

        return;
      }

      if (
        !this.dirs.has(src)
      ) {
        throw new Error(
          `cp: ${source}: No such file or directory`
        );
      }

      const files = [
        ...this.files.entries()
      ].filter(
        ([key]) =>
          key === src ||
          key.startsWith(
            src.replace(
              /\/$/,
              ""
            ) + "/"
          )
      );

      this.dirs.add(
        dest
      );

      for (
        const dir of [
          ...this.dirs
        ]
      ) {
        if (
          dir === src ||
          dir.startsWith(
            src.replace(
              /\/$/,
              ""
            ) + "/"
          )
        ) {
          const relative =
            dir === src
              ? ""
              : dir.slice(
                  src.length
                );

          this.dirs.add(
            this.normalize(
              dest + relative
            )
          );
        }
      }

      for (
        const [key, value] of files
      ) {
        const relative =
          key.slice(
            src.length
          );

        this.files.set(
          this.normalize(
            dest + relative
          ),
          value
        );
      }

      this.save();
    }

    move(
      source,
      destination
    ) {
      const src =
        this.normalize(
          source
        );

      const dest =
        this.normalize(
          destination
        );

      if (
        !this.exists(src)
      ) {
        throw new Error(
          `mv: ${source}: No such file or directory`
        );
      }

      this.copyTree(
        src,
        dest
      );

      this.remove(
        src,
        true,
        true
      );

      this.save();
    }

    list(path = this.cwd) {
      const target =
        this.normalize(
          path
        );

      if (
        this.files.has(target)
      ) {
        return [
          {
            name:
              this.base(
                target
              ),
            type:
              "file"
          }
        ];
      }

      if (
        !this.dirs.has(target)
      ) {
        throw new Error(
          `ls: ${path}: No such file or directory`
        );
      }

      const prefix =
        target === "/"
          ? "/"
          : target.replace(
              /\/$/,
              ""
            ) + "/";

      const names =
        new Map();

      for (
        const dir of this.dirs
      ) {
        if (
          dir === target
        ) {
          continue;
        }

        if (
          dir.startsWith(prefix)
        ) {
          const rest =
            dir.slice(
              prefix.length
            );

          if (
            rest &&
            !rest.includes("/")
          ) {
            names.set(
              rest,
              "dir"
            );
          }
        }
      }

      for (
        const file of this.files.keys()
      ) {
        if (
          file.startsWith(prefix)
        ) {
          const rest =
            file.slice(
              prefix.length
            );

          if (
            rest &&
            !rest.includes("/")
          ) {
            names.set(
              rest,
              "file"
            );
          }
        }
      }

      return [...names.entries()]
        .sort(
          (a, b) =>
            a[0].localeCompare(
              b[0]
            )
        )
        .map(
          ([name, type]) => ({
            name,
            type
          })
        );
    }

    tokenize(line) {
      const tokens = [];
      let current = "";
      let quote = "";
      let escaped = false;

      const flush = () => {
        if (
          current !== ""
        ) {
          tokens.push(
            current
          );

          current = "";
        }
      };

      for (
        let i = 0;
        i < line.length;
        i++
      ) {
        const ch =
          line[i];

        if (
          escaped
        ) {
          current += ch;
          escaped = false;
          continue;
        }

        if (
          ch === "\\" &&
          quote !== "'"
        ) {
          escaped = true;
          continue;
        }

        if (
          quote
        ) {
          if (
            ch === quote
          ) {
            quote = "";
          } else {
            current += ch;
          }

          continue;
        }

        if (
          ch === "'" ||
          ch === '"'
        ) {
          quote = ch;
          continue;
        }

        if (
          /\s/.test(ch)
        ) {
          flush();
          continue;
        }

        if (
          ch === "|" ||
          ch === "<"
        ) {
          flush();
          tokens.push(ch);
          continue;
        }

        if (
          ch === ">"
        ) {
          flush();

          if (
            line[i + 1] === ">"
          ) {
            tokens.push(">>");
            i++;
          } else {
            tokens.push(">");
          }

          continue;
        }

        current += ch;
      }

      if (escaped) {
        current += "\\";
      }

      flush();

      return tokens;
    }

    splitStatements(line) {
      const result = [];
      const operators = [];

      let current = "";
      let quote = "";
      let escaped = false;

      const push = op => {
        result.push(
          current.trim()
        );

        operators.push(
          op
        );

        current = "";
      };

      for (
        let i = 0;
        i < line.length;
        i++
      ) {
        const ch =
          line[i];

        if (
          escaped
        ) {
          current += ch;
          escaped = false;
          continue;
        }

        if (
          ch === "\\" &&
          quote !== "'"
        ) {
          current += ch;
          escaped = true;
          continue;
        }

        if (
          quote
        ) {
          current += ch;

          if (
            ch === quote
          ) {
            quote = "";
          }

          continue;
        }

        if (
          ch === "'" ||
          ch === '"'
        ) {
          quote = ch;
          current += ch;
          continue;
        }

        if (
          ch === ";"
        ) {
          push(";");
          continue;
        }

        if (
          ch === "&" &&
          line[i + 1] === "&"
        ) {
          push("&&");
          i++;
          continue;
        }

        if (
          ch === "|" &&
          line[i + 1] === "|"
        ) {
          push("||");
          i++;
          continue;
        }

        current += ch;
      }

      result.push(
        current.trim()
      );

      return {
        commands:
          result,
        operators
      };
    }

    expand(value) {
      return String(
        value
      )
        .replace(
          /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
          (_, key) =>
            this.env[key] ??
            ""
        )
        .replace(
          /\$([A-Za-z_][A-Za-z0-9_]*)/g,
          (_, key) =>
            this.env[key] ??
            ""
        );
    }

    async executePart(
      tokens,
      stdin = ""
    ) {
      let inputData =
        stdin;

      let outputFile =
        "";

      let append =
        false;

      const args = [];

      for (
        let i = 0;
        i < tokens.length;
        i++
      ) {
        const token =
          tokens[i];

        if (
          token === "<"
        ) {
          const next =
            tokens[++i];

          if (!next) {
            return {
              stdout: "",
              stderr:
                "bash: syntax error near unexpected token `newline'",
              code: 2
            };
          }

          inputData =
            this.readFile(
              this.expand(next)
            );

          continue;
        }

        if (
          token === ">" ||
          token === ">>"
        ) {
          const next =
            tokens[++i];

          if (!next) {
            return {
              stdout: "",
              stderr:
                "bash: syntax error near unexpected token `newline'",
              code: 2
            };
          }

          outputFile =
            this.expand(
              next
            );

          append =
            token === ">>";

          continue;
        }

        args.push(
          this.expand(
            token
          )
        );
      }

      const cmd =
        args.shift() || "";

      if (!cmd) {
        return {
          stdout: "",
          stderr: "",
          code: 0
        };
      }

      const result =
        await this.command(
          cmd,
          args,
          inputData
        );

      if (
        outputFile
      ) {
        this.writeFile(
          outputFile,
          result.stdout || "",
          append
        );

        result.stdout = "";
      }

      return result;
    }

    async executePipeline(
      line,
      stdin = ""
    ) {
      const tokens =
        this.tokenize(
          line
        );

      const parts = [];
      let current = [];

      for (
        const token of tokens
      ) {
        if (
          token === "|"
        ) {
          parts.push(
            current
          );

          current = [];
        } else {
          current.push(
            token
          );
        }
      }

      if (
        current.length
      ) {
        parts.push(
          current
        );
      }

      let inputData =
        stdin;

      let result = {
        stdout: "",
        stderr: "",
        code: 0
      };

      for (
        const part of parts
      ) {
        result =
          await this.executePart(
            part,
            inputData
          );

        if (
          result.code !== 0
        ) {
          return result;
        }

        inputData =
          result.stdout;
      }

      return result;
    }

    async exec(command) {
      const line =
        String(
          command || ""
        ).trim();

      if (!line) {
        return {
          stdout: "",
          stderr: "",
          code: 0
        };
      }

      const parsed =
        this.splitStatements(
          line
        );

      let lastCode =
        0;

      let stdout =
        "";

      let stderr =
        "";

      for (
        let i = 0;
        i < parsed.commands.length;
        i++
      ) {
        const cmd =
          parsed.commands[i];

        if (!cmd) {
          continue;
        }

        const previousOp =
          i > 0
            ? parsed.operators[
                i - 1
              ]
            : null;

        if (
          previousOp === "&&" &&
          lastCode !== 0
        ) {
          continue;
        }

        if (
          previousOp === "||" &&
          lastCode === 0
        ) {
          continue;
        }

        const result =
          await this.executePipeline(
            cmd
          );

        stdout +=
          result.stdout ||
          "";

        stderr +=
          result.stderr ||
          "";

        lastCode =
          result.code;
      }

      return {
        stdout,
        stderr,
        code: lastCode
      };
    }

    async command(
      cmd,
      args,
      stdin
    ) {
      if (
        cmd === "python" ||
        cmd === "python3" ||
        cmd === "py"
      ) {
        return executePython(
          this,
          args
        );
      }

      switch (cmd) {
        case "":
          return {
            stdout: "",
            stderr: "",
            code: 0
          };

        case "echo":
          return {
            stdout:
              args.join(" ") +
              "\n",
            stderr: "",
            code: 0
          };

        case "printf": {
          if (
            !args.length
          ) {
            return {
              stdout: "",
              stderr: "",
              code: 0
            };
          }

          let format =
            args.shift();

          let index =
            0;

          format =
            format.replace(
              /\\n/g,
              "\n"
            );

          format =
            format.replace(
              /%s/g,
              () =>
                args[
                  index++
                ] ?? ""
            );

          return {
            stdout:
              format,
            stderr: "",
            code: 0
          };
        }

        case "pwd":
          return {
            stdout:
              this.cwd +
              "\n",
            stderr: "",
            code: 0
          };

        case "whoami":
          return {
            stdout:
              "coder\n",
            stderr: "",
            code: 0
          };

        case "uname":
          return {
            stdout:
              this.sandbox
                ? "Code Nest WASM browser environment (sandboxed)\n"
                : "Code Nest WASM browser environment\n",
            stderr: "",
            code: 0
          };

        case "cd": {
          const target =
            args[0] ||
            this.env.HOME ||
            "/";

          const next =
            this.normalize(
              target
            );

          if (
            !this.dirs.has(
              next
            )
          ) {
            return {
              stdout: "",
              stderr:
                `cd: ${target}: No such file or directory`,
              code: 1
            };
          }

          this.cwd =
            next;

          this.syncEnv();
          this.save();

          status(
            `coder@code-nest:${this.cwd} $`
          );

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "ls": {
          let long =
            false;

          let all =
            false;

          let targets =
            [];

          for (
            const arg of args
          ) {
            if (
              arg === "-l" ||
              arg === "--long"
            ) {
              long = true;
            } else if (
              arg === "-a" ||
              arg === "--all"
            ) {
              all = true;
            } else if (
              arg.startsWith("-") &&
              arg !== "-"
            ) {
              if (
                arg.includes("l")
              ) {
                long = true;
              }

              if (
                arg.includes("a")
              ) {
                all = true;
              }
            } else {
              targets.push(
                arg
              );
            }
          }

          if (
            !targets.length
          ) {
            targets = [
              this.cwd
            ];
          }

          const lines =
            [];

          for (
            const target of targets
          ) {
            const path =
              this.normalize(
                target
              );

            if (
              targets.length > 1
            ) {
              lines.push(
                `${target}:`
              );
            }

            const entries =
              this.list(
                path
              );

            for (
              const entry of entries
            ) {
              if (
                !all &&
                entry.name.startsWith(
                  "."
                )
              ) {
                continue;
              }

              if (
                long
              ) {
                const full =
                  this.normalize(
                    path === "/"
                      ? "/" +
                        entry.name
                      : path +
                        "/" +
                        entry.name
                  );

                const type =
                  entry.type ===
                    "dir"
                    ? "d"
                    : "-";

                const size =
                  entry.type ===
                    "file"
                    ? String(
                        this.files.get(
                          full
                        )?.length ||
                          0
                      )
                    : "0";

                lines.push(
                  `${type} ${size.padStart(6)} ${entry.name}${entry.type === "dir" ? "/" : ""}`
                );
              } else {
                lines.push(
                  entry.name +
                  (
                    entry.type ===
                      "dir"
                      ? "/"
                      : ""
                  )
                );
              }
            }

            if (
              targets.length > 1 &&
              lines.length
            ) {
              lines.push(
                ""
              );
            }
          }

          return {
            stdout:
              lines.join(" ") +
              (
                lines.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code: 0
          };
        }

        case "cat": {
          if (
            !args.length
          ) {
            return {
              stdout:
                stdin ||
                "",
              stderr: "",
              code: 0
            };
          }

          const chunks =
            [];

          for (
            const file of args
          ) {
            try {
              chunks.push(
                this.readFile(
                  file
                )
              );
            } catch (
              error
            ) {
              return {
                stdout:
                  chunks.join(
                    ""
                  ),
                stderr:
                  String(
                    error.message ||
                    error
                  ),
                code: 1
              };
            }
          }

          return {
            stdout:
              chunks.join(""),
            stderr: "",
            code: 0
          };
        }

        case "touch": {
          if (
            !args.length
          ) {
            return {
              stdout: "",
              stderr:
                "touch: missing file operand",
              code: 1
            };
          }

          for (
            const name of args
          ) {
            const path =
              this.normalize(
                name
              );

            if (
              this.dirs.has(
                path
              )
            ) {
              continue;
            }

            const parent =
              this.parent(
                path
              );

            if (
              !this.dirs.has(
                parent
              )
            ) {
              return {
                stdout: "",
                stderr:
                  `touch: ${name}: No such file or directory`,
                code: 1
              };
            }

            if (
              !this.files.has(
                path
              )
            ) {
              this.files.set(
                path,
                ""
              );
            }
          }

          this.save();

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "mkdir": {
          let parents =
            false;

          const names =
            [];

          for (
            const arg of args
          ) {
            if (
              arg === "-p" ||
              arg === "--parents"
            ) {
              parents = true;
            } else {
              names.push(
                arg
              );
            }
          }

          if (
            !names.length
          ) {
            return {
              stdout: "",
              stderr:
                "mkdir: missing operand",
              code: 1
            };
          }

          for (
            const name of names
          ) {
            const path =
              this.normalize(
                name
              );

            if (
              this.files.has(
                path
              )
            ) {
              return {
                stdout: "",
                stderr:
                  `mkdir: ${name}: File exists`,
                code: 1
              };
            }

            if (
              this.dirs.has(
                path
              )
            ) {
              if (
                parents
              ) {
                continue;
              }

              return {
                stdout: "",
                stderr:
                  `mkdir: ${name}: File exists`,
                code: 1
              };
            }

            const parent =
              this.parent(
                path
              );

            if (
              !parents &&
              !this.dirs.has(
                parent
              )
            ) {
              return {
                stdout: "",
                stderr:
                  `mkdir: ${name}: No such file or directory`,
                code: 1
              };
            }

            if (
              parents
            ) {
              this.ensureParents(
                path
              );
            } else {
              this.dirs.add(
                path
              );
            }
          }

          this.save();

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "rm": {
          let recursive =
            false;

          let force =
            false;

          const names =
            [];

          for (
            const arg of args
          ) {
            if (
              arg === "-r" ||
              arg === "-R" ||
              arg === "--recursive"
            ) {
              recursive = true;
            } else if (
              arg === "-f" ||
              arg === "--force"
            ) {
              force = true;
            } else if (
              arg.startsWith("-") &&
              arg !== "-"
            ) {
              if (
                arg.includes("r")
              ) {
                recursive = true;
              }

              if (
                arg.includes("f")
              ) {
                force = true;
              }
            } else {
              names.push(
                arg
              );
            }
          }

          if (
            !names.length
          ) {
            return {
              stdout: "",
              stderr:
                "rm: missing operand",
              code: 1
            };
          }

          for (
            const name of names
          ) {
            try {
              this.remove(
                name,
                recursive,
                force
              );
            } catch (
              error
            ) {
              return {
                stdout: "",
                stderr:
                  String(
                    error.message ||
                    error
                  ),
                code: 1
              };
            }
          }

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "cp": {
          let recursive =
            false;

          const names =
            [];

          for (
            const arg of args
          ) {
            if (
              arg === "-r" ||
              arg === "-R" ||
              arg === "--recursive"
            ) {
              recursive = true;
            } else {
              names.push(
                arg
              );
            }
          }

          if (
            names.length < 2
          ) {
            return {
              stdout: "",
              stderr:
                "cp: missing destination file operand",
              code: 1
            };
          }

          const destination =
            names.pop();

          for (
            const source of names
          ) {
            if (
              this.isDir(
                source
              ) &&
              !recursive
            ) {
              return {
                stdout: "",
                stderr:
                  `cp: -r not specified; omitting directory '${source}'`,
                code: 1
              };
            }

            let dest =
              destination;

            if (
              this.isDir(
                destination
              )
            ) {
              dest =
                this.normalize(
                  destination +
                    "/" +
                    this.base(
                      source
                    )
                );
            }

            try {
              this.copyTree(
                source,
                dest
              );
            } catch (
              error
            ) {
              return {
                stdout: "",
                stderr:
                  String(
                    error.message ||
                    error
                  ),
                code: 1
              };
            }
          }

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "mv": {
          if (
            args.length < 2
          ) {
            return {
              stdout: "",
              stderr:
                "mv: missing destination file operand",
              code: 1
            };
          }

          const destination =
            args[
              args.length - 1
            ];

          const sources =
            args.slice(
              0,
              -1
            );

          for (
            const source of sources
          ) {
            let dest =
              destination;

            if (
              this.isDir(
                destination
              )
            ) {
              dest =
                this.normalize(
                  destination +
                    "/" +
                    this.base(
                      source
                    )
                );
            }

            try {
              this.move(
                source,
                dest
              );
            } catch (
              error
            ) {
              return {
                stdout: "",
                stderr:
                  String(
                    error.message ||
                    error
                  ),
                code: 1
              };
            }
          }

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "head": {
          let count =
            10;

          const files =
            [];

          for (
            let i = 0;
            i < args.length;
            i++
          ) {
            const arg =
              args[i];

            if (
              arg === "-n"
            ) {
              count =
                Number(
                  args[++i] ||
                  10
                );
            } else if (
              /^-\d+$/.test(
                arg
              )
            ) {
              count =
                Number(
                  arg.slice(1)
                );
            } else {
              files.push(
                arg
              );
            }
          }

          const text =
            files.length
              ? files.map(
                  file =>
                    this.readFile(
                      file
                    )
                ).join("")
              : stdin;

          const lines =
            text.split("\n");

          return {
            stdout:
              lines
                .slice(
                  0,
                  count
                )
                .join("\n"),
            stderr: "",
            code: 0
          };
        }

        case "tail": {
          let count =
            10;

          const files =
            [];

          for (
            let i = 0;
            i < args.length;
            i++
          ) {
            const arg =
              args[i];

            if (
              arg === "-n"
            ) {
              count =
                Number(
                  args[++i] ||
                  10
                );
            } else if (
              /^-\d+$/.test(
                arg
              )
            ) {
              count =
                Number(
                  arg.slice(1)
                );
            } else {
              files.push(
                arg
              );
            }
          }

          const text =
            files.length
              ? files.map(
                  file =>
                    this.readFile(
                      file
                    )
                ).join("")
              : stdin;

          const lines =
            text.split("\n");

          return {
            stdout:
              lines
                .slice(
                  Math.max(
                    0,
                    lines.length -
                      count -
                      (
                        text.endsWith(
                          "\n"
                        )
                          ? 1
                          : 0
                      )
                  )
                )
                .join("\n"),
            stderr: "",
            code: 0
          };
        }

        case "grep": {
          let ignoreCase =
            false;

          let lineNumbers =
            false;

          let pattern =
            "";

          const files =
            [];

          for (
            const arg of args
          ) {
            if (
              arg === "-i"
            ) {
              ignoreCase =
                true;
            } else if (
              arg === "-n"
            ) {
              lineNumbers =
                true;
            } else if (
              !pattern
            ) {
              pattern =
                arg;
            } else {
              files.push(
                arg
              );
            }
          }

          if (
            !pattern
          ) {
            return {
              stdout: "",
              stderr:
                "grep: missing pattern",
              code: 2
            };
          }

          const text =
            files.length
              ? files.map(
                  file =>
                    this.readFile(
                      file
                    )
                ).join("")
              : stdin;

          const sourceLines =
            text.split("\n");

          const needle =
            ignoreCase
              ? pattern.toLowerCase()
              : pattern;

          const matched =
            [];

          for (
            let i = 0;
            i < sourceLines.length;
            i++
          ) {
            const line =
              sourceLines[i];

            const haystack =
              ignoreCase
                ? line.toLowerCase()
                : line;

            if (
              haystack.includes(
                needle
              )
            ) {
              matched.push(
                lineNumbers
                  ? `${i + 1}:${line}`
                  : line
              );
            }
          }

          return {
            stdout:
              matched.join(
                "\n"
              ) +
              (
                matched.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code:
              matched.length
                ? 0
                : 1
          };
        }

        case "wc": {
          let lineMode =
            false;

          let wordMode =
            false;

          let charMode =
            false;

          const files =
            [];

          for (
            const arg of args
          ) {
            if (
              arg === "-l"
            ) {
              lineMode =
                true;
            } else if (
              arg === "-w"
            ) {
              wordMode =
                true;
            } else if (
              arg === "-c"
            ) {
              charMode =
                true;
            } else {
              files.push(
                arg
              );
            }
          }

          if (
            !lineMode &&
            !wordMode &&
            !charMode
          ) {
            lineMode =
              true;

            wordMode =
              true;

            charMode =
              true;
          }

          const text =
            files.length
              ? files.map(
                  file =>
                    this.readFile(
                      file
                    )
                ).join("")
              : stdin;

          const lines =
            text
              ? text.split("\n")
                  .length -
                (
                  text.endsWith(
                    "\n"
                  )
                    ? 1
                    : 0
                )
              : 0;

          const words =
            text.trim()
              ? text.trim()
                  .split(/\s+/)
                  .length
              : 0;

          const chars =
            text.length;

          const values =
            [];

          if (
            lineMode
          ) {
            values.push(
              lines
            );
          }

          if (
            wordMode
          ) {
            values.push(
              words
            );
          }

          if (
            charMode
          ) {
            values.push(
              chars
            );
          }

          return {
            stdout:
              values.join(
                " "
              ) +
              "\n",
            stderr: "",
            code: 0
          };
        }

        case "sort": {
          const text =
            stdin ||
            (
              args[0]
                ? this.readFile(
                    args[0]
                  )
                : ""
            );

          const lines =
            text.split("\n")
              .filter(
                (line, index, arr) =>
                  index <
                    arr.length - 1 ||
                  line !== ""
              )
              .sort(
                (
                  a,
                  b
                ) =>
                  a.localeCompare(
                    b
                  )
              );

          return {
            stdout:
              lines.join("\n") +
              (
                lines.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code: 0
          };
        }

        case "uniq": {
          const text =
            stdin ||
            (
              args[0]
                ? this.readFile(
                    args[0]
                  )
                : ""
            );

          const lines =
            text.split("\n");

          const result =
            [];

          for (
            const line of lines
          ) {
            if (
              !result.length ||
              result[
                result.length - 1
              ] !== line
            ) {
              result.push(
                line
              );
            }
          }

          return {
            stdout:
              result.join("\n"),
            stderr: "",
            code: 0
          };
        }

        case "tree": {
          const root =
            this.normalize(
              args[0] ||
                this.cwd
            );

          if (
            !this.exists(root)
          ) {
            return {
              stdout: "",
              stderr:
                `tree: ${args[0] || root}: No such file or directory`,
              code: 1
            };
          }

          const lines = [
            root === "/"
              ? "/"
              : this.base(root)
          ];

          const build =
            (
              dir,
              prefix
            ) => {
              const entries =
                this.list(
                  dir
                );

              for (
                let i = 0;
                i < entries.length;
                i++
              ) {
                const entry =
                  entries[i];

                const last =
                  i ===
                  entries.length - 1;

                const marker =
                  last
                    ? "└── "
                    : "├── ";

                lines.push(
                  prefix +
                    marker +
                    entry.name +
                    (
                      entry.type ===
                        "dir"
                        ? "/"
                        : ""
                    )
                );

                if (
                  entry.type ===
                  "dir"
                ) {
                  const next =
                    prefix +
                    (
                      last
                        ? "    "
                        : "│   "
                    );

                  build(
                    this.normalize(
                      dir === "/"
                        ? "/" +
                            entry.name
                        : dir +
                            "/" +
                            entry.name
                    ),
                    next
                  );
                }
              }
            };

          build(
            root,
            ""
          );

          return {
            stdout:
              lines.join("\n") +
              "\n",
            stderr: "",
            code: 0
          };
        }

        case "find": {
          const root =
            this.normalize(
              args.find(
                arg =>
                  !arg.startsWith(
                    "-"
                  ) &&
                  arg !== "f" &&
                  arg !== "d"
              ) ||
                this.cwd
            );

          let type =
            "";

          const typeIndex =
            args.indexOf(
              "-type"
            );

          if (
            typeIndex >= 0 &&
            args[typeIndex + 1]
          ) {
            type =
              args[
                typeIndex + 1
              ];
          }

          if (
            !this.exists(root)
          ) {
            return {
              stdout: "",
              stderr:
                `find: ${root}: No such file or directory`,
              code: 1
            };
          }

          const results =
            [];

          for (
            const dir of this.dirs
          ) {
            if (
              dir === root ||
              dir.startsWith(
                root.replace(
                  /\/$/,
                  ""
                ) + "/"
              )
            ) {
              if (
                type === "f"
              ) {
                continue;
              }

              if (
                type === "d" ||
                !type
              ) {
                results.push(
                  dir
                );
              }
            }
          }

          for (
            const file of this.files.keys()
          ) {
            if (
              file === root ||
              file.startsWith(
                root.replace(
                  /\/$/,
                  ""
                ) + "/"
              )
            ) {
              if (
                type === "d"
              ) {
                continue;
              }

              if (
                type === "f" ||
                !type
              ) {
                results.push(
                  file
                );
              }
            }
          }

          results.sort();

          return {
            stdout:
              results.join(
                "\n"
              ) +
              (
                results.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code: 0
          };
        }

        case "env":
          return {
            stdout:
              Object.entries(
                this.env
              )
                .sort(
                  (
                    [a],
                    [b]
                  ) =>
                    a.localeCompare(
                      b
                    )
                )
                .map(
                  (
                    [
                      key,
                      value
                    ]
                  ) =>
                    `${key}=${value}`
                )
                .join("\n") +
              "\n",
            stderr: "",
            code: 0
          };

        case "export": {
          if (
            !args.length
          ) {
            return {
              stdout:
                Object.entries(
                  this.env
                )
                  .map(
                    (
                      [
                        key,
                        value
                      ]
                    ) =>
                      `declare -x ${key}="${value}"`
                  )
                  .join(
                    "\n"
                  ) +
                "\n",
              stderr: "",
              code: 0
            };
          }

          for (
            const assignment of args
          ) {
            const index =
              assignment.indexOf(
                "="
              );

            if (
              index <= 0
            ) {
              return {
                stdout: "",
                stderr:
                  `export: invalid identifier: ${assignment}`,
                code: 1
              };
            }

            const key =
              assignment.slice(
                0,
                index
              );

            const value =
              assignment.slice(
                index + 1
              );

            this.env[key] =
              value;
          }

          this.syncEnv();
          this.save();

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "unset": {
          for (
            const key of args
          ) {
            delete this.env[
              key
            ];
          }

          this.syncEnv();
          this.save();

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "which": {
          const builtins =
            new Set([
              "cd",
              "pwd",
              "ls",
              "cat",
              "echo",
              "printf",
              "touch",
              "mkdir",
              "rm",
              "cp",
              "mv",
              "head",
              "tail",
              "grep",
              "wc",
              "sort",
              "uniq",
              "tree",
              "find",
              "env",
              "export",
              "unset",
              "history",
              "clear",
              "help",
              "whoami",
              "uname",
              "date",
              "basename",
              "dirname",
              "true",
              "false",
              "seq",
              "sleep",
              "which",
              "python",
              "python3",
              "py"
            ]);

          const lines =
            [];

          for (
            const name of args
          ) {
            if (
              builtins.has(
                name
              )
            ) {
              lines.push(
                `${name}: shell builtin`
              );
            } else {
              lines.push(
                `${name} not found`
              );
            }
          }

          return {
            stdout:
              lines.join(
                "\n"
              ) +
              (
                lines.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code: 0
          };
        }

        case "history":
          return {
            stdout:
              state.history
                .slice()
                .reverse()
                .map(
                  (
                    value,
                    index
                  ) =>
                    `${String(index + 1).padStart(4)}  ${value}`
                )
                .join(
                  "\n"
                ) +
              (
                state.history.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code: 0
          };

        case "date":
          return {
            stdout:
              new Date()
                .toString() +
              "\n",
            stderr: "",
            code: 0
          };

        case "basename":
          return {
            stdout:
              this.base(
                args[0] ||
                  ""
              ) +
              "\n",
            stderr: "",
            code: 0
          };

        case "dirname":
          return {
            stdout:
              this.parent(
                args[0] ||
                  ""
              ) +
              "\n",
            stderr: "",
            code: 0
          };

        case "true":
          return {
            stdout: "",
            stderr: "",
            code: 0
          };

        case "false":
          return {
            stdout: "",
            stderr: "",
            code: 1
          };

        case "seq": {
          const numbers =
            args.map(Number);

          if (
            numbers.some(
              Number.isNaN
            )
          ) {
            return {
              stdout: "",
              stderr:
                "seq: invalid number",
              code: 1
            };
          }

          let start = 1;
          let end = 0;
          let step = 1;

          if (
            numbers.length === 1
          ) {
            end =
              numbers[0];
          } else if (
            numbers.length === 2
          ) {
            start =
              numbers[0];

            end =
              numbers[1];
          } else if (
            numbers.length >= 3
          ) {
            start =
              numbers[0];

            step =
              numbers[1];

            end =
              numbers[2];
          }

          const values =
            [];

          if (
            step > 0
          ) {
            for (
              let value = start;
              value <= end;
              value += step
            ) {
              values.push(
                String(value)
              );
            }
          } else if (
            step < 0
          ) {
            for (
              let value = start;
              value >= end;
              value += step
            ) {
              values.push(
                String(value)
              );
            }
          }

          return {
            stdout:
              values.join(
                "\n"
              ) +
              (
                values.length
                  ? "\n"
                  : ""
              ),
            stderr: "",
            code: 0
          };
        }

        case "sleep": {
          const seconds =
            Number(
              args[0] ||
                0
            );

          if (
            !Number.isFinite(
              seconds
            ) ||
            seconds < 0
          ) {
            return {
              stdout: "",
              stderr:
                "sleep: invalid time interval",
              code: 1
            };
          }

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                Math.min(
                  seconds * 1000,
                  30000
                )
              )
          );

          return {
            stdout: "",
            stderr: "",
            code: 0
          };
        }

        case "clear":
          clear();

          return {
            stdout: "",
            stderr: "",
            code: 0
          };

        case "help":
          return {
            stdout:
              [
                "Built-in commands:",
                "cd pwd ls cat echo printf touch mkdir rm cp mv",
                "head tail grep wc sort uniq tree find",
                "env export unset which history clear help",
                "whoami uname date basename dirname",
                "true false seq sleep",
                "python python3 py"
              ].join("\n") +
              "\n",
            stderr: "",
            code: 0
          };

        default:
          return {
            stdout: "",
            stderr:
              `${cmd}: command not found`,
            code: 127
          };
      }
    }
  }

  function updatePrompt() {
    if (
      state.terminal instanceof
      BrowserShell
    ) {
      status(
        `coder@code-nest:${state.terminal.cwd} $`
      );
    } else {
      status();
    }
  }

  async function runCommand(
    command
  ) {
    const cmd =
      String(
        command || ""
      ).trim();

    if (!cmd) return;

    print(
      "coder@code-nest:/ $ " +
        cmd,
      "bash-command"
    );

    state.history =
      state.history.filter(
        value =>
          value !== cmd
      );

    state.history.unshift(
      cmd
    );

    state.history =
      state.history.slice(
        0,
        50
      );

    state.historyIndex =
      -1;

    try {
      const pipMatch =
        cmd.match(
          /^(?:pip|python\s+-m\s+pip|python3\s+-m\s+pip|py\s+-m\s+pip)\s+install\s+(.+)$/i
        );

      if (
        pipMatch &&
        typeof window.codeNestPipInstall ===
          "function"
      ) {
        const result =
          await window.codeNestPipInstall(
            pipMatch[1]
              .trim()
              .split(/\s+/)
          );

        if (result) {
          print(result);
        }

        updatePrompt();
        return;
      }

      if (
        pipMatch &&
        typeof window.codeNestPipInstall !==
          "function"
      ) {
        throw new Error(
          "pip bridge is not ready. Reload Code Nest and try again."
        );
      }

      const shell =
        await loadRuntime();

      const result =
        await shell.exec(
          cmd
        );

      if (
        typeof result ===
        "string"
      ) {
        if (
          result
        ) {
          print(result);
        }
      } else {
        if (
          result?.stdout
        ) {
          print(
            result.stdout
          );
        }

        if (
          result?.stderr
        ) {
          print(
            result.stderr,
            "bash-error"
          );
        }
      }

      updatePrompt();
    } catch (
      error
    ) {
      print(
        String(
          error &&
          error.message ||
          error
        ),
        "bash-error"
      );

      updatePrompt();
    }
  }

  function wireInput() {
    const field =
      input();

    if (
      !field ||
      field.dataset.codeNestBashWired ===
        "1"
    ) {
      return;
    }

    field.dataset.codeNestBashWired =
      "1";

    field.addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Enter"
        ) {
          event.preventDefault();

          const value =
            field.value;

          field.value =
            "";

          runCommand(
            value
          );

          return;
        }

        if (
          event.key ===
          "ArrowUp"
        ) {
          if (
            !state.history.length
          ) {
            return;
          }

          event.preventDefault();

          state.historyIndex =
            Math.min(
              state.historyIndex + 1,
              state.history.length - 1
            );

          field.value =
            state.history[
              state.historyIndex
            ] || "";

          requestAnimationFrame(
            () => {
              field.setSelectionRange(
                field.value.length,
                field.value.length
              );
            }
          );

          return;
        }

        if (
          event.key ===
          "ArrowDown"
        ) {
          if (
            !state.history.length
          ) {
            return;
          }

          event.preventDefault();

          state.historyIndex =
            Math.max(
              state.historyIndex - 1,
              -1
            );

          field.value =
            state.historyIndex >= 0
              ? state.history[
                  state.historyIndex
                ]
              : "";

          requestAnimationFrame(
            () => {
              field.setSelectionRange(
                field.value.length,
                field.value.length
              );
            }
          );

          return;
        }

        if (
          event.key === "l" &&
          event.ctrlKey
        ) {
          event.preventDefault();
          clear();
        }
      }
    );
  }

  function wire() {
    ensureSandboxButton();
    wireInput();
    updatePrompt();

    globalThis.__codeNestBashSandbox =
      state.sandbox;

    updateSandboxButton();
  }

  window.CodeNestBash = {
    init: wire,
    run: runCommand,
    loadRuntime,
    getSandbox:
      () => state.sandbox,
    setSandboxMode,
    clear,
    getState: () => ({
      ready:
        state.ready,
      loading:
        state.loading,
      sandbox:
        state.sandbox
    })
  };

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      wire,
      { once: true }
    );
  } else {
    wire();
  }

  setTimeout(
    ensureSandboxButton,
    0
  );

  setTimeout(
    ensureSandboxButton,
    250
  );

  setTimeout(
    wireInput,
    0
  );
})();
