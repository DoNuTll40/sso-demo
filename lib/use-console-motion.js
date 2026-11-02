"use client";
import { useLayoutEffect } from "react";
import gsap from "gsap";
import { useConsoleSettings } from "@/app/providers";
export function useConsoleMotion(ref, key, {selector, ready = true, modal = false} = {}) {
  const {motionEnabled, settings} = useConsoleSettings();
  useLayoutEffect(() => {
    if (!ready || !ref.current || !motionEnabled) return;
    const context = gsap.context(() => {
      const targets = selector ? ref.current.querySelectorAll(selector) : ref.current;
      gsap.fromTo(targets, {opacity: 0.65, y: modal ? 6 : 0}, {opacity: 1, y: 0, duration: settings.motionDuration / 1000, stagger: selector ? 0.025 : 0, ease: "power2.out", clearProps: "opacity,transform"});
    }, ref.current);
    return () => context.revert();
  }, [ref, key, selector, ready, modal, motionEnabled, settings.motionDuration]);
}
