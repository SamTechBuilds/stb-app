import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDelivery, getProject, keys, listDeliveries, listProjects, listSupport, prefillDelivery } from "../../lib/api";
import { friendlyError } from "../../lib/supabase";
import type { DeliveryStatus } from "../../lib/types";
import { Badge, Button, Empty, ErrorNote, Field, Loading, PageHeader, Panel, relTime, useToast } from "../../components/ui";

export const STATUS: Record<DeliveryStatus, { label: string; tone: "neutral" | "good" | "bad" }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "good" },
  archived: { label: "Archived", tone: "neutral" },
};

export function DeliveriesList() {
  const q = useQuery({ queryKey: keys.deliveries, queryFn: listDeliveries });
  return (
    <>
      <PageHeader title="Deliveries" subtitle="The handover pages your clients open."
        actions={<Link className="btn btn--primary" to="/deliveries/new">New delivery</Link>} />
      {q.isLoading && <Loading />}
      {q.error && <ErrorNote error={friendlyError(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && (
        <Empty title="No deliveries yet" action={<Link className="btn btn--primary" to="/deliveries/new">Create a delivery</Link>}>
          A delivery turns a finished project into a personal handover page with a private link.
        </Empty>
      )}
      {!!q.data?.length && (
        <ul className="list">
          {q.data.map((d) => (
            <li key={d.id}>
              <Link to={`/deliveries/${d.id}`} className="list__row">
                <span className="list__main">
                  <span className="list__title">{d.project_title}</span>
                  <span className="list__meta">
                    For {d.business_display_name || d.client_display_name}. {d.open_count > 0 ? `Opened ${d.open_count} ${d.open_count === 1 ? "time" : "times"}, last ${relTime(d.last_opened_at)}.` : "Not opened yet."}
                  </span>
                </span>
                <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NewDelivery() {
  const [params] = useSearchParams();
  const [projectId, setProjectId] = useState(params.get("project") ?? "");
  const projects = useQuery({ queryKey: keys.projects, queryFn: listProjects });
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!projectId && projects.data?.length === 1) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  const sorted = useMemo(() => [...(projects.data ?? [])].sort((a, b) => (a.status === "completed" ? -1 : 1) - (b.status === "completed" ? -1 : 1)), [projects.data]);

  const create = useMutation({
    mutationFn: async () => {
      const project = await getProject(projectId);
      const support = (await listSupport(projectId))[0] ?? null;
      return createDelivery(prefillDelivery(project, project.clients ?? null, support));
    },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: keys.deliveries }); toast("Draft delivery created"); nav(`/deliveries/${d.id}`); },
    onError: (e) => toast(friendlyError(e), "bad"),
  });

  return (
    <>
      <PageHeader title="New delivery" back={<Link to="/deliveries" className="back">Deliveries</Link>} />
      {projects.isLoading && <Loading />}
      {projects.data?.length === 0 && (
        <Empty title="Add a project first" action={<Link className="btn btn--primary" to="/projects/new">Add project</Link>}>
          Deliveries are created from a project.
        </Empty>
      )}
      {!!projects.data?.length && (
        <Panel title="Choose the project" description="We'll copy the client's name, project name, technologies, live URL and latest support period into a draft. Internal notes and budgets are never copied. You review everything before publishing.">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (projectId) create.mutate(); }}>
            <Field label="Project">
              {(p) => (
                <select {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                  <option value="">Choose a project</option>
                  {sorted.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} ({pr.clients?.business_name || pr.clients?.name})</option>)}
                </select>
              )}
            </Field>
            <div><Button type="submit" variant="primary" busy={create.isPending} disabled={!projectId}>Create draft</Button></div>
          </form>
        </Panel>
      )}
    </>
  );
}
