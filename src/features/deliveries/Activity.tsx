import { useQuery } from "@tanstack/react-query";
import { keys, listAssets, listEvents } from "../../lib/api";
import { Panel, fmtDateTime } from "../../components/ui";

function device(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad/.test(ua)) return "iPhone or iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

export function ActivityPanel({ deliveryId }: { deliveryId: string }) {
  const events = useQuery({ queryKey: keys.events(deliveryId), queryFn: () => listEvents(deliveryId), refetchInterval: 60_000 });
  const assets = useQuery({ queryKey: keys.assets(deliveryId), queryFn: () => listAssets(deliveryId) });
  const names = new Map((assets.data ?? []).map((a) => [a.id, a.title]));
  return (
    <Panel title="Activity" description="When your client opens the page or downloads a file. Previews aren't counted. IP addresses are never stored.">
      {events.data?.length === 0 && <p className="muted">Nothing yet.</p>}
      <ol className="activity">
        {events.data?.map((e) => (
          <li key={e.id}>
            <time dateTime={e.created_at}>{fmtDateTime(e.created_at)}</time>
            <span>{e.event === "opened" ? "Opened the page" : `Downloaded ${names.get(e.asset_id ?? "") ?? "a file"}`}</span>
            <span className="muted">{device(e.user_agent)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
