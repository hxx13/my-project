import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { displayPosition } from "@/features/cage-shelf/constants";
import {
  fetchMyClaims,
  cancelClaim,
  fetchMyCageOps,
  fetchCageOpPending,
  fetchReviewedCageOps,
  fetchTransferFormPdf,
  type CageClaimItem,
  type CageOpRequestView,
} from "@/api/domains/cageShelf.api";

type Tab = "claims" | "divide" | "transfer" | "review";

const UNSET = "未标注";

/** 位置串：地点 + 位号。地点用「校区 / 房间 / 笼架」，笼架名自带房号时不再重复房号。 */
function placeOf(r: CageOpRequestView): string {
  const parts: string[] = [];
  if (r.campusName) parts.push(r.campusName);
  const room = r.roomName ? String(r.roomName) : "";
  const shelve = r.shelveName ? String(r.shelveName) : "";
  if (shelve) {
    if (room && !shelve.startsWith(room)) parts.push(room);
    parts.push(shelve);
  } else if (room) {
    parts.push(room);
  }
  return parts.join(" / ") || "—";
}

/**
 * 手机端「我的申请」整页。
 *
 * 与 Web 的 MyCageRequestsDialog、小程序 myCageRequests 页同一套四分类、同一批接口：
 *   认领申请  /api/student/cage-claims/my
 *   分笼申请  /api/cage-op/my             → opType==='divide'
 *   转移申请  /api/cage-op/my             → opType==='transfer'
 *   审核申请  /api/cage-op/pending + /api/cage-op/reviewed?limit=50
 *
 * 三个来源各自成败各自回填：任何一个挂了，不该把别的 tab 拖成空列表。
 */
