/** H5 手机版 — 在馆审核（嵌在房间 Tab 内，保留底栏） */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Loader2, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import {
  addCardMapping,
  fetchAuditPendingByFloor,
  submitAuditManualExit,
  updateCardStatus,
  updateExemptFlag,
  type AuditCampusRow,
  type AuditPendingPersonRow,
} from "@/api/twinApi";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  DEFAULT_EXEMPT_UNTIL_TIME,
  formatExemptStatus,
  parseExemptRoomNames,
} from "@/constants/exemptDurationPresets";
import {
  buildAuditCampusDisplayList,
  type AuditCampusTreeNode,
  type AuditRoomGroup,
} from "./utils/roomDashboard";
import { useMobilePullToRefresh } from "./useMobilePullToRefresh";

type ExemptFilter = "all" | "exempt" | "controlled";

function entryTypeLabel(type?: string): string {
  const t = String(type || "").toUpperCase();
  if (t === "OWN_CARD") return "自带卡";
  if (t === "FOLLOWING") return "结伴";
  if (t === "BORROWED_CARD") return "公卡";
  return t || "—";
}

function apiCampusesToTree(campuses: AuditCampusRow[]): AuditCampusTreeNode[] {
  return (campuses || []).map((c) => ({
    campus: c.campus,
    floors: (c.floors || []).map((f) => {
      const rawPersons = Array.isArray(f.persons) ? f.persons : [];
      const persons = rawPersons.map((p) => ({
        ...p,
        entryTypeLabel: entryTypeLabel(p.entryType),
        exemptStatusText: formatExemptStatus(p),
        exemptRoomNames: parseExemptRoomNames(p.freezeExemptRoomIds).join(", "),
      }));
      return {
        floor: f.floor,
        floorPersonCount: rawPersons.length,
        persons,
        rooms: Array.isArray(f.rooms)
          ? f.rooms.map((r) => ({
              roomId: r.roomId,
              roomName: r.roomName || "未知房间",
              roomKey: `${r.roomId ?? ""}_${r.roomName || ""}`,
              persons: (Array.isArray(r.persons) ? r.persons : []).map((p) => ({
                ...p,
                entryTypeLabel: entryTypeLabel(p.entryType),
                exemptStatusText: formatExemptStatus(p),
                exemptRoomNames: parseExemptRoomNames(p.freezeExemptRoomIds).join(", "),
              })),
            }))
          : [],
      };
    }),
  }));
}

function pickRoomGroups(tree: AuditCampusTreeNode[], campus: string, floor: string): AuditRoomGroup[] {
  const c = tree.find((x) => x.campus === campus);
  if (!c) return [];
  const fl = c.floors.find((x) => x.floor === floor);
  if (!fl) return [];
  if (fl.rooms?.length) {
    const nonempty = fl.rooms.filter((r) => r.persons.length > 0);
    if (nonempty.length) return nonempty;
  }
  if (fl.persons?.length) {
    return [{ roomId: "", roomName: "本楼层", roomKey: "_legacy_floor", persons: fl.persons }];
  }
  return [];
}

function filterPersonsByExempt(
  persons: AuditPendingPersonRow[],
  exemptFilter: ExemptFilter,
): AuditPendingPersonRow[] {
  if (exemptFilter === "all") return persons;
  return persons.filter((p) => {
    const isExempt = Number(p.freezeExemptFlag) === 1;
    return exemptFilter === "exempt" ? isExempt : !isExempt;
  });
}

function applyExemptFilter(groups: AuditRoomGroup[], filter: ExemptFilter): AuditRoomGroup[] {
  return groups.map((g) => ({
    ...g,
    persons: filterPersonsByExempt(g.persons, filter),
  }));
}

function countPersons(groups: AuditRoomGroup[]): number {
  return groups.reduce((n, g) => n + g.persons.length, 0);
}

const FILTER_OPTIONS: { key: ExemptFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "exempt", label: "已豁免" },
  { key: "controlled", label: "未豁免" },
];

interface DecoratedPerson extends AuditPendingPersonRow {
  entryTypeLabel?: string;
  exemptStatusText?: string;
  exemptRoomNames?: string;
}

interface MobileRoomAuditPanelProps {
  onBack: () => void;
}

