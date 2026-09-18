// One-time (and safely re-runnable) fix-up: every post created before the
// commentsCount field existed doesn't have it set correctly yet. This sets
// it, for every post, to the real number of comments it actually has.
//
// Run this once from Render's Shell tab with:
//   npm run backfill-comments
//
// It's harmless to run again later — it always recomputes the true count
// from scratch rather than adding to whatever's there, so re-running it
// can only fix drift, never cause it.

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set — check your environment variables.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected. Recalculating comment counts…");

  const result = await mongoose.connection.db.collection("posts").updateMany(
    {},
    [{ $set: { commentsCount: { $size: { $ifNull: ["$comments", []] } } } }]
  );

  console.log(`Done — ${result.modifiedCount} post(s) updated out of ${result.matchedCount} checked.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(error => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
