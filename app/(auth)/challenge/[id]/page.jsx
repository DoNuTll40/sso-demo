"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RecoveryCodes from "@/app/components/recovery-codes";
import Link from "next/link";
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Terminal,
  Check,
  X,
} from "lucide-react";

export default function ChallengePage({ params }) {
  const resolvedParams = use(params);
  const challengeId = resolvedParams?.id;
  const router = useRouter();

  const [challengeData, setChallengeData] = useState(null);
  const [status, setStatus] = useState("PENDING");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!challengeId || challengeId === "demo-session") return;

    let isMounted = true;
    let intervalId = null;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/v1/auth/challenge-status?id=${encodeURIComponent(challengeId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();

        if (!isMounted) return;

        if (!res.ok) {
          setError(data.error || "ไม่พบข้อมูล Challenge");
          return;
        }

        setChallengeData(data);
        setStatus(data.status);

        if (data.status === "APPROVED") {
          if (intervalId) clearInterval(intervalId);

          setTimeout(() => {
            if (data.redirectUrl) {
              if (data.redirectUrl.startsWith("http")) {
                window.location.href = data.redirectUrl;
              } else {
                router.push(data.redirectUrl);
              }
            } else {
              router.push("/settings/security");
            }
          }, 1000);
        } else if (data.status === "REJECTED" || data.status === "EXPIRED") {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 2000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [challengeId, router]);

    const pending = status === "PENDING" && !error;
  const ended = status === "EXPIRED" || status === "REJECTED" || Boolean(error);
  const Icon = ended ? Clock : status === "APPROVED" ? CheckCircle2 : Smartphone;
  return <main data-auth-challenge className="flex min-h-screen items-center justify-center bg-[#09090b] px-5 py-12">
    <div className="w-full max-w-[360px]">
      
      <section className="challenge-card rounded-xl border border-zinc-800 bg-[#0c0c0e] p-5">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900"><Icon size={22} className={ended ? "text-amber-400" : "text-zinc-200"}/></div>
        <h1 className="text-center text-[15px] font-semibold text-zinc-100">{ended ? status === "REJECTED" ? "คำขอถูกยกเลิกแล้ว" : "คำขอนี้ใช้งานไม่ได้แล้ว" : status === "APPROVED" ? "ยืนยันตัวตนสำเร็จ" : "ยืนยันว่าเป็นคุณ"}</h1>
        <p className="mt-2 text-center text-sm leading-6 text-zinc-400">{ended ? error || "กรุณาเข้าสู่ระบบอีกครั้งเพื่อเริ่มคำขอยืนยันตัวตนใหม่" : status === "APPROVED" ? "กำลังพาคุณเข้าสู่ระบบ…" : challengeData ? <>เปิดแอปบน <span className="text-zinc-200">{challengeData.deviceName}</span><br/>แล้วเลือกตัวเลขให้ตรงกับที่แสดงด้านล่าง</> : "กำลังโหลดคำขอยืนยันตัวตน…"}</p>
        {pending && challengeData && <><div className="my-6 rounded-xl border border-zinc-800 bg-zinc-950 py-6 text-center"><p className="text-xs text-zinc-500">ตัวเลขยืนยัน</p><p className="mt-2 font-mono text-5xl font-semibold tracking-[.2em] text-white">{challengeData.challengeCode}</p></div><p role="status" className="flex items-center justify-center gap-2 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin"/>รอการอนุมัติจากมือถือ</p><RecoveryCodes challengeId={challengeId}/></>}
        {ended ? <Link href="/login" className="challenge-restart mt-5 flex h-9 items-center justify-center rounded-lg bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white">กลับไปเข้าสู่ระบบ</Link> : status !== "APPROVED" && <Link href="/login" className="mt-5 block text-center text-xs text-zinc-500 hover:text-zinc-200">ยกเลิกการเข้าสู่ระบบ</Link>}
      </section>
      <p className="mt-5 text-center text-xs text-zinc-600">อนุมัติเฉพาะคำขอที่คุณเป็นผู้เริ่มเท่านั้น</p>
    </div>
  </main>;
}


