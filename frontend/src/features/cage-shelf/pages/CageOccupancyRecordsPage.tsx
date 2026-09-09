/**
 * 笼位操作记录 — 留痕页。
 * 两个 tab：
 *   操作记录 — 按笼位 / 按人员两个视角追溯占用事件（转移、分笼、归档、退出…），支持事件类型筛选与分页。
 *   待审核   — 学生提交的分笼 / 转移请求，通过或驳回。
 */
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { CageFormPageShell } from "../components/CageFormPageShell";
import { appPrompt } from "@/lib/appDialog";
import {
  fetchCageOccupancyRecords,
  fetchCageOpPending,
  reviewCageOp,
  searchPersonnelByKeyword,
  type CageOccupancyRecord,
  type CageOccupancyRecordsPage as RecordsPage,
  type CageOpRequestView,
} from "@/api/domains/cageShelf.api";

const EVENT_TYPE_LABELS: Record<string, string> = {
  start: "开始占用",
  copy: "复制占用",
  transfer: "转移笼位",
  exit: "退出",
  archive: "归档",
  divide: "分笼",
};

const OP_TYPE_LABELS: Record<string, string> = {
  divide: "分笼",
  transfer: "转移笼位",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  cancelled: "已撤销",
};

const PAGE_SIZE = 20;

function formatTime(v?: string | null): string {
  return v ? v.replace("T", " ").substring(0, 19) : "-";
}

function cageLabel(id?: string | null, label?: string | null): string {
  if (!id) return "-";
  return label ? `${label} · #${id}` : `#${id}`;
}

function targetPosition(r: CageOpRequestView): string {
  if (r.positionX == null || r.positionY == null) return "-";
  return `${String.fromCharCode(64 + r.positionX)}-${r.positionY}`;
}

const inputCls =
  "h-8 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]";
const thCls = "px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap";
const tdCls = "px-3 py-2 text-[12px] align-top";
const mutedCls = "text-[var(--app-color-text-tertiary)]";

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

