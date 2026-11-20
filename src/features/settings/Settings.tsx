import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, keys, saveProfile } from "../../lib/api";
import { friendlyError, supabase } from "../../lib/supabase";
import { isEmail, isHttps, joinList, nullify, splitList } from "../../lib/forms";
import type { BusinessProfile } from "../../lib/types";
import { Button, ErrorNote, Field, Loading, PageHeader, Panel, useToast } from "../../components/ui";
import { ThemeToggle } from "../../components/theme";

export function Settings() {
  const q = useQuery({ queryKey: keys.profile, queryFn: getProfile });
  return (
    <>
      <PageHeader title="Settings" />
      {q.isLoading && <Loading />}
      {q.error && <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />}
      {q.data && <ProfileForm profile={q.data} />}
      <Security />
      <Panel title="Appearance"><ThemeToggle /></Panel>
    </>
  );
}

type Form = Omit<BusinessProfile, "id" | "services" | "socials"> & { services: string; socials: string };

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const init: Form = {
    brand_name: profile.brand_name, tagline: profile.tagline ?? "", person_name: profile.person_name ?? "",
    role_title: profile.role_title ?? "", phone: profile.phone ?? "", whatsapp: profile.whatsapp ?? "",
    email: profile.email ?? "", website: profile.website ?? "", location: profile.location ?? "",
    support_hours: profile.support_hours ?? "", services: joinList(profile.services),
    socials: profile.socials.map((s) => `${s.label} ${s.url}`).join("\n"),
  };
  const [f, setF] = useState(init);
  const qc = useQueryClient();
  const toast = useToast();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const socials = f.socials.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)\s+(https:\/\/\S+)$/);
    return m ? { label: m[1].trim().slice(0, 40), url: m[2] } : null;
  });
  const socialsError = socials.some((s) => !s) ? "Write one per line as: Name https://link" : null;
  const errors = { email: isEmail(f.email) ? null : "Enter a valid email.", website: isHttps(f.website) ? null : "Use a full https:// link." };
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const canSave = dirty && f.brand_name.trim() && !errors.email && !errors.website && !socialsError;

  const save = useMutation({
    mutationFn: () => {
      const { services, socials: _s, ...rest } = f;
      void _s;
      return saveProfile({ ...nullify(rest), brand_name: f.brand_name.trim(), services: splitList(services), socials: socials as { label: string; url: string }[] });
    },
    onSuccess: () => { toast("Visiting card saved"); qc.invalidateQueries({ queryKey: keys.profile }); },
    onError: (e) => toast(friendlyError(e), "bad"),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}>
      <Panel title="Your visiting card" description="Shown on every delivery page and saved to your clients' phones with Save contact.">
        <div className="fields">
          <Field label="Brand name">{(p) => <input {...p} value={f.brand_name} onChange={set("brand_name")} required maxLength={80} />}</Field>
          <Field label="Tagline">{(p) => <input {...p} value={f.tagline ?? ""} onChange={set("tagline")} maxLength={160} />}</Field>
          <Field label="Your name">{(p) => <input {...p} value={f.person_name ?? ""} onChange={set("person_name")} maxLength={120} />}</Field>
          <Field label="Role">{(p) => <input {...p} value={f.role_title ?? ""} onChange={set("role_title")} maxLength={120} placeholder="Founder" />}</Field>
          <Field label="Phone">{(p) => <input {...p} type="tel" value={f.phone ?? ""} onChange={set("phone")} maxLength={40} />}</Field>
          <Field label="WhatsApp number" hint="With country code, for example +91 98765 43210">{(p) => <input {...p} type="tel" value={f.whatsapp ?? ""} onChange={set("whatsapp")} maxLength={40} />}</Field>
          <Field label="Email" error={errors.email}>{(p) => <input {...p} type="email" value={f.email ?? ""} onChange={set("email")} />}</Field>
          <Field label="Website" error={errors.website}>{(p) => <input {...p} type="url" value={f.website ?? ""} onChange={set("website")} />}</Field>
          <Field label="Location">{(p) => <input {...p} value={f.location ?? ""} onChange={set("location")} maxLength={160} />}</Field>
          <Field label="Support hours">{(p) => <input {...p} value={f.support_hours ?? ""} onChange={set("support_hours")} maxLength={160} placeholder="Monday to Saturday, 10 am to 7 pm IST" />}</Field>
          <Field label="Services" hint="Separate with commas" className="span-2">{(p) => <input {...p} value={f.services} onChange={set("services")} />}</Field>
          <Field label="Social links" hint="One per line: Name https://link" error={socialsError} className="span-2">
            {(p) => <textarea {...p} rows={3} value={f.socials} onChange={set("socials")} placeholder="LinkedIn https://www.linkedin.com/in/…" />}
          </Field>
        </div>
        <div className="form-actions"><Button type="submit" variant="primary" busy={save.isPending} disabled={!canSave}>Save visiting card</Button></div>
      </Panel>
    </form>
  );
}

function Security() {
  const toast = useToast();
  const factors = useQuery({ queryKey: ["mfa"], queryFn: async () => (await supabase.auth.mfa.listFactors()).data });
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const verified = factors.data?.totp.filter((f) => f.status === "verified") ?? [];

  const start = async () => {
    setBusy(true);
    // clear abandoned, unverified enrolments first
    for (const f of factors.data?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `STB App ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) return toast(friendlyError(error), "bad");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const verify = async () => {
    if (!enroll) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return toast("That code didn't work. Enter the current 6-digit code from your app.", "bad");
    setEnroll(null); setCode(""); toast("Two-factor sign-in is on"); factors.refetch();
  };

  return (
    <Panel title="Sign-in security" description="Turn on two-factor sign-in before storing real client data. You'll enter a code from an authenticator app after your password.">
      {verified.length > 0 ? (
        <p><strong>Two-factor sign-in is on.</strong> <span className="muted">You'll be asked for a code each time you sign in.</span></p>
      ) : enroll ? (
        <div className="mfa">
          <img src={enroll.qr} alt="QR code to add STB App to your authenticator app" width={180} height={180} />
          <div className="stack">
            <p>Scan this with Google Authenticator, 1Password or a similar app. Or enter this key: <code className="mono">{enroll.secret}</code></p>
            <Field label="6-digit code">{(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} />}</Field>
            <div className="row-actions">
              <Button variant="primary" onClick={verify} busy={busy} disabled={code.replace(/\s/g, "").length !== 6}>Turn on</Button>
              <Button variant="ghost" onClick={() => setEnroll(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={start} busy={busy}>Set up two-factor sign-in</Button>
      )}
    </Panel>
  );
}
