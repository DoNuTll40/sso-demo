"use client";
import { useRouter } from "nextjs-toploader/app";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { HeroUIProvider } from "@heroui/react";
import { usePathname } from "next/navigation";
import { DEFAULT_SETTINGS, normalizeSettings } from "@/lib/console-settings";
const Context = createContext(null);
export function useConsoleSettings() { return useContext(Context); }
export function Providers({children}) {
  const router = useRouter();
  const navigation = useRef(router);
  navigation.current = router;
  const pathname = usePathname();
  const dashboard = pathname.startsWith("/admin") || pathname.startsWith("/settings");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [retry, setRetry] = useState(0);
  const saved = useRef("");
  const saveQueue = useRef(Promise.resolve());
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!dashboard) { setHydrated(false); setUser(null); return; }
    let active = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    setHydrated(false); setLoadError("");
    (async () => {
      try {
        const auth = await fetch("/api/v1/auth/me", {cache: "no-store", signal: abort.signal});
        if (auth.status === 401) { if (active) navigation.current.replace("/login"); return; }
        if (!auth.ok) throw new Error("โหลดบัญชีไม่สำเร็จ");
        const {user: account} = await auth.json();
        const response = await fetch("/api/v1/settings/preferences", {cache: "no-store", signal: abort.signal});
        if (!response.ok) throw new Error("โหลดการตั้งค่าไม่สำเร็จ");
        const data = await response.json();
        let initial = data.settings;
        // Migrate old browser preferences only once, into the currently authenticated account.
        if (!initial) {
          try {
            if (!localStorage.getItem("sso_console_settings_migrated")) {
              initial = JSON.parse(localStorage.getItem("sso_console_settings") || "null");
            }
          } catch { /* Invalid local data falls back to validated defaults. */ }
        }
        initial = normalizeSettings(initial || {});
        if (active) {
          saved.current = data.settings ? JSON.stringify(initial) : "";
          setSettings(initial); setUser(account); setHydrated(true);
          try { localStorage.setItem("sso_console_settings_migrated", account.id); } catch { /* Server storage remains available. */ }
        }
      } catch { if (active) setLoadError("โหลดการตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง"); }
      finally { clearTimeout(timeout); }
    })();
    return () => {active = false; clearTimeout(timeout); abort.abort();};
  }, [dashboard, retry]);
  useEffect(() => {
    if (!hydrated || !user || !dashboard) return;
    const serialized = JSON.stringify(settings);
    if (saved.current === serialized) return;
    setSaveStatus("saving");
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await (saveQueue.current = saveQueue.current.catch(() => {}).then(() => active ? fetch("/api/v1/settings/preferences", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({settings}), signal: AbortSignal.timeout(10000)}) : {ok: true}));
        if (!response.ok) throw new Error("Save failed");
        if (active) {saved.current = serialized; setSaveStatus("saved");}
      } catch { if (active) setSaveStatus("error"); }
    }, 350);
    return () => {active = false; clearTimeout(timer);};
  }, [settings, hydrated, user, dashboard]);
  const updateSettings = useCallback(partial => { saved.current = ""; setSettings(previous => normalizeSettings(typeof partial === "function" ? partial(previous) : {...previous, ...partial})); }, []);
  const resetSettings = useCallback(() => { saved.current = ""; setSettings({...DEFAULT_SETTINGS}); }, []);
  const motionEnabled = settings.animationsEnabled && !(settings.respectReducedMotion && reducedMotion);
  return <HeroUIProvider navigate={router.push}><Context.Provider value={{settings, updateSettings, resetSettings, hydrated, user, saveStatus, motionEnabled, retrySave: () => setSettings(s => ({...s}))}}>
    {dashboard && !hydrated ? <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-6"><div role="status" className="text-center text-sm text-zinc-400">{loadError || "กำลังโหลดพื้นที่ทำงานของคุณ…"}{loadError && <button className="mx-auto mt-4 block rounded-lg border border-zinc-700 px-4 py-2 text-white" onClick={() => setRetry(x => x + 1)}>ลองอีกครั้ง</button>}</div></div> : children}
  </Context.Provider></HeroUIProvider>;
}


