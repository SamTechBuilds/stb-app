import { useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLink, deleteDelivery, getDelivery, keys, listSupport, setDeliveryStatus, updateDelivery } from "../../lib/api";
import { deliverySiteUrl, friendlyError } from "../../lib/supabase";
import { deliveryLink } from "../../lib/security";
import { isHttps, joinList, nullify, splitList } from "../../lib/forms";
import type { ChecklistItem, Delivery, DeliveryContent, DeliveryStatus, Theme } from "../../lib/types";
import { Badge, Button, Confirm, ErrorNote, Field, Loading, PageHeader, Panel, fmtDate, fmtDateTime, relTime, useToast } from "../../components/ui";
import { STATUS } from "./DeliveriesList";
import { AssetsPanel } from "./Assets";
import { LinksPanel } from "./Links";
import { ActivityPanel } from "./Activity";

type Form = Omit<DeliveryContent, "tech_list"> & { tech: string };

function toForm(d: Delivery): Form {
  const { tech_list, ...rest } = pickContent(d);
  return { ...rest, tech: joinList(tech_list) };
}
function pickContent(d: Delivery): DeliveryContent {
  return {
    theme: d.theme, client_display_name: d.client_display_name, business_display_name: d.business_display_name ?? "",
    welcome_title: d.welcome_title ?? "", welcome_message: d.welcome_message ?? "", project_title: d.project_title,
    project_summary: d.project_summary ?? "", live_url: d.live_url ?? "", tech_list: d.tech_list, completed_on: d.completed_on ?? "",
    video_url: d.video_url ?? "", support_period_id: d.support_period_id, support_contact_note: d.support_contact_note ?? "",
    handover_checklist: d.handover_checklist ?? [], closing_message: d.closing_message ?? "",
  };
}

