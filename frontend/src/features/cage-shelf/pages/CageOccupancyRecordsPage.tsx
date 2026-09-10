/**
 * 笼位留痕 — 变更记录页。
 *
 * 与「笼架信息 → 记录模式」弹窗读同一套留痕（cage_form_audit_log），只是换了切面：
 *   弹窗 = 按笼位（一个笼位的完整更替叙事）
 *   本页 = 全部 / 按人员（此人占用过的笼位发生过什么）/ 按操作人（此人做过什么）
 *
 * 落库是字段级的，但展示按「一次操作」聚合（同笼位 + 同类型 + 同一秒），行内点开看该次操作的字段明细——
 * 否则全表 10 万条字段碎片铺到页面上没有任何可读性。全表 99.9% 是 ARO 同步写入，另有「来源」分层。
 *
 * 布局对齐 animal-order-review 的表格模式：筛选条与分页抽到滚动区之外，表格容器自己滚，表头吸顶。
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { CageFormPageShell } from "../components/CageFormPageShell";
import { appPrompt } from "@/lib/appDialog";
import {
  fetchCageAuditOperations,
  type CageAuditOperation,
  type CageAuditOperationPage,
} from "../api/cageFormAudit.api";
import {
  fetchCageOpPending,
  reviewCageOp,
  searchPersonnelByKeyword,
  type CageOpRequestView,
} from "@/api/domains/cageShelf.api";

/** 审计 change_type → 中文。与 CageFormAuditService 的 IN_TYPES / OUT_TYPES 对应。 */
const CHANGE_TYPE_LABELS: Record<string, string> = {
  UPDATE: "字段修改",
  TRANSFER: "转移笼位",
  TRANSFER_OUT: "转出到其他笼位",
  COPY: "复制占用",
  DIVIDE: "分笼",
  INHERIT: "分笼继承",
  BIND: "绑定笼盒",
  UNBIND: "解绑笼盒",
  ARCHIVE: "归档",
  EXIT: "退出",
  UNALLOCATE: "取消分配",
};

const OP_TYPE_LABELS: Record<string, string> = {
  divide: "分笼",
  transfer: "转移笼位",
};

const PAGE_SIZE = 20;

/** 维度：all=全部（默认）/ person=按人员（占用者）/ operator=按操作人 */
type View = "all" | "person" | "operator";
/** 来源：''=全部 / manual=仅人工 / system=仅 ARO 同步 */
type SourceKind = "" | "manual" | "system";

const VIEW_OPTIONS: Array<{ key: View; label: string }> = [
  { key: "all", label: "全部" },
  { key: "person", label: "按人员" },
  { key: "operator", label: "按操作人" },
];

const SOURCE_OPTIONS: Array<{ key: SourceKind; label: string }> = [
  { key: "manual", label: "仅人工操作" },
  { key: "", label: "含系统同步" },
  { key: "system", label: "仅系统同步" },
];

type Person = { id: number; name: string; accountId: string };

function formatTime(v?: string | null): string {
  return v ? v.replace("T", " ").substring(0, 19) : "-";
}

/** 审计落库的布尔是字面量；其余值写库时已是可读文本。 */
function show(v?: string | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v === "true") return "是";
  if (v === "false") return "否";
  return v;
}

function targetPosition(r: CageOpRequestView): string {
  if (r.positionX == null || r.positionY == null) return "-";
  return `${String.fromCharCode(64 + r.positionX)}-${r.positionY}`;
}

/** 聚合键：与后端 (target_id, change_type, created_at) 同构，用于行展开状态。 */
const opKey = (o: { targetId?: number | null; changeType: string; createdAt?: string }) =>
  `${o.targetId ?? ""}|${o.changeType}|${o.createdAt ?? ""}`;

const inputCls =
  "h-8 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]";
const thCls = "px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap";
const tdCls = "px-3 py-2 text-[12px] align-top";
const mutedCls = "text-[var(--app-color-text-tertiary)]";

