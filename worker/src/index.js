export default {
  async fetch(request) {
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
      return Response.json(
        {
          ok: true,
          service: "Code Nest Backend",
          message: "Code Nest backend is working!",
        },
        { headers: corsHeaders }
      );
    }

    return Response.json(
      { error: "Not Found" },
      {
        status: 404,
        headers: corsHeaders,
      }
    );
  },
};
