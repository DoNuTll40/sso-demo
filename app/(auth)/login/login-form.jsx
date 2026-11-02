"use client";
import { useRouter } from "nextjs-toploader/app";


import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Lock,
  User,
  AlertCircle,
  Loader2,
  KeyRound,
  ArrowRight,
} from "lucide-react";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [clientName, setClientName] = useState("");
  const [contextError, setContextError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

    useEffect(() => {
    setClientName(""); setContextError("");
    if (!sessionId) return;
    const controller = new AbortController();
    fetch(`/api/v1/auth/login-context?session_id=${encodeURIComponent(sessionId)}`, {cache:"no-store",signal:controller.signal})
      .then(async response => {const data=await response.json(); if(!response.ok) throw new Error(data.error); setClientName(data.clientName);})
      .catch(error => {if(error.name!=="AbortError") setContextError(error.message || "โหลดข้อมูลระบบไม่สำเร็จ");});
    return () => controller.abort();
  }, [sessionId]);
const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setStatusMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          session_id: sessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "ข้อมูลประจำตัวไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
        setLoading(false);
        return;
      }

      if (data.status === "CHALLENGE_REQUIRED" && data.challengeId) {
        setStatusMessage("ตรวจสอบรหัสผ่านสำเร็จ กำลังส่งแจ้งเตือน 2FA...");
        router.push(`/challenge/${data.challengeId}`);
        return;
      }

      if (data.status === "CONSENT_REQUIRED" && data.redirectUrl) {
        setStatusMessage("กำลังนำทางไปยังหน้ายืนยันสิทธิ์...");
        router.push(data.redirectUrl);
        return;
      }

      if (data.status === "APPROVED" && data.redirectUrl) {
        setStatusMessage("เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนหน้า...");
        if (data.redirectUrl.startsWith("http")) {
          window.location.href = data.redirectUrl;
        } else {
          router.push(data.redirectUrl);
        }
        return;
      }

      router.replace("/");
    } catch (err) {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] p-4">
      <div className="w-full max-w-[360px]">
{/* Brand Header */}
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100">
            <Shield className="h-4 w-4" />
          </div>
          <h1 className="text-[16px] font-semibold tracking-tight text-zinc-100">
            {sessionId ? (clientName ? `เข้าสู่ระบบ ${clientName}` : "เข้าสู่ระบบ") : "เข้าสู่ระบบ SSO Core"}
          </h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            ระบบยืนยันตัวตนกลาง (Single Sign-On &amp; 2FA)
          </p>

          {contextError && <p role="alert" className="mt-2 text-[11px] text-rose-300">{contextError}</p>}
        </div>

{/* Sign-In Card */}
        <div className="rounded-xl border border-zinc-800/90 bg-[#0c0c0e] p-5 shadow-xl">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
              <span>{statusMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                ชื่อผู้ใช้หรืออีเมล
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text" autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ชื่อผู้ใช้หรืออีเมลของคุณ"
                  disabled={loading || Boolean(sessionId && (!clientName || contextError))}
                  required
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-8 pr-3 text-[12px] text-zinc-100 placeholder-zinc-600 transition focus:border-zinc-600 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="password" autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading || Boolean(sessionId && (!clientName || contextError))}
                  required
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-8 pr-3 text-[12px] text-zinc-100 placeholder-zinc-600 transition focus:border-zinc-600 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || Boolean(sessionId && (!clientName || contextError))}
              className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-zinc-100 text-[12px] font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>กำลังตรวจสอบสิทธิ์...</span>
                </>
              ) : (
                <>
                  <span>ดำเนินการต่อ</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>

          </div>


      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}