export function DeliveryEditor() {
  const { id } = useParams() as { id: string };
  const q = useQuery({ queryKey: keys.delivery(id), queryFn: () => getDelivery(id) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />;
  return <Editor key={q.data.id} delivery={q.data} />;
}

const THEMES: { value: Theme; label: string; wrap: string; ribbon: string }[] = [
  { value: "midnight", label: "Midnight", wrap: "#1E2A5A", ribbon: "#F2B33D" },
  { value: "aurora", label: "Aurora", wrap: "#0F4C4A", ribbon: "#F28C8C" },
  { value: "ivory", label: "Ivory", wrap: "#ECEEF3", ribbon: "#1E2A5A" },
];

function Editor({ delivery: d }: { delivery: Delivery }) {
  const initial = useMemo(() => toForm(d), [d]);
  const [f, setF] = useState<Form>(initial);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "revoke" | "reinstate" | "delete">(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const support = useQuery({ queryKey: keys.support(d.project_id), queryFn: () => listSupport(d.project_id) });
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("You have unsaved changes on this delivery. Leave without saving?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.delivery(d.id) });
    qc.invalidateQueries({ queryKey: keys.deliveries });
  };

  const save = useMutation({
    mutationFn: () => {
      const { tech, ...rest } = f;
      const clean = nullify(rest);
      return updateDelivery(d.id, {
        ...clean,
        client_display_name: f.client_display_name.trim(), project_title: f.project_title.trim(), theme: f.theme,
        tech_list: splitList(tech), support_period_id: f.support_period_id || null,
        handover_checklist: f.handover_checklist.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim(), done: i.done })),
      });
    },
    onSuccess: () => { toast("Changes saved"); refresh(); },
    onError: (e) => toast(friendlyError(e), "bad"),
  });

  const status = useMutation({
    mutationFn: (s: DeliveryStatus) => setDeliveryStatus(d.id, s),
    onSuccess: (s) => {
      setConfirm(null);
      toast({ published: "Published", draft: "Moved to draft", revoked: "Revoked: all links stopped working" }[s]);
      refresh();
      qc.invalidateQueries({ queryKey: keys.tokens(d.id) });
    },
    onError: (e) => { setConfirm(null); toast(friendlyError(e), "bad"); },
  });

  const del = useMutation({
    mutationFn: () => deleteDelivery(d.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.deliveries }); toast("Delivery deleted"); nav("/deliveries"); },
    onError: (e) => { setConfirm(null); toast(friendlyError(e), "bad"); },
  });

  const preview = async () => {
    if (!deliverySiteUrl) { toast("Set VITE_DELIVERY_SITE_URL to preview.", "bad"); return; }
    const win = window.open("about:blank", "_blank"); // open now, so the popup isn't blocked
    try {
      const token = await createLink(d.id, "preview", "Preview", null);
      qc.invalidateQueries({ queryKey: keys.tokens(d.id) });
      if (win) { win.opener = null; win.location.href = deliveryLink(deliverySiteUrl, token); }
    } catch (e) {
      win?.close();
      toast(friendlyError(e), "bad");
    }
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const liveErr = isHttps(f.live_url) ? null : "Use a full https:// link.";
  const videoErr = isHttps(f.video_url) ? null : "Use a full https:// link (YouTube or Vimeo play inline).";
  const canSave = dirty && f.client_display_name.trim() !== "" && f.project_title.trim() !== "" && !liveErr && !videoErr;

  const setItem = (i: number, patch: Partial<ChecklistItem>) =>
    setF({ ...f, handover_checklist: f.handover_checklist.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  const isRevoked = d.status === "revoked";
  const st = STATUS[d.status];

  return (
    <>
      <PageHeader
        back={<Link to="/deliveries" className="back">Deliveries</Link>}
        title={d.project_title}
        subtitle={<>For {d.projects?.clients?.business_name || d.projects?.clients?.name || d.client_display_name}. <Link to={`/projects/${d.project_id}`}>Open project</Link></>}
        actions={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {!isRevoked && <Button onClick={preview}>Preview</Button>}
            {d.status === "draft" && <Button variant="primary" onClick={() => setConfirm("publish")} disabled={dirty} title={dirty ? "Save your changes first" : undefined}>Publish</Button>}
            {d.status === "published" && <Button onClick={() => setConfirm("unpublish")}>Unpublish</Button>}
            {isRevoked && <Button onClick={() => setConfirm("reinstate")}>Move back to draft</Button>}
          </>
        }
      />

      <dl className="stats">
        <div><dt>Opens</dt><dd>{d.open_count}</dd></div>
        <div><dt>First opened</dt><dd>{d.first_opened_at ? fmtDateTime(d.first_opened_at) : "Not yet"}</dd></div>
        <div><dt>Last opened</dt><dd>{d.last_opened_at ? relTime(d.last_opened_at) : "Not yet"}</dd></div>
        <div><dt>Published</dt><dd>{d.published_at ? fmtDate(d.published_at) : "No"}</dd></div>
      </dl>

      {isRevoked && <p className="banner banner--bad">Revoked on {fmtDate(d.revoked_at)}. Every link to this delivery has stopped working. Move it back to draft to edit it and create new links.</p>}
      {d.status === "published" && <p className="banner banner--good">Live. Anyone holding a client link can open it. Edits you save appear immediately.</p>}

      <form id="delivery-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}>
        <fieldset disabled={isRevoked} className="fieldset-reset">
          <Panel title="Welcome" description="The first screen: a gift tag with the client's name over a wrapped box.">
            <div className="fields">
              <Field label="Name on the gift tag" hint="Usually the client's first name.">
                {(p) => <input {...p} value={f.client_display_name} onChange={set("client_display_name")} required maxLength={120} />}
              </Field>
              <Field label="Business name">{(p) => <input {...p} value={f.business_display_name ?? ""} onChange={set("business_display_name")} maxLength={160} />}</Field>
              <Field label="Headline" className="span-2">{(p) => <input {...p} value={f.welcome_title ?? ""} onChange={set("welcome_title")} maxLength={160} placeholder="Your new website is ready" />}</Field>
              <Field label="Welcome message" className="span-2">{(p) => <textarea {...p} rows={3} value={f.welcome_message ?? ""} onChange={set("welcome_message")} maxLength={2000} />}</Field>
              <fieldset className="span-2 themes">
                <legend>Wrapping</legend>
                {THEMES.map((t) => (
                  <label key={t.value} className={`theme-choice${f.theme === t.value ? " is-on" : ""}`}>
                    <input type="radio" name="theme" value={t.value} checked={f.theme === t.value} onChange={() => setF({ ...f, theme: t.value })} />
                    <span className="theme-swatch" style={{ background: t.wrap }} aria-hidden="true"><span style={{ background: t.ribbon }} /></span>
                    {t.label}
                  </label>
                ))}
              </fieldset>
            </div>
          </Panel>

          <Panel title="Project reveal" description="Everything here is visible to your client.">
            <div className="fields">
              <Field label="Project title">{(p) => <input {...p} value={f.project_title} onChange={set("project_title")} required maxLength={160} />}</Field>
              <Field label="Completed on">{(p) => <input {...p} type="date" value={f.completed_on ?? ""} onChange={set("completed_on")} />}</Field>
              <Field label="Summary" className="span-2" hint="Two or three sentences about what you built for them.">
                {(p) => <textarea {...p} rows={3} value={f.project_summary ?? ""} onChange={set("project_summary")} maxLength={4000} />}
              </Field>
              <Field label="Live website" error={liveErr}>{(p) => <input {...p} type="url" value={f.live_url ?? ""} onChange={set("live_url")} placeholder="https://" />}</Field>
              <Field label="Walkthrough video" error={videoErr} hint="YouTube or Vimeo link (unlisted is fine).">
                {(p) => <input {...p} type="url" value={f.video_url ?? ""} onChange={set("video_url")} placeholder="https://" />}
              </Field>
              <Field label="Built with" hint="Separate with commas" className="span-2">{(p) => <input {...p} value={f.tech} onChange={set("tech")} />}</Field>
              <Field label="Closing message" className="span-2">{(p) => <textarea {...p} rows={2} value={f.closing_message ?? ""} onChange={set("closing_message")} maxLength={1000} />}</Field>
            </div>
          </Panel>

          <Panel title="Handover checklist" description="Shown as ticks next to the files. Never put passwords here; send credentials through a one-time secret link instead.">
            <ul className="checklist-edit">
              {f.handover_checklist.map((it, i) => (
                <li key={i}>
                  <input type="checkbox" checked={it.done} onChange={(e) => setItem(i, { done: e.target.checked })} aria-label={`Mark item ${i + 1} as done`} />
                  <input value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} maxLength={200} aria-label={`Checklist item ${i + 1}`} placeholder="For example: Domain connected" />
                  <Button size="sm" variant="ghost" onClick={() => setF({ ...f, handover_checklist: f.handover_checklist.filter((_, j) => j !== i) })} aria-label={`Remove item ${i + 1}`}>Remove</Button>
                </li>
              ))}
            </ul>
            <Button size="sm" onClick={() => setF({ ...f, handover_checklist: [...f.handover_checklist, { label: "", done: true }] })}
              disabled={f.handover_checklist.length >= 40}>Add item</Button>
          </Panel>

          <Panel title="Support" description={<>Choose a support period from the project. <Link to={`/projects/${d.project_id}`}>Manage support periods</Link></>}>
            <div className="fields">
              <Field label="Support period">
                {(p) => (
                  <select {...p} value={f.support_period_id ?? ""} onChange={(e) => setF({ ...f, support_period_id: e.target.value || null })}>
                    <option value="">Don't show support</option>
                    {support.data?.map((s) => <option key={s.id} value={s.id}>{s.plan_name}: {fmtDate(s.starts_on)} to {fmtDate(s.ends_on)}</option>)}
                  </select>
                )}
              </Field>
              <Field label="How to reach you" className="span-2" hint="Shown under the terms, for example your reply time.">
                {(p) => <textarea {...p} rows={2} value={f.support_contact_note ?? ""} onChange={set("support_contact_note")} maxLength={1000} />}
              </Field>
            </div>
          </Panel>
        </fieldset>
      </form>

      <div className={`savebar${dirty ? " is-dirty" : ""}`} role="region" aria-label="Save changes">
        <p>{dirty ? "You have unsaved changes." : "All changes saved."}</p>
        <div>
          {dirty && <Button variant="ghost" onClick={() => setF(initial)}>Discard</Button>}
          <Button type="submit" form="delivery-form" variant="primary" busy={save.isPending} disabled={!canSave}>Save changes</Button>
        </div>
      </div>

      <AssetsPanel delivery={d} kind="screenshot" />
      <AssetsPanel delivery={d} kind="document" />
      <LinksPanel delivery={d} />
      <ActivityPanel deliveryId={d.id} />

      <Panel title="Danger zone">
        <div className="danger-row">
          {!isRevoked && (
            <div>
              <p><strong>Revoke delivery.</strong> Every link stops working at once. Use this if a link was shared by mistake.</p>
              <Button variant="danger" onClick={() => setConfirm("revoke")}>Revoke delivery</Button>
            </div>
          )}
          {d.status !== "published" && d.open_count === 0 && (
            <div>
              <p><strong>Delete delivery.</strong> Removes the page and its uploaded files.</p>
              <Button variant="ghost" onClick={() => setConfirm("delete")}>Delete delivery</Button>
            </div>
          )}
        </div>
      </Panel>

      <Confirm open={confirm === "publish"} title="Publish this delivery?" confirmLabel="Publish" busy={status.isPending}
        body={<p>Client links will open the page straight away. Check it with Preview first. Then create a client link below.</p>}
        onConfirm={() => status.mutate("published")} onCancel={() => setConfirm(null)} />
      <Confirm open={confirm === "unpublish"} title="Unpublish?" confirmLabel="Unpublish" busy={status.isPending}
        body={<p>Client links will show "This link isn't active" until you publish again. Links themselves keep working after republishing.</p>}
        onConfirm={() => status.mutate("draft")} onCancel={() => setConfirm(null)} />
      <Confirm open={confirm === "revoke"} title="Revoke this delivery?" tone="danger" confirmLabel="Revoke delivery" busy={status.isPending}
        body={<p>All links stop working permanently. To share it again you'll need to move it back to draft, publish, and send new links.</p>}
        onConfirm={() => status.mutate("revoked")} onCancel={() => setConfirm(null)} />
      <Confirm open={confirm === "reinstate"} title="Move back to draft?" confirmLabel="Move to draft" busy={status.isPending}
        body={<p>You can edit and publish it again. Old links stay dead; create new ones after publishing.</p>}
        onConfirm={() => status.mutate("draft")} onCancel={() => setConfirm(null)} />
      <Confirm open={confirm === "delete"} title="Delete this delivery?" tone="danger" confirmLabel="Delete" busy={del.isPending}
        body={<p>The page, its links and its uploaded files are removed. This can't be undone.</p>}
        onConfirm={() => del.mutate()} onCancel={() => setConfirm(null)} />
    </>
  );
}
