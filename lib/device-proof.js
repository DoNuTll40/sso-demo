import crypto from "crypto";
export function verifyDeviceProof(publicKey, payload, signature) {
  try {
    if (!/^ed25519:[0-9a-f]{64}$/.test(publicKey) || !/^[0-9a-f]{128}$/.test(signature)) return false;
    const key = crypto.createPublicKey({key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey.slice(8), "hex")]), format: "der", type: "spki"});
    return crypto.verify(null, Buffer.from(payload), key, Buffer.from(signature, "hex"));
  } catch { return false; }
}
export function challengePayload(challengeId, nonce, deviceId, action, selectedCode) {
  return JSON.stringify(["sso-2fa-v1", challengeId, nonce, deviceId, action, String(selectedCode ?? "")]);
}
