// Cloudflare Pages Function for /profile/:username
//
// A normal visitor still gets the full interactive Lion Link app — this
// only changes what a crawler or link-preview bot sees before any
// JavaScript runs: a real <title>, description, and Open Graph tags for
// THIS specific profile, instead of the same generic tags every route
// currently shares.
//
// Place this file at:  functions/profile/[username].js
// (same level as your existing `functions` folder, or create one there if
// you don't have one yet — it sits alongside your deployed index.html.)
//
// IMPORTANT LIMITATION: Lion Link requires login to view any content, so
// this cannot make a profile's real posts/bio text searchable on Google —
// only the title/description/preview card become accurate. Full content
// indexing would require some pages being viewable without an account.

export async function onRequestGet(context) {
  const { params, request, next } = context;
  const username = params.username;

  let user = null;
  try {
    // Fetching our own origin's /api path re-enters Cloudflare's normal
    // routing, so this goes through whatever already forwards /api to the
    // real backend (a Function or a Pages redirect) — this file doesn't
    // need to know the backend's real address.
    const apiUrl = new URL(`/api/users/${encodeURIComponent(username)}`, request.url);
    const apiResponse = await fetch(apiUrl.toString());
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      user = data.user;
    }
    // A non-OK response (404 for an unknown username, or 401 if that
    // endpoint turns out to require login) just falls through below and
    // serves the normal app shell with its default tags — never an error
    // page for a real visitor.
  } catch {
    // Network hiccup talking to the API — same fallback as above.
  }

  // Get the app's normal HTML (the same file every route serves).
  const appResponse = await next();
  if (!user) return appResponse;

  const title = `${user.name} (@${user.username}) | Lion Link`;
  const description = user.bio
    ? truncate(user.bio, 155)
    : `${user.name}'s profile on Lion Link — UNN's campus social platform.`;
  const image = user.profileImage || "";

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", {
      element(el) {
        const tags =
          `<meta property="og:title" content="${escapeHtml(title)}">` +
          `<meta property="og:description" content="${escapeHtml(description)}">` +
          `<meta property="og:type" content="profile">` +
          (image ? `<meta property="og:image" content="${escapeHtml(image)}">` : "") +
          `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`;
        el.append(tags, { html: true });
      }
    })
    .transform(appResponse);
}

function truncate(text, max) {
  const clean = String(text).trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
