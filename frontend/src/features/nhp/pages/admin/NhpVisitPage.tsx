/**
 * NHP 访视方案页：方案选择 + 访视时点（TP）增删 + 时点名/锚点/窗口天数编辑。
 * 方案 = 一组 TP 定义；「默认方案」为内置种子（schemeId 空），可新建/重命名/删除自定义方案。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import {
  EVENT_ANCHOR_OPTIONS,
  createNhpVisit,
  createNhpVisitScheme,
  deleteNhpVisit,
  deleteNhpVisitScheme,
  fetchNhpVisitSchemes,
  fetchNhpVisits,
  updateNhpVisit,
  updateNhpVisitScheme,
  type NhpVisit,
} from "../../api/nhpVisit.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

/** 数字单元格：本地草稿 + 失焦提交 */
function NumCell({ value, onCommit, disabled }: { value?: number | null; onCommit: (v: number | null) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  return (
    <input
      className="input"
      type="number"
      style={{ width: 92 }}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        onCommit(t === "" ? null : Number(t));
      }}
    />
  );
}

/** 文本单元格：本地草稿 + 失焦提交（时点名编辑） */
function TextCell({ value, onCommit, placeholder, disabled }: { value?: string | null; onCommit: (v: string | undefined) => void; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <input
      className="input"
      style={{ width: 150 }}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim() || undefined)}
    />
  );
}

