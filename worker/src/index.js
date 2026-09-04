export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/") {
      return Response.json({
        ok: true,
        service: "Code Nest Backend",
        message: "Code Nest backend is working!",
      }, { headers: corsHeaders });
    }

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
        url: `/share/${id}`
      }, { headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname.startsWith("/share/")) {
      const id = url.pathname.split("/")[2];
      const value = await env.CODE_NEST_SHARE.get(id);

      if (!value) {
        return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });
      }

      return Response.json(JSON.parse(value), { headers: corsHeaders });
    }

    return Response.json(
      { error: "Not Found" },
      { status: 404, headers: corsHeaders }
    );
  },
};
