// Cloudflare Pages Function: forwards same-origin /api requests to the Express API.
export async function onRequest(context) {
  const baseUrl = context.env.LION_LINK_API_URL;
  if (!baseUrl) return Response.json({ message: "The Lion Link API has not been configured." }, { status: 503 });
  const incoming = new URL(context.request.url);
  // The Pages route is /api/* while the configured API URL already ends in /api.
  const target = baseUrl.replace(/\/$/, "") + incoming.pathname.replace(/^\/api/, "") + incoming.search;
  const headers = new Headers(context.request.headers);
  headers.delete("host");
  try {
    const response = await fetch(target, { method: context.request.method, headers, body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body });
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  } catch {
    return Response.json({ message: "Lion Link API is unavailable." }, { status: 502 });
  }
}
