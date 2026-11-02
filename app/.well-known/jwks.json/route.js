import { NextResponse } from "next/server";
import crypto from "crypto";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=86400",
};

export async function GET() {
  const keys = [];

  // หากมีการตั้งค่า RSA Public Key (PEM) ใน Environment Variable ให้แปลงเป็น JWK อัตโนมัติ
  const publicKeyPem =
    process.env.OIDC_PUBLIC_KEY || process.env.JWT_PUBLIC_KEY;

  if (publicKeyPem) {
    try {
      const normalizedPem = publicKeyPem.replace(/\\n/g, "\n");
      const publicKeyObject = crypto.createPublicKey(normalizedPem);
      const jwk = publicKeyObject.export({ format: "jwk" });

      const kid =
        process.env.OIDC_KEY_ID ||
        crypto
          .createHash("sha256")
          .update(normalizedPem)
          .digest("hex")
          .slice(0, 16);

      keys.push({
        kty: jwk.kty || "RSA",
        use: "sig",
        alg: "RS256",
        kid,
        n: jwk.n,
        e: jwk.e,
      });
    } catch (error) {
      console.error("[JWKS Export Error]:", error);
    }
  }

  return NextResponse.json(
    { keys },
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

