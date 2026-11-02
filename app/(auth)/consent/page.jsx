"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Mail,
  User,
  KeyRound,
  Check,
  Loader2,
  AlertCircle,
  Lock,
} from "lucide-react";

const SCOPE_DESCRIPTIONS = {
  openid: {
    label: "openid",
    title: "ยืนยันตัวตนผ่านบัญชีกลาง",
    description: "ระบุตัวตนของคุณผ่านมาตรฐาน OpenID Connect (sub)",
    icon: KeyRound,
  },
  profile: {
    label: "profile",
    title: "ข้อมูลโปรไฟล์พื้นฐาน",
    description: "อ่านชื่อ-นามสกุล ชื่อผู้ใช้ บทบาท และรูปโปรไฟล์",
    icon: User,
  },
  email: {
    label: "email",
    title: "ที่อยู่อีเมล",
    description: "อ่านที่อยู่อีเมลและสถานะการยืนยันอีเมลของคุณ",
    icon: Mail,
  },
};

function ConsentScreenContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setError("ไม่พบรหัสเซสชัน (session_id) สำหรับการขอความยินยอมสิทธิ์");
      setLoading(false);
      return;
    }

    const fetchConsentDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/v1/oauth/consent?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error_description || "ไม่สามารถดึงข้อมูลเซสชันได้");
          return;
        }

        setSessionData(data);
      } catch (err) {
        setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      } finally {
        setLoading(false);
      }
    };

    fetchConsentDetails();
  }, [sessionId]);

    const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!sessionData?.expiresAt) { setRemaining(null); return; }
    const update = () => setRemaining(Math.max(0, Math.ceil((new Date(sessionData.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [sessionData?.expiresAt]);
  const expired = remaining === 0;
  const timeLabel = remaining === null ? "—" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
const handleDecision = async (action) => {
    if (!sessionId || submittingAction || expired) return;
    setError("");
    setSubmittingAction(action);

    try {
      const res = await fetch("/api/v1/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error_description || "ไม่สามารถดำเนินการได้");
        setSubmittingAction(null);
        return;
      }

      if (data.redirectUrl) {
        if (data.redirectUrl.startsWith("http")) {
          window.location.href = data.redirectUrl;
        } else {
          router.push(data.redirectUrl);
        }
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
      setSubmittingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </div>
    );
  }

  const clientName = sessionData?.client?.clientName || "OAuth Application";
  const clientId = sessionData?.client?.clientId || "unknown-client";
  const user = sessionData?.user || {
    fullName: "System Administrator",
    email: "admin@example.com",
    username: "admin",
    role: "ADMIN",
  };
  const scopes = sessionData?.scopes || ["openid", "profile", "email"];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-[390px]">
        <div className="rounded-xl border border-zinc-800/90 bg-[#0c0c0e] p-5 shadow-xl">
          {/* Header */}
          <div className="border-b border-zinc-800/80 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-200">
                <Shield className="h-3.5 w-3.5" />
              </div>
              <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                {clientId}
              </span>
            </div>

            <h1 className="mt-3 text-[15px] font-semibold text-zinc-100">
              {sessionData.previouslyApproved ? `เข้าใช้งาน ${clientName} อีกครั้ง` : `${clientName} ขอสิทธิ์เข้าถึงบัญชีของคุณ`}
            </h1>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {sessionData.previouslyApproved ? "คุณเคยอนุญาตสิทธิ์เหล่านี้แล้ว ยืนยันเพื่อเข้าใช้งานด้วยบัญชีด้านล่าง" : "ตรวจสอบรายการข้อมูลที่แอปพลิเคชันจะสามารถเข้าถึงได้"}
            </p>
          </div>

          {error && (
            <div className="mt-3.5 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Signed-in Identity Bar */}
          <div className="mt-3.5 flex items-center justify-between rounded-lg border border-zinc-800/90 bg-zinc-950 px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[11px] font-semibold text-zinc-200">
                {(user.fullName || user.username || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-zinc-200">
                  {user.fullName}
                </div>
                <div className="truncate text-[11px] text-zinc-500">
                  {user.email}
                </div>
              </div>
            </div>
            <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              {user.role}
            </span>
          </div>

          {/* Requested Scopes */}
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-medium text-zinc-400">
              {sessionData.previouslyApproved ? "สิทธิ์ที่เคยอนุญาต" : "ขอบเขตการเข้าถึงข้อมูล"} ({scopes.length} รายการ)
            </div>
            <div className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800/90 bg-zinc-950/60">
              {scopes.map((scopeKey) => {
                const info = SCOPE_DESCRIPTIONS[scopeKey] || {
                  label: scopeKey,
                  title: `สิทธิ์การเข้าถึง ${scopeKey}`,
                  description: `อนุญาตให้เข้าถึงข้อมูลภายใต้ขอบเขต ${scopeKey}`,
                  icon: Lock,
                };
                const IconComponent = info.icon;

                return (
                  <div
                    key={scopeKey}
                    className="flex items-start gap-3 px-3 py-2.5"
                  >
                    <IconComponent className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-zinc-200">
                          {info.title}
                        </span>
                        <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                          {info.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {info.description}
                      </p>
                    </div>
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  </div>
                );
              })}
            </div>
          </div>

          {sessionData?.redirectUri && (
            <div className="mt-3 truncate text-[11px] text-zinc-500">
              Callback:{" "}
              <span className="font-mono text-zinc-400">
                {sessionData.redirectUri}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between gap-3 text-[11px]" style={{color: remaining !== null && remaining <= 60 ? "#fbbf24" : "#71717a"}}>
            <span>{expired ? "คำขอหมดอายุ เริ่มเข้าสู่ระบบจากแอปต้นทางอีกครั้ง" : "เวลาที่เหลือในการยืนยัน"}</span>
            <span className="font-mono" style={{fontVariantNumeric:"tabular-nums",flexShrink:0}}>{timeLabel}</span>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-3.5">
            <button
              type="button"
              disabled={!sessionData || Boolean(submittingAction) || expired}
              onClick={() => handleDecision("deny")}
              className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {submittingAction === "deny" ? "กำลังยกเลิก..." : "ปฏิเสธ (Deny)"}
            </button>

            <button
              type="button"
              disabled={!sessionData || Boolean(submittingAction) || expired}
              onClick={() => handleDecision("allow")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 text-[12px] font-medium text-zinc-950 transition hover:bg-white disabled:opacity-50"
            >
              {submittingAction === "allow" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              <span>{sessionData.previouslyApproved ? "ยืนยันเข้าใช้งาน" : "อนุญาต (Allow Access)"}</span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-zinc-500">
          <span>SSO Core OAuth 2.0 / OIDC</span>
          <Link href={`/login?session_id=${encodeURIComponent(sessionId)}`} className="hover:text-zinc-300">
            สลับบัญชีผู้ใช้
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        </div>
      }
    >
      <ConsentScreenContent />
    </Suspense>
  );
}



