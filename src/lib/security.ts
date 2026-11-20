// Delivery link tokens are created here, in the owner's browser, with the platform CSPRNG.
// Only the SHA-256 hex digest is sent to STB Core; the token itself is shown to the owner once.

export type Rng = (a: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
const defaultRng: Rng = (a) => crypto.getRandomValues(a);

export interface GeneratedToken {
  token: string; // 43-char base64url (32 random bytes)
  hash: string;  // 64-char lowercase hex SHA-256 of the token
  hint: string;  // last 4 characters, to recognise a link in lists
}

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateToken(rng: Rng = defaultRng): Promise<GeneratedToken> {
  const token = base64url(rng(new Uint8Array(32)));
  return { token, hash: await sha256Hex(token), hint: token.slice(-4) };
}

/** Links carry the token in the fragment, which is never sent to servers or in Referer headers. */
export function deliveryLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/#${token}`;
}

/** Storage object name: '<deliveryId>/<random>-<safe file name>' (matches the DB check constraint). */
export function storagePath(deliveryId: string, fileName: string, rng: Rng = defaultRng): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").replace(/-+/g, "-").slice(0, 80) || "file";
  const rand = [...rng(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${deliveryId}/${rand}-${base}${ext ? "." + ext : ""}`;
}

export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const DOCUMENT_TYPES = [
  "application/pdf", "text/plain", "text/csv", "application/zip", "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4", ...SCREENSHOT_TYPES,
];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function checkUpload(file: File, kind: "screenshot" | "document"): string | null {
  const allowed = kind === "screenshot" ? SCREENSHOT_TYPES : DOCUMENT_TYPES;
  if (!allowed.includes(file.type)) {
    return kind === "screenshot"
      ? `${file.name}: screenshots must be PNG, JPEG or WebP.`
      : `${file.name}: this file type isn't allowed. Use PDF, Office files, ZIP, text, images or MP4.`;
  }
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 50 MB. Compress it or share it another way.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}
