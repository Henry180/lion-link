exports.handler = async event => {
  const baseUrl = process.env.LION_LINK_API_URL;
  if (!baseUrl) return { statusCode: 503, body: JSON.stringify({ message: "The Lion Link API has not been configured." }) };
  const suffix = event.path.replace(/^\/(?:\.netlify\/functions\/api|api)/, "");
  const url = `${baseUrl.replace(/\/$/, "")}${suffix}${event.rawQuery ? `?${event.rawQuery}` : ""}`;
  try {
    const response = await fetch(url, { method: event.httpMethod, headers: { "Content-Type": event.headers["content-type"] || "application/json", Authorization: event.headers.authorization || "" }, body: ["GET", "HEAD"].includes(event.httpMethod) ? undefined : event.body });
    return { statusCode: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json" }, body: await response.text() };
  } catch { return { statusCode: 502, body: JSON.stringify({ message: "Lion Link API is unavailable." }) }; }
};
