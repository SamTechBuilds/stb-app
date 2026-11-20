import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteClient, getClient, keys, listClients, listProjects, saveClient, type ClientInput } from "../../lib/api";
import { friendlyError } from "../../lib/supabase";
import { isEmail, nullify } from "../../lib/forms";
import { Badge, Button, Confirm, Empty, ErrorNote, Field, Loading, PageHeader, Panel, useToast } from "../../components/ui";

export function ClientsList() {
  const q = useQuery({ queryKey: keys.clients, queryFn: listClients });
  const [search, setSearch] = useState("");
  const rows = (q.data ?? []).filter((c) =>
    `${c.name} ${c.business_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader title="Clients" actions={<Link className="btn btn--primary" to="/clients/new">Add client</Link>} />
      {q.isLoading && <Loading />}
      {q.error && <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && (
        <Empty title="No clients yet" action={<Link className="btn btn--primary" to="/clients/new">Add your first client</Link>}>
          Add a client, then create their project and its delivery.
        </Empty>
      )}
      {q.data && q.data.length > 0 && (
        <>
          <input className="search" type="search" placeholder="Search clients" aria-label="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="list">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/clients/${c.id}`} className="list__row">
                  <span className="list__main">
                    <span className="list__title">{c.name}</span>
                    <span className="list__meta">{[c.business_name, c.email, c.phone].filter(Boolean).join("  ·  ") || "No contact details"}</span>
                  </span>
                  {c.status === "archived" && <Badge>Archived</Badge>}
                </Link>
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="muted">No clients match “{search}”.</p>}
        </>
      )}
    </>
  );
}

const EMPTY: ClientInput = { name: "", business_name: "", email: "", phone: "", address: "", notes: "", status: "active" };

export function ClientEdit() {
  const { id } = useParams();
  const isNew = !id;
  const q = useQuery({ queryKey: keys.client(id ?? "new"), queryFn: () => getClient(id!), enabled: !isNew });
  if (!isNew && q.isLoading) return <Loading />;
  if (!isNew && q.error) return <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />;
  const initial: ClientInput = q.data
    ? { name: q.data.name, business_name: q.data.business_name ?? "", email: q.data.email ?? "", phone: q.data.phone ?? "",
        address: q.data.address ?? "", notes: q.data.notes ?? "", status: q.data.status }
    : EMPTY;
  return <ClientForm key={id ?? "new"} id={id ?? null} initial={initial} />;
}

function ClientForm({ id, initial }: { id: string | null; initial: ClientInput }) {
  const [f, setF] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const projects = useQuery({ queryKey: keys.projects, queryFn: listProjects, enabled: !!id });
  const theirs = (projects.data ?? []).filter((p) => p.client_id === id);

  const save = useMutation({
    mutationFn: () => saveClient(id, nullify(f)),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: keys.clients });
      toast(id ? "Client saved" : "Client added");
      if (!id) nav(`/clients/${c.id}`, { replace: true });
    },
    onError: (e) => toast(friendlyError(e), "bad"),
  });
  const del = useMutation({
    mutationFn: () => deleteClient(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.clients }); toast("Client deleted"); nav("/clients"); },
    onError: (e) => { setConfirmDelete(false); toast(friendlyError(e), "bad"); },
  });

  const set = (k: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const emailError = isEmail(f.email) ? null : "Enter a valid email address.";
  const canSave = f.name.trim().length > 0 && !emailError;

  return (
    <>
      <PageHeader title={id ? initial.name : "Add client"} back={<Link to="/clients" className="back">Clients</Link>} />
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}>
        <Panel title="Details">
          <div className="fields">
            <Field label="Name">{(p) => <input {...p} value={f.name} onChange={set("name")} required maxLength={200} />}</Field>
            <Field label="Business name">{(p) => <input {...p} value={f.business_name ?? ""} onChange={set("business_name")} maxLength={200} />}</Field>
            <Field label="Email" error={emailError}>{(p) => <input {...p} type="email" value={f.email ?? ""} onChange={set("email")} />}</Field>
            <Field label="Phone">{(p) => <input {...p} type="tel" value={f.phone ?? ""} onChange={set("phone")} maxLength={40} />}</Field>
            <Field label="Address" className="span-2">{(p) => <textarea {...p} rows={2} value={f.address ?? ""} onChange={set("address")} maxLength={500} />}</Field>
            <Field label="Internal notes" hint="Only you see these. They never appear on a delivery page." className="span-2">
              {(p) => <textarea {...p} rows={4} value={f.notes ?? ""} onChange={set("notes")} maxLength={10000} />}
            </Field>
            <Field label="Status">
              {(p) => <select {...p} value={f.status} onChange={set("status")}><option value="active">Active</option><option value="archived">Archived</option></select>}
            </Field>
          </div>
        </Panel>
        <div className="form-actions">
          <Button type="submit" variant="primary" busy={save.isPending} disabled={!canSave}>{id ? "Save client" : "Add client"}</Button>
          {id && <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete client</Button>}
        </div>
      </form>

      {id && (
        <Panel title="Projects" actions={<Link className="btn btn--secondary btn--sm" to={`/projects/new?client=${id}`}>Add project</Link>}>
          {theirs.length === 0 ? <p className="muted">No projects for this client yet.</p> : (
            <ul className="list list--plain">
              {theirs.map((p) => <li key={p.id}><Link className="list__row" to={`/projects/${p.id}`}><span className="list__title">{p.name}</span></Link></li>)}
            </ul>
          )}
        </Panel>
      )}

      <Confirm open={confirmDelete} title="Delete this client?" tone="danger" confirmLabel="Delete client" busy={del.isPending}
        body={<p>This can't be undone. Clients with projects can't be deleted; archive them instead.</p>}
        onConfirm={() => del.mutate()} onCancel={() => setConfirmDelete(false)} />
    </>
  );
}
