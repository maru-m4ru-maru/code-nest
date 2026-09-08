// Code Nest Worker V0.5.0
// Share API + Scratch Cloud bridge
//
// Security model:
// - Shared code is stored in KV.
// - ?view=code -> read-only HTML view.
// - ?view=data -> JSON data only.
// - ?view=preview -> NEVER returns executable user HTML.
// - Actual preview execution is handled by shared-preview.html.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ----------------------------------------------------------
    // Scratch Cloud read bridge
    // ----------------------------------------------------------

    if (request.method === "GET" && url.pathname === "/scratch-cloud") {
      const projectId = String(url.searchParams.get("project_id") || "");
      if (!/^\d+$/.test(projectId)) {
        return json({ error: "Invalid project_id" }, 400, cors);
      }

      try {
        const upstream = await fetch(
          "https://clouddata.scratch.mit.edu/logs?projectid=" +
            encodeURIComponent(projectId) +
            "&limit=100&offset=0",
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
              "User-Agent": "Code-Nest/0.5.0"
            }
          }
        );

        if (!upstream.ok) {
          return json({
            error: "Scratch cloud logs request failed",
            status: upstream.status,
            message: await upstream.text()
          }, 502, cors);
        }

        const logs = await upstream.json();
        const vars = {};

        if (Array.isArray(logs)) {
          for (const item of logs) {
            if (
              item &&
              typeof item.name === "string" &&
              Object.prototype.hasOwnProperty.call(item, "value")
            ) {
              vars[item.name] = item.value;
            }
          }
        }

        return json({
          ok: true,
          project_id: projectId,
          variables: vars
        }, 200, cors);
      } catch (error) {
        return json({
          error: "Scratch cloud logs request failed",
          message: String(error?.message || error)
        }, 502, cors);
      }
    }

    // ----------------------------------------------------------
    // Scratch Cloud write bridge
    // ----------------------------------------------------------

    if (request.method === "POST" && url.pathname === "/scratch-cloud") {
      try {
        const data = await request.json();
        const projectId = String(data.project_id ?? "").trim();
        const username = String(data.username || "");
        const sessionId = String(data.session_id || "");
        const action = String(data.action || "");
        const variable = String(data.variable || "").replace(/^☁\s*/, "");
        const value = String(data.value ?? "");

        if (!/^[0-9]{1,20}$/.test(projectId)) {
          return json({ error: "Invalid project_id", received: projectId }, 400, cors);
        }
        if (!username || !sessionId) {
          return json({ error: "Authentication data is missing" }, 401, cors);
        }
        if (action !== "set") {
          return json({ error: "Unsupported cloud action" }, 400, cors);
        }
        if (!variable || variable.length > 200) {
          return json({ error: "Invalid cloud variable name" }, 400, cors);
        }
        if (value.length > 256 || !/^-?\d+(?:\.\d+)?$/.test(value)) {
          return json({ error: "Invalid cloud value" }, 400, cors);
        }

        const upstream = await fetch("https://clouddata.scratch.mit.edu/", {
          headers: {
            "Upgrade": "websocket",
            "Cookie": "scratchsessionsid=" + sessionId + ";",
            "Origin": "https://scratch.mit.edu",
            "User-Agent": "Code-Nest/0.5.0"
          }
        });

        const ws = upstream.webSocket;
        if (!ws) {
          return json({ error: "Scratch cloud WebSocket was not accepted" }, 502, cors);
        }

        ws.accept();
        ws.send(JSON.stringify({
          method: "handshake",
          user: username,
          project_id: projectId
        }));
        ws.send(JSON.stringify({
          method: "set",
          name: "☁ " + variable,
          value,
          user: username,
          project_id: projectId
        }));

        await new Promise(resolve => setTimeout(resolve, 200));
        try { ws.close(1000, "Code Nest request complete"); } catch {}

        return json({
          ok: true,
          project_id: projectId,
          variable: "☁ " + variable,
          value
        }, 200, cors);
      } catch (error) {
        return json({
          error: "Scratch cloud request failed",
          message: String(error?.message || error)
        }, 502, cors);
      }
    }

    // ----------------------------------------------------------
    // Create shared notebook
    // ----------------------------------------------------------

    if (request.method === "POST" && url.pathname === "/share") {
      try {
        const data = await request.json();
        const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);

        const cells = Array.isArray(data.cells)
          ? data.cells.map(cell => ({
              type: cell?.type || "code",
              source: String(cell?.source || ""),
              output: String(cell?.output || "")
            }))
          : [{
              type: "code",
              source: String(data.code || ""),
              output: String(data.output || "")
            }];

        const notebook = {
          title: String(data.title || "Untitled Notebook").slice(0, 200),
          cells,
          createdAt: Date.now()
        };

        await env.CODE_NEST_SHARE.put(id, JSON.stringify(notebook));

        const baseUrl = url.origin + "/share/" + id;

        return json({
          id,
          url: baseUrl,
          codeUrl: baseUrl + "?view=code",
          dataUrl: baseUrl + "?view=data",
          // Kept for compatibility. This endpoint is non-executable.
          previewUrl: baseUrl + "?view=preview"
        }, 200, cors);
      } catch (error) {
        return json({
          error: "Invalid JSON",
          message: String(error?.message || error)
        }, 400, cors);
      }
    }

    // ----------------------------------------------------------
    // Read shared notebook
    // ----------------------------------------------------------

    if (request.method === "GET" && url.pathname.startsWith("/share/")) {
      const id = url.pathname.split("/")[2];

      if (!id) return text("Share not found", 404);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
        return text("Invalid share ID", 400);
      }

      const data = await env.CODE_NEST_SHARE.get(id, "json");
      if (!data) return text("Share not found", 404);

      const cells = Array.isArray(data.cells)
        ? data.cells.map(cell => ({
            type: cell?.type || "code",
            source: String(cell?.source || ""),
            output: String(cell?.output || "")
          }))
        : [{
            type: "code",
            source: String(data.code || ""),
            output: String(data.output || "")
          }];

      const view = url.searchParams.get("view") || "code";

      // --------------------------------------------------------
      // DATA VIEW: JSON only. Never executable as HTML.
      // --------------------------------------------------------

      if (view === "data") {
        return json({
          ok: true,
          id,
          title: String(data.title || "Untitled Notebook").slice(0, 200),
          cells
        }, 200, {
          ...cors,
          "Cache-Control": "public, max-age=300"
        });
      }

      // --------------------------------------------------------
      // PREVIEW VIEW: deliberately non-executable.
      // --------------------------------------------------------

      if (view === "preview") {
        return new Response(
          "Code Nest Shared Preview\n\nこのURLは直接コードを実行しません。\nCode Nestの安全確認ページから実行してください。",
          {
            status: 410,
            headers: {
              ...cors,
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff"
            }
          }
        );
      }

      // --------------------------------------------------------
      // CODE VIEW
      // --------------------------------------------------------

      const codeUrl = url.origin + "/share/" + id + "?view=code";
      const previewPageUrl = "/shared-preview.html?id=" + encodeURIComponent(id);

      const cellHtml = cells.map((cell, index) => {
        const type = cell.type === "markdown"
          ? "Markdown"
          : cell.type === "terminal"
            ? "Terminal"
            : "Code";

        const output = cell.output
          ? '<div class="output"><div class="label">Output</div><pre>' +
            escapeHtml(cell.output) +
            '</pre></div>'
          : "";

        return '<section class="cell">' +
          '<div class="cell-head">' +
            '<span class="badge">' + type + '</span>' +
            '<span class="number">#' + (index + 1) + '</span>' +
          '</div>' +
          '<pre class="source">' + escapeHtml(cell.source || "") + '</pre>' +
          output +
        '</section>';
      }).join("");

      const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f2f4fb">
