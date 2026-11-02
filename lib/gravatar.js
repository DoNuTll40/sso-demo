import crypto from "crypto";

/**
 * สร้าง Gravatar URL จาก Email
 * ตามมาตรฐาน Gravatar: MD5 hash ของ email (trimmed & lowercase)
 * Default image: 'identicon' (สร้างรูปกราฟิกเรขาคณิตอัตโนมัติตาม hash หากไม่มีรูปใน gravatar)
 */
export function getGravatarUrl(email, size = 128) {
  if (!email || typeof email !== "string") {
    return `https://www.gravatar.com/avatar/?d=identicon&s=${size}`;
  }
  const cleanEmail = email.trim().toLowerCase();
  const hash = crypto.createHash("md5").update(cleanEmail).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}