export default function MobileRoomAuditPanel({ onBack }: MobileRoomAuditPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campusTree, setCampusTree] = useState<AuditCampusTreeNode[]>([]);
  const [expandedCampus, setExpandedCampus] = useState<Record<string, boolean>>({
    浦东: true,
    浦西: false,
  });
  const [selectedCampus, setSelectedCampus] = useState("浦东");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [exemptFilter, setExemptFilter] = useState<ExemptFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedOnceRef = useRef(false);

  const role = authStorage.getRole();
  const canGrantExempt = hasMinRole(role, "ADMIN");

  const campusDisplayList = useMemo(
    () => buildAuditCampusDisplayList(campusTree, expandedCampus),
    [campusTree, expandedCampus],
  );

  const currentRoomGroups = useMemo(() => {
    if (!selectedCampus || !selectedFloor) return [];
    return applyExemptFilter(pickRoomGroups(campusTree, selectedCampus, selectedFloor), exemptFilter);
  }, [campusTree, selectedCampus, selectedFloor, exemptFilter]);

  const roomPersonTotal = countPersons(currentRoomGroups);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditPendingByFloor();
      const tree = apiCampusesToTree(data.campuses || []);
      setCampusTree(tree);
      setSelectedCampus((prevCampus) => {
        const node = tree.find((x) => x.campus === prevCampus);
        if (node?.floors?.length) {
          setSelectedFloor((prevFloor) => {
            const ok = node.floors.some((f) => f.floor === prevFloor);
            return ok ? prevFloor : node.floors[0].floor;
          });
          return prevCampus;
        }
        const pudong = tree.find((x) => x.campus === "浦东");
        if (pudong?.floors?.length) {
          setSelectedFloor(pudong.floors[0].floor);
          return "浦东";
        }
        setSelectedFloor("");
        return prevCampus;
      });
      loadedOnceRef.current = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      if (!loadedOnceRef.current) setError(msg);
      else toast.error(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadedOnceRef.current) void refresh();
  }, [refresh]);

  const pullRefresh = useMobilePullToRefresh(
    () => refresh({ silent: true }),
    scrollRef,
  );

  const handleManualExit = async (person: DecoratedPerson) => {
    if (!window.confirm(`${person.userName || person.userId} 将被登记为离开，是否继续？`)) return;
    try {
      await submitAuditManualExit({
        userId: person.userId,
        userName: person.userName,
        roomId: person.roomId != null ? String(person.roomId) : undefined,
        roomName: person.roomName,
      });
      toast.success("已确认离开");
      await refresh({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "确认离开失败");
    }
  };

  const handleToggleFreeze = async (person: DecoratedPerson) => {
    if (!person.cardNo) return;
    const next = person.cardStatus === "FROZEN" ? "NORMAL" : "FROZEN";
    const label = next === "FROZEN" ? "冻结" : "解冻";
    if (!window.confirm(`确认${label}卡号 ${person.cardNo}？`)) return;
    try {
      await updateCardStatus(person.cardNo, next);
      toast.success("已更新");
      await refresh({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleToggleExempt = async (person: DecoratedPerson) => {
    if (!person.cardNo) return;
    const flag = person.freezeExemptFlag === 1 ? 0 : 1;
    if (flag === 0) {
      if (!window.confirm(`取消卡号 ${person.cardNo} 的豁免？`)) return;
      try {
        await updateExemptFlag(person.cardNo, 0);
        toast.success("已取消豁免");
        await refresh({ silent: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
      return;
    }
    try {
      await updateExemptFlag(person.cardNo, 1, undefined, "TIME", undefined, undefined, DEFAULT_EXEMPT_UNTIL_TIME);
      toast.success("已设豁免");
      await refresh({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  };

  const handleBind = async (person: DecoratedPerson) => {
    const cardNo = window.prompt("物理卡号", "")?.trim();
    if (!cardNo) return;
    const dahuaSeq = window.prompt("大华序号", "")?.trim();
    if (!dahuaSeq) return;
    try {
      await addCardMapping({
        cardNo,
        dahuaSeq,
        aroUserId: person.userId,
        cardStatus: "NORMAL",
        freezeExemptFlag: 0,
      });
      toast.success("绑定成功");
      await refresh({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "绑定失败");
    }
  };

  if (loading && !loadedOnceRef.current) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" style={{ color: "#94a3b8" }} />
      </div>
    );
  }

  if (error && !loadedOnceRef.current) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-4">
        <WifiOff className="size-8" style={{ color: "#c8c9cc" }} />
        <p className="text-xs text-center" style={{ color: "#969799" }}>{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-white"
          style={{ background: "#ac1736" }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0" style={{ background: "#eef0f6" }}>
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-b"
        style={{ background: "#fff", borderColor: "#ebedf0" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 p-1 rounded-lg active:opacity-70"
          aria-label="返回房间"
        >
          <ChevronLeft className="size-5" style={{ color: "#323233" }} />
        </button>
        <span className="text-[15px] font-semibold" style={{ color: "#323233" }}>
          在馆审核
        </span>
      </div>

      <div
        className="shrink-0 flex gap-2 px-3 py-2.5 border-b overflow-x-auto"
        style={{ background: "#fff", borderColor: "#ebedf0" }}
      >
        {FILTER_OPTIONS.map((opt) => {
          const active = exemptFilter === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setExemptFilter(opt.key)}
              className="shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap"
              style={
                active
                  ? { color: "#fff", background: "#2563eb", border: "1px solid #2563eb" }
                  : { color: "#64748b", background: "#fff", border: "1px solid #e2e8f0" }
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex min-h-0">
        <aside
          className="shrink-0 flex flex-col min-h-0 overflow-y-auto overscroll-contain"
          style={{
            width: 90,
            background: "#fff",
            borderRight: "1px solid #ebedf0",
          }}
        >
          {campusDisplayList.map((item) => (
            <div key={item.campus} className="border-b" style={{ borderColor: "#f7f7f7" }}>
              <button
                type="button"
                onClick={() =>
                  setExpandedCampus((prev) => ({ ...prev, [item.campus]: !prev[item.campus] }))
                }
                className="w-full px-2 py-3 flex items-center justify-between"
              >
                <span className="text-[13px] font-semibold" style={{ color: "#323233" }}>
                  {item.campus}
                </span>
                <span className="text-[11px]" style={{ color: "#969799" }}>
                  {item.expanded ? "▾" : "▸"}
                </span>
              </button>
              {item.expanded &&
                item.floors.map((f) => {
                  const isActive = selectedCampus === item.campus && selectedFloor === f.floor;
                  return (
                    <button
                      key={f.floor}
                      type="button"
                      onClick={() => {
                        setSelectedCampus(item.campus);
                        setSelectedFloor(f.floor);
                      }}
                      className="mx-0 mb-1 px-2 py-1.5 rounded-xl flex items-center justify-between gap-1 w-full"
                      style={{
                        color: isActive ? "#1989fa" : "#646566",
                        background: isActive ? "#e8f3ff" : "#f6f7f9",
                        fontWeight: isActive ? 600 : 400,
                        fontSize: 12,
                      }}
                    >
                      <span className="truncate">{f.floor}</span>
                      {f.floorPersonCount > 0 && (
                        <span
                          className="shrink-0 min-w-[14px] h-[15px] px-1 text-[10px] font-semibold text-white rounded-full text-center leading-[15px]"
                          style={{ background: "#ee0a24" }}
                        >
                          {f.floorPersonCount}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </aside>

        <section className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <header
            className="shrink-0 px-3 py-2 border-b"
            style={{ borderColor: "#ebedf0", background: "#fff" }}
          >
            <p className="text-[14px] font-semibold truncate" style={{ color: "#323233" }}>
              {selectedCampus && selectedFloor ? `${selectedCampus} ${selectedFloor}` : "在馆审核"}
            </p>
            <p className="text-[11px]" style={{ color: "#969799" }}>
              {selectedCampus && selectedFloor
                ? `共 ${roomPersonTotal} 人 · 下拉刷新`
                : "请在左侧选择楼层 · 下拉刷新"}
            </p>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 pb-4"
            onTouchStart={pullRefresh.handlers.onTouchStart}
            onTouchMove={pullRefresh.handlers.onTouchMove}
            onTouchEnd={pullRefresh.handlers.onTouchEnd}
          >
            {(pullRefresh.indicatorVisible || pullRefresh.refreshing) && (
              <div className="flex items-center justify-center gap-1.5 py-2">
                <Loader2
                  className={`size-3.5 ${pullRefresh.refreshing ? "animate-spin" : ""}`}
                  style={{ color: "#969799" }}
                />
                <span className="text-[11px]" style={{ color: "#969799" }}>
                  {pullRefresh.refreshing ? "刷新中…" : "松开刷新"}
                </span>
              </div>
            )}

            {!selectedCampus || !selectedFloor ? (
              <p className="py-12 text-center text-xs leading-relaxed" style={{ color: "#969799" }}>
                请展开「浦东」「浦西」，点选楼层后，右侧按房间聚合展示在馆人员与物理卡映射。
              </p>
            ) : roomPersonTotal === 0 ? (
              <p className="py-12 text-center text-xs" style={{ color: "#969799" }}>
                本楼层暂无在馆人员
              </p>
            ) : (
              currentRoomGroups.map((rg) => (
                <div key={rg.roomKey} className="mb-3">
                  <div
                    className="flex items-center justify-between py-1 mb-1 border-b"
                    style={{ borderColor: "#ebedf0" }}
                  >
                    <span className="text-[13px] font-bold" style={{ color: "#323233" }}>
                      {rg.roomName}
                    </span>
                    <span className="text-[11px]" style={{ color: "#969799" }}>
                      {rg.persons.length} 人
                    </span>
                  </div>
                  {rg.persons.map((item) => (
                    <div
                      key={item.userId}
                      className="mb-2 p-3 rounded-xl border"
                      style={{ background: "#fff", borderColor: "#ebedf0" }}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-[14px] font-bold" style={{ color: "#323233" }}>
                          {item.userName || "未知"}
                        </span>
                        <span className="text-[10px] truncate" style={{ color: "#969799" }}>
                          {item.userId}
                        </span>
                      </div>
                      <p className="text-[11px] mb-0.5" style={{ color: "#646566" }}>
                        入场 {(item as DecoratedPerson).entryTypeLabel
                          ? `${item.entryTime} · ${(item as DecoratedPerson).entryTypeLabel}`
                          : item.entryTime}
                      </p>
                      {item.hasMapping && item.cardNo ? (
                        <p className="text-[11px] mb-0.5 font-mono" style={{ color: "#646566" }}>
                          卡号 {item.cardNo} · {item.cardStatus}
                        </p>
                      ) : (
                        <p className="text-[11px] mb-0.5" style={{ color: "#969799" }}>
                          未绑定物理卡
                        </p>
                      )}
                      {(item as DecoratedPerson).exemptRoomNames ? (
                        <p className="text-[10px] font-medium" style={{ color: "#b45309" }}>
                          房间: {(item as DecoratedPerson).exemptRoomNames}
                        </p>
                      ) : null}
                      <div className="flex gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: "#f0f0f0" }}>
                        {item.hasMapping && item.cardNo ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleFreeze(item)}
                              className="flex-1 min-w-0 py-1.5 rounded-lg text-[10px] font-medium border"
                              style={{
                                color: item.cardStatus === "FROZEN" ? "#1989fa" : "#ed6a0c",
                                borderColor: item.cardStatus === "FROZEN" ? "#1989fa" : "#ff976a",
                                background: item.cardStatus === "FROZEN" ? "#f0f8ff" : "#fff8f2",
                              }}
                            >
                              {item.cardStatus === "FROZEN" ? "解冻" : "冻结"}
                            </button>
                            {canGrantExempt ? (
                              <button
                                type="button"
                                onClick={() => handleToggleExempt(item)}
                                className="flex-1 min-w-0 py-1.5 rounded-lg text-[10px] font-medium border"
                                style={{ color: "#323233", borderColor: "#c8c9cc", background: "#fff" }}
                              >
                                {item.freezeExemptFlag === 1 ? "取消豁免" : "豁免"}
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleBind(item)}
                            className="flex-1 min-w-0 py-1.5 rounded-lg text-[10px] font-medium border"
                            style={{ color: "#1989fa", borderColor: "#1989fa", background: "#f0f8ff" }}
                          >
                            发卡绑定
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleManualExit(item)}
                          className="flex-1 min-w-0 py-1.5 rounded-lg text-[10px] font-medium border"
                          style={{ color: "#07a14f", borderColor: "#07c160", background: "#f1fff7" }}
                        >
                          确认离开
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