<title>${escapeHtml(data.title || "Shared Notebook")} — Code Nest</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f2f4fb}
*{box-sizing:border-box}
body{margin:0;padding:32px 18px 60px}
.page{width:min(960px,100%);margin:auto}
.header{background:#fff;border:1px solid #e3e7f0;border-radius:22px;padding:26px 28px;margin-bottom:18px;box-shadow:0 12px 40px rgba(31,41,55,.08)}
.brand{font-weight:800;font-size:14px;color:#7c3aed;margin-bottom:12px}
h1{margin:0;font-size:clamp(26px,5vw,40px);letter-spacing:-.03em}
.meta{margin-top:8px;color:#697386;font-size:14px}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.actions a{display:inline-flex;align-items:center;justify-content:center;padding:10px 15px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;border:1px solid #dfe4ee;color:#334155;background:#fff}
.actions a.primary{background:#7c3aed;color:#fff;border-color:#7c3aed}
.cell{background:#fff;border:1px solid #e3e7f0;border-radius:18px;margin:14px 0;overflow:hidden;box-shadow:0 8px 30px rgba(31,41,55,.05)}
.cell-head{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid #edf0f5;color:#6b7280;font-size:13px}
.badge{font-weight:700;color:#7c3aed}.number{opacity:.65}
pre{margin:0;white-space:pre-wrap;word-break:break-word}
.source{padding:20px;background:#10131a;color:#f3f4f6;font:14px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;min-height:40px}
.output{border-top:1px solid #edf0f5}.output .label{padding:9px 16px;color:#6b7280;font-size:12px;font-weight:700}
.output pre{padding:0 16px 16px;color:#303846;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.footer{text-align:center;color:#8a93a5;font-size:12px;margin-top:24px}
</style>
</head>
<body>
<div class="page">
<header class="header">
<div class="brand">&lt;/&gt; Code Nest · Shared Notebook</div>
<h1>${escapeHtml(data.title || "Untitled Notebook")}</h1>
<div class="meta">${cells.length} cells · read-only shared view</div>
<div class="actions">
<a class="primary" href="${escapeAttribute(previewPageUrl)}">プレビューを開く</a>
<a href="${escapeAttribute(codeUrl)}">コードを見る</a>
</div>
</header>
<main>${cellHtml || '<div class="cell"><pre class="source">このNotebookにはセルがありません。</pre></div>'}</main>
<div class="footer">Shared with Code Nest</div>
</div>
</body>
</html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // ----------------------------------------------------------
    // Service information
    // ----------------------------------------------------------

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "Code Nest Backend",
        version: "0.5.0",
        share: "/share/:id",
        shareCode: "/share/:id?view=code",
        shareData: "/share/:id?view=data",
        sharePreview: "/share/:id?view=preview",
        previewExecution: "disabled on Worker",
        scratchProxy: "removed"
      }, 200, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  }
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function text(data, status = 200, extraHeaders = {}) {
  return new Response(String(data), {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders
    }
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(text) {
  return escapeHtml(text);
}
