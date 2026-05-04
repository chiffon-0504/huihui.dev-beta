export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        ok: true,
        message: "huihui.dev API",
        endpoints: [
          "/api/tech-news",
          "/api/apod",
          "/api/github-updates",
          "/api/steam-library",
          "/api/contact"
        ]
      });
    }

    if (url.pathname === "/api/tech-news") {
      return Response.json({ ok: true, techNews: [] });
    }

    if (url.pathname === "/api/apod") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/github-updates") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/steam-library") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
};
