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
      const data = await request.json();
      const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);

      await env.CODE_NEST_SHARE.put(id, JSON.stringify({
        title: data.title || "Untitled",
        code: data.code || "",
        createdAt: Date.now()
      }));

      return Response.json({
        id,
        url: `${url.origin}/share/${id}`
      }, { headers: cors });
    }

    if (request.method === "GET" && url.pathname.startsWith("/share/")) {
      const id = url.pathname.split("/")[2];
      const data = await env.CODE_NEST_SHARE.get(id, "json");

      if (!data) {
        return new Response("Share not found", { status: 404 });
      }

      return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${data.title}</title><style>body{font-family:system-ui;max-width:900px;margin:40px auto;padding:20px;background:#f5f6fa}pre{background:#111;color:#fff;padding:20px;border-radius:12px;overflow:auto}</style></head><body><h1>${data.title}</h1><pre>${escapeHtml(data.code)}</pre></body></html>`, { headers:{"Content-Type":"text/html;charset=utf-8"} });
    }

    return Response.json({ ok:true, service:"Code Nest Backend" }, { headers:cors });
  }
};

function escapeHtml(text) {
  return text.replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
