import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLink, keys, listTokens, revokeLink } from "../../lib/api";
import { deliverySiteUrl, friendlyError } from "../../lib/supabase";
import { deliveryLink } from "../../lib/security";
import { canShare, copyText, shareLink } from "../../lib/platform";
import type { Delivery, DeliveryToken } from "../../lib/types";
import { Badge, Button, Confirm, Field, Loading, Panel, fmtDate, relTime, useToast } from "../../components/ui";

const EXPIRY = [
  { value: "none", label: "Never (revoke when needed)" },
  { value: "7", label: "In 7 days" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
];

function tokenState(t: DeliveryToken): { label: string; tone: "good" | "bad" | "neutral" | "warn" } {
  if (t.revoked_at) return { label: "Revoked", tone: "bad" };
  if (t.expires_at && new Date(t.expires_at) <= new Date()) return { label: "Expired", tone: "neutral" };
  return { label: "Active", tone: "good" };
}

export function LinksPanel({ delivery }: { delivery: Delivery }) {
  const q = useQuery({ queryKey: keys.tokens(delivery.id), queryFn: () => listTokens(delivery.id) });
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("none");
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<DeliveryToken | null>(null);
  const [showOld, setShowOld] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.tokens(delivery.id) });

  const create = useMutation({
    mutationFn: () => {
      const expiresAt = expiry === "none" ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
      return createLink(delivery.id, "client", label.trim() || null, expiresAt);
    },
    onSuccess: (token) => { setFresh(deliveryLink(deliverySiteUrl, token)); setLabel(""); refresh(); },
    onError: (e) => toast(friendlyError(e), "bad"),
  });
  const revoke = useMutation({
    mutationFn: () => revokeLink(revoking!.id),
    onSuccess: () => { setRevoking(null); toast("Link revoked"); refresh(); },
    onError: (e) => { setRevoking(null); toast(friendlyError(e), "bad"); },
  });

  const clientLinks = (q.data ?? []).filter((t) => t.kind === "client");
  const visible = showOld ? clientLinks : clientLinks.filter((t) => tokenState(t).label === "Active");
  const hiddenCount = clientLinks.length - clientLinks.filter((t) => tokenState(t).label === "Active").length;

  return (
    <Panel title="Client links" id="links"
      description="Each link is a private key to this page. It's shown once when created; STB Core keeps only a fingerprint of it, so it can't be shown again.">
      {delivery.status === "archived" ? (
        <p className="muted">This delivery is archived. Links are kept but do not open until you restore it to draft and publish it.</p>
      ) : (
        <form className="link-create" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Label (only you see it)">
            {(p) => <input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="For example: Sent on WhatsApp" />}
          </Field>
          <Field label="Expires">
            {(p) => <select {...p} value={expiry} onChange={(e) => setExpiry(e.target.value)}>{EXPIRY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>}
          </Field>
          <Button type="submit" variant="primary" busy={create.isPending} disabled={!deliverySiteUrl}>Create client link</Button>
          {!deliverySiteUrl && <p className="field__error">Set VITE_DELIVERY_SITE_URL in this app's environment first.</p>}
          {delivery.status === "draft" && <p className="field__hint span-all">This delivery is a draft: links will work once you publish.</p>}
        </form>
      )}

      {fresh && <NewLink url={fresh} onDone={() => setFresh(null)} />}

      {q.isLoading && <Loading />}
      {visible.length > 0 && (
        <table className="table">
          <thead><tr><th>Link</th><th>Status</th><th>Created</th><th>Expires</th><th>Last used</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {visible.map((t) => {
              const s = tokenState(t);
              return (
                <tr key={t.id}>
                  <td data-label="Link"><span className="mono">…{t.token_hint}</span> {t.label && <span className="muted">{t.label}</span>}</td>
                  <td data-label="Status"><Badge tone={s.tone}>{s.label}</Badge></td>
                  <td data-label="Created">{fmtDate(t.created_at)}</td>
                  <td data-label="Expires">{t.expires_at ? fmtDate(t.expires_at) : "Never"}</td>
                  <td data-label="Last used">{t.use_count ? `${relTime(t.last_used_at)} (${t.use_count}×)` : "Not used"}</td>
                  <td>{s.label === "Active" && <Button size="sm" variant="ghost" onClick={() => setRevoking(t)}>Revoke</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!q.isLoading && clientLinks.length === 0 && !fresh && <p className="muted">No client links yet.</p>}
      {hiddenCount > 0 && (
        <button type="button" className="link-btn" onClick={() => setShowOld(!showOld)}>
          {showOld ? "Hide revoked and expired links" : `Show ${hiddenCount} revoked or expired`}
        </button>
      )}

      <Confirm open={!!revoking} title="Revoke this link?" tone="danger" confirmLabel="Revoke link" busy={revoke.isPending}
        body={<p>Anyone using the link ending …{revoking?.token_hint} will see "This link isn't active". Other links keep working.</p>}
        onConfirm={() => revoke.mutate()} onCancel={() => setRevoking(null)} />
    </Panel>
  );
}

function NewLink({ url, onDone }: { url: string; onDone: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQr).catch(() => setQr(null));
  }, [url]);
  const copy = async () => setCopied(await copyText(url));
  const share = () => shareLink({ title: "Your project delivery", text: "Here's your project, ready for you:", url });
  return (
    <div className="new-link" role="region" aria-label="New client link">
      <div>
        <p className="new-link__title">Copy this link now</p>
        <p className="muted">It won't be shown again. Send it privately, for example on WhatsApp or email. If it's lost, revoke it and create another.</p>
        <input className="new-link__url mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Client link" />
        <div className="row-actions">
          <Button variant="primary" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
          {canShare() && <Button onClick={share}>Share</Button>}
          <Button variant="ghost" onClick={onDone}>Done</Button>
        </div>
      </div>
      {qr && <img className="new-link__qr" src={qr} alt="QR code of the client link" width={140} height={140} />}
    </div>
  );
}
