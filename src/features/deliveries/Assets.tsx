import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assetPreviewUrl, deleteAsset, keys, listAssets, updateAsset, uploadAsset } from "../../lib/api";
import { friendlyError } from "../../lib/supabase";
import { checkUpload, DOCUMENT_TYPES, SCREENSHOT_TYPES } from "../../lib/security";
import type { Delivery, DeliveryAsset } from "../../lib/types";
import { Badge, Button, Confirm, Loading, Panel, useToast } from "../../components/ui";

const COPY = {
  screenshot: {
    title: "Screenshots",
    description: "The first one appears in a browser frame at the top of the page; the rest form a gallery. PNG, JPEG or WebP, up to 50 MB.",
    add: "Add screenshots",
    empty: "No screenshots yet. Add at least one: it's the centrepiece of the reveal.",
  },
  document: {
    title: "Handover files",
    description: "User guides, brand assets, source exports. Clients download them through links that expire after two minutes.",
    add: "Add files",
    empty: "No files yet.",
  },
};

function fmtSize(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetsPanel({ delivery, kind }: { delivery: Delivery; kind: "screenshot" | "document" }) {
  const q = useQuery({ queryKey: keys.assets(delivery.id), queryFn: () => listAssets(delivery.id) });
  const items = (q.data ?? []).filter((a) => a.kind === kind);
  const [uploading, setUploading] = useState<string[]>([]);
  const [removing, setRemoving] = useState<DeliveryAsset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.assets(delivery.id) });
  const locked = delivery.status === "revoked";
  const c = COPY[kind];

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    const problems = list.map((f) => checkUpload(f, kind)).filter(Boolean) as string[];
    if (problems.length) { problems.forEach((p) => toast(p, "bad")); }
    const ok = list.filter((f) => !checkUpload(f, kind));
    let order = items.reduce((m, a) => Math.max(m, a.sort_order), 0);
    for (const file of ok) {
      setUploading((u) => [...u, file.name]);
      try {
        await uploadAsset(delivery.id, kind, file, ++order);
      } catch (e) {
        toast(`${file.name}: ${friendlyError(e)}`, "bad");
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
    if (ok.length) { toast(ok.length === 1 ? "File uploaded" : `${ok.length} files uploaded`); refresh(); }
    if (input.current) input.current.value = "";
  };

  const move = useMutation({
    mutationFn: async ({ a, dir }: { a: DeliveryAsset; dir: -1 | 1 }) => {
      const idx = items.findIndex((x) => x.id === a.id);
      const other = items[idx + dir];
      if (!other) return;
      // normalise orders, then swap
      const ordered = items.map((x, i) => ({ ...x, sort_order: i + 1 }));
      await Promise.all([
        updateAsset(a.id, { sort_order: ordered[idx + dir].sort_order }),
        updateAsset(other.id, { sort_order: ordered[idx].sort_order }),
      ]);
    },
    onSuccess: refresh,
    onError: (e) => toast(friendlyError(e), "bad"),
  });

  const del = useMutation({
    mutationFn: () => deleteAsset(removing!),
    onSuccess: () => { setRemoving(null); toast("File removed"); refresh(); },
    onError: (e) => { setRemoving(null); toast(friendlyError(e), "bad"); },
  });

  return (
    <Panel title={c.title} description={c.description} id={`assets-${kind}`}
      actions={!locked && (
        <>
          <input ref={input} type="file" multiple hidden accept={(kind === "screenshot" ? SCREENSHOT_TYPES : DOCUMENT_TYPES).join(",")}
            onChange={(e) => onFiles(e.target.files)} aria-label={c.add} />
          <Button size="sm" onClick={() => input.current?.click()} busy={uploading.length > 0}>{c.add}</Button>
        </>
      )}>
      {q.isLoading && <Loading />}
      {uploading.length > 0 && <p className="muted" role="status">Uploading {uploading.join(", ")}…</p>}
      {!q.isLoading && items.length === 0 && uploading.length === 0 && <p className="muted">{c.empty}</p>}
      <ul className="assets">
        {items.map((a, i) => (
          <AssetRow key={a.id} asset={a} first={i === 0} last={i === items.length - 1} locked={locked}
            onMove={(dir) => move.mutate({ a, dir })} onRemove={() => setRemoving(a)} onSaved={refresh} />
        ))}
      </ul>
      <Confirm open={!!removing} title="Remove this file?" tone="danger" confirmLabel="Remove" busy={del.isPending}
        body={<p>{removing?.file_name} is deleted from storage and disappears from the delivery page.</p>}
        onConfirm={() => del.mutate()} onCancel={() => setRemoving(null)} />
    </Panel>
  );
}

function AssetRow({ asset, first, last, locked, onMove, onRemove, onSaved }: {
  asset: DeliveryAsset; first: boolean; last: boolean; locked: boolean;
  onMove: (dir: -1 | 1) => void; onRemove: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [description, setDescription] = useState(asset.description ?? "");
  const [thumb, setThumb] = useState<string | null>(null);
  const toast = useToast();
  const dirty = title !== asset.title || description !== (asset.description ?? "");

  useEffect(() => {
    if (asset.kind !== "screenshot") return;
    let live = true;
    assetPreviewUrl(asset.storage_path).then((u) => live && setThumb(u));
    return () => { live = false; };
  }, [asset.kind, asset.storage_path]);

  const save = useMutation({
    mutationFn: () => updateAsset(asset.id, { title: title.trim() || asset.title, description: description.trim() || null }),
    onSuccess: () => { toast("Saved"); onSaved(); },
    onError: (e) => toast(friendlyError(e), "bad"),
  });
  const toggle = useMutation({
    mutationFn: () => updateAsset(asset.id, { is_published: !asset.is_published }),
    onSuccess: onSaved,
    onError: (e) => toast(friendlyError(e), "bad"),
  });

  return (
    <li className={`asset${asset.is_published ? "" : " asset--hidden"}`}>
      <div className="asset__thumb" aria-hidden="true">
        {asset.kind === "screenshot" ? (thumb ? <img src={thumb} alt="" /> : null) : <span>{asset.file_name.split(".").pop()?.slice(0, 4)}</span>}
      </div>
      <div className="asset__body">
        <input className="asset__title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} disabled={locked} aria-label="Title shown to the client" />
        <input className="asset__desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={locked}
          placeholder="Optional description" aria-label="Description shown to the client" />
        <p className="asset__meta">{asset.file_name}, {fmtSize(asset.size_bytes)} {!asset.is_published && <Badge tone="warn">Hidden from client</Badge>} {first && asset.kind === "screenshot" && asset.is_published && <Badge tone="info">Main screenshot</Badge>}</p>
      </div>
      {!locked && (
        <div className="asset__actions">
          {dirty && <Button size="sm" variant="primary" onClick={() => save.mutate()} busy={save.isPending}>Save</Button>}
          <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${asset.title} up`}>Up</Button>
          <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${asset.title} down`}>Down</Button>
          <Button size="sm" variant="ghost" onClick={() => toggle.mutate()} busy={toggle.isPending}>{asset.is_published ? "Hide" : "Show"}</Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
        </div>
      )}
    </li>
  );
}
