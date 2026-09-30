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

// Real content types only. Without this, /presign would hand out a valid
// signed URL for ANY contentType the caller names — including text/html —
// letting someone host arbitrary files (including a working HTML/JS page)
// on your own R2 domain.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/webm", "audio/mpeg", "audio/mp4", "audio/wav"
]);

// 60 MB matches the app's own stated limit (see MAX_UPLOAD_BYTES in
// frontend.js). Enforced here too — an API call made directly, bypassing
// the browser entirely, previously had no size ceiling at all.
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

router.post("/presign", auth, async (req, res) => {
  try {
    const { filename, contentType, fileSize } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({
        message: "filename and contentType are required"
      });
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return res.status(400).json({ message: "That file type isn't supported." });
    }

    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ message: "Files must be 60 MB or smaller." });
    }

    const safeName = String(filename).replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
    const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // Signing ContentLength means the signature itself is only valid for
      // exactly this many bytes — R2 rejects the upload outright if the
      // browser tries to send anything else, so the size limit can't be
      // bypassed by calling this endpoint directly and lying about size.
      ContentLength: size
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
