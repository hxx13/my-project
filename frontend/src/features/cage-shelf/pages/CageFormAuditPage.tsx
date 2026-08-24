/**
 * 笼位表单审计页 — 数据变更 + 字典变更（对齐 NhpAuditPage 紧凑风格）。
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  fetchCageFormAuditLog,
  type CageFormAuditEntry,
} from "../api/cageFormAudit.api";
import { CageFormPageShell } from "../components/CageFormPageShell";
import "@/features/aup/aup.css";
import "@/features/nhp/nhp.css";

type Tab = "data" | "dict";
const PAGE_SIZE = 50;

const DATA_CHANGE_TYPES = ["UPDATE", "BIND", "UNBIND", "TRANSFER", "RELEASE"];
const DICT_CHANGE_TYPES = ["CREATE", "UPDATE", "DELETE", "PUBLISH"];
const ENTITY_TYPES = [
  { value: "field", label: "字段" },
  { value: "codelist", label: "码表" },
  { value: "form", label: "表单" },
  { value: "claim", label: "认领" },
  { value: "cage_box", label: "笼盒" },
];

type Filters = {
  keyword: string;
  changeType: string;
  operatorId: string;
  entity: string;
  dateFrom: string;
  dateTo: string;
  page: number;
};

const defaultFilters = (): Filters => ({
  keyword: "",
  changeType: "",
  operatorId: "",
  entity: "",
  dateFrom: "",
  dateTo: "",
  page: 1,
});

function changeTypeTone(t: string): { bg: string; color: string } {
  switch (t.toUpperCase()) {
    case "CREATE":
    case "BIND":
      return { bg: "var(--primary-weak)", color: "var(--primary)" };
    case "UPDATE":
    case "TRANSFER":
      return { bg: "var(--warn-weak)", color: "var(--warn)" };
    case "DELETE":
    case "UNBIND":
    case "RELEASE":
      return { bg: "var(--danger-weak)", color: "var(--danger)" };
    case "PUBLISH":
      return { bg: "#EEF2F7", color: "var(--slate)" };
    default:
      return { bg: "#EEF2F7", color: "var(--slate)" };
  }
}

function entityLabel(entity: string): string {
  return (ENTITY_TYPES.find((e) => e.value === entity)?.label ?? entity) || "—";
}

function hasActiveFilters(f: Filters): boolean {
  return !!(f.keyword.trim() || f.changeType || f.operatorId.trim() || f.entity || f.dateFrom || f.dateTo);
}

function ChangeBadge({ type }: { type: string }) {
  const tone = changeTypeTone(type);
  return (
    <span className="nhp-audit-badge" style={{ background: tone.bg, color: tone.color }}>
      {type}
    </span>
  );
}

function AuditDetailRow({
  colSpan,
  before,
  after,
}: {
  colSpan: number;
  before?: string | null;
  after?: string | null;
}) {
  return (
    <tr className="nhp-audit-detail">
      <td colSpan={colSpan}>
        <div className="nhp-audit-detail-grid">
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>变更前</div>
            <pre className="nhp-audit-detail-pre">{before ?? "—"}</pre>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>变更后</div>
            <pre className="nhp-audit-detail-pre">{after ?? "—"}</pre>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ObjectCell({ row }: { row: CageFormAuditEntry }) {
  const name = row.entityName?.trim();
  const code = row.entityCode?.trim();
  if (name || code) {
    return (
      <div>
        {name ? <div className="nhp-audit-cell-name">{name}</div> : null}
        {code ? <div className="nhp-audit-cell-sub">{code}</div> : null}
      </div>
    );
  }
  return <span className="nhp-audit-cell-sub">{row.targetLabel ?? "—"}</span>;
}

export default function CageFormAuditPage() {
  const [tab, setTab] = useState<Tab>("data");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((prev) => (prev.keyword === keywordInput ? prev : { ...prev, keyword: keywordInput, page: 1 }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [keywordInput]);

  useEffect(() => {
    setExpandedId(null);
  }, [tab, filters]);

  const auditQuery = useQuery({
    queryKey: ["cage-form", "audit", tab, filters],
    queryFn: () =>
      fetchCageFormAuditLog({
        category: tab,
        keyword: filters.keyword.trim() || undefined,
        changeType: filters.changeType || undefined,
        entity: filters.entity || undefined,
        operatorId: filters.operatorId.trim() || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59` : undefined,
        page: filters.page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const page = auditQuery.data?.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entitySummaries = auditQuery.data?.entitySummaries ?? [];
  const totalAll = useMemo(
    () => entitySummaries.reduce((sum, s) => sum + (s.count ?? 0), 0),
    [entitySummaries],
  );

  const applyFilters = (next: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...next, page: next.page ?? 1 }));
  const clearFilters = () => {
    setKeywordInput("");
    setFilters(defaultFilters());
  };
  const switchTab = (next: Tab) => {
    setTab(next);
    setExpandedId(null);
    setFilters(defaultFilters());
    setKeywordInput("");
  };

  const seg = (on: boolean) => (on ? "nhp-audit-seg-btn on" : "nhp-audit-seg-btn");

  return (
    <CageFormPageShell backTo="/admin/cage-shelves/forms">
      <div className="aup-app aup-app--workbench cage-form-wb min-h-0 flex-1" style={{ background: "var(--bg)" }}>
        <div className="aup-wb">
          <div className="nhp-audit-shell">
            <div className="nhp-audit-toolbar">
              <div className="nhp-audit-toolbar-row">
                <div className="nhp-audit-seg">
                  <button type="button" className={seg(tab === "data")} onClick={() => switchTab("data")}>
                    数据变更
                  </button>
                  <button type="button" className={seg(tab === "dict")} onClick={() => switchTab("dict")}>
                    字典变更
                  </button>
                </div>

                <div className="nhp-audit-cat-scroll">
                  <button
                    type="button"
                    className={`nhp-audit-cat-btn${filters.entity ? "" : " on"}`}
                    onClick={() => applyFilters({ entity: "" })}
                  >
                    全部<span className="cnt">{totalAll}</span>
                  </button>
                  {entitySummaries.map((e) => (
                    <button
                      key={e.entity}
                      type="button"
                      className={`nhp-audit-cat-btn${filters.entity === e.entity ? " on" : ""}`}
                      onClick={() => applyFilters({ entity: e.entity })}
                    >
                      {e.label || entityLabel(e.entity)}
                      <span className="cnt">{e.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="nhp-audit-toolbar-row">
                <input
                  className="nhp-audit-search"
                  placeholder={tab === "data" ? "搜索字段/对象/操作人…" : "搜索实体名/编码/操作人…"}
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                />
                <select
                  className="nhp-audit-filter"
                  value={filters.changeType}
                  onChange={(e) => applyFilters({ changeType: e.target.value })}
                >
                  <option value="">全部操作</option>
                  {(tab === "data" ? DATA_CHANGE_TYPES : DICT_CHANGE_TYPES).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  className="nhp-audit-filter"
                  style={{ width: 110 }}
                  placeholder="操作人"
                  value={filters.operatorId}
                  onChange={(e) => applyFilters({ operatorId: e.target.value })}
                />
                <input
                  type="date"
                  className="nhp-audit-filter"
                  value={filters.dateFrom}
                  onChange={(e) => applyFilters({ dateFrom: e.target.value })}
                  title="起始日期"
                />
                <input
                  type="date"
                  className="nhp-audit-filter"
                  value={filters.dateTo}
                  onChange={(e) => applyFilters({ dateTo: e.target.value })}
                  title="截止日期"
                />
              </div>

              <div className="nhp-audit-meta">
                <span>
                  共 <strong>{total}</strong> 条
                  {hasActiveFilters(filters) ? "（已筛选）" : ""}
                </span>
                {hasActiveFilters(filters) ? (
                  <button type="button" className="btn ghost small" onClick={clearFilters}>
                    清除筛选
                  </button>
                ) : null}
                {auditQuery.isFetching ? <span>加载中…</span> : null}
              </div>
            </div>

            <div className="nhp-audit-panel">
              <div className="nhp-audit-table-wrap">
                <table className="aup-wb-table aup-wb-table--dense">
                  <thead>
                    <tr>
                      {tab === "data" ? (
                        <>
                          <th style={{ width: "14%" }}>字段</th>
                          <th style={{ width: 72 }}>操作</th>
                          <th style={{ width: "16%" }}>对象</th>
                          <th style={{ width: "12%" }}>目标</th>
                          <th style={{ width: "10%" }}>变更</th>
                        </>
                      ) : (
                        <>
                          <th style={{ width: "12%" }}>实体</th>
                          <th style={{ width: "18%" }}>对象</th>
                          <th style={{ width: 72 }}>操作</th>
                        </>
                      )}
                      <th style={{ width: 80 }}>操作人</th>
                      <th style={{ width: 100 }}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditQuery.isError ? (
                      <tr>
                        <td colSpan={tab === "data" ? 7 : 5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          加载失败，请刷新重试
                        </td>
                      </tr>
                    ) : auditQuery.isLoading ? (
                      <tr>
                        <td colSpan={tab === "data" ? 7 : 5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          加载审计…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={tab === "data" ? 7 : 5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          暂无匹配记录
                        </td>
                      </tr>
                    ) : (
                      items.map((r) => {
                        const expanded = expandedId === r.id;
                        const before = tab === "data" ? r.beforeValue : r.beforeJson;
                        const after = tab === "data" ? r.afterValue : r.afterJson;
                        const colSpan = tab === "data" ? 7 : 5;
                        return (
                          <Fragment key={r.id}>
                            <tr
                              className={`nhp-audit-row${expanded ? " expanded" : ""}`}
                              onClick={() => setExpandedId(expanded ? null : r.id)}
                            >
                              {tab === "data" ? (
                                <>
                                  <td>
                                    <div>
                                      {r.fieldName ? <div className="nhp-audit-cell-name">{r.fieldName}</div> : null}
                                      {r.fieldCode ? <div className="nhp-audit-cell-sub">{r.fieldCode}</div> : !r.fieldName ? "—" : null}
                                    </div>
                                  </td>
                                  <td>
                                    <ChangeBadge type={r.changeType} />
                                  </td>
                                  <td>
                                    <ObjectCell row={r} />
                                  </td>
                                  <td className="nhp-audit-cell-sub">{r.targetLabel ?? "—"}</td>
                                  <td className="clip" style={{ color: "var(--muted)", fontSize: 11 }}>
                                    {r.afterValue ?? r.beforeValue ?? "—"}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td>
                                    <span className="nhp-audit-badge" style={{ background: "#EEF2F7", color: "var(--slate)" }}>
                                      {entityLabel(r.entity ?? "")}
                                    </span>
                                  </td>
                                  <td>
                                    <ObjectCell row={r} />
                                  </td>
                                  <td>
                                    <ChangeBadge type={r.changeType} />
                                  </td>
                                </>
                              )}
                              <td style={{ color: "var(--muted)", fontSize: 11 }}>
                                {r.operatorName ?? r.operator ?? r.operatorId ?? "—"}
                              </td>
                              <td style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                                {r.createdAt ? formatDateTimeAsiaShanghaiShort(r.createdAt) : "—"}
                              </td>
                            </tr>
                            {expanded ? <AuditDetailRow colSpan={colSpan} before={before} after={after} /> : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {total > 0 ? (
                <div className="nhp-audit-pager">
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={page <= 1}
                    onClick={() => applyFilters({ page: page - 1 })}
                  >
                    上一页
                  </button>
                  <span>
                    第 {page} / {pageCount} 页
                  </span>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={page >= pageCount}
                    onClick={() => applyFilters({ page: page + 1 })}
                  >
                    下一页
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </CageFormPageShell>
  );
}
