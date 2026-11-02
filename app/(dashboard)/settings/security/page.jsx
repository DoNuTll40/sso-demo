"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import RecoveryCodes from "@/app/components/recovery-codes";
import Link from "next/link";
import { useConsoleMotion } from "@/lib/use-console-motion";
import { QRCodeSVG } from "qrcode.react";
import { useConsoleSettings } from "@/app/providers";
import {
  QrCode,
  Smartphone,
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  X,
  Loader2,
  Terminal,
  Code2,
  ArrowUpRight,
} from "lucide-react";

export default function SecuritySettingsPage() {
  const { settings } = useConsoleSettings();
  const pageRef = useRef(null);
  const modalRef = useRef(null);

  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const verifiedCount = devices.filter(device => device.isVerified).length;
  const [qrPayload, setQrPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPairModal, setShowPairModal] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedField, setCopiedField] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/devices/pair", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (res.ok) {
        setUser(data.user);
        setDevices(data.devices || []);
        setQrPayload(data.qrPayload);
      }
    } catch (err) {
      console.error("Failed to fetch security data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  useConsoleMotion(pageRef, loading ? "loading" : devices.length, {ready: !loading, selector: ".gsap-stagger"});
  useConsoleMotion(modalRef, Boolean(showPairModal), {ready: Boolean(showPairModal), modal: true});




  const handleOpenPairModal = async () => {
    await fetchSecurityData();
    setShowRawJson(false);
    setShowPairModal(true);
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(""), 1800);
  };


  const handleDeleteDevice = async (device) => {
    const deviceId = device.id;
    if (!window.confirm(device.isVerified ? `ยกเลิกการผูก ${device.deviceName}? เครื่องนี้จะใช้ยืนยันตัวตนไม่ได้` : `ลบ ${device.deviceName} ออกจากรายการ?`)) return;
    try {
      const res = await fetch(
        `/api/v1/devices/pair?id=${encodeURIComponent(deviceId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchSecurityData();
      }
    } catch (err) {
      console.error("Delete device error:", err);
    }
  };

  const qrString = qrPayload ? JSON.stringify(qrPayload) : "";

  return (
    <div ref={pageRef} className="w-full space-y-4">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-zinc-800/80 pb-3.5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">
            Security &amp; 2FA Authenticator Devices
          </h1>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            จัดการอุปกรณ์มือถือที่ผูกไว้สำหรับยืนยันตัวตนแบบสองขั้นตอน (Mobile Push Number Matching)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenPairModal}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3 text-[12px] font-medium text-zinc-950 transition hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>ผูกอุปกรณ์ใหม่ (Pair Device)</span>
          </button>
        </div>
      </div>

      {/* Main Full-Width Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Account & MFA Policy Status (4 cols) */}
        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] p-4 lg:col-span-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <span className="text-[12px] font-medium text-zinc-200">
              MFA Enforcement Status
            </span>
            {verifiedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ผูกอุปกรณ์แล้ว
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Unconfigured
              </span>
            )}
          </div>

          <div className="mt-3.5">
            {verifiedCount > 0 ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>เปิดใช้งาน Push 2FA แล้ว ({verifiedCount} เครื่อง)</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  การเข้าสู่ระบบทุกครั้งจะสุ่มรหัส Matching 2 หลักและส่งแจ้งเตือนไปยังอุปกรณ์ที่ลงทะเบียนไว้
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-200">
                  <Smartphone className="h-4 w-4 text-amber-400" />
                  <span>ยังไม่ได้ผูกอุปกรณ์ 2FA</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  ขณะนี้บัญชีใช้เฉพาะรหัสผ่านในการเข้าสู่ระบบ กดปุ่ม &ldquo;ผูกอุปกรณ์ใหม่&rdquo; เพื่อเปิดใช้ 2FA
                </p>
              </div>
            )}
          </div>

          {user && (
            <div className="mt-4 border-t border-zinc-800/80 pt-3.5">
              <div className="mb-3.5 flex items-center gap-2.5">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 font-mono text-[13px] font-semibold text-zinc-200">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName || user.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>
                      {(user.fullName || user.username || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-zinc-100">
                    {user.fullName}
                  </div>
                  <div className="truncate font-mono text-[11px] text-zinc-500">
                    @{user.username}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Email</span>
                  <span className="font-mono text-zinc-300">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Role</span>
                  <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {user.role}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Paired Devices Table/List (8 cols) */}
        <div className="gsap-stagger overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0c0c0e] lg:col-span-8">
          <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-200">
              <span>Registered Devices</span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                {devices.length}
              </span>
            </div>
            <button
              type="button"
              onClick={fetchSecurityData}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              <RefreshCw
                className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
              />
              <span>รีเฟรช</span>
            </button>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {loading ? (
              <div className="flex h-52 flex-col items-center justify-center text-[12px] text-zinc-500">
                <Loader2 className="mb-1.5 h-4 w-4 animate-spin text-zinc-400" />
                <span>กำลังโหลดรายการอุปกรณ์...</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="flex h-52 flex-col items-center justify-center p-6 text-center">
                <QrCode className="mb-2 h-7 w-7 text-zinc-600" />
                <p className="text-[12px] font-medium text-zinc-300">
                  ยังไม่มีอุปกรณ์ที่ลงทะเบียนไว้
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  คลิกปุ่ม &ldquo;ผูกอุปกรณ์ใหม่ (Pair Device)&rdquo; เพื่อสร้าง QR Code สำหรับแอปมือถือ
                </p>
              </div>
            ) : (
              devices.map((device) => (
                <div
                  key={device.id}
                  className="gsap-stagger flex flex-col justify-between gap-3 px-4 py-3.5 transition hover:bg-zinc-900/30 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-zinc-100">
                          {device.deviceName} <span className="ml-2 text-[10px] text-zinc-500">{device.isVerified ? "ผูกอยู่" : "ยกเลิกการผูกแล้ว"}</span>
                        </span>
                        {device.isVerified && (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-medium text-emerald-300">
                            Verified
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                        Public Key: {device.publicKey.slice(0, 48)}...
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        ใช้งานล่าสุด:{" "}
                        {new Date(device.lastUsedAt).toLocaleString("th-TH")}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteDevice(device)}
                    className="inline-flex h-7 items-center gap-1.5 self-end rounded border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] font-medium text-zinc-400 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 sm:self-center"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{device.isVerified ? "ยกเลิกการผูก" : "ลบออกจากรายการ"}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <RecoveryCodes />
      {/* Compact QR Code Modal (Rendered via Portal to cover 100vw/100vh completely and center properly) */}
      {mounted && showPairModal && qrPayload && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={modalRef}
            className="w-full max-w-sm rounded-xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-zinc-300" />
                <span className="text-[13px] font-semibold text-zinc-100">
                  ผูกอุปกรณ์ 2FA (Pair Mobile Device)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <p className="text-center text-[11px] text-zinc-400">
                สแกน QR Code นี้ด้วยแอปมือถือเพื่อลงทะเบียน Public Key และ FCM Token
              </p>

              <div className="mx-auto flex w-fit items-center justify-center rounded-lg border border-zinc-700 bg-white p-3.5 shadow-sm">
                <QRCodeSVG
                  value={qrString}
                  size={156}
                  level="M"
                  includeMargin={false}
                />
              </div>

              <div className="space-y-2 rounded-lg border border-zinc-800/90 bg-zinc-950 p-3 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-zinc-500">Endpoint</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(qrPayload.endpoint, "endpoint")}
                    className="inline-flex min-w-0 items-center gap-1.5 font-mono text-zinc-300 hover:text-white"
                  >
                    <span className="truncate max-w-[200px]">
                      {qrPayload.endpoint}
                    </span>
                    {copiedField === "endpoint" ? (
                      <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 shrink-0 text-zinc-500" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2">
                  <span className="shrink-0 text-zinc-500">JSON Payload</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRawJson((v) => !v)}
                      className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200"
                    >
                      <Code2 className="h-3 w-3" />
                      <span>{showRawJson ? "ซ่อน" : "ดู JSON"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(JSON.stringify(qrPayload, null, 2), "json")
                      }
                      className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300 hover:text-white"
                    >
                      {copiedField === "json" ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 text-zinc-400" />
                          <span>คัดลอก</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {showRawJson && (
                  <pre className="mt-2 max-h-24 overflow-y-auto break-all whitespace-pre-wrap rounded border border-zinc-800 bg-[#09090b] p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
                    {JSON.stringify(qrPayload, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-zinc-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="h-8 rounded-md bg-zinc-100 px-4 text-[12px] font-medium text-zinc-950 transition hover:bg-white"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}