function nextTpCode(visits: NhpVisit[]): string {
  let max = -1;
  for (const v of visits) {
    const m = v.code?.match(/^TP(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TP${String(max + 1).padStart(2, "0")}`;
}

export default function NhpVisitPage() {
  const qc = useQueryClient();
  const goBack = useGoBack("/content-manager/nhp-template");

  const [schemeId, setSchemeId] = useState<number | null>(null); // null = 默认方案

  const schemesQuery = useQuery({ queryKey: ["nhp", "visit-schemes"], queryFn: fetchNhpVisitSchemes });
  const visitsQuery = useQuery({
    queryKey: ["nhp", "visits", schemeId],
    queryFn: () => fetchNhpVisits(schemeId),
  });

  const visits = useMemo(
    () => [...(visitsQuery.data ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.code.localeCompare(b.code)),
    [visitsQuery.data],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "visit-schemes"] });
    void qc.invalidateQueries({ queryKey: ["nhp", "visits"] });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<NhpVisit> }) => updateNhpVisit(id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nhp", "visits"] }),
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const createVisitMut = useMutation({
    mutationFn: () => createNhpVisit({ code: nextTpCode(visits), name: "新时点", schemeId, seq: visits.length }),
    onSuccess: () => {
      toast.success("已添加时点，请编辑时点名");
      void qc.invalidateQueries({ queryKey: ["nhp", "visits"] });
    },
    onError: (e: Error) => toast.error(e.message || "添加失败"),
  });

  const deleteVisitMut = useMutation({
    mutationFn: (id: number) => deleteNhpVisit(id),
    onSuccess: () => {
      toast.success("已删除时点");
      void qc.invalidateQueries({ queryKey: ["nhp", "visits"] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const createSchemeMut = useMutation({
    mutationFn: (name: string) => createNhpVisitScheme(name),
    onSuccess: (s) => {
      toast.success("已新建方案");
      invalidate();
      setSchemeId(s.id);
    },
    onError: (e: Error) => toast.error(e.message || "新建方案失败"),
  });

  const renameSchemeMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateNhpVisitScheme(id, { name }),
    onSuccess: () => {
      toast.success("已重命名");
      void qc.invalidateQueries({ queryKey: ["nhp", "visit-schemes"] });
    },
    onError: (e: Error) => toast.error(e.message || "重命名失败"),
  });

  const deleteSchemeMut = useMutation({
    mutationFn: (id: number) => deleteNhpVisitScheme(id),
    onSuccess: () => {
      toast.success("已删除方案");
      setSchemeId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除方案失败", { duration: 6000 }),
  });

  const schemes = schemesQuery.data ?? [];
  const activeScheme = schemes.find((s) => s.id === schemeId) ?? null;
  const readonly = schemeId == null; // 默认方案只读，须新建方案后再编辑

  const patch = (row: NhpVisit, p: Partial<NhpVisit>) => updateMut.mutate({ id: row.id, patch: p });

  const handleCreateScheme = async () => {
    const name = (await appPrompt("新建方案名", ""))?.trim();
    if (!name) return;
    createSchemeMut.mutate(name);
  };

  const handleRenameScheme = async () => {
    if (!activeScheme) return;
    const name = (await appPrompt("方案名", activeScheme.name))?.trim();
    if (!name || name === activeScheme.name) return;
    renameSchemeMut.mutate({ id: activeScheme.id, name });
  };

  const handleDeleteScheme = async () => {
    if (!activeScheme) return;
    if (await appConfirm(`删除方案「${activeScheme.name}」？其下时点也会一并删除。`, { danger: true })) {
      deleteSchemeMut.mutate(activeScheme.id);
    }
  };

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-toolbar" style={{ flexWrap: "nowrap" }}>
          <button type="button" className="btn ghost small" onClick={goBack} style={{ flexShrink: 0 }}>
            ← 返回
          </button>
          <select
            className="select"
            value={schemeId == null ? "" : String(schemeId)}
            onChange={(e) => setSchemeId(e.target.value ? Number(e.target.value) : null)}
            style={{ minWidth: 120, maxWidth: 200 }}
          >
            <option value="">默认方案</option>
            {schemes.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost small" onClick={handleCreateScheme}>
            ＋ 新建方案
          </button>
          {activeScheme && (
            <>
              <button type="button" className="btn ghost small" onClick={handleRenameScheme}>
                重命名
              </button>
              <button type="button" className="btn danger small" onClick={handleDeleteScheme}>
                删除方案
              </button>
            </>
          )}
          <button
            type="button"
            className="btn primary small"
            disabled={readonly}
            title={readonly ? "默认方案不可修改，请新建方案" : undefined}
            onClick={() => createVisitMut.mutate()}
          >
            ＋ 添加时点
          </button>
          <span className="aup-wb-count">共 {visits.length} 个时点</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">访视时点（{activeScheme ? activeScheme.name : "默认方案"}）</span>
              <span className="aup-wb-chip muted">共 {visits.length} 个时点</span>
              {readonly && (
                <span className="aup-wb-chip" style={{ background: "#fff7ed", color: "#c2410c" }}>
                  默认方案为内置只读，请「新建方案」后再编辑
                </span>
              )}
            </div>
            <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
              <table className="aup-wb-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>TP 码</th>
                    <th style={{ width: 170 }}>时点名</th>
                    <th style={{ width: 160 }}>event_anchor</th>
                    <th style={{ width: 100 }}>planned_days</th>
                    <th style={{ width: 92 }}>early_days</th>
                    <th style={{ width: 92 }}>late_days</th>
                    <th style={{ width: 92 }}>end_days</th>
                    <th style={{ width: 64 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visitsQuery.isLoading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
                        加载访视时点…
                      </td>
                    </tr>
                  ) : visits.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
                        暂无访视时点，点「＋ 添加时点」新建
                      </td>
                    </tr>
                  ) : (
                    visits.map((v) => (
                      <tr key={v.id}>
                        <td className="mono">{v.code}</td>
                        <td>
                          <TextCell value={v.name} placeholder="时点名" disabled={readonly} onCommit={(n) => patch(v, { name: n })} />
                        </td>
                        <td>
                          <select
                            className="select"
                            value={v.eventAnchor ?? ""}
                            disabled={readonly}
                            onChange={(e) => patch(v, { eventAnchor: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {EVENT_ANCHOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <NumCell value={v.plannedDays} disabled={readonly} onCommit={(n) => patch(v, { plannedDays: n })} />
                        </td>
                        <td>
                          <NumCell value={v.earlyDays} disabled={readonly} onCommit={(n) => patch(v, { earlyDays: n })} />
                        </td>
                        <td>
                          <NumCell value={v.lateDays} disabled={readonly} onCommit={(n) => patch(v, { lateDays: n })} />
                        </td>
                        <td>
                          <NumCell value={v.endDays} disabled={readonly} onCommit={(n) => patch(v, { endDays: n })} />
                        </td>
                        <td>
                          {!readonly && (
                            <button
                              type="button"
                              className="btn danger small"
                              onClick={async () => {
                                if (await appConfirm(`删除时点「${v.code}」？`, { danger: true })) {
                                  deleteVisitMut.mutate(v.id);
                                }
                              }}
                            >
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
