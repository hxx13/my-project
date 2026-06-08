import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGroupRanking, fetchAnimalOrderRanking, fetchRankingPollConfig, ensureRankingSnapshot } from "@/api/twinApi";
import { Trophy } from "lucide-react";

type Region = "TOTAL" | "PUDONG" | "PUXI";
type TabKey = "activity" | "animal";

const REGIONS: Region[] = ["TOTAL", "PUDONG", "PUXI"];
const REGION_LABELS: Record<Region, string> = {
  TOTAL: "全部",
  PUDONG: "浦东",
  PUXI: "浦西",
};

type RankItem = {
  name: string;
  value: number;
  trend: "up" | "down" | "same";
  trendValue: number;
};

const MAX_ITEMS = 50;

const podiumColors = [
  {
    bg: "linear-gradient(180deg, #fef3c7, #fbbf24, #f59e0b)",
    height: 62,
    medal: "🥇",
    anim: "glowPulse 2s ease-in-out infinite",
  },
  {
    bg: "linear-gradient(180deg, #e2e8f0, #94a3b8)",
    height: 50,
    medal: "🥈",
    anim: "silverPulse 2.5s ease-in-out infinite",
  },
  {
    bg: "linear-gradient(180deg, #fed7aa, #f97316, #ea580c)",
    height: 38,
    medal: "🥉",
    anim: "bronzePulse 3s ease-in-out infinite",
  },
];

const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd
const podiumWidths = [72, 82, 66];

