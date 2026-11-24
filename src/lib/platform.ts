// One codebase, two distribution formats: the STB Website (browser) and the STB App (Android APK via
// Capacitor). Everything that differs between them goes through this file, so screens never branch
// on platform themselves. Native plugins are imported lazily, keeping them out of the web start-up path.
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as "web" | "android" | "ios";

/** Public address of the hosted STB Website, used for links that must open in a browser (password reset). */
export const webAppUrl = ((import.meta.env.VITE_APP_WEB_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** Where Supabase should send password-reset emails. In the APK the app runs at https://localhost, so use the website. */
export function authRedirectUrl(path = "/settings"): string | null {
  if (isNative) return webAppUrl ? webAppUrl + path : null;
  return window.location.origin + path;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (isNative) {
      const { Clipboard } = await import("@capacitor/clipboard");
      await Clipboard.write({ string: text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    return false;
  }
}

export const canShare = () => isNative || (typeof navigator !== "undefined" && "share" in navigator);

/** Opens the Android share sheet (WhatsApp, Gmail…) or the browser's. Returns false if cancelled or unavailable. */
export async function shareLink(opts: { title: string; text?: string; url: string }): Promise<boolean> {
  try {
    if (isNative) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return true;
    }
    if ("share" in navigator) {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return true;
    }
  } catch { /* cancelled */ }
  return false;
}

/**
 * Open an external page. On Android this uses an in-app Chrome Custom Tab, so the client page is
 * shown exactly as a client sees it, outside the app's WebView.
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "fullscreen", toolbarColor: "#1E2A5A" });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Android hardware/gesture back: go back in the app's history, or leave the app from the first screen. */
export async function registerBackButton(): Promise<() => void> {
  if (!isNative) return () => {};
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("backButton", ({ canGoBack }) => {
    const openDialog = document.querySelector("dialog[open]") as HTMLDialogElement | null;
    if (openDialog) { openDialog.close(); return; }
    if (canGoBack && window.history.length > 1) window.history.back();
    else App.exitApp();
  });
  return () => { handle.remove(); };
}

export async function setNativeStatusBar(dark: boolean): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? "#12151C" : "#F6F7F9" });
  } catch { /* not critical */ }
}

/** Calls back with true/false as connectivity changes. Uses the native network plugin on Android. */
export async function watchConnectivity(cb: (online: boolean) => void): Promise<() => void> {
  if (isNative) {
    const { Network } = await import("@capacitor/network");
    cb((await Network.getStatus()).connected);
    const h = await Network.addListener("networkStatusChange", (s) => cb(s.connected));
    return () => { h.remove(); };
  }
  const on = () => cb(true);
  const off = () => cb(false);
  cb(navigator.onLine);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
}

export async function appInfo(): Promise<{ label: string; version: string }> {
  if (!isNative) return { label: "STB Website", version: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "web" };
  const { App } = await import("@capacitor/app");
  const info = await App.getInfo();
  return { label: "STB App for Android", version: `${info.version} (${info.build})` };
}
