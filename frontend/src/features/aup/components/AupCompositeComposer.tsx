import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAupTemplateById, type TemplateVersionVO } from "../api/aup.api";
import TemplateStructurePreview from "./TemplateStructurePreview";

export type AupAtomPick = {
  atomFormKey: string;
  atomTemplateId: number;
  version?: number;
  name?: string;
};

interface Props {
  /** 全部 ATOM 版本行（后端按 kind=ATOM 列表） */
  atoms: TemplateVersionVO[];
  name: string;
  formKey: string;
  onNameChange: (v: string) => void;
  onFormKeyChange: (v: string) => void;
  onConfirm: (picks: AupAtomPick[]) => void;
  onCancel: () => void;
  confirming?: boolean;
}

function isPublished(s?: string): boolean {
  return (s ?? "").toUpperCase() === "PUBLISHED";
}

function statusText(s?: string): string {
  switch ((s ?? "").toUpperCase()) {
    case "PUBLISHED": return "已发布";
    case "PENDING_REVIEW": return "待审核";
    case "ARCHIVED": return "已归档";
    default: return "草稿";
  }
}

/**
 * 组合域创建器（对齐 NHP 组合模板设计）：勾选原子域 → 选版本 → 右侧预览 → 确认组合。
 */
export default function AupCompositeComposer({
  atoms,
  name,
  formKey,
  onNameChange,
  onFormKeyChange,
  onConfirm,
  onCancel,
  confirming,
}: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, TemplateVersionVO[]>();
    for (const a of atoms) {
      if ((a.kind ?? "ATOM") !== "ATOM") continue;
      const arr = map.get(a.formKey) ?? [];
      arr.push(a);
      map.set(a.formKey, arr);
    }
    return Array.from(map.entries())
      .map(([fk, vers]) => ({
        formKey: fk,
        name: vers[0].name,
        versions: vers.sort((x, y) => (y.version ?? 0) - (x.version ?? 0)),
      }))
      .sort((x, y) => x.formKey.localeCompare(y.formKey));
  }, [atoms]);

  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated || !groups.length) return;
    const nextEnabled = new Set<string>();
    const nextPicks: Record<string, number> = {};
    for (const g of groups) {
      nextEnabled.add(g.formKey);
      const pub = g.versions.find((v) => isPublished(v.status)) ?? g.versions[0];
      if (pub) nextPicks[g.formKey] = pub.id;
    }
    setEnabled(nextEnabled);
    setPicks(nextPicks);
    setPreviewKey(groups[0].formKey ?? null);
    setHydrated(true);
  }, [groups, hydrated]);

  const selectedPicks = useMemo<AupAtomPick[]>(
    () =>
      groups
        .filter((g) => enabled.has(g.formKey) && picks[g.formKey])
        .map((g) => {
          const v = g.versions.find((x) => x.id === picks[g.formKey]);
          return { atomFormKey: g.formKey, atomTemplateId: picks[g.formKey], version: v?.version, name: g.name };
        }),
    [groups, enabled, picks],
  );

  const previewId = previewKey ? picks[previewKey] : undefined;
  const previewQuery = useQuery({
    queryKey: ["aup", "template", "composer-preview", previewId],
    queryFn: () => fetchAupTemplateById(previewId!),
    enabled: !!previewId,
  });

  const toggleAtom = (fk: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(fk)) next.delete(fk);
      else {
        next.add(fk);
        if (!picks[fk]) {
          const g = groups.find((x) => x.formKey === fk);
          const pub = g?.versions.find((v) => isPublished(v.status)) ?? g?.versions[0];
          if (pub) setPicks((p) => ({ ...p, [fk]: pub.id }));
        }
        setPreviewKey(fk);
      }
      return next;
    });
  };

  const setVersion = (fk: string, formId: number) => {
    setPicks((p) => ({ ...p, [fk]: formId }));
    setPreviewKey(fk);
  };

  return (
    <div className="aup-modal-mask" onClick={onCancel}>
      <div className="aup-modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <h3>新建组合域</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          勾选原子域并钉住版本，右侧预览当前选中的原子域结构；确认后组合成一份快照。草稿与已发布版本均可钉住，发布组合前建议优先选已发布版。
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 13, flex: 1 }}>
            名称
            <input className="input" style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="如 完整 AUP 组合" />
          </label>
          <label style={{ fontSize: 13, flex: 1 }}>
            编码（formKey）
            <input className="input" style={{ width: "100%", marginTop: 4 }} value={formKey} onChange={(e) => onFormKeyChange(e.target.value)} placeholder="可选，如 aupComposite" />
          </label>
        </div>

        {groups.length === 0 ? (
          <div className="aup-empty small">尚无原子域。请先到「原子域」页签新建原子域，或到「字段域」页把字段组织成原子域。</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              {groups.map((g) => {
                const on = enabled.has(g.formKey);
                const selectedId = picks[g.formKey];
                return (
                  <div key={g.formKey} style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={on} onChange={() => toggleAtom(g.formKey)} />
                      <span style={{ fontWeight: 600 }}>{g.name}</span>
                      <span className="aup-wb-chip muted" style={{ fontFamily: "ui-monospace, monospace" }}>{g.formKey}</span>
                    </label>
                    {on && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginLeft: 26 }}>
                        {g.versions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="btn small"
                            onClick={() => setVersion(g.formKey, v.id)}
                            style={{
                              borderColor: selectedId === v.id ? "var(--primary)" : undefined,
                              background: selectedId === v.id ? "var(--primary-weak)" : "#fff",
                              fontWeight: selectedId === v.id ? 700 : 500,
                            }}
                          >
                            v{v.version} · {statusText(v.status)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, maxHeight: 360, overflowY: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>结构预览</div>
              {!previewId ? (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>勾选并选择版本后，此处显示该原子域结构。</div>
              ) : previewQuery.isLoading ? (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>加载预览…</div>
              ) : previewQuery.isError ? (
                <div style={{ color: "var(--danger, #c2410c)", fontSize: 12 }}>预览加载失败</div>
              ) : (
                <TemplateStructurePreview sections={previewQuery.data?.sections ?? []} />
              )}
            </div>
          </div>
        )}

        <div className="aup-modal-actions">
          <div style={{ fontSize: 12, color: "var(--muted)" }}>已选 {selectedPicks.length} 个原子域</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={onCancel}>取消</button>
            <button className="btn primary" disabled={confirming || selectedPicks.length === 0} onClick={() => onConfirm(selectedPicks)}>
              {confirming ? "组合中…" : "组合并创建"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
