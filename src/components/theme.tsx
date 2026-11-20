import { useEffect, useState } from "react";

export type ColorMode = "light" | "dark" | "system";
const KEY = "stb-app-color-mode";

export function readMode(): ColorMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyMode(mode: ColorMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.mode = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#12151C" : "#F6F7F9");
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ColorMode>(readMode);
  useEffect(() => {
    applyMode(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    if (mode !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const on = () => applyMode("system");
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, [mode]);

  return (
    <label className={`mode-toggle${compact ? " mode-toggle--compact" : ""}`}>
      <span className={compact ? "sr-only" : ""}>Appearance</span>
      <select value={mode} onChange={(e) => setMode(e.target.value as ColorMode)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
