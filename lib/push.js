export async function sendChallengePush(token, challenge) {
  if (!/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token || "")) return false;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: {"Content-Type": "application/json"}, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({to: token, sound: "default", channelId: "sso-2fa-channel", title: "คำขอเข้าสู่ระบบ SSO", body: "เปิดแอปเพื่อยืนยันเลขบนหน้าจอ", data: {type: "2FA_CHALLENGE", ...challenge}}),
    });
    const result = await response.json();
    return response.ok && result.data?.status === "ok";
  } catch { return false; }
}
