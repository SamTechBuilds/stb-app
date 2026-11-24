import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/young-serif/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import { applyMode, readMode } from "./components/theme";
import { App } from "./App";
import { isNative } from "./lib/platform";

applyMode(readMode());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: offline app shell only. It never caches Supabase responses.
// The Android app ships its files inside the APK, so it needs no service worker.
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
