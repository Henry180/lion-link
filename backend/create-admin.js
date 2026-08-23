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
  const existing = await User.findOne({ $or: [{ username: normalized }, { email: email.toLowerCase() }] });
  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    existing.name = name; existing.username = normalized; existing.email = email.toLowerCase(); existing.password = passwordHash; existing.role = "admin";
    await existing.save();
    console.log("Admin account updated.");
  } else {
    await User.create({ name, username: normalized, email: email.toLowerCase(), password: passwordHash, role: "admin" });
    console.log("Admin account created.");
  }
  await mongoose.disconnect();
})().catch(error => { console.error(error.message); process.exit(1); });