export function UnifiedRankingCard() {
  const [activeTab, setActiveTab] = useState<TabKey>("activity");
  const [region, setRegion] = useState<Region>("TOTAL");
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const autoTabTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Data fetching ----

  // 读取定时管理页面配置的轮询间隔（默认：活跃5分钟，动物30分钟）
  const { data: pollConfig } = useQuery({
    queryKey: ["dashboard", "rankingPollConfig"],
    queryFn: fetchRankingPollConfig,
    staleTime: 600_000, // 10分钟内不重复请求
  });
  const activityInterval = (pollConfig?.activityIntervalSeconds ?? 300) * 1000;
  const animalInterval = (pollConfig?.animalIntervalSeconds ?? 1800) * 1000;

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard", "ranking", "MONTH", region],
    queryFn: () => fetchGroupRanking("MONTH", region),
    refetchInterval: activityInterval,
  });

  // 动物消耗：本周 / 上周 / 上上周（用于自动选取最新非空周 + 趋势对比基线）
  const { data: animalWeek0, isLoading: animalLoading0 } = useQuery({
    queryKey: ["dashboard", "animalRanking", region, "week", 0],
    queryFn: () => fetchAnimalOrderRanking(region, 0),
    refetchInterval: animalInterval,
  });
  const { data: animalWeekMinus1 } = useQuery({
    queryKey: ["dashboard", "animalRanking", region, "week", -1],
    queryFn: () => fetchAnimalOrderRanking(region, -1),
    staleTime: 1_800_000,
  });
  const { data: animalWeekMinus2 } = useQuery({
    queryKey: ["dashboard", "animalRanking", region, "week", -2],
    queryFn: () => fetchAnimalOrderRanking(region, -2),
    staleTime: 3_600_000,
  });

  const animalLoading = animalLoading0;

  // 进出活跃趋势快照：直接调 ensure 端点查缺补漏，避免首次 GET 返回空 → 颁奖台无趋势箭头
  const { data: activitySnapshot } = useQuery({
    queryKey: ["dashboard", "rankingSnapshot", region],
    queryFn: () => ensureRankingSnapshot(region),
    staleTime: 300_000,
  });
  const prevRankMap = useMemo(() => {
    const map = new Map<string, number>();
    if (activitySnapshot) {
      for (const it of activitySnapshot) {
        if (it.name) map.set(it.name, it.rank);
      }
    }
    return map;
  }, [activitySnapshot]);

  // ---- Data normalization ----
  const rawActivityList = useMemo<{ name?: string; value?: number; count?: number }[]>(() => {
    return Array.isArray(activityData) ? activityData : [];
  }, [activityData]);

  /** Normalise a raw animal ranking payload into {name, value}[] */
  const normAnimal = (raw: any): { name: string; value: number }[] => {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((item: { projectName?: string; totalQuantity?: number }) => ({
      name: item.projectName ?? "",
      value: item.totalQuantity ?? 0,
    }));
  };

  // Pick the most recent non-empty week for display; fall back through -1, -2
  const { displayAnimalData, baselineAnimalMap } = useMemo(() => {
    const weeks = [
      { data: normAnimal(animalWeek0), baseline: normAnimal(animalWeekMinus1) },
      { data: normAnimal(animalWeekMinus1), baseline: normAnimal(animalWeekMinus2) },
      { data: normAnimal(animalWeekMinus2), baseline: [] },
    ];
    for (const w of weeks) {
      if (w.data.length > 0) {
        const map = new Map<string, number>();
        for (const it of w.baseline) {
          if (it.name) map.set(it.name, it.value);
        }
        return { displayAnimalData: w.data, baselineAnimalMap: map };
      }
    }
    return { displayAnimalData: [] as { name: string; value: number }[], baselineAnimalMap: new Map<string, number>() };
  }, [animalWeek0, animalWeekMinus1, animalWeekMinus2]);

  const rankedList = useMemo<RankItem[]>(() => {
    const src = activeTab === "activity" ? rawActivityList : displayAnimalData;
    const items: RankItem[] = src.slice(0, MAX_ITEMS).map((item, idx) => {
      const name = item.name ?? "";
      const value = item.value ?? 0;
      let trend: RankItem["trend"] = "same";
      let trendValue = 0;

      if (activeTab === "activity") {
        // 进出活跃：对比后端快照中的上次排名 (prevRankMap)
        const prevRank = prevRankMap.get(name);
        if (prevRank !== undefined) {
          const curRank = idx + 1;
          if (prevRank > curRank) {
            trend = "up";
            trendValue = prevRank - curRank;
          } else if (prevRank < curRank) {
            trend = "down";
            trendValue = curRank - prevRank;
          }
        }
      } else {
        // 动物消耗：对比上一周数量 (baselineAnimalMap)
        const prevVal = baselineAnimalMap.get(name);
        if (prevVal !== undefined && prevVal > 0) {
          if (value > prevVal) {
            trend = "up";
            trendValue = value - prevVal;
          } else if (value < prevVal) {
            trend = "down";
            trendValue = prevVal - value;
          }
        }
      }
      return { name, value, trend, trendValue };
    });

    return items;
  }, [rawActivityList, displayAnimalData, activeTab, region, baselineAnimalMap, prevRankMap]);

  const top3 = rankedList.slice(0, 3);
  const rest = rankedList.slice(3);
  const maxValue =
    rankedList.length > 0 ? Math.max(rankedList[0].value, 1) : 1;

  // ---- Coordinated auto-scroll + region/tab rotation ----
  // Scrolls list from top to bottom, pauses 3s, then advances to next region.
  // After all 3 regions, switches to the other tab. Cycle:
  //   Activity TOTAL → PUDONG → PUXI → Animal TOTAL → PUDONG → PUXI → loop
  const regionRef = useRef<Region>(region);
  regionRef.current = region;

  const advanceCycle = useCallback(() => {
    const cur = regionRef.current;
    const idx = REGIONS.indexOf(cur);
    if (idx < REGIONS.length - 1) {
      setRegion(REGIONS[idx + 1]);
    } else {
      // All regions exhausted — switch tab and reset region
      setRegion("TOTAL");
      setActiveTab((prev) => (prev === "activity" ? "animal" : "activity"));
    }
  }, []);

  // Reset scroll position on region/tab change
  useEffect(() => {
    if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
  }, [region, activeTab]);

  useEffect(() => {
    const displayCount = activeTab === "activity" ? rest.length : rankedList.length;
    if (!isAutoPlaying || displayCount <= 3) return;
    let active = true;
    let raf: number;
    let timeout: ReturnType<typeof setTimeout>;

    const scrollOneCycle = () => {
      if (!active || !scrollBoxRef.current) return;
      const el = scrollBoxRef.current;
      el.scrollTop = 0;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) {
        // nothing to scroll — brief pause then advance
        timeout = setTimeout(advanceCycle, 3000);
        return;
      }

      const start = performance.now();
      const duration = Math.max(4000, maxScroll * 38); // ~26px/s, 与公告模块相同速度

      const animate = (now: number) => {
        if (!active) return;
        const progress = Math.min((now - start) / duration, 1);
        el.scrollTop = progress * maxScroll; // linear, no easing
        if (progress < 1) {
          raf = requestAnimationFrame(animate);
        } else {
          // reached bottom — pause 3s then advance region/tab
          timeout = setTimeout(advanceCycle, 3000);
        }
      };
      raf = requestAnimationFrame(animate);
    };

    // initial delay before first scroll
    timeout = setTimeout(scrollOneCycle, 2500);
    return () => {
      active = false;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [isAutoPlaying, rest.length, rankedList.length, region, activeTab, advanceCycle]);

  const handleTabClick = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setRegion("TOTAL"); // reset region on manual tab switch
    setIsAutoPlaying(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setIsAutoPlaying(true), 8000);
  }, []);

  const handleRegionClick = useCallback((reg: Region) => {
    setRegion(reg);
    setIsAutoPlaying(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setIsAutoPlaying(true), 8000);
  }, []);

  const isLoading = activeTab === "activity" ? activityLoading : animalLoading;

  // ---- Render helpers ----
  const trendEl = (trend: RankItem["trend"], trendValue: number) => {
    if (trend === "up") {
      return (
        <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 900 }}>
          ▲{trendValue}
        </span>
      );
    }
    if (trend === "down") {
      return (
        <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 900 }}>
          ▼{trendValue}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full flex flex-col gap-1 overflow-hidden bg-transparent">
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-amber-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <div
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              boxShadow: "0 0 12px rgba(245,158,11,0.4)",
            }}
          >
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <span
            className="text-[16px] font-black tracking-wider"
            style={{
              background: "linear-gradient(90deg, #b45309, #d97706)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            排行榜
          </span>
        </div>
        <div className="flex p-0.5 rounded-md" style={{ background: "#fef3c7" }}>
          <button
            type="button"
            onClick={() => handleTabClick("activity")}
            style={{
              padding: "3px 10px",
              borderRadius: 5,
              fontWeight: 800,
              fontSize: 10,
              background: activeTab === "activity" ? "#fbbf24" : "transparent",
              color: activeTab === "activity" ? "#fff" : "#b45309",
              boxShadow:
                activeTab === "activity"
                  ? "0 2px 6px rgba(245,158,11,0.35)"
                  : "none",
              transition: "all 0.2s",
            }}
          >
            进出活跃
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("animal")}
            style={{
              padding: "3px 10px",
              borderRadius: 5,
              fontWeight: 800,
              fontSize: 10,
              background: activeTab === "animal" ? "#fbbf24" : "transparent",
              color: activeTab === "animal" ? "#fff" : "#b45309",
              boxShadow:
                activeTab === "animal"
                  ? "0 1px 3px rgba(245,158,11,0.3)"
                  : "none",
              transition: "all 0.2s",
            }}
          >
            动物消耗
          </button>
        </div>
      </div>

      {/* Region filter */}
      <div className="flex gap-2 items-center shrink-0">
        {REGIONS.map((reg) => (
          <button
            key={reg}
            type="button"
            onClick={() => handleRegionClick(reg)}
            style={{
              padding: "2px 10px",
              borderRadius: 4,
              fontWeight: 800,
              fontSize: 10,
              background: region === reg ? "#3b82f6" : "transparent",
              color: region === reg ? "#fff" : "#94a3b8",
              boxShadow:
                region === reg ? "0 2px 6px rgba(59,130,246,0.35)" : "none",
              transition: "all 0.15s",
            }}
          >
            {REGION_LABELS[reg]}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-400 font-semibold">Top 50</span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400 animate-pulse">
          加载中…
        </div>
      ) : (
        <>
          {/* Podium — only for activity tab */}
          {activeTab === "activity" && top3.length > 0 && (
            <div
              className="flex items-end justify-center shrink-0 pt-1"
              style={{ gap: 5 }}
            >
              {podiumOrder.map((podiumIdx) => {
                const item = top3[podiumIdx];
                if (!item) return null;
                const colors = podiumColors[podiumIdx];
                const fontSize = podiumIdx === 0 ? 11 : podiumIdx === 1 ? 10 : 9;
                const numSize = podiumIdx === 0 ? 22 : podiumIdx === 1 ? 18 : 14;
                return (
                  <div
                    key={`podium-${activeTab}-${podiumIdx}`}
                    style={{
                      textAlign: "center",
                      width: podiumWidths[podiumIdx],
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          podiumIdx === 0 ? 32 : podiumIdx === 1 ? 28 : 24,
                      }}
                    >
                      {colors.medal}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize,
                        color: podiumIdx === 0 ? "#b45309" : "#475569",
                        lineHeight: 1.2,
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        background: colors.bg,
                        height: colors.height,
                        borderRadius: "3px 3px 0 0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 2,
                        animation: colors.anim,
                        position: "relative",
                        boxShadow:
                          podiumIdx === 0
                            ? "0 0 18px rgba(251,191,36,0.4)"
                            : undefined,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: numSize,
                          color: "#fff",
                          textShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                      >
                        {podiumIdx + 1}
                      </span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700 }}>
                      {item.value}{" "}
                      {trendEl(item.trend, item.trendValue)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Flat list — 4-20 for activity, 1-20 for animal */}
          <div
            ref={scrollBoxRef}
            className="flex-1 flex flex-col gap-[1.5px] overflow-y-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {(activeTab === "activity" ? rest : rankedList).map(
              (item, i) => {
                const rank =
                  activeTab === "activity" ? i + 4 : i + 1;
                const pct =
                  maxValue > 0 ? (item.value / maxValue) * 100 : 0;

                return (
                  <div
                    key={`rank-${activeTab}-${rank}`}
                    className="flex items-center px-[1%] py-[3px] rounded-sm"
                    style={{
                      gap: 6,
                      background: i % 2 === 0 ? "#f8fafc" : "transparent",
                      minHeight: 22,
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        textAlign: "center",
                        fontWeight: 900,
                        fontSize: 11,
                        color: "#cbd5e1",
                        flexShrink: 0,
                      }}
                    >
                      {rank}
                    </span>
                    <span
                      style={{
                        width: 120,
                        fontSize: 11,
                        color: "#334155",
                        textAlign: "left",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 10,
                        background: "#f1f5f9",
                        borderRadius: 5,
                        overflow: "hidden",
                        minWidth: 10,
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background:
                            "linear-gradient(90deg, #6366f1, #8b5cf6)",
                          borderRadius: 5,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          className="animate-shimmer-bg"
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                            backgroundSize: "200% 100%",
                          }}
                        />
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 11,
                        color: "#475569",
                        width: 40,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {item.value}
                    </span>
                    <span
                      style={{ width: 34, textAlign: "right", flexShrink: 0 }}
                    >
                      {trendEl(item.trend, item.trendValue)}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </>
      )}
    </div>
  );
}
