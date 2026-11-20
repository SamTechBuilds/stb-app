import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { keys, listDeliveries, listProjects } from "../../lib/api";
import { friendlyError } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Badge, ErrorNote, PageHeader, Panel, relTime } from "../../components/ui";
import { STATUS } from "../deliveries/DeliveriesList";

export function Overview() {
  const { state } = useAuth();
  const deliveries = useQuery({ queryKey: keys.deliveries, queryFn: listDeliveries });
  const projects = useQuery({ queryKey: keys.projects, queryFn: listProjects });
  const name = state.kind === "authorized" ? state.displayName : null;
  const active = (projects.data ?? []).filter((p) => p.status === "in_progress" || p.status === "planned").length;
  const live = (deliveries.data ?? []).filter((d) => d.status === "published").length;
  const waiting = (deliveries.data ?? []).filter((d) => d.status === "published" && d.open_count === 0);
  const recent = (deliveries.data ?? []).slice(0, 5);

  return (
    <>
      <PageHeader title={name ? `Hello, ${name}` : "Overview"} actions={<Link className="btn btn--primary" to="/deliveries/new">New delivery</Link>} />
      {(deliveries.error || projects.error) && <ErrorNote error={friendlyError(deliveries.error ?? projects.error)} />}
      <dl className="stats stats--big">
        <div><dt>Active projects</dt><dd>{projects.data ? active : "…"}</dd></div>
        <div><dt>Live deliveries</dt><dd>{deliveries.data ? live : "…"}</dd></div>
        <div><dt>Waiting to be opened</dt><dd>{deliveries.data ? waiting.length : "…"}</dd></div>
      </dl>
      <Panel title="Recent deliveries" actions={<Link to="/deliveries" className="link-btn">All deliveries</Link>}>
        {recent.length === 0 ? <p className="muted">No deliveries yet. Create one from a finished project.</p> : (
          <ul className="list list--plain">
            {recent.map((d) => (
              <li key={d.id}>
                <Link to={`/deliveries/${d.id}`} className="list__row">
                  <span className="list__main">
                    <span className="list__title">{d.project_title}</span>
                    <span className="list__meta">{d.open_count ? `Opened ${relTime(d.last_opened_at)}` : "Not opened yet"}</span>
                  </span>
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="muted coming">Leads, tasks, finance and documents arrive in later phases.</p>
    </>
  );
}
