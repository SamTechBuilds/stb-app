import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteProject, deleteSupport, getProject, keys, listClients, listDeliveries, listProjects, listSupport,
  saveProject, saveSupport, type ProjectInput, type SupportInput,
} from "../../lib/api";
import { friendlyError } from "../../lib/supabase";
import { joinList, nullify, splitList } from "../../lib/forms";
import type { ProjectStatus, SupportPeriod } from "../../lib/types";
import { Badge, Button, Confirm, Empty, ErrorNote, Field, Loading, PageHeader, Panel, fmtDate, useToast } from "../../components/ui";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned", in_progress: "In progress", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_TONE: Record<ProjectStatus, "neutral" | "info" | "warn" | "good" | "bad"> = {
  planned: "neutral", in_progress: "info", on_hold: "warn", completed: "good", cancelled: "bad",
};

export function ProjectsList() {
  const q = useQuery({ queryKey: keys.projects, queryFn: listProjects });
  return (
    <>
      <PageHeader title="Projects" actions={<Link className="btn btn--primary" to="/projects/new">Add project</Link>} />
      {q.isLoading && <Loading />}
      {q.error && <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && (
        <Empty title="No projects yet" action={<Link className="btn btn--primary" to="/projects/new">Add a project</Link>}>
          Projects belong to a client. Each delivery is created from a project.
        </Empty>
      )}
      {!!q.data?.length && (
        <ul className="list">
          {q.data.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="list__row">
                <span className="list__main">
                  <span className="list__title">{p.name}</span>
                  <span className="list__meta">{p.clients?.business_name || p.clients?.name}{p.due_date ? `  ·  due ${fmtDate(p.due_date)}` : ""}</span>
                </span>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type FormState = Omit<ProjectInput, "tech_stack"> & { tech: string };

export function ProjectEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = !id;
  const q = useQuery({ queryKey: keys.project(id ?? "new"), queryFn: () => getProject(id!), enabled: !isNew });
  if (!isNew && q.isLoading) return <Loading />;
  if (!isNew && q.error) return <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />;
  const p = q.data;
  const initial: FormState = {
    client_id: p?.client_id ?? params.get("client") ?? "",
    name: p?.name ?? "", category: p?.category ?? "", description: p?.description ?? "", tech: joinList(p?.tech_stack),
    status: p?.status ?? "in_progress", start_date: p?.start_date ?? "", due_date: p?.due_date ?? "",
    completed_on: p?.completed_on ?? "", live_url: p?.live_url ?? "", internal_notes: p?.internal_notes ?? "",
  };
  return <ProjectForm key={id ?? "new"} id={id ?? null} initial={initial} />;
}

function ProjectForm({ id, initial }: { id: string | null; initial: FormState }) {
  const [f, setF] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clients = useQuery({ queryKey: keys.clients, queryFn: listClients });
  const deliveries = useQuery({ queryKey: keys.deliveries, queryFn: listDeliveries, enabled: !!id });
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();

  const save = useMutation({
    mutationFn: () => {
      const { tech, ...rest } = f;
      return saveProject(id, { ...nullify(rest), client_id: f.client_id, status: f.status, tech_stack: splitList(tech) });
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.project(p.id) });
      toast(id ? "Project saved" : "Project added");
      if (!id) nav(`/projects/${p.id}`, { replace: true });
    },
    onError: (e) => toast(friendlyError(e), "bad"),
  });
  const del = useMutation({
    mutationFn: () => deleteProject(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.projects }); toast("Project deleted"); nav("/projects"); },
    onError: (e) => { setConfirmDelete(false); toast(friendlyError(e), "bad"); },
  });

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const urlError = f.live_url && !/^https?:\/\/\S+$/.test(f.live_url) ? "Start the link with https://" : null;
  const canSave = !!f.client_id && f.name.trim().length > 0 && !urlError;
  const theirDeliveries = (deliveries.data ?? []).filter((d) => d.project_id === id);

  return (
    <>
      <PageHeader title={id ? initial.name : "Add project"} back={<Link to="/projects" className="back">Projects</Link>}
        actions={id && <Link className="btn btn--primary" to={`/deliveries/new?project=${id}`}>Create delivery</Link>} />
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}>
        <Panel title="Project">
          <div className="fields">
            <Field label="Client">
              {(p) => (
                <select {...p} value={f.client_id} onChange={set("client_id")} required>
                  <option value="">Choose a client</option>
                  {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.business_name ? `${c.business_name} (${c.name})` : c.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Project name">{(p) => <input {...p} value={f.name} onChange={set("name")} required maxLength={200} />}</Field>
            <Field label="Category" hint="For example: Website, Web app, Automation">{(p) => <input {...p} value={f.category ?? ""} onChange={set("category")} maxLength={80} />}</Field>
            <Field label="Status">
              {(p) => <select {...p} value={f.status} onChange={set("status")}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
            </Field>
            <Field label="Technologies" hint="Separate with commas" className="span-2">{(p) => <input {...p} value={f.tech} onChange={set("tech")} />}</Field>
            <Field label="Live URL" error={urlError}>{(p) => <input {...p} type="url" inputMode="url" value={f.live_url ?? ""} onChange={set("live_url")} placeholder="https://" />}</Field>
            <Field label="Start date">{(p) => <input {...p} type="date" value={f.start_date ?? ""} onChange={set("start_date")} />}</Field>
            <Field label="Due date">{(p) => <input {...p} type="date" value={f.due_date ?? ""} onChange={set("due_date")} />}</Field>
            <Field label="Completed on">{(p) => <input {...p} type="date" value={f.completed_on ?? ""} onChange={set("completed_on")} />}</Field>
            <Field label="Description" hint="Internal. Write the client-facing summary on the delivery." className="span-2">
              {(p) => <textarea {...p} rows={4} value={f.description ?? ""} onChange={set("description")} maxLength={10000} />}
            </Field>
            <Field label="Internal notes" hint="Never shown to clients." className="span-2">
              {(p) => <textarea {...p} rows={3} value={f.internal_notes ?? ""} onChange={set("internal_notes")} maxLength={20000} />}
            </Field>
          </div>
        </Panel>
        <div className="form-actions">
          <Button type="submit" variant="primary" busy={save.isPending} disabled={!canSave}>{id ? "Save project" : "Add project"}</Button>
          {id && <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete project</Button>}
        </div>
      </form>

      {id && <SupportPanel projectId={id} />}

      {id && theirDeliveries.length > 0 && (
        <Panel title="Deliveries">
          <ul className="list list--plain">
            {theirDeliveries.map((d) => (
              <li key={d.id}><Link className="list__row" to={`/deliveries/${d.id}`}>
                <span className="list__title">{d.project_title}</span><Badge tone={d.status === "published" ? "good" : d.status === "revoked" ? "bad" : "neutral"}>{d.status}</Badge>
              </Link></li>
            ))}
          </ul>
        </Panel>
      )}

      <Confirm open={confirmDelete} title="Delete this project?" tone="danger" confirmLabel="Delete project" busy={del.isPending}
        body={<p>This removes its support periods too. Projects with deliveries can't be deleted.</p>}
        onConfirm={() => del.mutate()} onCancel={() => setConfirmDelete(false)} />
    </>
  );
}

const EMPTY_SUPPORT = (): SupportInput => {
  const start = new Date();
  const end = new Date(start); end.setMonth(end.getMonth() + 6);
  return { plan_name: "Six-month care plan", starts_on: start.toISOString().slice(0, 10), ends_on: end.toISOString().slice(0, 10), terms: "" };
};

function SupportPanel({ projectId }: { projectId: string }) {
  const q = useQuery({ queryKey: keys.support(projectId), queryFn: () => listSupport(projectId) });
  const [editing, setEditing] = useState<{ id: string | null; f: SupportInput } | null>(null);
  const [removing, setRemoving] = useState<SupportPeriod | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => saveSupport(projectId, editing!.id, nullify(editing!.f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.support(projectId) }); setEditing(null); toast("Support period saved"); },
    onError: (e) => toast(friendlyError(e), "bad"),
  });
  const del = useMutation({
    mutationFn: () => deleteSupport(removing!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.support(projectId) }); setRemoving(null); toast("Support period deleted"); },
    onError: (e) => { setRemoving(null); toast(friendlyError(e), "bad"); },
  });
  const dateError = editing && editing.f.ends_on < editing.f.starts_on ? "The end date must be on or after the start date." : null;

  return (
    <Panel title="Support periods" description="Attach one to a delivery to show the client their cover and terms."
      actions={!editing && <Button size="sm" onClick={() => setEditing({ id: null, f: EMPTY_SUPPORT() })}>Add support period</Button>}>
      {q.isLoading && <Loading />}
      {q.data?.length === 0 && !editing && <p className="muted">No support periods yet.</p>}
      <ul className="list list--plain">
        {q.data?.map((s) => (
          <li key={s.id} className="list__row list__row--static">
            <span className="list__main">
              <span className="list__title">{s.plan_name}</span>
              <span className="list__meta">{fmtDate(s.starts_on)} to {fmtDate(s.ends_on)}</span>
            </span>
            <span className="row-actions">
              <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, f: { plan_name: s.plan_name, starts_on: s.starts_on, ends_on: s.ends_on, terms: s.terms ?? "" } })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(s)}>Delete</Button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <form className="subform" onSubmit={(e) => { e.preventDefault(); if (!dateError) save.mutate(); }}>
          <div className="fields">
            <Field label="Plan name">{(p) => <input {...p} value={editing.f.plan_name} required maxLength={120} onChange={(e) => setEditing({ ...editing, f: { ...editing.f, plan_name: e.target.value } })} />}</Field>
            <Field label="Starts on">{(p) => <input {...p} type="date" required value={editing.f.starts_on} onChange={(e) => setEditing({ ...editing, f: { ...editing.f, starts_on: e.target.value } })} />}</Field>
            <Field label="Ends on" error={dateError}>{(p) => <input {...p} type="date" required value={editing.f.ends_on} onChange={(e) => setEditing({ ...editing, f: { ...editing.f, ends_on: e.target.value } })} />}</Field>
            <Field label="Terms the client will see" className="span-2" hint="What's included, response times, what isn't covered.">
              {(p) => <textarea {...p} rows={4} maxLength={4000} value={editing.f.terms ?? ""} onChange={(e) => setEditing({ ...editing, f: { ...editing.f, terms: e.target.value } })} />}
            </Field>
          </div>
          <div className="form-actions">
            <Button type="submit" variant="primary" size="sm" busy={save.isPending} disabled={!!dateError}>Save support period</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      )}
      <Confirm open={!!removing} title="Delete this support period?" tone="danger" confirmLabel="Delete" busy={del.isPending}
        body={<p>Deliveries using it will stop showing support details.</p>} onConfirm={() => del.mutate()} onCancel={() => setRemoving(null)} />
    </Panel>
  );
}
