/** Empty strings become null so optional columns stay NULL rather than ''. */
export function nullify<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  return out as T;
}

export const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
export const joinList = (a: string[] | null | undefined) => (a ?? []).join(", ");

export const isHttps = (s: string | null | undefined) => !s || /^https:\/\/\S+$/.test(s);
export const isEmail = (s: string | null | undefined) => !s || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
