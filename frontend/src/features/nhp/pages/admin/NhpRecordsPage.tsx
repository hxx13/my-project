/**
 * NHP 填写实例管理（后台）：审阅 / 续填 / 删除；运维可建实例。
 * 实验者一线开填入口在门户 /#/nhp/fill（先选动物）。
 * 入口：/#/content-manager/nhp-records
 * 深链：?create=1&formKey=…&subjectId=…&mode=open（create 为管理端建实例）
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  createNhpRecord,
  deleteNhpRecord,
  fetchNhpRecords,
  fetchNhpSubjects,
  type NhpRecord,
  type NhpRecordListItem,
  type NhpSubject,
} from "../../api/nhpRecord.api";
import { fetchNhpTemplates, fillableFormId, isFillablePublished, type NhpTemplateListItem } from "../../api/nhpTemplate.api";
import { animalTypeLabel } from "../../utils/nhpSubjectLabels";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

type ViewMode = "card" | "list";
type StatusFilter = "ALL" | "DRAFT" | "COMPLETE" | "LOCKED";
type EntryMode = "list" | "create" | "open";

function statusChip(status: string): { text: string; bg: string; color: string } {
  const s = status.toUpperCase();
  if (s === "LOCKED") return { text: "LOCKED", bg: "#e8f7ee", color: "#16a34a" };
  if (s === "COMPLETE") return { text: "COMPLETE", bg: "#fdf3e3", color: "#d97706" };
  return { text: status || "DRAFT", bg: "#eef2ff", color: "#002FA7" };
}

function isUsableFillTemplate(t: NhpTemplateListItem): boolean {
  return isFillablePublished(t);
}

function templateEditPath(formKey: string | undefined | null): string | null {
  const key = (formKey || "").trim();
  if (key) return `/content-manager/nhp-template/edit/${encodeURIComponent(key)}`;
  return null;
}

export default function NhpRecordsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack("/content-manager/nhp-hub");
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectIdParam = searchParams.get("subjectId");
  const formKeyParam = searchParams.get("formKey") || "";
  const wantCreate = searchParams.get("create") === "1";
  const wantOpen = searchParams.get("mode") === "open";
  const filterSubjectId = subjectIdParam ? Number(subjectIdParam) : undefined;
  const canDelete = hasMinRole(authStorage.getRole(), "ADMIN");

  const [view, setView] = useState<ViewMode>("card");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<NhpRecordListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>(wantCreate ? "create" : wantOpen ? "open" : "list");
  const [subjects, setSubjects] = useState<NhpSubject[]>([]);
  const [templates, setTemplates] = useState<NhpTemplateListItem[]>([]);
  const [pickSubjectId, setPickSubjectId] = useState(filterSubjectId && filterSubjectId > 0 ? String(filterSubjectId) : "");
  const [pickFormKey, setPickFormKey] = useState(formKeyParam);
  const [creating, setCreating] = useState(false);
  const size = 20;

  useEffect(() => {
    if (wantCreate) setEntryMode("create");
    else if (wantOpen) setEntryMode("open");
    if (filterSubjectId && filterSubjectId > 0) setPickSubjectId(String(filterSubjectId));
    if (formKeyParam) setPickFormKey(formKeyParam);
  }, [wantCreate, wantOpen, filterSubjectId, formKeyParam]);

  useEffect(() => {
    void Promise.all([
      fetchNhpSubjects({ page: 1, size: 100 }).then((r) => setSubjects(r.items ?? [])),
      Promise.all([
        fetchNhpTemplates("COMPOSITE").catch(() => [] as NhpTemplateListItem[]),
        fetchNhpTemplates("ATOM").catch(() => [] as NhpTemplateListItem[]),
      ]).then(([composites, atoms]) => {
        const usable = [...composites, ...atoms]
          .filter(isUsableFillTemplate)
          .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
        setTemplates(usable);
        setPickFormKey((prev) => {
          if (prev && usable.some((t) => t.formKey === prev)) return prev;
          if (formKeyParam && usable.some((t) => t.formKey === formKeyParam)) return formKeyParam;
          return usable[0]?.formKey ?? "";
        });
      }),
    ]).catch((e: Error) => toast.error(e.message || "加载新建选项失败"));
  }, [formKeyParam]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetchNhpRecords({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        subjectId: filterSubjectId && filterSubjectId > 0 ? filterSubjectId : undefined,
        q: qApplied || undefined,
        page,
        size,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast.error((e as Error).message || "加载实例失败");
      setItems([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }, [statusFilter, qApplied, page, filterSubjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = () => {
    setPage(1);
    setQApplied(q.trim());
  };

  const clearSubjectFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("subjectId");
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const onCreateRecord = async () => {
    const sid = Number(pickSubjectId);
    const tpl = templates.find((t) => t.formKey === pickFormKey);
    const formId = tpl ? fillableFormId(tpl) : undefined;
    if (!sid || formId == null) {
      toast.error("请选择动物与已发布原子/组合模板");
      return;
    }
    setCreating(true);
    try {
      const r = await createNhpRecord(sid, formId);
      toast.success(`已创建实例 #${r.id}`);
      navigate(`/content-manager/nhp-entry/${r.id}`, { state: nhpNavState(location) });
    } catch (e) {
      toast.error((e as Error).message || "创建实例失败");
    } finally {
      setCreating(false);
    }
  };

  const onDeleteRecord = async (r: NhpRecord) => {
    if (!canDelete) return;
    const ok = await appConfirm(
      `确定删除填写实例 #${r.id}？\n将软删除（状态→DELETED），字段值与审计保留可追溯。`,
    );
    if (!ok) return;
    try {
      await deleteNhpRecord(r.id);
      toast.success(`已删除实例 #${r.id}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  const filterSubjectLabel = useMemo(() => {
    if (!filterSubjectId) return null;
    const s = subjects.find((x) => x.id === filterSubjectId);
    return s?.subjectCode ?? `#${filterSubjectId}`;
  }, [filterSubjectId, subjects]);

  const totalPages = Math.max(1, Math.ceil(total / size));

  const segBtn = (on: boolean) => ({
    padding: "6px 12px",
    fontSize: 12,
    border: "none",
    cursor: "pointer" as const,
    background: on ? "var(--primary-weak)" : "transparent",
    color: on ? "var(--primary)" : "var(--slate)",
    fontWeight: on ? 600 : 500,
  });

  const portalCreateHref = pickFormKey
    ? `/nhp/fill?formKey=${encodeURIComponent(pickFormKey)}${pickSubjectId ? `&subjectId=${pickSubjectId}` : ""}`
    : "/nhp/fill";

  return (
    <div className="aup-app aup-app--full">
      <div className="aup-wb-hd" style={{ marginBottom: 16 }}>
        <div>
          <button type="button" className="btn ghost small" onClick={goBack} style={{ marginBottom: 8 }}>
            ← 返回
          </button>
          <h1>实例管理</h1>
          <div className="sub">
              后台审阅 / 删除 / 运维建实例 · 实验者请走门户「选动物 → 开填」·{" "}
            <Link to="/content-manager/nhp-hub" state={nhpNavState(location)} style={{ color: "var(--primary)" }}>
              流程引导
            </Link>
            {" · "}
            <Link to="/content-manager/nhp-template" state={nhpNavState(location)} style={{ color: "var(--primary)" }}>
              原子/组合模板
            </Link>
          </div>
        </div>
        <div className="aup-wb-actions">
          <Link to="/nhp/fill" className="btn primary small" style={{ textDecoration: "none" }}>
            门户填写入口
          </Link>
          <Link to="/content-manager/nhp-subjects" className="btn ghost small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            动物管理
          </Link>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setEntryMode((m) => (m === "create" ? "list" : "create"))}
          >
            管理端建实例
          </button>
        </div>
      </div>

      <div
        style={{
          background: "var(--primary-weak)",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: "var(--slate)",
          lineHeight: 1.65,
        }}
      >
        <b style={{ color: "var(--text)" }}>一线开填不在此页。</b>{" "}
        实验者从门户 <code>/#/nhp/fill</code> 先选动物，再选已有实例或新建。本页用于管理员查看全部实例、删除与必要时代建。
        <Link to="/nhp/fill" style={{ marginLeft: 8, color: "var(--primary)", fontWeight: 600 }}>
          打开门户填写 →
        </Link>
      </div>

      {entryMode === "create" && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>管理端建实例</span>
          <select
            className="input"
            style={{ width: 220 }}
            value={pickSubjectId}
            onChange={(e) => setPickSubjectId(e.target.value)}
          >
            <option value="">选择动物…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subjectCode} · {animalTypeLabel(s.subjectType)}
              </option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 280 }}
            value={pickFormKey}
            onChange={(e) => setPickFormKey(e.target.value)}
          >
            {templates.length === 0 && <option value="">暂无已发布原子/组合模板</option>}
            {templates.map((t) => (
              <option key={t.formKey} value={t.formKey}>
                {t.title || t.formKey} · v{t.version ?? 1}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn primary small"
            disabled={creating || !pickSubjectId || !pickFormKey}
            onClick={() => void onCreateRecord()}
          >
            {creating ? "创建中…" : "创建（进管理缓冲页）"}
          </button>
          <Link to={portalCreateHref} className="btn ghost small" style={{ textDecoration: "none" }}>
            改走门户填写
          </Link>
          <button type="button" className="btn ghost small" onClick={() => setEntryMode("list")}>
            取消
          </button>
          {subjects.length === 0 && (
            <Link to="/content-manager/nhp-entry" style={{ fontSize: 12, color: "var(--primary)" }}>
              尚无对象，前往登记 →
            </Link>
          )}
          {subjects.length > 0 && templates.length === 0 && (
            <Link to="/content-manager/nhp-template" style={{ fontSize: 12, color: "var(--primary)" }}>
              尚无已发布模板，先去发布原子或组合 →
            </Link>
          )}
        </div>
      )}

      {entryMode === "open" && (
        <div
          style={{
            background: "#fff7ed",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "var(--slate)",
          }}
        >
          在下方列表中搜索或筛选实例，点击「续填」打开管理侧缓冲页。
          <button type="button" className="btn ghost small" style={{ marginLeft: 10 }} onClick={() => setEntryMode("list")}>
            收起
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
          <button type="button" style={segBtn(view === "card")} onClick={() => setView("card")}>
            ▦ 卡片
          </button>
          <button type="button" style={segBtn(view === "list")} onClick={() => setView("list")}>
            ☰ 列表
          </button>
        </div>
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
          {(["ALL", "DRAFT", "COMPLETE", "LOCKED"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              style={segBtn(statusFilter === s)}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
            >
              {s === "ALL" ? "全部" : s === "DRAFT" ? "草稿" : s === "COMPLETE" ? "已完成" : "已锁定"}
            </button>
          ))}
        </div>
        {filterSubjectLabel && (
          <span
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--primary-weak)",
              color: "var(--primary)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            动物 {filterSubjectLabel}
            <button type="button" onClick={clearSubjectFilter} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", padding: 0 }}>
              ×
            </button>
          </span>
        )}
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="动物编号 / 实例ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
        />
        <button className="btn ghost small" disabled={busy} onClick={applySearch}>
          搜索
        </button>
        <button className="btn ghost small" disabled={busy} onClick={() => void load()}>
          刷新
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
          共 {total} 条 · 第 {page}/{totalPages} 页
        </span>
      </div>

      {busy && items.length === 0 ? (
        <div className="aup-empty">加载中…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>暂无填写实例</div>
          <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 440, margin: "0 auto 18px", lineHeight: 1.7 }}>
            请在数据采集入口登记或选择研究对象，并选用已发布原子/组合模板创建实例。
          </div>
          <Link to="/content-manager/nhp-entry" className="btn primary" style={{ textDecoration: "none", marginRight: 8 }}>
            数据采集入口
          </Link>
          <Link to="/nhp/fill" className="btn ghost" style={{ textDecoration: "none" }}>
            门户填写
          </Link>
        </div>
      ) : view === "card" ? (
        <>
          {items.map((row) => {
            const r = row.record;
            const subject = row.subject;
            const chip = statusChip(r.status);
            return (
              <RecordCard
                key={r.id}
                record={r}
                subject={subject}
                formLabel={row.formName || row.formCode || String(r.formId)}
                formKey={row.formCode}
                chip={chip}
                canDelete={canDelete}
                onDelete={() => void onDeleteRecord(r)}
              />
            );
          })}
        </>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>实例</th>
              <th>动物编号</th>
              <th>模板</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const tplPath = templateEditPath(row.formCode);
              return (
                <tr key={row.record.id} className="row">
                  <td>#{row.record.id}</td>
                  <td>{row.subject?.subjectCode ?? row.record.subjectId}</td>
                  <td>{row.formName || row.formCode || row.record.formId}</td>
                  <td>{row.record.status}</td>
                  <td style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link to={`/content-manager/nhp-entry/${row.record.id}`}>续填（管理）</Link>
                    <Link to={`/nhp/fill/${row.record.id}`}>门户打开</Link>
                    {tplPath && <Link to={tplPath}>查看模板</Link>}
                    {canDelete && (
                      <button
                        type="button"
                        className="btn ghost small"
                        style={{ color: "#b91c1c", padding: 0 }}
                        onClick={() => void onDeleteRecord(row.record)}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="btn ghost small" disabled={page <= 1 || busy} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <button className="btn ghost small" disabled={page >= totalPages || busy} onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function RecordCard({
  record: r,
  subject,
  formLabel,
  formKey,
  chip,
  canDelete,
  onDelete,
}: {
  record: NhpRecord;
  subject: NhpSubject | null;
  formLabel: string;
  formKey?: string;
  chip: { text: string; bg: string; color: string };
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const tplPath = templateEditPath(formKey);
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 15, fontWeight: 800 }}>
        <span>填写实例</span>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>#{r.id}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 999,
            background: chip.bg,
            color: chip.color,
            fontWeight: 600,
          }}
        >
          {chip.text}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, margin: "12px 0" }}>
        {[
          ["动物编号", subject?.subjectCode ?? String(r.subjectId)],
          ["类型", animalTypeLabel(subject?.subjectType)],
          ["模板", formLabel],
          ["访视", r.visitInstanceId != null ? String(r.visitInstanceId) : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{k}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid #f3f5f8", paddingTop: 12 }}>
        <Link to={`/content-manager/nhp-entry/${r.id}`} className="btn primary small" style={{ textDecoration: "none" }}>
          {(r.status || "").toUpperCase() === "LOCKED" ? "查看" : "续填（管理）"}
        </Link>
        {tplPath && (
          <Link to={tplPath} className="btn ghost small" style={{ textDecoration: "none" }}>
            查看模板
          </Link>
        )}
        <Link to={`/nhp/fill/${r.id}`} className="btn ghost small" style={{ textDecoration: "none" }}>
          门户打开
        </Link>
        {canDelete && (
          <button type="button" className="btn ghost small" style={{ color: "#b91c1c" }} onClick={onDelete}>
            删除
          </button>
        )}
      </div>
    </div>
  );
}
