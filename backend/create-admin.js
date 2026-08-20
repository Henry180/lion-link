require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const [name, username, email, password] = process.argv.slice(2);
if (![name, username, email, password].every(Boolean) || password.length < 6) {
  console.error('Usage: npm run create-admin -- "Lion Link Admin" lionlinkadmin admin@example.com password');
  process.exit(1);
}
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const normalized = username.toLowerCase().replace(/^@/, "");
  if (await User.exists({ $or: [{ username: normalized }, { email: email.toLowerCase() }] })) throw Error("Username or email already exists");
  await User.create({ name, username: normalized, email: email.toLowerCase(), password: await bcrypt.hash(password, 10), role: "admin" });
  console.log("Admin account created."); await mongoose.disconnect();
})().catch(error => { console.error(error.message); process.exit(1); });
