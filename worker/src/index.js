export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "POST" && url.pathname === "/share") {
      try {
        const data = await request.json();
        const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
        const notebook = {
          title: data.title || "Untitled Notebook",
          cells: Array.isArray(data.cells) ? data.cells.map(cell => ({
            type: cell.type || "code",
            source: cell.source || "",
            output: cell.output || ""
          })) : [{
            type: "code",
            source: data.code || "",
            output: data.output || ""
          }],
          createdAt: Date.now()
        };
        await env.CODE_NEST_SHARE.put(id, JSON.stringify(notebook));
        return Response.json({ id, url: url.origin + "/share/" + id }, { headers: cors });
      } catch (error) {
        return Response.json(
          { error: "Invalid JSON", message: String(error?.message || error) },
          { status: 400, headers: cors }
        );
      }
    }

    if (request.method === "GET" && url.pathname.startsWith("/share/")) {
      const id = url.pathname.split("/")[2];
      if (!id) return new Response("Share not found", { status: 404 });

      const data = await env.CODE_NEST_SHARE.get(id, "json");
      if (!data) return new Response("Share not found", { status: 404 });

      const cells = Array.isArray(data.cells) ? data.cells : [{
        type: "code",
        source: data.code || "",
        output: data.output || ""
      }];

      const cellHtml = cells.map((cell, index) => {
        const type = cell.type === "markdown" ? "Markdown" : cell.type === "terminal" ? "Terminal" : "Code";
        const output = cell.output ? '<div class="output"><div class="label">Output</div><pre>' + escapeHtml(cell.output) + '</pre></div>' : "";
        return '<section class="cell"><div class="cell-head"><span class="badge">' + type + '</span><span class="number">#' + (index + 1) + '</span></div><pre class="source">' + escapeHtml(cell.source || "") + '</pre>' + output + '</section>';
      }).join("");

      const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f2f4fb">
<title>${escapeHtml(data.title || "Shared Notebook")} — Code Nest</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f2f4fb}
*{box-sizing:border-box}body{margin:0;padding:32px 18px 60px}.page{width:min(960px,100%);margin:auto}
.header{background:#fff;border:1px solid #e3e7f0;border-radius:22px;padding:26px 28px;margin-bottom:18px;box-shadow:0 12px 40px rgba(31,41,55,.08)}
.brand{font-weight:800;font-size:14px;color:#7c3aed;margin-bottom:12px}h1{margin:0;font-size:clamp(26px,5vw,40px);letter-spacing:-.03em}.meta{margin-top:8px;color:#697386;font-size:14px}
.cell{background:#fff;border:1px solid #e3e7f0;border-radius:18px;margin:14px 0;overflow:hidden;box-shadow:0 8px 30px rgba(31,41,55,.05)}
.cell-head{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid #edf0f5;color:#6b7280;font-size:13px}.badge{font-weight:700;color:#7c3aed}.number{opacity:.65}
pre{margin:0;white-space:pre-wrap;word-break:break-word}.source{padding:20px;background:#10131a;color:#f3f4f6;font:14px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;min-height:40px}
.output{border-top:1px solid #edf0f5}.output .label{padding:9px 16px;color:#6b7280;font-size:12px;font-weight:700}.output pre{padding:0 16px 16px;color:#303846;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.footer{text-align:center;color:#8a93a5;font-size:12px;margin-top:24px}
</style></head>
<body><div class="page"><header class="header"><div class="brand">&lt;/&gt; Code Nest · Shared Notebook</div><h1>${escapeHtml(data.title || "Untitled Notebook")}</h1><div class="meta">${cells.length} cells · read-only shared view</div></header>
<main>${cellHtml || '<div class="cell"><div class="source">このNotebookにはセルがありません。</div></div>'}</main>
<div class="footer">Shared with Code Nest</div></div></body></html>`;

      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
    }

    return Response.json({ ok: true, service: "Code Nest Backend" }, { headers: cors });
  }
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
