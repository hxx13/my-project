import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchRetentionWarnings } from "@/api/twinApi";
import { Clock, MapPin, Users } from "lucide-react";

type RetentionRow = Record<string, unknown>;

interface TaskCard {
  id: string;
  userName: string;
  groupName: string;
  roomName: string;
  areaName: string;
  enterClock: string;
  enterDate: string;
  passedMins: number;
  aiDurationMins: number;
  cardKind: "own" | "borrowed" | "shared" | "keep";
}

const CARD_COLORS: Record<TaskCard["cardKind"], { accent: string; label: string; bg: string; border: string }> = {
  own:      { accent: "#3b82f6", label: "自带卡",   bg: "rgba(59,130,246,0.06)",  border: "rgba(59,130,246,0.22)" },
  borrowed: { accent: "#22c55e", label: "领用公卡", bg: "rgba(34,197,94,0.06)",   border: "rgba(34,197,94,0.22)" },
  shared:   { accent: "#a855f7", label: "同行共享", bg: "rgba(168,85,247,0.06)",   border: "rgba(168,85,247,0.22)" },
  keep:     { accent: "#f59e0b", label: "延迟还卡", bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.3)" },
};

const PAGE_SWITCH_MS = 14_000;

export default function ResearchTaskSection() {
  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [now, setNow] = useState(new Date());
  const [page, setPage] = useState<"pudong" | "puxi">("pudong");
  const pageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [pd, px] = await Promise.all([
          fetchRetentionWarnings(100, "浦东"),
          fetchRetentionWarnings(100, "浦西"),
        ]);
        if (!cancelled) setRows([...(pd || []), ...(px || [])]);
      } catch { /* */ }
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const cards: TaskCard[] = useMemo(() => {
    const nowMs = now.getTime();
    return rows.map(r => {
      const enterTime = String(r.enterTime ?? "");
      const enterDate = new Date(enterTime.replace(" ", "T"));
      const passedMins = Math.max(0, Math.floor((nowMs - enterDate.getTime()) / 60000));
      const aiDurationMins = Number(r.aiDurationMins) || 120;
      const parts = enterTime.split(" ");
      const datePart = parts[0] ?? "";
      const clockPart = parts[1]?.substring(0, 5) ?? "--:--";
      const isOwn = !!(r.is_own_card ?? r.isOwnCard);
      const isShared = !!(r.is_shared_card ?? r.isSharedCard);
      const isKeep = !!(r.is_keep_card ?? r.isKeepCard);
      let cardKind: TaskCard["cardKind"] = "borrowed";
      if (isKeep) cardKind = "keep";
      else if (isShared) cardKind = "shared";
      else if (isOwn) cardKind = "own";
      return { id: String(r.logId ?? Math.random()), userName: String(r.userName ?? "未知"), groupName: String(r.groupName ?? "未知课题组"), roomName: String(r.roomName ?? "未知房间"), areaName: String(r.areaName ?? ""), enterClock: clockPart, enterDate: datePart, passedMins, aiDurationMins, cardKind };
    });
  }, [rows, now]);

  const pudongCards = useMemo(() => cards.filter(c => c.areaName.includes("浦东")), [cards]);
  const puxiCards = useMemo(() => cards.filter(c => c.areaName.includes("浦西")), [cards]);
  const activeCards = page === "pudong" ? pudongCards : puxiCards;
  const pdKeep = pudongCards.filter(c => c.cardKind === "keep").length;
  const pxKeep = puxiCards.filter(c => c.cardKind === "keep").length;

  // Auto-switch pages
  const switchPage = useCallback(() => {
    setPage(p => p === "pudong" ? "puxi" : "pudong");
    // reset scroll
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  useEffect(() => {
    pageTimerRef.current = setInterval(switchPage, PAGE_SWITCH_MS);
    return () => { if (pageTimerRef.current) clearInterval(pageTimerRef.current); };
  }, [switchPage]);

  const handleTabClick = (p: "pudong" | "puxi") => {
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // reset timer
    if (pageTimerRef.current) clearInterval(pageTimerRef.current);
    pageTimerRef.current = setInterval(switchPage, PAGE_SWITCH_MS);
  };

  const pageLabel = page === "pudong" ? "浦东" : "浦西";
  const pageColor = page === "pudong" ? "#3b82f6" : "#ec4899";

  return (
    <section style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column", background: "transparent", overflow: "hidden", scrollSnapAlign: "start", scrollSnapStop: "always" as const, flexShrink: 0, contain: "paint" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={20} style={{ color: "rgba(255,255,255,0.5)" }} />
          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 5, color: "rgba(255,255,255,0.6)" }}>动物房 · 在室人员</span>
        </div>

        {/* Page tabs — 浦东 / 浦西 */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["pudong", "puxi"] as const).map(p => {
            const active = page === p;
            const c = p === "pudong" ? "#3b82f6" : "#ec4899";
            const count = p === "pudong" ? pudongCards.length : puxiCards.length;
            return (
              <button key={p} onClick={() => handleTabClick(p)}
                style={{
                  padding: "6px 18px", borderRadius: 20,
                  border: `1px solid ${active ? c + "55" : "rgba(255,255,255,0.06)"}`,
                  background: active ? c + "14" : "transparent",
                  color: active ? c : "rgba(255,255,255,0.3)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 1,
                  transition: "all 0.35s", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {p === "pudong" ? "浦东" : "浦西"}
                <span style={{ fontSize: 15, fontWeight: 900, opacity: active ? 1 : 0.5 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ flexShrink: 0, display: "flex", gap: 20, padding: "8px 32px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
        <MiniStat label="浦东在室" value={pudongCards.length} color="#3b82f6" />
        <MiniStat label="延迟还卡" value={pdKeep} color="#f59e0b" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
        <MiniStat label="浦西在室" value={puxiCards.length} color="#ec4899" />
        <MiniStat label="延迟还卡" value={pxKeep} color="#f59e0b" />
      </div>

      {/* Page indicator */}
      <div style={{ flexShrink: 0, padding: "8px 32px 4px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: pageColor, letterSpacing: 2 }}>{pageLabel}校区</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>· {activeCards.length} 人在室 · {PAGE_SWITCH_MS / 1000}s 自动切换</span>
        {/* Progress bar */}
        <div style={{ flex: 1, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)", marginLeft: 12, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 1, background: pageColor, animation: `page-progress ${PAGE_SWITCH_MS}ms linear infinite` }} />
        </div>
      </div>
      <style>{`@keyframes page-progress { 0%{width:0%} 100%{width:100%} }`}</style>

      {/* Card grid — scrollable */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 32px", display: "flex", flexWrap: "wrap", gap: 14, alignContent: "flex-start" }}>
        <AnimatePresence mode="wait">
          {activeCards.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", height: 180, color: "rgba(255,255,255,0.15)", fontSize: 14, fontWeight: 600 }}>
              {pageLabel} 暂无在室人员
            </motion.div>
          ) : (
            <motion.div key={page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexWrap: "wrap", gap: 14, width: "100%", alignContent: "flex-start" }}>
              {activeCards.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.5), type: "spring", stiffness: 280, damping: 24 }}
                >
                  <PersonCard card={card} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </section>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 900, color }}>{value}</span>
    </div>
  );
}

function PersonCard({ card }: { card: TaskCard }) {
  const c = CARD_COLORS[card.cardKind];
  return (
    <div
      style={{
        width: 198, padding: "14px 16px", borderRadius: 12,
        border: `1.5px solid ${c.border}`, background: c.bg,
        boxShadow: `0 0 20px rgba(0,0,0,0.25)`,
        display: "flex", flexDirection: "column", gap: 8, cursor: "default",
        transition: "box-shadow 0.3s, transform 0.2s", position: "relative",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 32px ${c.accent}18, 0 4px 16px rgba(0,0,0,0.35)`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 20px rgba(0,0,0,0.25)"; }}
    >
      <div style={{ position: "absolute", top: 0, left: 12, right: 12, height: 2, borderRadius: "0 0 2px 2px", background: `linear-gradient(90deg, transparent, ${c.accent}88, transparent)` }} />
      <div style={{ fontSize: 16, fontWeight: 900, color: "#f1f5f9", letterSpacing: 0.5, marginTop: 2 }}>{card.userName}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.groupName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
        <MapPin size={11} style={{ opacity: 0.5 }} /><span>{card.areaName} · {card.roomName}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
        <Clock size={12} style={{ opacity: 0.5 }} /><span>进入 {card.enterDate} {card.enterClock}</span>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
        已驻留 <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{fmtMins(card.passedMins)}</span>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 4 }}>
        AI 参考驻留：约 {fmtMins(card.aiDurationMins)}
      </div>
      <div style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: 10, background: `${c.accent}18`, border: `1px solid ${c.accent}30`, fontSize: 10, fontWeight: 700, color: c.accent, letterSpacing: 0.5 }}>{c.label}</div>
    </div>
  );
}

function fmtMins(m: number): string {
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins > 0 ? `${h} 小时 ${mins} 分` : `${h} 小时`;
}
