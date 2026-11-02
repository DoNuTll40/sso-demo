import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session-auth";
import { storedPreferences, savePreferences } from "@/lib/user-preferences";
export async function GET(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  return NextResponse.json({settings: await storedPreferences(user.id)}, {headers: {"Cache-Control": "no-store"}});
}
export async function PUT(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  const body = await request.json();
  if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) return NextResponse.json({error: "Invalid settings"}, {status: 400});
  return NextResponse.json({settings: await savePreferences(user.id, body.settings)});
}
