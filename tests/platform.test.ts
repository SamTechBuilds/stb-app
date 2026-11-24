import { describe, it, expect, vi, beforeEach } from "vitest";

const native = vi.hoisted(() => ({
  on: false,
  clipboard: vi.fn(async () => {}),
  share: vi.fn(async () => ({})),
  browser: vi.fn(async () => {}),
  exitApp: vi.fn(),
  backHandler: null as null | ((e: { canGoBack: boolean }) => void),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.on, getPlatform: () => (native.on ? "android" : "web") },
}));
vi.mock("@capacitor/clipboard", () => ({ Clipboard: { write: native.clipboard } }));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: native.browser } }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (_: string, cb: (e: { canGoBack: boolean }) => void) => { native.backHandler = cb; return { remove: () => {} }; },
    exitApp: native.exitApp,
    getInfo: async () => ({ version: "0.2.0", build: "7" }),
  },
}));

async function load(isNative: boolean) {
  native.on = isNative;
  vi.resetModules();
  return import("../src/lib/platform");
}

beforeEach(() => vi.clearAllMocks());

describe("platform layer on the web", () => {
  it("uses browser APIs and the site's own origin", async () => {
    const p = await load(false);
    expect(p.isNative).toBe(false);
    const write = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: write } });
    expect(await p.copyText("x")).toBe(true);
    expect(write).toHaveBeenCalledWith("x");
    expect(native.clipboard).not.toHaveBeenCalled();
    expect(p.authRedirectUrl("/settings")).toBe(window.location.origin + "/settings");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await p.openExternal("https://delivery.example/#t");
    expect(open).toHaveBeenCalledWith("https://delivery.example/#t", "_blank", "noopener,noreferrer");
    expect((await p.appInfo()).label).toBe("STB Website");
  });
});

describe("platform layer in the Android app", () => {
  it("uses native clipboard, share sheet and Custom Tabs", async () => {
    const p = await load(true);
    expect(p.isNative).toBe(true);
    expect(await p.copyText("link")).toBe(true);
    expect(native.clipboard).toHaveBeenCalledWith({ string: "link" });
    expect(p.canShare()).toBe(true);
    expect(await p.shareLink({ title: "T", url: "https://d/#x" })).toBe(true);
    expect(native.share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://d/#x" }));
    await p.openExternal("https://d/#x");
    expect(native.browser).toHaveBeenCalledWith(expect.objectContaining({ url: "https://d/#x" }));
    expect(await p.appInfo()).toEqual({ label: "STB App for Android", version: "0.2.0 (7)" });
  });

  it("never sends password resets to https://localhost", async () => {
    const p = await load(true);
    expect(p.authRedirectUrl()).toBeNull(); // VITE_APP_WEB_URL not set in tests
  });

  it("back button closes dialogs first, then goes back, then exits", async () => {
    const p = await load(true);
    await p.registerBackButton();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    dialog.close = vi.fn(() => dialog.removeAttribute("open"));
    document.body.appendChild(dialog);
    native.backHandler!({ canGoBack: true });
    expect(dialog.close).toHaveBeenCalled();
    dialog.remove();
    native.backHandler!({ canGoBack: false });
    expect(native.exitApp).toHaveBeenCalled();
  });
});
