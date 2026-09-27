// Cloudflare Pages Function for /sitemap.xml
//
// Your navigation uses <button data-profile="..."> / <button data-view="...">
// rather than real <a href> links, which means Google's crawler has no
// links to follow to ever discover an individual profile or post page —
// no matter how good the per-page meta tags are. This sitemap is what
// makes those URLs discoverable at all: submit it in Google Search Console
// once it's live (Search Console → Sitemaps → enter "sitemap.xml").
//
// It lists: the home page, the announcements page, and the most recent
// public posts along with their authors' profile pages. It intentionally
// only calls the public, no-login GET /api/posts endpoint — not an
// authenticated "list all users" endpoint — so this keeps working exactly
// as-is even if that endpoint's auth requirements ever change.
//
// Place this file at:  functions/sitemap.xml.js

export async function onRequestGet(context) {
  const { request } = context;
  const origin = new URL(request.url).origin;

  const urls = new Set([`${origin}/`, `${origin}/announcements`]);

  try {
    const apiUrl = new URL("/api/posts?limit=50", request.url);
    const response = await fetch(apiUrl.toString());
    if (response.ok) {
      const { posts = [] } = await response.json();
      posts.forEach(post => {
        urls.add(`${origin}/post/${post._id}`);
        if (post.author?.username) {
          urls.add(`${origin}/profile/${post.author.username}`);
        }
      });
    }
  } catch {
    // If the API is briefly unreachable, still serve a sitemap with just
    // the static pages rather than failing the whole request.
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...urls].map(url => `  <url><loc>${url}</loc></url>`).join("\n") +
    `\n</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Regenerated every few minutes rather than on every single request —
      // a sitemap doesn't need to be second-by-second fresh.
      "Cache-Control": "public, max-age=300"
    }
  });
}
