"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConsoleMotion } from "@/lib/use-console-motion";
import { useConsoleSettings } from "@/app/providers";
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Key,
  X,
  AlertCircle,
  Loader2,
  Smartphone,
  Check,
  Copy,
} from "lucide-react";

export default function AdminUsersPage() {
  const { settings } = useConsoleSettings();
  const pageRef = useRef(null);
  const createModalRef = useRef(null);
  const editModalRef = useRef(null);
  const resetPassModalRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("USER");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit User Modal
  const [editingUser, setEditingUser] = useState(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("USER");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Reset Password Modal
  const [resetPassUser, setResetPassUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccessMessage, setResetSuccessMessage] = useState("");

  // Notification Toast
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter && roleFilter !== "ALL") params.set("role", roleFilter);

      const res = await fetch(`/api/v1/admin/users?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers();
  };

  // GSAP Animations
  useConsoleMotion(pageRef, loading ? "loading" : users.length, {ready: !loading, selector: ".gsap-stagger"});
  useConsoleMotion(createModalRef, Boolean(isCreateOpen), {ready: Boolean(isCreateOpen), modal: true});
  useConsoleMotion(editModalRef, Boolean(editingUser), {ready: Boolean(editingUser), modal: true});
  useConsoleMotion(resetPassModalRef, Boolean(resetPassUser), {ready: Boolean(resetPassUser), modal: true});








  // Handle Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateSubmitting(true);

    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createUsername,
          email: createEmail,
          fullName: createFullName,
          password: createPassword,
          role: createRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error || "ไม่สามารถสร้างผู้ใช้ได้");
        return;
      }

      showToast(`สร้างผู้ใช้ "${data.user.username}" สำเร็จแล้ว`);
      setIsCreateOpen(false);
      setCreateUsername("");
      setCreateEmail("");
      setCreateFullName("");
      setCreatePassword("");
      setCreateRole("USER");
      await fetchUsers();
    } catch (err) {
      setCreateError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Edit User
  const handleStartEdit = (user) => {
    setEditError("");
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    setEditRole(user.role);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError("");
    setEditSubmitting(true);

    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUser.id,
          fullName: editFullName,
          email: editEmail,
          role: editRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error || "ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้");
        return;
      }

      showToast(`อัปเดตข้อมูล "${editingUser.username}" สำเร็จแล้ว`);
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      setEditError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Reset Password
  const handleStartResetPass = (user) => {
    setResetError("");
    setResetSuccessMessage("");
    setResetPassUser(user);
    setNewPassword("");
  };

  const handleExecuteResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPassUser) return;
    setResetError("");
    setResetSubmitting(true);

    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resetPassUser.id,
          password: newPassword,
          action: "reset_password",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || "ไม่สามารถรีเซ็ตรหัสผ่านได้");
        return;
      }

      showToast(`รีเซ็ตรหัสผ่านสำหรับ "${resetPassUser.username}" เรียบร้อย`);
      setResetPassUser(null);
    } catch (err) {
      setResetError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setResetSubmitting(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (user) => {
    const confirmDelete = window.confirm(
      `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${user.username}" (${user.fullName})?\nเซสชันและอุปกรณ์ 2FA ทั้งหมดของบัญชีนี้จะถูกลบออกทันที`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `/api/v1/admin/users?id=${encodeURIComponent(user.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "ไม่สามารถลบผู้ใช้งานได้");
        return;
      }

      showToast(`ลบผู้ใช้ "${user.username}" เรียบร้อยแล้ว`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      console.error("Delete user error:", err);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
  };

  // Helper สุ่มรหัสผ่านปลอดภัย
  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let pass = "";
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const regularUsersCount = users.filter((u) => u.role === "USER").length;
  const twoFactorCount = users.filter((u) => (u.devices?.filter(device => device.isVerified).length || 0) > 0).length;

  return (
    <div ref={pageRef} className="w-full space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/90 px-4 py-2.5 text-[12px] font-medium text-emerald-300 shadow-xl backdrop-blur-xs">
          <Check className="h-4 w-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-zinc-800/80 pb-3.5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">
            User Directory
          </h1>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึง (RBAC) และสถานะการผูกอุปกรณ์ 2FA สำหรับระบบยืนยันตัวตนกลาง
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateError("");
            setCreatePassword(generateRandomPassword());
            setIsCreateOpen(true);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3 text-[12px] font-medium text-zinc-950 transition hover:bg-white"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>เพิ่มผู้ใช้งานใหม่</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Total Accounts</span>
            <Users className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {totalUsers}
          </div>
        </div>

        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Administrators</span>
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {adminCount}
          </div>
        </div>

        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Standard Users</span>
            <Shield className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {regularUsersCount}
          </div>
        </div>

        <div className="gsap-stagger rounded-lg border border-zinc-800/80 bg-[#0c0c0e] px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>2FA Protected</span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {twoFactorCount}
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="gsap-stagger flex flex-col justify-between gap-2.5 rounded-lg border border-zinc-800/80 bg-[#0c0c0e] p-2.5 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาตามชื่อ, username หรือ email..."
            className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-8 pr-3 text-[12px] text-zinc-200 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-[11px]">
            {["ALL", "ADMIN", "USER"].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  roleFilter === role
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {role === "ALL" ? "ทั้งหมด" : role}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchUsers}
            title="รีเฟรชข้อมูล"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Main Users Table */}
      <div className="gsap-stagger w-full overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0c0c0e]">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-zinc-900/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">2FA Protection</th>
                <th className="px-4 py-2.5">Registered</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-[12px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    <Loader2 className="mx-auto mb-1.5 h-4 w-4 animate-spin text-zinc-400" />
                    <span>กำลังโหลดรายชื่อผู้ใช้...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    ไม่พบข้อมูลผู้ใช้งานตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const has2FA = (user.devices?.filter(device => device.isVerified).length || 0) > 0;
                  return (
                    <tr
                      key={user.id}
                      className="gsap-stagger transition hover:bg-zinc-900/30"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 font-mono text-[11px] font-semibold text-zinc-300">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.fullName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span>
                                {(user.fullName || user.username || "U").charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-100">
                              {user.fullName}
                            </div>
                            <div className="font-mono text-[11px] text-zinc-500">
                              @{user.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle font-mono text-[11px] text-zinc-300">
                        {user.email}
                      </td>

                      <td className="px-4 py-3 align-middle">
                        {user.role === "ADMIN" ? (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            ADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                            USER
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 align-middle">
                        {has2FA ? (
                          <div className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                            <Smartphone className="h-3 w-3 text-emerald-400" />
                            <span>
                              {user.devices.filter(device => device.isVerified).length} อุปกรณ์ที่ผูกอยู่
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                            ยังไม่ผูก 2FA
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 align-middle text-[11px] text-zinc-500">
                        {new Date(user.createdAt).toLocaleDateString("th-TH")}
                      </td>

                      <td className="px-4 py-3 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* ปุ่ม Reset Password */}
                          <button
                            type="button"
                            onClick={() => handleStartResetPass(user)}
                            title="รีเซ็ตรหัสผ่าน"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
                          >
                            <Key className="h-3.5 w-3.5" />
                          </button>

                          {/* ปุ่ม Edit */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(user)}
                            title="แก้ไขข้อมูลผู้ใช้"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {/* ปุ่ม Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            title="ลบผู้ใช้งาน"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: สร้างผู้ใช้งานใหม่ */}
      {mounted && isCreateOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={createModalRef}
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold text-zinc-100">
                  เพิ่มผู้ใช้งานใหม่
                </h2>
                <p className="text-[11px] text-zinc-500">
                  ลงทะเบียนบัญชีสำหรับเข้าใช้งานระบบ SSO กลาง
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

            <form onSubmit={handleCreateUser} className="space-y-3 p-5">
              {createError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Full Name (ชื่อ-นามสกุล) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="เช่น สมชาย ใจดี"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                    Username <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="เช่น somchai"
                    className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                    Role (บทบาท)
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 text-[12px] text-zinc-100 focus:border-zinc-600 focus:outline-none"
                  >
                    <option value="USER">USER (ผู้ใช้ทั่วไป)</option>
                    <option value="ADMIN">ADMIN (ผู้ดูแลระบบ)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="เช่น somchai@example.com"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[12px] font-medium text-zinc-300">
                    Initial Password (รหัสผ่านเริ่มต้น) <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreatePassword(generateRandomPassword())}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    สุ่มรหัสผ่าน
                  </button>
                </div>
                <input
                  type="text"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 text-[12px] font-medium text-zinc-950 transition hover:bg-white disabled:opacity-50"
                >
                  {createSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>สร้างผู้ใช้</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: แก้ไขข้อมูลผู้ใช้ */}
      {mounted && editingUser && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={editModalRef}
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold text-zinc-100">
                  แก้ไขข้อมูลผู้ใช้
                </h2>
                <p className="text-[11px] font-mono text-zinc-500">
                  @{editingUser.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-3 p-5">
              {editError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Full Name (ชื่อ-นามสกุล) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-zinc-300">
                  Role (บทบาท)
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 text-[12px] text-zinc-100 focus:border-zinc-600 focus:outline-none"
                >
                  <option value="USER">USER (ผู้ใช้ทั่วไป)</option>
                  <option value="ADMIN">ADMIN (ผู้ดูแลระบบ)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
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

      {/* Modal: รีเซ็ตรหัสผ่าน */}
      {mounted && resetPassUser && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div
            ref={resetPassModalRef}
            className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#0c0c0e] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-300">
                <Key className="h-4 w-4 text-amber-400" />
                <span>รีเซ็ตรหัสผ่านผู้ใช้งาน</span>
              </div>
              <button
                type="button"
                onClick={() => setResetPassUser(null)}
                className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteResetPassword} className="space-y-3 p-5">
              <p className="text-[12px] text-zinc-300">
                ตั้งรหัสผ่านใหม่สำหรับผู้ใช้{" "}
                <span className="font-semibold text-zinc-100">
                  {resetPassUser.fullName}
                </span>{" "}
                (<span className="font-mono text-zinc-400">@{resetPassUser.username}</span>)
              </p>

              {resetError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{resetError}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[12px] font-medium text-zinc-300">
                    New Password (รหัสผ่านใหม่)
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    สุ่มรหัสผ่าน
                  </button>
                </div>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="ความยาวอย่างน้อย 6 ตัวอักษร"
                  className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 font-mono text-[12px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={() => setResetPassUser(null)}
                  className="h-8 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[12px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-3.5 text-[12px] font-medium text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {resetSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>เปลี่ยนรหัสผ่าน</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


