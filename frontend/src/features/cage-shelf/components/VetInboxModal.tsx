import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  fetchCageVetInbox,
  fetchLocalAnnotate,
  markCageVetRead,
  markCageVetReadAll,
  saveCageVetAdvice,
  type CageVetMessage,
} from "@/api/domains/cageShelf.api";
import {
  INBOX_FILTERS,
  hasVetAdvice,
  matchesInboxFilter,
  matchesInboxKeyword,
  vetInboxFilterCounts,
  type InboxFilter,
} from "../vetInboxFilter";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import StatusPhotoStrip from "./StatusPhotoStrip";
import { VET_UNREAD_COLOR } from "../constants";
import { useCageColors } from "./CageColorContext";
import { CAGE_TYPE_LABEL } from "./CageCellOverlays";

/**
 * 兽医收件箱弹窗：左树右详情。
 *
 * 三条口径（用户 2026-09-18 定）：
 * ① **每次「通知兽医」触发一条消息**（收件箱形态，不按笼位合并）—— 能看出哪些是新发的；
 * ② **未读用紫色标**（与网格上那圈紫色描边同色），且**只有点「已查看」才清**：进来看一眼不算；
 * ③ 兽医看完写**指导意见**（文字 + 图片），落回表单字段 → 归档随表单一起走、
 *    详情表单里只读（服务端把这两个字段设成 editable=0，通用表单写口拒改）。
 */

/** 树的四层键：校区 / 楼层 / 房间 / 笼架 —— 名称缺失时退回 id，别渲染成空白节点。 */
function groupTree(list: CageVetMessage[]) {
  const d = (v?: string | null, fallback = "未分类") => (v && v.trim() ? v.trim() : fallback);
  const tree = new Map<string, Map<string, Map<string, Map<string, CageVetMessage[]>>>>();
  for (const m of list) {
    const campus = d(m.campusName, "未知校区");
    const floor = d(m.floorName, "未知楼层");
    const room = d(m.roomName, "未知房间");
    const shelve = d(m.shelveName, "未知笼架");
    if (!tree.has(campus)) tree.set(campus, new Map());
    const f = tree.get(campus)!;
    if (!f.has(floor)) f.set(floor, new Map());
    const r = f.get(floor)!;
    if (!r.has(room)) r.set(room, new Map());
    const s = r.get(room)!;
    if (!s.has(shelve)) s.set(shelve, []);
    s.get(shelve)!.push(m);
  }
  return tree;
}

/**
 * 筛选/搜索口径在 `../vetInboxFilter.ts`（纯函数 + 单测），那份与小程序逐字一致。
 * 这里只用，不重新实现。
 */

