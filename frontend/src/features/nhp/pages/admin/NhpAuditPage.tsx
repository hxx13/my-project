/**
 * NHP 审计页（单页双 tab，对齐 06 §100 / 24 §3.9）。
 *
 * 数据变更审计 + 字典变更审计；顶栏分类/筛选/搜索 + 紧凑扁平表格。
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  fetchNhpDataAuditLog,
  fetchNhpDictChangeLog,
  type NhpDataAuditEntry,
  type NhpDictChangeLogEntry,
} from "../../api/nhpAudit.api";
import NhpUserRefLabel from "../../components/NhpUserRefLabel";
import "@/features/aup/aup.css";
import "../../nhp.css";

type Tab = "data" | "dict";
const PAGE_SIZE = 50;

const DATA_CHANGE_TYPES = ["INSERT", "UPDATE", "DELETE"];
const DICT_CHANGE_TYPES = ["CREATE", "UPDATE", "FREEZE", "RETIRE"];
const DICT_ENTITY_TYPES = [
  { value: "field", label: "字段" },
  { value: "codelist", label: "码表" },
  { value: "form", label: "模板" },
];

type Filters = {
  keyword: string;
  changeType: string;
  operatorId: string;
  subjectType: string;
  dateFrom: string;
  dateTo: string;
  formKey: string;
  entityType: string;
  page: number;
};

const defaultFilters = (): Filters => ({
  keyword: "",
  changeType: "",
  operatorId: "",
  subjectType: "",
  dateFrom: "",
  dateTo: "",
  formKey: "",
  entityType: "",
  page: 1,
});

function changeTypeTone(t: string): { bg: string; color: string } {
  switch (t.toUpperCase()) {
    case "INSERT":
    case "CREATE":
      return { bg: "var(--primary-weak)", color: "var(--primary)" };
    case "UPDATE":
      return { bg: "var(--warn-weak)", color: "var(--warn)" };
    case "DELETE":
      return { bg: "var(--danger-weak)", color: "var(--danger)" };
    case "FREEZE":
    case "RETIRE":
      return { bg: "#EEF2F7", color: "var(--slate)" };
    default:
      return { bg: "#EEF2F7", color: "var(--slate)" };
  }
}

function entityLabel(entity: string): string {
  return (DICT_ENTITY_TYPES.find((e) => e.value === entity)?.label ?? entity) || "—";
}

function hasActiveFilters(f: Filters, tab: Tab): boolean {
  return !!(
    f.keyword.trim() ||
    f.changeType ||
    f.operatorId.trim() ||
    f.dateFrom ||
    f.dateTo ||
    (tab === "data" && (f.formKey || f.subjectType)) ||
    (tab === "dict" && f.entityType)
  );
}

function FieldCell({ row }: { row: NhpDataAuditEntry }) {
  const name = row.fieldName?.trim();
  const code = row.fieldCode?.trim();
  return (
    <div>
      {name ? <div className="nhp-audit-cell-name">{name}</div> : null}
      {code ? <div className="nhp-audit-cell-sub">{code}</div> : !name ? "—" : null}
    </div>
  );
}

function DictObjectCell({ row }: { row: NhpDictChangeLogEntry }) {
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
  return <span className="nhp-audit-cell-sub">#{row.entityId ?? "—"}</span>;
}

function ChangeBadge({ type }: { type: string }) {
  const tone = changeTypeTone(type);
  return (
    <span className="nhp-audit-badge" style={{ background: tone.bg, color: tone.color }}>
      {type}
    </span>
  );
}

function AuditDetailRow({ colSpan, before, after }: { colSpan: number; before?: string | null; after?: string | null }) {
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

export default function NhpAuditPage() {
  const goBack = useGoBack("/content-manager/nhp-template");
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

  const dataQuery = useQuery({
    queryKey: ["nhp", "data-audit-log", filters],
    queryFn: () =>
      fetchNhpDataAuditLog({
        formKey: filters.formKey || undefined,
        keyword: filters.keyword.trim() || undefined,
        changeType: filters.changeType || undefined,
        operatorId: filters.operatorId.trim() || undefined,
        subjectType: filters.subjectType || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59` : undefined,
        page: filters.page,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === "data",
  });

  const dictQuery = useQuery({
    queryKey: ["nhp", "dict-change-log", filters],
    queryFn: () =>
      fetchNhpDictChangeLog({
        entityType: filters.entityType || undefined,
        keyword: filters.keyword.trim() || undefined,
        changeType: filters.changeType || undefined,
        operatorId: filters.operatorId.trim() || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59` : undefined,
        page: filters.page,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === "dict",
  });

  const activeQuery = tab === "data" ? dataQuery : dictQuery;
  const dataResult = dataQuery.data;
  const dictResult = dictQuery.data;
  const items = tab === "data" ? (dataResult?.items ?? []) : (dictResult?.items ?? []);
  const total = tab === "data" ? (dataResult?.total ?? 0) : (dictResult?.total ?? 0);
  const page = tab === "data" ? (dataResult?.page ?? 1) : (dictResult?.page ?? 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formSummaries = dataResult?.formSummaries ?? [];
  const entitySummaries = dictResult?.entitySummaries ?? [];
  const dataTotalAll = useMemo(
    () => formSummaries.reduce((sum, s) => sum + (s.count ?? 0), 0),
    [formSummaries],
  );
  const dictTotalAll = useMemo(
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
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>审计</h1>
            <div className="sub">数据变更 + 字典变更 · 全字段级留痕 ALCOA+</div>
          </div>
        </div>

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

              {tab === "data" ? (
                <div className="nhp-audit-cat-scroll">
                  <button
                    type="button"
                    className={`nhp-audit-cat-btn${filters.formKey ? "" : " on"}`}
                    onClick={() => applyFilters({ formKey: "" })}
                  >
                    全部<span className="cnt">{dataTotalAll}</span>
                  </button>
                  {formSummaries.map((f) => {
                    const key = f.formKey || String(f.formId);
                    const on = filters.formKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`nhp-audit-cat-btn${on ? " on" : ""}`}
                        onClick={() => applyFilters({ formKey: key })}
                        title={f.formKey}
                      >
                        {f.formTitle || f.formKey || `#${f.formId}`}
                        <span className="cnt">{f.count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="nhp-audit-cat-scroll">
                  <button
                    type="button"
                    className={`nhp-audit-cat-btn${filters.entityType ? "" : " on"}`}
                    onClick={() => applyFilters({ entityType: "" })}
                  >
                    全部<span className="cnt">{dictTotalAll}</span>
                  </button>
                  {entitySummaries.map((e) => (
                    <button
                      key={e.entity}
                      type="button"
                      className={`nhp-audit-cat-btn${filters.entityType === e.entity ? " on" : ""}`}
                      onClick={() => applyFilters({ entityType: e.entity })}
                    >
                      {e.label || entityLabel(e.entity)}
                      <span className="cnt">{e.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="nhp-audit-toolbar-row">
              <input
                className="nhp-audit-search"
                placeholder={tab === "data" ? "搜索字段/对象/操作人/表单…" : "搜索实体名/编码/操作人…"}
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
              {tab === "data" ? (
                <input
                  className="nhp-audit-filter"
                  style={{ width: 90 }}
                  placeholder="对象类型"
                  value={filters.subjectType}
                  onChange={(e) => applyFilters({ subjectType: e.target.value })}
                />
              ) : null}
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
                {hasActiveFilters(filters, tab) ? "（已筛选）" : ""}
              </span>
              {hasActiveFilters(filters, tab) ? (
                <button type="button" className="btn ghost small" onClick={clearFilters}>
                  清除筛选
                </button>
              ) : null}
              {activeQuery.isFetching ? <span>加载中…</span> : null}
            </div>
          </div>

          <div className="nhp-audit-panel">
            <div className="nhp-audit-table-wrap">
              {tab === "data" ? (
                <table className="aup-wb-table aup-wb-table--dense">
                  <thead>
                    <tr>
                      <th style={{ width: "14%" }}>字段</th>
                      <th style={{ width: "12%" }}>表单</th>
                      <th style={{ width: 72 }}>操作</th>
                      <th style={{ width: "14%" }}>对象</th>
                      <th style={{ width: 56 }}>实例</th>
                      <th style={{ width: "10%" }}>变更</th>
                      <th style={{ width: 80 }}>操作人</th>
                      <th style={{ width: 100 }}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataQuery.isError ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          加载失败，请刷新重试
                        </td>
                      </tr>
                    ) : dataQuery.isLoading ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          加载审计…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          暂无匹配记录
                        </td>
                      </tr>
                    ) : (
                      (items as NhpDataAuditEntry[]).map((r) => {
                        const expanded = expandedId === r.id;
                        return (
                          <Fragment key={r.id}>
                            <tr
                              className={`nhp-audit-row${expanded ? " expanded" : ""}`}
                              onClick={() => setExpandedId(expanded ? null : r.id)}
                            >
                              <td>
                                <FieldCell row={r} />
                              </td>
                              <td>
                                {r.formTitle ? (
                                  <div>
                                    <div className="nhp-audit-cell-name clip">{r.formTitle}</div>
                                    {r.formKey ? <div className="nhp-audit-cell-sub">{r.formKey}</div> : null}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                <ChangeBadge type={r.changeType} />
                              </td>
                              <td>
                                {r.subjectCode ? (
                                  <div>
                                    <div className="nhp-audit-cell-name">{r.subjectCode}</div>
                                    {r.subjectType ? <div className="nhp-audit-cell-sub">{r.subjectType}</div> : null}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {r.recordId != null ? (
                                  <Link
                                    to={`/content-manager/nhp-entry/${r.recordId}`}
                                    className="nhp-audit-cell-sub"
                                    style={{ color: "var(--primary)", fontWeight: 600 }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    #{r.recordId}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="clip" style={{ color: "var(--muted)", fontSize: 11 }}>
                                {r.afterValue ?? r.beforeValue ?? "—"}
                              </td>
                              <td style={{ color: "var(--muted)", fontSize: 11 }}>
                                <NhpUserRefLabel name={r.operatorName ?? r.operator} userId={r.operatorId} inline />
                                {!r.operatorName && !r.operator && !r.operatorId ? "—" : null}
                              </td>
                              <td style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                                {r.createdAt ? formatDateTimeAsiaShanghaiShort(r.createdAt) : "—"}
                              </td>
                            </tr>
                            {expanded ? (
                              <AuditDetailRow colSpan={8} before={r.beforeValue} after={r.afterValue} />
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="aup-wb-table aup-wb-table--dense">
                  <thead>
                    <tr>
                      <th style={{ width: "16%" }}>实体</th>
                      <th style={{ width: "18%" }}>对象</th>
                      <th style={{ width: 72 }}>操作</th>
                      <th style={{ width: 80 }}>操作人</th>
                      <th style={{ width: 100 }}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dictQuery.isError ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          加载失败，请刷新重试
                        </td>
                      </tr>
                    ) : dictQuery.isLoading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          加载审计…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                          暂无匹配记录
                        </td>
                      </tr>
                    ) : (
                      (items as NhpDictChangeLogEntry[]).map((r) => {
                        const expanded = expandedId === r.id;
                        return (
                          <Fragment key={r.id}>
                            <tr
                              className={`nhp-audit-row${expanded ? " expanded" : ""}`}
                              onClick={() => setExpandedId(expanded ? null : r.id)}
                            >
                              <td>
                                <span className="nhp-audit-badge" style={{ background: "#EEF2F7", color: "var(--slate)" }}>
                                  {entityLabel(r.entity)}
                                </span>
                              </td>
                              <td>
                                <DictObjectCell row={r} />
                              </td>
                              <td>
                                <ChangeBadge type={r.changeType} />
                              </td>
                              <td style={{ color: "var(--muted)", fontSize: 11 }}>
                                <NhpUserRefLabel name={r.operatorName ?? r.operator} userId={r.operatorId} inline />
                                {!r.operatorName && !r.operator && !r.operatorId ? "—" : null}
                              </td>
                              <td style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                                {r.createdAt ? formatDateTimeAsiaShanghaiShort(r.createdAt) : "—"}
                              </td>
                            </tr>
                            {expanded ? (
                              <AuditDetailRow colSpan={5} before={r.beforeJson} after={r.afterJson} />
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
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
  );
}
