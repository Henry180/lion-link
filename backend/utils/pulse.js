// "Has anything changed for me?" counters, kept in memory.
//
// The app asks every few seconds whether it has new messages or notifications.
// Answering that from the database would mean scanning conversations on every
// check from every signed-in person, which is far too heavy for a small
// database. Instead, the places that actually change something (a message
// sent, a message read, a notification created) bump a counter for the people
// affected, and the check just reads that counter: no database work at all.
//
// The counters live in this server process. That is correct while the API runs
// as a single instance (as it does on Render's Starter plan). If the API is
// ever scaled to several instances, move these counters to a shared store.
// After a restart every counter changes value, so each open app simply
// reloads once.

const boot = Date.now().toString(36);
const counters = new Map(); // userId -> { chat, notif }

function entry(userId) {
  const key = String(userId);
  let current = counters.get(key);
  if (!current) { current = { chat: 0, notif: 0 }; counters.set(key, current); }
  return current;
}

// kind: "chat" (messages / read ticks) or "notif" (likes, comments, follows)
function touch(userIds, kind) {
  for (const id of [].concat(userIds || [])) {
    const resolved = id && id._id ? id._id : id;
    if (resolved) entry(resolved)[kind] += 1;
  }
}

function snapshot(userId) {
  const current = entry(userId);
  return { chat: `${boot}.${current.chat}`, notif: `${boot}.${current.notif}` };
}

module.exports = { touch, snapshot };
