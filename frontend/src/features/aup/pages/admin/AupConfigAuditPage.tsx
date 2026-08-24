import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAupConfigAudit, type AupConfigChangeLogVO, type AupConfigAuditResult } from "@/features/aup/api/aup.api";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import "@/features/aup/aup.css";

/* =====================================================================
 * AUP 配置变更记录。
 *  - 筛选工具栏（entity / changeType / 关键字 / 日期区间）
 *  - 密集表 + 可展开 before/after JSON
 *  - 只追加、不更新不删除；entity 冗余 code/name，主表被删也显示
 * ================================================================== */

const ENTITY_LABELS: Record<string, string> = {
  codelist: "码表",
  codelist_item: "码表项",
  field: "字段",
  folder: "文件夹",
  template: "模板",
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  CREATE: "新建",
  UPDATE: "修改",
  DELETE: "删除",
  MOVE: "移动",
  SUBMIT_REVIEW: "提交审核",
  APPROVE: "通过",
  REJECT: "驳回",
  UNFREEZE: "解冻",
  NEW_VERSION: "新建版本",
  ARCHIVE: "归档",
};

function changeTypeMeta(ct?: string): { text: string; color: string } {
  switch ((ct ?? "").toUpperCase()) {
    case "CREATE":
    case "NEW_VERSION":
      return { text: CHANGE_TYPE_LABELS[ct!] ?? ct ?? "—", color: "#16a34a" };
    case "DELETE":
      return { text: "删除", color: "#dc2626" };
    case "REJECT":
      return { text: "驳回", color: "#dc2626" };
    case "APPROVE":
    case "ARCHIVE":
      return { text: CHANGE_TYPE_LABELS[ct!] ?? ct ?? "—", color: "#16a34a" };
    case "SUBMIT_REVIEW":
    case "UNFREEZE":
    case "MOVE":
      return { text: CHANGE_TYPE_LABELS[ct!] ?? ct ?? "—", color: "#c2410c" };
    default:
      return { text: CHANGE_TYPE_LABELS[ct!] ?? ct ?? "—", color: "#64748b" };
  }
}

function prettyJson(raw?: string): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function JsonBlock({ title, raw }: { title: string; raw?: string }) {
  return (
    <div style={{ padding: 8, background: "#f8fafc", borderRadius: 6, border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{title}</div>
      <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, monospace" }}>
        {prettyJson(raw)}
      </pre>
    </div>
  );
}

export default function AupConfigAuditPage() {
  const [entity, setEntity] = useState("");
  const [changeType, setChangeType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const queryKey = ["aup", "config-audit", { entity, changeType, keyword: appliedKeyword, dateFrom, dateTo, page, pageSize }];
  const { data, isLoading, isFetching } = useQuery<AupConfigAuditResult>({
    queryKey,
    queryFn: () =>
      fetchAupConfigAudit({
        entity: entity || undefined,
        changeType: changeType || undefined,
        keyword: appliedKeyword || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize,
      }),
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const entitySummaries = useMemo(() => data?.entitySummaries ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applyFilters = () => {
    setAppliedKeyword(keyword.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setEntity("");
    setChangeType("");
    setKeyword("");
    setAppliedKeyword("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="aup-app aup-app--full">
      <div className="aup-wb-hd">
        <div>
          <h1>AUP 配置变更记录</h1>
          <div className="sub">码表 / 字段 / 文件夹 / 模板的增删改与状态机流转留痕；只追加，不更新不删除。</div>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div className="aup-wb-toolbar" style={{ flexWrap: "wrap" }}>
        <select className="select" style={{ width: "auto" }} value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
          <option value="">全部实体</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={changeType} onChange={(e) => { setChangeType(e.target.value); setPage(1); }}>
          <option value="">全部变更类型</option>
          {Object.entries(CHANGE_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ maxWidth: 220 }}
          placeholder="搜索编码 / 名称 / 操作人…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
        <input className="input" style={{ width: 150 }} type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        <span style={{ color: "var(--muted)", fontSize: 12 }}>至</span>
        <input className="input" style={{ width: 150 }} type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        <button className="btn ghost small" onClick={applyFilters}>
          查询
        </button>
        <button className="btn ghost small" onClick={resetFilters}>
          重置
        </button>
        <span className="aup-wb-count">共 {total} 条记录</span>
      </div>

      {/* 实体分类 chip */}
      {entitySummaries.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {entitySummaries.map((s) => (
            <button
              key={s.entity}
              type="button"
              className="btn small"
              onClick={() => {
                setEntity((prev) => (prev === s.entity ? "" : s.entity ?? ""));
                setPage(1);
              }}
              style={{
                borderColor: entity === s.entity ? "var(--primary)" : undefined,
                background: entity === s.entity ? "var(--primary-weak)" : "#fff",
                fontWeight: entity === s.entity ? 700 : 500,
              }}
            >
              {ENTITY_LABELS[s.entity ?? ""] ?? s.entity} · {s.count}
            </button>
          ))}
        </div>
      )}

      <div className="aup-wb-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div className="aup-wb-table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table className="aup-wb-table aup-wb-table--dense" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>时间</th>
                <th style={{ width: 90 }}>实体</th>
                <th style={{ width: 150 }}>编码</th>
                <th>名称</th>
                <th style={{ width: 100 }}>变更类型</th>
                <th style={{ width: 90 }}>操作人</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: AupConfigChangeLogVO) => {
                const expanded = expandedId === it.id;
                const cm = changeTypeMeta(it.changeType);
                return (
                  <Fragment key={it.id}>
                    <tr onClick={() => setExpandedId(expanded ? null : it.id ?? null)} style={{ cursor: "pointer" }}>
                      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {it.createdAt ? formatDateTimeAsiaShanghaiShort(it.createdAt) : "—"}
                      </td>
                      <td>{ENTITY_LABELS[it.entity ?? ""] ?? it.entity ?? "—"}</td>
                      <td>
                        <span className="mono" style={{ fontSize: 11 }}>{it.entityCode || "—"}</span>
                      </td>
                      <td>
                        <div className="clip" title={it.entityName || ""}>{it.entityName || "—"}</div>
                      </td>
                      <td>
                        <span className="aup-wb-chip" style={{ background: "#fff", color: cm.color, border: "1px solid var(--border)" }}>
                          {cm.text}
                        </span>
                      </td>
                      <td>{it.operator || "—"}</td>
                      <td style={{ color: "var(--muted)", textAlign: "center" }}>{expanded ? "▾" : "▸"}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} style={{ background: "#fbfcfe" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <JsonBlock title="before" raw={it.beforeJson} />
                            <JsonBlock title="after" raw={it.afterJson} />
                          </div>
                          {it.comment && (
                            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                              审核意见：{it.comment}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {items.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                    暂无变更记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          第 {page} / {totalPages} 页{isFetching ? " · 加载中…" : ""}
        </span>
        <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          上一页
        </button>
        <button className="btn ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          下一页
        </button>
      </div>
    </div>
  );
}