export default function VetInboxModal({
  open,
  onOpenChange,
  onAfterChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 未读数变了就通知调用方（刷新入口角标 / 网格上的紫色描边） */
  onAfterChange?: (unreadCount: number) => void;
}) {
  const [sel, setSel] = useState<CageVetMessage | null>(null);
  const [advice, setAdvice] = useState("");
  const [adviceImages, setAdviceImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [kw, setKw] = useState("");

  const { colors } = useCageColors();
  /** 状态标签配色与网格同一套；明细状态码（SF_ 前缀）归到「特殊饲养」那一色，与网格角标同理 */
  const statusColor = (code: string) =>
    colors[(code.startsWith("SF_") ? "SPECIAL_FEEDING" : code) as keyof typeof colors]?.border ?? "#94a3b8";

  const { data: inbox, refetch } = useQuery({
    queryKey: ["cageVetInbox"],
    queryFn: fetchCageVetInbox,
    enabled: open,
  });
  const messages = inbox?.messages ?? [];
  /** 筛选 + 搜索后的那批，树和列表都用它 */
  const shown = useMemo(
    () => messages.filter((m) => matchesInboxFilter(m, filter) && matchesInboxKeyword(m, kw)),
    [messages, filter, kw],
  );
  const tree = useMemo(() => groupTree(shown), [shown]);

  /** 筛选胶囊上的数字跟着关键字走 */
  const counts = useMemo(() => vetInboxFilterCounts(messages, kw), [messages, kw]);

  // 选中某条 → 拉该笼位的状态照片（用户要求发给兽医的是完整信息）
  const { data: annot } = useQuery({
    queryKey: ["cageVetAnnot", sel?.animalCageId],
    queryFn: () => fetchLocalAnnotate(String(sel!.animalCageId)),
    enabled: open && !!sel?.animalCageId,
  });

  // 选中变化时把指导意见草稿铺上（来自该笼位当前的表单值）
  useEffect(() => {
    if (!sel) return;
    setAdvice(sel.adviceText ?? "");
    setAdviceImages(sel.adviceImages ?? []);
  }, [sel]);

  const photos = useMemo(() => {
    const raw = annot?.statusPhotos;
    if (!raw) return [];
    try {
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Object.values(obj as Record<string, string[]>).flat().filter(Boolean);
    } catch {
      return [];
    }
  }, [annot]);

  const unread = inbox?.unreadCount ?? 0;

  /** 未读数变了：通知调用方（刷新网格紫色描边/入口）**并**广播一次待办角标刷新 —— 侧栏那枚数字
      在别的页面上，不给它一个事件就得等下次轮询才归零。 */
  const afterUnreadChange = (n: number) => {
    onAfterChange?.(n);
    window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
  };

  const markRead = async (m: CageVetMessage) => {
    try {
      const n = await markCageVetRead(m.id);
      afterUnreadChange(n);
      await refetch();
      // 本地也要更新选中项，否则右侧「已查看」按钮状态不跟着变
      setSel((s) => (s && s.id === m.id ? { ...s, read: true } : s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "标记已查看失败");
    }
  };

  const markAll = async () => {
    try {
      const n = await markCageVetReadAll();
      afterUnreadChange(n);
      await refetch();
      toast.success("已全部标为已查看");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "一键查看失败");
    }
  };

  const submitAdvice = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      await saveCageVetAdvice(sel.animalCageId, advice, adviceImages);
      toast.success("指导意见已保存");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>兽医收件箱</DialogTitle>
          <DialogDescription>
            笼位健康异常的通知逐条列在这里；未读的在网格上是紫色描边，点「已查看」才消。
            看完把指导意见写回去，它会随笼位表单一起归档，详情表单里只读。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--twin-mute)]">
            共 {messages.length} 条 · 未读 <b style={{ color: VET_UNREAD_COLOR }}>{unread}</b> 条
          </span>
          <button type="button" onClick={() => void markAll()} disabled={unread === 0}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-2.5 py-1 text-[11px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)] disabled:opacity-40">
            一键查看
          </button>
        </div>

        {/* 搜索 + 筛选：筛的是「回没回意见」，与左树的已读/未读是两条独立轴 */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--twin-mute)]" />
            <input
              type="text"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜索位号 / 笼架 / 房间 / 课题组 / AUP…"
              className="w-full bg-transparent text-[11px] text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)]"
            />
            {kw && (
              <button type="button" onClick={() => setKw("")} aria-label="清空搜索"
                className="shrink-0 text-[var(--twin-mute)] transition hover:text-[var(--twin-ink)]">✕</button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {INBOX_FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                  filter === f.key
                    ? "bg-[var(--twin-primary)] text-white"
                    : "bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] hover:brightness-95"
                }`}>
                {f.label} <span className={filter === f.key ? "text-white/70" : "text-[var(--twin-mute)]"}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 gap-3" style={{ height: "60vh" }}>
          {/* 左：树状列表 */}
          <div className="w-[19rem] shrink-0 overflow-y-auto rounded-twin-sm border border-[var(--twin-hairline)] p-1.5">
            {shown.length === 0 && (
              <div className="px-2 py-6 text-center text-[11px] text-[var(--twin-mute)]">
                <div>{messages.length === 0 ? "暂无兽医通知" : "没有匹配的通知"}</div>
                {messages.length > 0 && (
                  <button type="button" onClick={() => { setFilter("all"); setKw(""); }}
                    className="mt-2 rounded-full bg-[var(--twin-canvas-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--twin-body)] transition hover:brightness-95">
                    清除筛选
                  </button>
                )}
              </div>
            )}
            {[...tree.entries()].map(([campus, floors]) => (
              <details key={campus} open className="mb-1">
                <summary className="cursor-pointer px-1 text-[11px] font-semibold text-[var(--twin-ink)]">{campus}</summary>
                {[...floors.entries()].map(([floor, rooms]) => (
                  <details key={floor} className="ml-2" open>
                    <summary className="cursor-pointer px-1 text-[11px] text-[var(--twin-body)]">{floor}</summary>
                    {[...rooms.entries()].map(([room, shelves]) => (
                      <details key={room} className="ml-2" open>
                        <summary className="cursor-pointer px-1 text-[11px] text-[var(--twin-body)]">{room}</summary>
                        {[...shelves.entries()].map(([shelve, items]) => (
                          <div key={shelve} className="ml-2">
                            <div className="px-1 text-[10px] text-[var(--twin-mute)]">{shelve}</div>
                            {items.map((m) => {
                              const on = sel?.id === m.id;
                              return (
                                <button key={m.id} type="button"
                                  onClick={() => setSel(m)}
                                  className={`mt-0.5 flex w-full items-center gap-1.5 rounded-twin-sm px-1.5 py-1 text-left text-[11px] transition ${
                                    on ? "bg-[var(--twin-primary)]/10" : "hover:bg-[var(--twin-canvas-soft)]"
                                  }`}
                                  /* 未读整行铺紫底：只靠一个小圆点太不显眼（用户 2026-09-18 反馈）；
                                     选中行有自己的底色，不叠这个 */
                                  style={!m.read && !on ? { backgroundColor: `color-mix(in srgb, ${VET_UNREAD_COLOR} 14%, transparent)` } : undefined}>
                                  {/* 未读 = 紫色圆点（与网格那圈描边同色） */}
                                  <span className="size-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: m.read ? "transparent" : VET_UNREAD_COLOR }} />
                                  <span className="shrink-0 font-semibold text-[var(--twin-ink)]">{m.positionLabel ?? "—"}</span>
                                  <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--twin-mute)]">
                                    {m.projectPiName || m.experimenterName || ""}
                                  </span>
                                  {/* 回过意见的挂一枚中性标记：与「未读」是两条轴，两个可以同时出现 */}
                                  {hasVetAdvice(m) && (
                                    <span className="shrink-0 rounded-full bg-[var(--twin-canvas-soft)] px-1.5 py-px text-[9px] text-[var(--twin-body)]">
                                      已回意见
                                    </span>
                                  )}
                                  {!m.read && (
                                    <span className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold text-white"
                                      style={{ backgroundColor: VET_UNREAD_COLOR }}>未读</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </details>
                    ))}
                  </details>
                ))}
              </details>
            ))}
          </div>

          {/* 右：该笼位的全部信息 + 状态照片 + 指导意见。
              未读时整块套一圈紫描边 —— 左侧一个小紫点太不显眼（用户 2026-09-18 反馈），
              右侧是真正要读的内容，这里也要能一眼看出「这条还没看」。 */}
          <div className="min-w-0 flex-1 overflow-y-auto rounded-twin-sm border p-2.5"
            style={sel && !sel.read
              ? { borderColor: VET_UNREAD_COLOR, boxShadow: `inset 0 0 0 1px ${VET_UNREAD_COLOR}` }
              : { borderColor: "var(--twin-hairline)" }}>
            {!sel ? (
              <div className="py-10 text-center text-[11px] text-[var(--twin-mute)]">左侧选一条通知看笼位详情</div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 text-[12px] font-semibold text-[var(--twin-ink)]">
                    {!sel.read && (
                      <span className="mr-1.5 rounded-full px-1.5 py-px align-middle text-[10px] font-bold text-white"
                        style={{ backgroundColor: VET_UNREAD_COLOR }}>未读</span>
                    )}
                    {sel.shelveName} {sel.positionLabel}
                    <span className="ml-2 text-[10px] font-normal text-[var(--twin-mute)]">
                      {sel.statusLabel} · {sel.firedAt ? String(sel.firedAt).replace("T", " ").slice(0, 16) : ""}
                    </span>
                  </div>
                  <button type="button" onClick={() => void markRead(sel)} disabled={sel.read}
                    className="rounded-twin-sm px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:opacity-40"
                    style={{ backgroundColor: VET_UNREAD_COLOR }}>
                    {sel.read ? "已查看" : "标为已查看"}
                  </button>
                </div>

                {/* 基本信息：笼位是谁的、在哪、什么编号 —— 只列这几项，不铺整张表单字段 */}
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] p-2">
                  <div className="mb-1 text-[11px] font-semibold text-[var(--twin-ink)]">基本信息</div>
                  <div className="space-y-0.5">
                    {([
                      ["位置", [sel.campusName, sel.floorName, sel.roomName].filter(Boolean).join(" · ")],
                      ["笼盒编号", sel.cageBoxCode],
                      ["AUP 注册号", sel.aupNumber],
                      ["课题组", sel.projectPiName],
                      ["实验员", sel.experimenterName],
                      // 笼位类型复用网格那套 CAGE_TYPE_LABEL，去掉括号（这里是「标签：值」的表述）
                      ["笼位状态", sel.cageTypeCode != null ? (CAGE_TYPE_LABEL[sel.cageTypeCode] ?? "").replace(/[()]/g, "") : ""],
                    ] as const)
                      .filter(([, v]) => v && String(v).trim())
                      .map(([k, v]) => (
                        <div key={k} className="flex min-w-0 gap-1 text-[11px]">
                          <span className="shrink-0 text-[var(--twin-mute)]">{k}：</span>
                          <span className="min-w-0 truncate text-[var(--twin-ink)]" title={String(v)}>{v}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 当前实际状态：**只列开启的**。一格都没开就说「无特殊状态」——
                    别把 需分笼=false 这类没发生的状态也写出来（用户 2026-09-18 明确否掉那种表达）。 */}
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] p-2">
                  <div className="mb-1 text-[11px] font-semibold text-[var(--twin-ink)]">当前状态</div>
                  {sel.statuses?.length || sel.healthSeverityLabel || sel.healthItch ? (
                    <div className="flex flex-wrap gap-1">
                      {(sel.statuses ?? []).map((s) => (
                        <span key={s.code} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: statusColor(s.code) }}>
                          {s.label}
                          {s.code === "HEALTH_ABNORMAL" && sel.healthSeverityLabel ? `·${sel.healthSeverityLabel}` : ""}
                        </span>
                      ))}
                      {/* 严重程度若在状态标签之外单独存在（健康异常已关但严重程度还留着），也照实显示 */}
                      {sel.healthSeverityLabel && !(sel.statuses ?? []).some((s) => s.code === "HEALTH_ABNORMAL") && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: colors.HEALTH_ABNORMAL?.border ?? "#a855f7" }}>
                          健康异常·{sel.healthSeverityLabel}
                        </span>
                      )}
                      {sel.healthItch && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: colors.HEALTH_ABNORMAL?.border ?? "#a855f7" }}>瘙痒</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--twin-mute)]">无特殊状态</div>
                  )}
                </div>

                {/* 状态照片：该笼位各状态归档的照片（用户要求一并发给兽医） */}
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] p-2">
                  <div className="mb-1 text-[11px] font-semibold text-[var(--twin-ink)]">状态照片</div>
                  {photos.length === 0 ? (
                    <div className="text-[10px] text-[var(--twin-mute)]">无</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {photos.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="" className="h-14 w-14 rounded-sm border object-cover"
                            style={{ borderColor: "var(--twin-hairline)" }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* 指导意见：写回表单字段（归档随表单；详情表单里只读） */}
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] p-2">
                  <div className="mb-1 text-[11px] font-semibold text-[var(--twin-ink)]">指导意见</div>
                  <textarea value={advice} onChange={(e) => setAdvice(e.target.value)}
                    rows={3} placeholder="写检查结论与处理建议…"
                    className="w-full resize-y rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)] outline-none" />
                  <StatusPhotoStrip variant="twin" label="指导意见图片"
                    value={adviceImages} onChange={setAdviceImages} />
                  <div className="mt-1.5 flex justify-end">
                    <button type="button" onClick={() => void submitAdvice()} disabled={saving}
                      className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40">
                      {saving ? "保存中…" : "保存指导意见"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
