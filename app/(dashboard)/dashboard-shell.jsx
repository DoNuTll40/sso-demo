"use client";
import { useRouter } from "nextjs-toploader/app";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useConsoleSettings } from "@/app/providers";
import { useConsoleMotion } from "@/lib/use-console-motion";
import { Shield, History, Monitor, Users, LayoutGrid, Smartphone, Sliders, ArrowUpRight, PanelLeftClose, PanelLeftOpen, LogOut, ChevronRight } from "lucide-react";
const links = [
  {href: "/settings/sessions", label: "เซสชันของฉัน", icon: Monitor},
  {href: "/settings/activity", label: "ประวัติกิจกรรม", icon: History},
  {href: "/admin/users", label: "ผู้ใช้งาน", icon: Users, admin: true},
  {href: "/admin/clients", label: "แอปพลิเคชันของฉัน", icon: LayoutGrid, admin: true},
  {href: "/settings/security", label: "อุปกรณ์และ 2FA", icon: Smartphone},
  {href: "/settings/preferences", label: "การตั้งค่า", icon: Sliders},
];
export default function DashboardLayout({children}) {
  const pathname = usePathname();
  const router = useRouter();
  const {settings, updateSettings, user, motionEnabled} = useConsoleSettings();
  const [dragging, setDragging] = useState(false);
  const dragCleanup = useRef(null);
  const main = useRef(null);
  useConsoleMotion(main, pathname);
  const collapsed = settings.sidebarCollapsed;
  const width = collapsed ? 64 : settings.sidebarWidth;
  const toggle = () => updateSettings(s => ({...s, sidebarCollapsed: !s.sidebarCollapsed}));
  useEffect(() => {
    const key = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b" && !e.target.closest("input,textarea,[contenteditable=true]")) {
        e.preventDefault(); updateSettings(s => ({...s, sidebarCollapsed: !s.sidebarCollapsed}));
      }
    };
    window.addEventListener("keydown", key);
    return () => {window.removeEventListener("keydown", key); dragCleanup.current?.();};
  }, [updateSettings]);
  const resize = e => {
    e.preventDefault(); setDragging(true);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    const move = event => { if (event.buttons !== 1) {stop(); return;} updateSettings({sidebarCollapsed: false, sidebarWidth: Math.max(180, Math.min(420, event.clientX))}); };
    const stop = () => {window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); document.body.style.cursor = previousCursor; setDragging(false); dragCleanup.current = null;};
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); dragCleanup.current = stop;
  };
  const visibleLinks = links.filter(link => !link.admin || user?.role === "ADMIN");
  const title = links.find(link => link.href === pathname)?.label || "พื้นที่ทำงาน";
  return <div data-console="true" data-contrast={settings.contrast} data-accent={settings.accent} data-motion={motionEnabled ? "on" : "off"} className="flex min-h-screen bg-[#09090b] text-zinc-100" style={{"--motion-duration": `${settings.motionDuration}ms`}}>
    <aside aria-label="เมนูหลัก" className="relative hidden shrink-0 flex-col border-r border-zinc-800/70 bg-[#0c0c0e] md:flex" style={{width, transition: motionEnabled && !dragging ? `width ${settings.motionDuration}ms ease` : "none"}}>
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="flex h-12 items-center justify-between gap-2 border-b border-zinc-800/70 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="SSO Core"><Shield className="h-6 w-6 shrink-0 console-accent"/>{!collapsed && <span className="truncate text-sm font-semibold">SSO Core</span>}</Link>
          {!collapsed && <button aria-label="ย่อแถบเมนู" onClick={toggle} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><PanelLeftClose size={16}/></button>}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {!collapsed && <p className="mb-3 px-3 pt-3 text-[10px] font-semibold uppercase tracking-[.15em] text-zinc-500">Workspace</p>}
          {visibleLinks.map(({href,label,icon: Icon}) => <Link key={href} href={href} title={collapsed ? label : undefined} aria-current={pathname === href ? "page" : undefined} className={`console-nav flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${pathname === href ? "console-active" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"} ${collapsed ? "justify-center" : ""}`}><Icon size={17} className="shrink-0"/>{!collapsed && <span className="truncate">{label}</span>}</Link>)}
          <div className="!mt-7 border-t border-zinc-800/70 pt-4">{!collapsed && <p className="mb-2 px-3 text-[10px] uppercase tracking-[.15em] text-zinc-600">Developer resources</p>}{[["คู่มือและ API Docs","/docs"],["OIDC Configuration","/.well-known/openid-configuration"],["JWKS Public Keys","/.well-known/jwks.json"]].map(([label,href]) => <Link key={href} href={href} target="_blank" rel="noopener noreferrer" title={label} className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-200"><ArrowUpRight size={16}/>{!collapsed && label}</Link>)}</div>
        </nav>
        <div className="border-t border-zinc-800/70 p-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium">{(user?.fullName || "U")[0]}</span>{!collapsed && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user?.fullName}</p><p className="mt-1 truncate text-[10px] text-zinc-500">{user?.email}</p></div><button aria-label="ออกจากระบบ" className="text-zinc-500 hover:text-white" onClick={async () => {const response = await fetch("/api/v1/auth/logout",{method:"POST"}); if(response.ok) router.replace("/login");}}><LogOut size={16}/></button></>}</div></div>
      </div>
      {!collapsed && <div role="separator" aria-label="ปรับความกว้างแถบเมนู" aria-orientation="vertical" tabIndex={0} onKeyDown={e => {if(["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();updateSettings({sidebarWidth: settings.sidebarWidth + (e.key === "ArrowRight" ? 10 : -10)});}}} onPointerDown={resize} onDoubleClick={() => updateSettings({sidebarWidth:240})} className="absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize hover:bg-zinc-500/20"/>}
    </aside>
    <div className="min-w-0 flex-1">
      <header className={`${settings.stickyHeader ? "sticky top-0" : "relative"} z-20 flex h-12 items-center justify-between gap-3 border-b border-zinc-800/70 bg-[#09090b]/95 px-5 backdrop-blur-md md:px-8`}>
        <div className="flex items-center gap-3 text-xs"><button aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"} onClick={toggle} className="hidden rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white md:block">{collapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</button><span className="hidden text-zinc-600 sm:inline">Workspace</span><ChevronRight size={13} className="hidden text-zinc-700 sm:block"/><span className="font-medium">{title}</span></div>
        <Link href="/settings/preferences" aria-label="ตั้งค่าพื้นที่ทำงาน" className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white"><Sliders size={16}/></Link>
      </header>
      <nav aria-label="เมนูมือถือ" className="flex gap-1 overflow-x-auto border-b border-zinc-800 p-2 md:hidden">{visibleLinks.map(link => <Link key={link.href} href={link.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${pathname === link.href ? "console-active" : "text-zinc-500"}`}>{link.label}</Link>)}</nav>
      <main ref={main} className={`mx-auto w-full ${settings.density === "compact" ? "p-4 md:p-5" : "p-5 md:p-6"}`} style={{maxWidth: settings.contentWidth === "focused" ? 1120 : 1760}}>{children}</main>
    </div>
  </div>;
}



