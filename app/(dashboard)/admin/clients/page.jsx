"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useConsoleMotion } from "@/lib/use-console-motion";
import { useConsoleSettings } from "@/app/providers";
import {
  Plus,
  Key,
  ArrowUpRight,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  X,
  Shield,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Globe,
  Lock,
  Layers,
  Pencil,
  KeyRound,
  RotateCcw,
} from "lucide-react";

function CopyableCode({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`คลิกเพื่อคัดลอก ${label || value}`}
      className="group inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
    >
      <span className="truncate max-w-[240px]">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-zinc-500 transition group-hover:text-zinc-300" />
      )}
    </button>
  );
}

export default function AdminClientsPage() {
  const { settings } = useConsoleSettings();
  const pageRef = useRef(null);
  const createModalRef = useRef(null);
  const editModalRef = useRef(null);
  const regenModalRef = useRef(null);

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Modal Create
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [customClientId, setCustomClientId] = useState("");
  const [redirectUrisText, setRedirectUrisText] = useState("");
  const [scopesText, setScopesText] = useState("openid, profile, email");
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Modal Edit
  const [editingClient, setEditingClient] = useState(null);
  const [editClientName, setEditClientName] = useState("");
  const [editRedirectUrisText, setEditRedirectUrisText] = useState("");
  const [editScopesText, setEditScopesText] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editFormError, setEditFormError] = useState("");

  // Modal Confirm Regenerate Secret
  const [regenConfirmClient, setRegenConfirmClient] = useState(null);
  const [regenSubmitting, setRegenSubmitting] = useState(false);

  // Banner แสดง Secret ที่เพิ่งสร้างหรือเพิ่ง Regen
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await fetch("/api/v1/admin/clients", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setClients(data.clients || []);
      } else { setLoadError(data.error || "โหลดรายการไม่สำเร็จ"); }
    } catch (err) {
      setLoadError("เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง");
      console.error("Failed to fetch clients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // GSAP Stagger Animation
  useConsoleMotion(pageRef, loading ? "loading" : clients.length, {ready: !loading, selector: ".gsap-stagger"});
  useConsoleMotion(createModalRef, Boolean(isCreateOpen), {ready: Boolean(isCreateOpen), modal: true});
  useConsoleMotion(editModalRef, Boolean(editingClient), {ready: Boolean(editingClient), modal: true});
  useConsoleMotion(regenModalRef, Boolean(regenConfirmClient), {ready: Boolean(regenConfirmClient), modal: true});


  // GSAP Modal Animations






  // สร้าง Client ใหม่
  const handleCreateClient = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!clientName.trim() || !redirectUrisText.trim()) {
      setFormError("กรุณากรอกชื่อแอปพลิเคชันและ Redirect URI");
      return;
    }

    setSubmitting(true);
    try {
      const redirectUris = redirectUrisText
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      const allowedScopes = scopesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/v1/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientId: customClientId || undefined,
          redirectUris,
          allowedScopes,
          isPublic,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "ไม่สามารถสร้าง OAuth Client ได้");
        return;
      }

      setNewlyCreatedSecret({
        clientName: data.client.clientName,
        clientId: data.client.clientId,
        clientSecret: data.rawClientSecret,
        isRegen: false,
      });

      setClientName("");
      setCustomClientId("");
      setRedirectUrisText("");
      setIsCreateOpen(false);
      await fetchClients();
    } catch (err) {
      setFormError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setSubmitting(false);
    }
  };

  // เปิด Modal แก้ไข Client
  const handleStartEdit = (client) => {
    setEditFormError("");
    setEditingClient(client);
    setEditClientName(client.clientName);
    setEditRedirectUrisText(client.redirectUris.join(", "));
    setEditScopesText(client.allowedScopes.join(", "));
    setEditIsPublic(client.isPublic);
  };

  // บันทึกการแก้ไข Client
  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!editingClient) return;
    setEditFormError("");

    if (!editClientName.trim() || !editRedirectUrisText.trim()) {
      setEditFormError("กรุณากรอกชื่อแอปพลิเคชันและ Redirect URI อย่างน้อย 1 รายการ");
      return;
    }

    setEditSubmitting(true);
    try {
      const redirectUris = editRedirectUrisText
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      const allowedScopes = editScopesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/v1/admin/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingClient.id,
          clientName: editClientName,
          redirectUris,
          allowedScopes,
          isPublic: editIsPublic,
          action: "update",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditFormError(data.error || "ไม่สามารถอัปเดตข้อมูลได้");
        return;
      }

      // ถ้ามีการสร้าง secret ใหม่จากการเปลี่ยนจาก Public เป็น Confidential
      if (data.rawClientSecret) {
        setNewlyCreatedSecret({
          clientName: data.client.clientName,
          clientId: data.client.clientId,
          clientSecret: data.rawClientSecret,
          isRegen: false,
        });
      }

      setEditingClient(null);
      await fetchClients();
    } catch (err) {
      setEditFormError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setEditSubmitting(false);
    }
  };

  // ดำเนินการ Regenerate Client Secret
  const handleExecuteRegenSecret = async () => {
    if (!regenConfirmClient) return;

    setRegenSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: regenConfirmClient.id,
          action: "regenerate_secret",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "ไม่สามารถสร้าง Secret ใหม่ได้");
        return;
      }

      setNewlyCreatedSecret({
        clientName: data.client.clientName,
        clientId: data.client.clientId,
        clientSecret: data.rawClientSecret,
        isRegen: true,
      });

      setRegenConfirmClient(null);
      if (editingClient?.id === regenConfirmClient.id) {
        setEditingClient(null);
      }
      await fetchClients();
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setRegenSubmitting(false);
    }
  };

  // ลบ Client
  const handleDeleteClient = async (id, name) => {
    const confirmDelete = window.confirm(
      `คุณแน่ใจหรือไม่ว่าต้องการลบ OAuth Client "${name}"?\nการกระทำนี้ไม่สามารถย้อนกลับได้`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `/api/v1/admin/clients?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setClients((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error("Delete client error:", err);
    }
  };

  const confidentialCount = clients.filter((c) => !c.isPublic).length;
  const publicCount = clients.filter((c) => c.isPublic).length;
  const totalRedirectUris = clients.reduce(
    (acc, c) => acc + (c.redirectUris?.length || 0),
    0
  );

  return (
    <div ref={pageRef} className="w-full space-y-4">
      {loadError && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{loadError}<button className="ml-3 underline" onClick={fetchClients}>ลองใหม่</button></div>}
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-zinc-800/80 pb-3.5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">
            แอปพลิเคชันของฉัน
          </h1>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            ดูและจัดการเฉพาะแอปพลิเคชันที่คุณสร้าง กำหนด Redirect URIs และสิทธิ์การเข้าถึงได้ที่นี่
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFormError("");
              setIsCreateOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3 text-[12px] font-medium text-zinc-950 transition hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>ลงทะเบียน Client ใหม่</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Total Applications</span>
            <Layers className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {clients.length}
          </div>
        </div>

        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Confidential Clients</span>
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {confidentialCount}
          </div>
        </div>

        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Public Clients (PKCE)</span>
            <Shield className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {publicCount}
          </div>
        </div>

        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Whitelisted Redirect URIs</span>
            <Globe className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {totalRedirectUris}
          </div>
        </div>
      </div>

      {/* Alert Card แสดง Client Secret ใหม่ */}
      {newlyCreatedSecret && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-medium text-emerald-300">
              <Key className="h-3.5 w-3.5" />
              <span>
                {newlyCreatedSecret.isRegen
                  ? `สร้าง Client Secret ใหม่สำหรับ "${newlyCreatedSecret.clientName}" สำเร็จแล้ว`
                  : `ลงทะเบียน "${newlyCreatedSecret.clientName}" สำเร็จแล้ว`}
                {" "}(โปรดคัดลอก Client Secret เก็บไว้ทันที ระบบจะไม่แสดงอีกครั้ง)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNewlyCreatedSecret(null)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
              <span className="text-[11px] text-zinc-400">Client ID</span>
              <CopyableCode value={newlyCreatedSecret.clientId} label="Client ID" />
            </div>
            {newlyCreatedSecret.clientSecret && (
              <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                <span className="text-[11px] text-zinc-400">Client Secret</span>
                <CopyableCode
                  value={newlyCreatedSecret.clientSecret}
                  label="Client Secret"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Data Table */}
      <div className="gsap-stagger w-full overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0c0c0e]">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
            <span>Registered Applications</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              {clients.length}
            </span>
          </div>
          <button
            type="button"
            onClick={fetchClients}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span>รีเฟรช</span>
          </button>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5">Application</th>
                <th className="px-4 py-2.5">Client ID</th>
                <th className="px-4 py-2.5">Profile</th>
                <th className="px-4 py-2.5">Redirect URIs</th>
                <th className="px-4 py-2.5">Scopes</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-[12px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    <Loader2 className="mx-auto mb-1.5 h-4 w-4 animate-spin text-zinc-400" />
                    <span>กำลังโหลดข้อมูล...</span>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    คุณยังไม่ได้สร้างแอปพลิเคชัน
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="gsap-stagger transition hover:bg-zinc-900/30"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-zinc-100">
                        {client.clientName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        Created{" "}
                        {new Date(client.createdAt).toLocaleDateString("th-TH")}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <CopyableCode value={client.clientId} label="Client ID" />
                    </td>

                    <td className="px-4 py-3 align-top">
                      {client.isPublic ? (
                        <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Public (PKCE)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Confidential
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        {client.redirectUris.map((uri) => (
                          <div
                            key={uri}
                            className="font-mono text-[11px] text-zinc-400"
                          >
                            {uri}
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {client.allowedScopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* ปุ่ม Regen Secret (เฉพาะ Confidential Client) */}
                        {!client.isPublic && (
                          <button
                            type="button"
                            onClick={() => setRegenConfirmClient(client)}
                            title="สร้าง Client Secret ใหม่ (Regenerate)"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* ปุ่ม Edit */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(client)}
                          title="แก้ไขการตั้งค่า Client"
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        {/* ปุ่ม Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteClient(client.id, client.clientName)}
                          title="ลบ OAuth Client"
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discovery Endpoints Bar */}
      <div className="gsap-stagger flex flex-col justify-between gap-3 rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-[12px] text-zinc-400">
          <Shield className="h-3.5 w-3.5 text-zinc-500" />
          <span>OpenID Connect Provider Endpoints</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Link
            href="/.well-known/openid-configuration"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <span>/.well-known/openid-configuration</span>
            <ArrowUpRight className="h-3 w-3 -translate-x-0.5 translate-y-0.5 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
          </Link>
          <Link
            href="/.well-known/jwks.json"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <span>/.well-known/jwks.json</span>
            <ArrowUpRight className="h-3 w-3 -translate-x-0.5 translate-y-0.5 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
          </Link>
        </div>
      </div>

      {/* Modal: ลงทะเบียน OAuth Client ใหม่ */}
      {mounted && isCreateOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={createModalRef}
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold text-zinc-100">
                  ลงทะเบียน OAuth Client ใหม่
                </h2>
                <p className="text-[11px] text-zinc-500">
                  กำหนดค่าแอปพลิเคชันสำหรับเชื่อมต่อผ่านมาตรฐาน OAuth 2.0 / OIDC
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-3.5 p-5">
              {formError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Application Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. HR Management System"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Client ID{" "}
                  <span className="font-normal text-zinc-500">
                    (เว้นว่างเพื่อสุ่มอัตโนมัติ)
                  </span>
                </label>
                <input
                  type="text"
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  placeholder="e.g. hr-system-portal"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Redirect URIs <span className="text-rose-400">*</span>{" "}
                  <span className="font-normal text-zinc-500">
                    (คั่นด้วยจุลภาค ,)
                  </span>
                </label>
                <input
                  type="text"
                  value={redirectUrisText}
                  onChange={(e) => setRedirectUrisText(e.target.value)}
                  placeholder="https://app.example.com/api/auth/callback"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[11px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Allowed Scopes
                </label>
                <input
                  type="text"
                  value={scopesText}
                  onChange={(e) => setScopesText(e.target.value)}
                  placeholder="openid, profile, email"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[11px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-zinc-800/90 bg-zinc-950/60 px-3.5 py-2.5">
                <div>
                  <div className="text-[12px] font-medium text-zinc-200">
                    Public Client (SPA / Native Mobile)
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    ไม่ใช้ Client Secret และบังคับตรวจสอบ PKCE (S256)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-zinc-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3.5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 text-[12px] font-medium text-zinc-950 transition hover:bg-white disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>ลงทะเบียน Client</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: แก้ไข OAuth Client */}
      {mounted && editingClient && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={editModalRef}
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold text-zinc-100">
                  แก้ไขข้อมูล OAuth Client
                </h2>
                <p className="text-[11px] text-zinc-500 font-mono">
                  {editingClient.clientId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateClient} className="space-y-3.5 p-5">
              {editFormError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{editFormError}</span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Application Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Client ID
                </label>
                <div className="flex items-center justify-between rounded-md border border-zinc-800/80 bg-zinc-950/80 px-3 py-1.5 font-mono text-[11px] text-zinc-400">
                  <span>{editingClient.clientId}</span>
                  <CopyableCode value={editingClient.clientId} label="Client ID" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Redirect URIs <span className="text-rose-400">*</span>{" "}
                  <span className="font-normal text-zinc-500">
                    (คั่นด้วยจุลภาค ,)
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={editRedirectUrisText}
                  onChange={(e) => setEditRedirectUrisText(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Allowed Scopes
                </label>
                <input
                  type="text"
                  value={editScopesText}
                  onChange={(e) => setEditScopesText(e.target.value)}
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[11px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-zinc-800/90 bg-zinc-950/60 px-3.5 py-2.5">
                <div>
                  <div className="text-[12px] font-medium text-zinc-200">
                    Public Client (SPA / Native Mobile)
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    ไม่ใช้ Client Secret และบังคับตรวจสอบ PKCE (S256)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-zinc-100"
                />
              </div>

              {/* ส่วนจัดการ Client Secret ภายใน Edit Modal */}
              {!editIsPublic && (
                <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-300">
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Client Secret</span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Secret ถูกเข้ารหัสทางเดียว (Hash) ในฐานข้อมูล
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRegenConfirmClient(editingClient)}
                    className="inline-flex h-7 items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Regen Secret</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3.5">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 text-[12px] font-medium text-zinc-950 transition hover:bg-white disabled:opacity-50"
                >
                  {editSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>บันทึกการแก้ไข</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: ยืนยันการ Regenerate Client Secret */}
      {mounted && regenConfirmClient && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={regenModalRef}
            className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>ยืนยันการสร้าง Client Secret ใหม่</span>
              </div>
              <button
                type="button"
                onClick={() => setRegenConfirmClient(null)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-[12px] leading-relaxed text-zinc-300">
                คุณกำลังจะสร้าง Client Secret ใหม่สำหรับแอปพลิเคชัน{" "}
                <span className="font-semibold text-zinc-100">
                  &ldquo;{regenConfirmClient.clientName}&rdquo;
                </span>{" "}
                (<span className="font-mono text-zinc-400">{regenConfirmClient.clientId}</span>)
              </p>

              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] leading-relaxed text-rose-300">
                <span className="font-semibold text-rose-200">คำเตือน:</span>{" "}
                Client Secret เดิมจะถูกยกเลิกทันที! แอปพลิเคชันหรือระบบลูกที่ใช้ Secret เดิมจะไม่สามารถขอ Access Token หรือ Refresh Token ได้จนกว่าจะนำ Secret ใหม่ไปอัปเดตในระบบลูก
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={() => setRegenConfirmClient(null)}
                  className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={regenSubmitting}
                  onClick={handleExecuteRegenSecret}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-3.5 text-[12px] font-medium text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {regenSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  <span>ยืนยันสร้าง Secret ใหม่</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