export function MobileMyCageRequestsView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("claims");
  const [claims, setClaims] = useState<CageClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [divides, setDivides] = useState<CageOpRequestView[]>([]);
  const [transfers, setTransfers] = useState<CageOpRequestView[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [reviewOps, setReviewOps] = useState<CageOpRequestView[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    setClaimsLoading(true);
    setOpsLoading(true);
    setReviewLoading(true);
    setClaims([]);
    setDivides([]);
    setTransfers([]);
    setReviewOps([]);
    const p1 = fetchMyClaims()
      .then(setClaims)
      .catch(() => toast.error("加载认领申请失败"))
      .finally(() => setClaimsLoading(false));
    const p2 = fetchMyCageOps()
      .then((list) => {
        setDivides(list.filter((it) => it.opType === "divide"));
        setTransfers(list.filter((it) => it.opType === "transfer"));
      })
      .catch(() => toast.error("加载分笼/转移申请失败"))
      .finally(() => setOpsLoading(false));
    const p3 = Promise.all([fetchCageOpPending(), fetchReviewedCageOps(50)])
      .then(([p, r]) => setReviewOps([...(p ?? []), ...(r ?? [])]))
      .catch(() => toast.error("加载审核申请失败"))
      .finally(() => setReviewLoading(false));
    return Promise.all([p1, p2, p3]);
  }, []);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  const tabs = useMemo(
    () => [
      { key: "claims" as Tab, label: "认领申请", count: claims.length },
      { key: "divide" as Tab, label: "分笼申请", count: divides.length },
      { key: "transfer" as Tab, label: "转移申请", count: transfers.length },
      { key: "review" as Tab, label: "审核申请", count: reviewOps.length },
    ],
    [claims.length, divides.length, transfers.length, reviewOps.length]
  );

  /** 认领项：房间已在分组标题里，条目只显示笼架 + 格位 */
  const claimShort = (c: CageClaimItem) => {
    const pos = c.positionX != null && c.positionY != null ? displayPosition(`${c.positionX}-${c.positionY}`) : "";
    return [c.shelveName, pos].filter(Boolean).join(" · ") || `笼位 #${c.animalCageId}`;
  };

  const claimGroups = useMemo(() => {
    const m = new Map<string, CageClaimItem[]>();
    for (const c of claims) {
      const key = [c.campusName, c.roomName].filter(Boolean).join(" / ") || "未指定房间";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return Array.from(m.entries());
  }, [claims]);

  const onCancel = async (id: number) => {
    if (!window.confirm("确定取消该申请？")) return;
    setBusyId(String(id));
    try {
      await cancelClaim(id);
      toast.success("已取消申请");
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取消失败");
    } finally {
      setBusyId(null);
    }
  };

  const onViewForm = async (id: number | string) => {
    setBusyId(String(id));
    try {
      const blob = await fetchTransferFormPdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // 交给新窗口后立刻回收，别把 blob 长期挂在内存里
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "转移单加载失败");
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  const ops = tab === "divide" ? divides : transfers;

  const opCard = (r: CageOpRequestView) => (
    <div key={String(r.id)} className="rounded-xl border bg-white px-3 py-3 mb-2.5" style={{ borderColor: "#ebedf0" }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold break-all" style={{ color: "#323233" }}>{placeOf(r)}</span>
        <span className="text-[11px] shrink-0" style={{ color: "#969799" }}>
          {r.status === "pending" ? "审核中" : r.status === "approved" ? "已通过" : r.status === "rejected" ? "已驳回" : r.status === "cancelled" ? "已撤销" : r.status || "—"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px]" style={{ color: "#969799" }}>{r.createdAt || ""}</span>
        <button
          type="button"
          disabled={busyId === String(r.id)}
          onClick={() => void onViewForm(r.id)}
          className="text-[12px] font-medium disabled:opacity-50 shrink-0"
          style={{ color: "#2563eb" }}
        >
          查看转移单
        </button>
      </div>
    </div>
  );

  const empty = (text: string) => (
    <div className="py-16 text-center text-xs" style={{ color: "#969799" }}>{text}</div>
  );

  const loadingBox = (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
    </div>
  );

  return (
    <div
      className="fixed inset-0 flex flex-col bg-white"
      style={{
        zIndex: "var(--z-modal, 800)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* 顶栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: "#ebedf0" }}>
        <button type="button" aria-label="返回" onClick={onClose} className="p-1 rounded-lg">
          <ChevronLeft className="size-5" style={{ color: "#323233" }} />
        </button>
        <span className="text-sm font-bold" style={{ color: "#323233" }}>我的申请</span>
      </div>

      {/* 四个分类 */}
      <div className="flex flex-wrap gap-2 px-3 pt-3 pb-2 shrink-0">
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs"
              style={on ? { background: "#2563eb", color: "#fff", fontWeight: 600 } : { background: "#f1f3f7", color: "#334155" }}
            >
              {t.label}
              {t.count > 0 ? <span className="text-[10px] opacity-85">{t.count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
        {tab === "claims" ? (
          claimsLoading ? loadingBox : claims.length === 0 ? empty("暂无认领申请") : claimGroups.map(([room, items]) => (
            <div key={room} className="mb-3">
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                <MapPin className="size-3" style={{ color: "#94a3b8" }} />
                <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>{room}</span>
                <span className="text-[10px]" style={{ color: "#c8c9cc" }}>{items.length}</span>
              </div>
              {items.map((c) => (
                <div key={String(c.id)} className="rounded-xl border bg-white px-3 py-3 mb-2.5" style={{ borderColor: "#ebedf0" }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold break-all" style={{ color: "#323233" }}>{claimShort(c)}</span>
                    <span className="text-[11px] shrink-0" style={{ color: "#969799" }}>
                      {c.claimStatus === "pending_approval" ? "待审批" : c.claimStatus === "locked" ? "未到位" : c.claimStatus === "confirmed" ? "已到位" : c.claimStatus === "rejected" ? "已驳回" : c.claimStatus === "released" ? "已释放" : c.claimStatus === "cancelled" ? "已取消" : c.claimStatus || "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[11px]" style={{ color: "#969799" }}>{c.createdAt || ""}</span>
                    {c.claimStatus === "pending_approval" ? (
                      <button
                        type="button"
                        disabled={busyId === String(c.id)}
                        onClick={() => void onCancel(c.id)}
                        className="text-[12px] font-medium disabled:opacity-50 shrink-0"
                        style={{ color: "#2563eb" }}
                      >
                        取消申请
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : tab === "review" ? (
          reviewLoading ? loadingBox : reviewOps.length === 0 ? empty("暂无需要你审核的申请") : reviewOps.map(opCard)
        ) : (
          opsLoading ? loadingBox : ops.length === 0 ? empty(tab === "divide" ? "暂无分笼申请" : "暂无转移申请") : ops.map(opCard)
        )}
      </div>
    </div>
  );
}
