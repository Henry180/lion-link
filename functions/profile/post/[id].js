// Cloudflare Pages Function for /post/:id
//
// Same idea as functions/profile/[username].js: a real visitor gets the
// normal app; a crawler or link-preview bot (Google, WhatsApp, Twitter,
// etc.) gets a page with this specific post's real title, text, and image
// in the meta tags, before any JavaScript runs.
//
// Place this file at:  functions/post/[id].js
//
// Same limitation as the profile function: since Lion Link requires login
// to view content, this makes the LINK PREVIEW accurate — it does not make
// the post's full text/comments searchable on Google.

export async function onRequestGet(context) {
  const { params, request, next } = context;
  const id = params.id;

  let post = null;
  try {
    const apiUrl = new URL(`/api/posts/${encodeURIComponent(id)}`, request.url);
    const apiResponse = await fetch(apiUrl.toString());
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      post = data.post;
    }
  } catch {
    // Network hiccup — fall through to the normal app shell below.
  }

  const appResponse = await next();
  if (!post) return appResponse;

  const authorName = post.author?.name || "A Lion Link user";
  const title = post.text
    ? `${truncate(post.text, 70)} — ${authorName} on Lion Link`
    : `A post by ${authorName} on Lion Link`;
  const description = post.text
    ? truncate(post.text, 155)
    : `See this post by ${authorName} on Lion Link — UNN's campus social platform.`;
  const firstImage = (post.media || []).find(item => item.type === "image")?.url || "";

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", {
      element(el) {
        const tags =
          `<meta property="og:title" content="${escapeHtml(title)}">` +
          `<meta property="og:description" content="${escapeHtml(description)}">` +
          `<meta property="og:type" content="article">` +
          (firstImage ? `<meta property="og:image" content="${escapeHtml(firstImage)}">` : "") +
          `<meta name="twitter:card" content="${firstImage ? "summary_large_image" : "summary"}">`;
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