export default function CageOccupancyRecordsPage() {
  const [tab, setTab] = useState<"records" | "pending">("records");

  // ── 操作记录 ──
  const [view, setView] = useState<"cage" | "person">("person");
  const [cageId, setCageId] = useState("");
  const [kw, setKw] = useState("");
  const [persons, setPersons] = useState<Array<{ id: number; name: string }>>([]);
  const [personSearching, setPersonSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null);
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<RecordsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<CageOccupancyRecord | null>(null);

  const targetId = view === "cage" ? cageId.trim() : selectedPerson?.id;

  const load = useCallback(async () => {
    if (targetId == null || targetId === "") {
      setRecords(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setRecords(
        await fetchCageOccupancyRecords(view, targetId, {
          eventType: eventType || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (e) {
      setRecords(null);
      setError(e instanceof Error ? e.message : "加载记录失败");
    } finally {
      setLoading(false);
    }
  }, [view, targetId, eventType, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [view, targetId, eventType]);

  const searchPerson = async () => {
    const keyword = kw.trim();
    if (!keyword) {
      toast.error("请输入人员姓名或工号");
      return;
    }
    setPersonSearching(true);
    try {
      setPersons(await searchPersonnelByKeyword(keyword));
    } catch (e) {
      setPersons([]);
      toast.error(e instanceof Error ? e.message : "搜索人员失败");
    } finally {
      setPersonSearching(false);
    }
  };

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

  const totalPages = records ? Math.max(1, Math.ceil(records.total / PAGE_SIZE)) : 1;

  return (
    <CageFormPageShell
      backTo="/admin/cage-shelves"
      toolbar={
        <>
          <TabButton active={tab === "records"} onClick={() => setTab("records")}>
            操作记录
          </TabButton>
          <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
            待审核{pending.length > 0 && tab === "pending" ? `（${pending.length}）` : ""}
          </TabButton>
        </>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-3">
        {tab === "records" ? (
          <>
            {/* 查询条件 */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <TabButton
                  active={view === "person"}
                  onClick={() => setView("person")}
                >
                  按人员
                </TabButton>
                <TabButton active={view === "cage"} onClick={() => setView("cage")}>
                  按笼位
                </TabButton>
              </div>

              {view === "person" ? (
                <>
                  <input
                    className={`${inputCls} w-56`}
                    placeholder="人员姓名或工号"
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void searchPerson()}
                  />
                  <AdminButton tone="secondary" onClick={() => void searchPerson()} loading={personSearching}>
                    搜索
                  </AdminButton>
                  {selectedPerson && (
                    <span className="text-[12px] text-[var(--app-color-text-secondary)]">
                      已选：<b>{selectedPerson.name}</b>
                    </span>
                  )}
                </>
              ) : (
                <input
                  className={`${inputCls} w-56`}
                  placeholder="笼位 ID（animal_cage_id）"
                  value={cageId}
                  onChange={(e) => setCageId(e.target.value.replace(/[^\d]/g, ""))}
                />
              )}

              <select
                className={`${inputCls} w-36`}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="">全部事件</option>
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {view === "person" && persons.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {persons.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPerson(p);
                      setPersons([]);
                    }}
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition ${
                      selectedPerson?.id === p.id
                        ? "border-[var(--app-color-accent)] bg-[var(--app-color-surface-hover)]"
                        : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] hover:bg-[var(--app-color-surface-hover)]"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* 结果 */}
            {targetId == null || targetId === "" ? (
              <div className={`py-12 text-center text-[13px] ${mutedCls}`}>
                {view === "person" ? "搜索并选择人员后查看记录" : "输入笼位 ID 后查看记录"}
              </div>
            ) : loading ? (
              <div className={`py-12 text-center text-[13px] ${mutedCls}`}>加载中…</div>
            ) : error ? (
              <div className="py-12 text-center text-[13px] text-red-500">{error}</div>
            ) : !records || records.list.length === 0 ? (
              <div className={`py-12 text-center text-[13px] ${mutedCls}`}>暂无记录</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-[var(--app-color-border-default)]">
                  <table className="w-full border-collapse twin-table">
                    <thead>
                      <tr>
                        <th className={thCls}>时间</th>
                        <th className={thCls}>事件</th>
                        <th className={thCls}>源笼位</th>
                        <th className={thCls}>目标笼位</th>
                        <th className={thCls}>占用者</th>
                        <th className={thCls}>操作人</th>
                        <th className={thCls}>原因</th>
                        <th className={thCls}>快照</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.list.map((r) => (
                        <tr key={r.id}>
                          <td className={`${tdCls} whitespace-nowrap ${mutedCls}`}>{formatTime(r.createdAt)}</td>
                          <td className={`${tdCls} whitespace-nowrap`}>
                            {EVENT_TYPE_LABELS[r.eventType] ?? r.eventType}
                          </td>
                          <td className={tdCls}>{cageLabel(r.fromAnimalCageId, r.fromLabel)}</td>
                          <td className={tdCls}>{cageLabel(r.toAnimalCageId, r.toLabel)}</td>
                          <td className={tdCls}>{r.occupantName || (r.occupantId != null ? `#${r.occupantId}` : "-")}</td>
                          <td className={tdCls}>{r.operatorName || "-"}</td>
                          <td className={`${tdCls} max-w-[220px]`}>{r.reason || "-"}</td>
                          <td className={tdCls}>
                            {r.dataSnapshot ? (
                              <button
                                type="button"
                                className="text-[12px] text-[var(--app-color-accent)] hover:underline"
                                onClick={() => setSnapshot(r)}
                              >
                                查看
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 分页 */}
                <div className="mt-3 flex items-center justify-end gap-2 text-[12px]">
                  <span className={mutedCls}>
                    共 {records.total} 条 · 第 {records.page}/{totalPages} 页
                  </span>
                  <AdminButton
                    tone="secondary"
                    disabled={records.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </AdminButton>
                  <AdminButton
                    tone="secondary"
                    disabled={records.page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </AdminButton>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {pendingLoading ? (
              <div className={`py-12 text-center text-[13px] ${mutedCls}`}>加载中…</div>
            ) : pending.length === 0 ? (
              <div className={`py-12 text-center text-[13px] ${mutedCls}`}>暂无待审核的分笼/转移请求</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--app-color-border-default)]">
                <table className="w-full border-collapse twin-table">
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
                          {cageLabel(r.sourceAnimalCageId, [r.roomName, r.shelveName, targetPosition(r)].filter(Boolean).join("/"))}
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
          </>
        )}
      </div>

      {/* 快照抽屉 */}
      {snapshot && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSnapshot(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-[var(--app-color-surface-container)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold">
                覆盖前快照 · {EVENT_TYPE_LABELS[snapshot.eventType] ?? snapshot.eventType}
              </span>
              <button type="button" className={`text-[13px] ${mutedCls}`} onClick={() => setSnapshot(null)}>
                ✕
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-all text-[12px] text-[var(--app-color-text-secondary)]">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(snapshot.dataSnapshot || "{}"), null, 2);
                } catch {
                  return snapshot.dataSnapshot;
                }
              })()}
            </pre>
          </div>
        </div>
      )}
    </CageFormPageShell>
  );
}
