// Small in-memory rate limiter (no extra npm package needed).
//
// Works for ONE running instance, which is how Lion Link runs today. If you ever run more
// than one backend instance, move the counters to a shared store such as Redis, because each
// instance would otherwise count separately.
const jwt = require("jsonwebtoken");

// The real visitor's address. Browser traffic reaches this API through the Cloudflare Pages
// Function, so req.ip would be the same proxy address for everybody and one noisy visitor
// would get everyone blocked. The Function passes the visitor's address in x-client-ip.
function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return String(req.headers["x-client-ip"] || req.headers["cf-connecting-ip"] || forwarded || req.ip || "unknown").trim();
}

// Signed-in people are counted by account, so people sharing one Wi-Fi network (a campus,
// for example) never use up each other's allowance. Everyone else is counted by address.
function actorKey(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ") && process.env.JWT_SECRET) {
    try { return `user:${jwt.verify(header.slice(7), process.env.JWT_SECRET).userId}`; } catch { /* fall back to the address */ }
  }
  return `ip:${clientIp(req)}`;
}

const buckets = new Map();
const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of buckets) if (record.resetAt <= now) buckets.delete(key);
}, 60 * 1000);
cleaner.unref();

function createLimiter({ name, max, windowMs, keyFn = actorKey, methods, message }) {
  return (req, res, next) => {
    if (methods && !methods.includes(req.method)) return next();
    const key = `${name}:${keyFn(req)}`;
    const now = Date.now();
    let record = buckets.get(key);
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      buckets.set(key, record);
    }
    record.count += 1;
    if (record.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))));
      return res.status(429).json({ message: message || "You are doing that too quickly. Please wait a moment and try again." });
    }
    next();
  };
}

module.exports = { createLimiter, clientIp, actorKey };