/** 表格容器自己滚：吸顶表头靠 .twin-table thead th 的 position:sticky 贴在这个容器顶部。 */
const tableWrapCls =
  "flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "bg-[var(--app-color-accent)] text-white"
          : "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

/** 滚动区内的空态/加载态：撑满剩余高度居中。 */
function Placeholder({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className={`flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-[var(--app-color-border-default)] text-[13px] ${
        danger ? "text-red-500" : mutedCls
      }`}
    >
      {children}
    </div>
  );
}

/** 旧值 → 新值；占位「（空）」不加删除线，横杠划掉占位符是视觉噪声。 */
function Diff({ before, after }: { before?: string | null; after?: string | null }) {
  const b = show(before);
  const a = show(after);
  return (
    <span className="break-all">
      <span className={b === null ? mutedCls : `${mutedCls} line-through decoration-1`}>{b ?? "（空）"}</span>
      <span className={`mx-1.5 ${mutedCls}`}>→</span>
      <span className="font-medium">{a ?? "（清空）"}</span>
    </span>
  );
}

/**
 * 人员筛选：输入即防抖搜索、下拉点选、可清除。
 * 取代原先「输入 → 点搜索 → 再点候选按钮」三步，且选中的人在维度切换时保留。
 */
function PersonFilter({ value, onPick }: { value: Person | null; onPick: (p: Person | null) => void }) {
  const [kw, setKw] = useState("");
  const [rows, setRows] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = kw.trim();
    if (!k) {
      setRows([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchPersonnelByKeyword(k);
        if (!cancelled) {
          setRows(r);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [kw]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (value) {
    return (
      <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--app-color-accent)] bg-[var(--app-color-surface-container)] pl-2.5 pr-1.5 text-[13px]">
        {value.name}
        <button
          type="button"
          title="清除"
          onClick={() => {
            onPick(null);
            setKw("");
          }}
          className={`rounded px-1 text-[14px] leading-none ${mutedCls} hover:text-[var(--app-color-text-primary)]`}
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
      <input
        className={`${inputCls} w-56`}
        placeholder="搜索人员姓名或工号"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
        onFocus={() => rows.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="absolute left-0 top-9 z-30 max-h-64 w-72 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] py-1 shadow-lg">
          {loading && rows.length === 0 && <div className={`px-3 py-2 text-[12px] ${mutedCls}`}>搜索中…</div>}
          {!loading && rows.length === 0 && <div className={`px-3 py-2 text-[12px] ${mutedCls}`}>无匹配人员</div>}
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
            >
              <span className="truncate">{p.name}</span>
              <span className={`shrink-0 font-mono text-[11px] ${mutedCls}`}>{p.accountId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CageOccupancyRecordsPage() {
  const [tab, setTab] = useState<"records" | "pending">("records");

  // ── 变更记录 ──
  const [view, setView] = useState<View>("all");
  const [person, setPerson] = useState<Person | null>(null);
  const [source, setSource] = useState<SourceKind>("manual");
  const [changeType, setChangeType] = useState("");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<CageAuditOperationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /** 「全部」不需要主体；按人员用 personnel.id，按操作人用 STAFF_ 账号标识（与审计 operator_id 同源）。 */
  const needPerson = view !== "all";
  /** 来源分层只在「全部」下有意义：按人员/按操作人已经把人定死了。 */
  const showSource = view === "all";

  const load = useCallback(async () => {
    if (needPerson && !person) {
      setRecords(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setRecords(
        await fetchCageAuditOperations({
          category: "data",
          changeType: changeType || undefined,
          ...(view === "person" ? { personId: person!.id } : {}),
          ...(view === "operator" ? { operatorId: person!.accountId } : {}),
          ...(showSource && source ? { operatorKind: source } : {}),
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (e) {
      setRecords(null);
      setError(e instanceof Error ? e.message : "加载留痕失败");
    } finally {
      setLoading(false);
    }
  }, [view, needPerson, person, showSource, source, changeType, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [view, person, source, changeType]);

  // ── 待审核 ──
  const [pending, setPending] = useState<CageOpRequestView[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      setPending(await fetchCageOpPending());
    } catch (e) {
      setPending([]);
      toast.error(e instanceof Error ? e.message : "加载待审列表失败");
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "pending") void loadPending();
  }, [tab, loadPending]);

  const decide = async (r: CageOpRequestView, decision: "approved" | "rejected") => {
    let reason: string | null = null;
    if (decision === "rejected") {
      reason = await appPrompt("驳回理由", "", { placeholder: "请填写驳回理由", allowEmpty: false });
      if (reason == null || !reason.trim()) {
        if (reason != null) toast.error("驳回必须填写理由");
        return;
      }
    }
    setReviewingId(r.id);
    try {
      await reviewCageOp(r.id, decision, reason?.trim());
      toast.success(decision === "approved" ? "已通过并执行" : "已驳回");
      await loadPending();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "审批失败");
    } finally {
      setReviewingId(null);
    }
  };

  const items = records?.items ?? [];
  const total = records?.total ?? 0;
  const currentPage = records?.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allExpanded = useMemo(
    () => items.length > 0 && items.every((o) => expanded.has(opKey(o))),
    [items, expanded],
  );

  const toggleOne = (o: CageAuditOperation) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      const k = opKey(o);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(items.map((o) => opKey(o))));

  return (
    <CageFormPageShell
      backTo="/admin/cage-shelves"
      toolbar={
        <>
          <TabButton active={tab === "records"} onClick={() => setTab("records")}>
            变更记录
          </TabButton>
          <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
            待审核{pending.length > 0 && tab === "pending" ? `（${pending.length}）` : ""}
          </TabButton>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "records" ? (
          <>
            {/* 筛选条：不参与滚动，滚动表格时始终可见 */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
              <div className="flex items-center gap-1">
                {VIEW_OPTIONS.map((o) => (
                  <TabButton key={o.key} active={view === o.key} onClick={() => setView(o.key)}>
                    {o.label}
                  </TabButton>
                ))}
              </div>

              {needPerson && <PersonFilter value={person} onPick={setPerson} />}

              <select
                className={`${inputCls} w-36`}
                value={changeType}
                onChange={(e) => setChangeType(e.target.value)}
              >
                <option value="">全部操作类型</option>
                {Object.entries(CHANGE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              {showSource && (
                <select
                  className={`${inputCls} w-36`}
                  value={source}
                  onChange={(e) => setSource(e.target.value as SourceKind)}
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}

              <div className="min-w-0 flex-1" />

              {!loading && !error && !(needPerson && !person) && (
                <>
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={items.length === 0}
                    className={`shrink-0 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-40 ${mutedCls}`}
                  >
                    {allExpanded ? "收起全部" : "展开全部"}
                  </button>
                  <span className={`shrink-0 text-[12px] ${mutedCls}`}>共 {total} 次操作</span>
                </>
              )}
            </div>

            {/* 表格：容器自己滚，表头吸顶、横向滚动条常驻容器底部 */}
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
              {needPerson && !person ? (
                <Placeholder>搜索并选择人员后查看其留痕</Placeholder>
              ) : loading ? (
                <Placeholder>加载中…</Placeholder>
              ) : error ? (
                <Placeholder danger>{error}</Placeholder>
              ) : items.length === 0 ? (
                <Placeholder>暂无变更记录</Placeholder>
              ) : (
                <div className={tableWrapCls}>
                  <table className="twin-table w-max min-w-full border-collapse text-left">
                    <thead>
                      <tr>
                        <th className={thCls}>时间</th>
                        <th className={thCls}>笼位</th>
                        <th className={thCls}>操作</th>
                        <th className={thCls}>字段</th>
                        <th className={thCls}>操作人</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((o) => {
                        const k = opKey(o);
                        const open = expanded.has(k);
                        return (
                          <Fragment key={k}>
                            <tr
                              onClick={() => toggleOne(o)}
                              className="cursor-pointer"
                              aria-expanded={open}
                            >
                              <td className={`${tdCls} whitespace-nowrap ${mutedCls}`}>
                                <span className="mr-1.5 inline-block w-2 text-[10px]">{open ? "▾" : "▸"}</span>
                                {formatTime(o.createdAt)}
                              </td>
                              <td className={`${tdCls} whitespace-nowrap`}>
                                {o.cageLabel || (o.targetId != null ? `笼位 ${o.targetId}` : "-")}
                              </td>
                              <td className={`${tdCls} whitespace-nowrap`}>
                                {CHANGE_TYPE_LABELS[o.changeType] ?? o.changeType}
                              </td>
                              <td className={`${tdCls} whitespace-nowrap`}>{o.fieldCount} 项</td>
                              <td className={`${tdCls} whitespace-nowrap`}>{o.operator || "-"}</td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={5} className="p-0">
                                  <div className="border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-3 py-2">
                                    <table className="w-full border-collapse text-left">
                                      <thead>
                                        <tr>
                                          <th className="w-40 px-2 py-1 text-[11px] font-medium text-[var(--app-color-text-tertiary)]">
                                            字段
                                          </th>
                                          <th className="px-2 py-1 text-[11px] font-medium text-[var(--app-color-text-tertiary)]">
                                            变更
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {o.changes.map((c, i) => (
                                          <tr key={i}>
                                            <td className="px-2 py-1 text-[12px] text-[var(--app-color-text-secondary)]">
                                              {c.label || c.canonical || "—"}
                                            </td>
                                            <td className="px-2 py-1 text-[12px]">
                                              <Diff before={c.before} after={c.after} />
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 分页：同样抽在滚动区之外 */}
            {total > 0 && (
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--app-color-border-default)] px-3 py-2 text-[12px]">
                <span className={mutedCls}>
                  第 {currentPage} / {totalPages} 页
                </span>
                <AdminButton
                  tone="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </AdminButton>
                <AdminButton
                  tone="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </AdminButton>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
            {pendingLoading ? (
              <Placeholder>加载中…</Placeholder>
            ) : pending.length === 0 ? (
              <Placeholder>暂无待审核的分笼/转移请求</Placeholder>
            ) : (
              <div className={tableWrapCls}>
                <table className="twin-table w-max min-w-full border-collapse text-left">
                  <thead>
                    <tr>
                      <th className={thCls}>提交时间</th>
                      <th className={thCls}>类型</th>
                      <th className={thCls}>源笼位</th>
                      <th className={thCls}>目标笼位</th>
                      <th className={thCls}>申请人</th>
                      <th className={thCls}>原因</th>
                      <th className={thCls}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.id}>
                        <td className={`${tdCls} whitespace-nowrap ${mutedCls}`}>{formatTime(r.createdAt)}</td>
                        <td className={`${tdCls} whitespace-nowrap`}>
                          {OP_TYPE_LABELS[r.opType] ?? r.opType}
                          {r.opType === "divide" && r.keepSource ? "（保留源笼位）" : ""}
                        </td>
                        <td className={tdCls}>
                          {[r.roomName, r.shelveName, targetPosition(r)].filter(Boolean).join("/") ||
                            (r.sourceAnimalCageId ? `笼位 ${r.sourceAnimalCageId}` : "-")}
                        </td>
                        <td className={tdCls}>
                          {r.targetAnimalCageIds.map((id) => `#${id}`).join("、") || "-"}
                        </td>
                        <td className={tdCls}>{r.applicantName || "-"}</td>
                        <td className={`${tdCls} max-w-[220px]`}>{r.reason || "-"}</td>
                        <td className={`${tdCls} whitespace-nowrap`}>
                          <div className="flex gap-2">
                            <AdminButton
                              tone="primary"
                              loading={reviewingId === r.id}
                              onClick={() => void decide(r, "approved")}
                            >
                              通过
                            </AdminButton>
                            <AdminButton
                              tone="destructive"
                              disabled={reviewingId === r.id}
                              onClick={() => void decide(r, "rejected")}
                            >
                              驳回
                            </AdminButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </CageFormPageShell>
  );
}
