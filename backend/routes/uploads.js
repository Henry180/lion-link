const express = require("express");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const auth = require("../middleware/auth");

const router = express.Router();

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// The browser asks here first, gets a short-lived (5 minute) signed link,
// then sends the actual photo/video bytes straight to Cloudflare R2 — never
// through this server. Render's free plan has very little bandwidth and
// CPU to spare; this keeps every upload off it entirely, and off MongoDB,
// which previously stored the whole file as text inside each post.
router.post("/presign", auth, async (req, res) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({
        message: "filename and contentType are required"
      });
    }

    const safeName = String(filename).replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
    const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

    res.json({ uploadUrl, publicUrl });

  } catch (error) {
    console.error("Presign error:", error);
    res.status(500).json({
      message: "Server error"
    });
  }
});

module.exports = router;
