import { NextResponse } from "next/server";

/**
 * GET /api/auth/callback/custom-sso
 * Callback Endpoint จำลองสำหรับทดสอบรับ Authorization Code จากระบบ SSO
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json(
      {
        status: "OAUTH_CALLBACK_ERROR",
        error,
        error_description: searchParams.get("error_description"),
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: "OAUTH_CALLBACK_SUCCESS",
    message:
      "ได้รับ Authorization Code สำเร็จ! สามารถนำ code ไปแลก Access Token และ ID Token ได้ที่ POST /api/v1/oauth/token",
    code,
    state,
    tokenExchangeExample: {
      endpoint: "/api/v1/oauth/token",
      method: "POST",
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost:3000/api/auth/callback/custom-sso",
        client_id: "test-client-web",
        client_secret: "secret1234",
      },
    },
  });
}

