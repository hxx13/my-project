import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchGroupRanking, fetchAnimalOrderRanking } from "@/api/twinApi";

type RankItem = { name?: string; groupName?: string; value?: number; count?: number };

export default function RankingsSection() {
  const [region, setRegion] = useState<"TOTAL" | "PUDONG" | "PUXI">("TOTAL");

  const { data: groupRank = [] } = useQuery({
    queryKey: ["cosmos-ranking", "MONTH", region],
    queryFn: () => fetchGroupRanking("MONTH", region),
    refetchInterval: 300_000,
  });

  const { data: animalRank = [] } = useQuery({
    queryKey: ["cosmos-animal-ranking", region],
    queryFn: () => fetchAnimalOrderRanking(region),
    refetchInterval: 300_000,
  });

  // auto cycle region
  useEffect(() => {
    const iv = setInterval(() => {
      setRegion((r) => (r === "TOTAL" ? "PUDONG" : r === "PUDONG" ? "PUXI" : "TOTAL"));
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  const safeGroup = useMemo(() => (Array.isArray(groupRank) ? groupRank : []), [groupRank]);
  const safeAnimal = useMemo(() => (Array.isArray(animalRank) ? animalRank : []), [animalRank]);

  const regionLabel = region === "TOTAL" ? "全区域" : region === "PUDONG" ? "浦东" : "浦西";

  return (
    <section
      style={{
        height: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        overflow: "hidden",
        scrollSnapAlign: "start", scrollSnapStop: "always" as const,
        flexShrink: 0, contain: "paint",
        padding: "60px 80px",
        gap: 40,
      }}
    >
      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <span
          style={{
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 10,
            color: "rgba(255,255,255,0.6)",
            textShadow: "0 0 40px rgba(250,204,21,0.3)",
          }}
        >
          月度荣誉榜 · {regionLabel}
        </span>
      </div>

      {/* Top 3 Podium */}
      <div style={{ display: "flex", gap: 32, alignItems: "flex-end", justifyContent: "center" }}>
        {safeGroup.slice(0, 3).map((item: RankItem, i) => {
          const rank = i + 1;
          const name = String(item.name ?? item.groupName ?? "—");
          const val = Number(item.value ?? item.count ?? 0);
          const colors = [
            { border: "#fbbf24", glow: "rgba(251,191,36,0.5)", bg: "rgba(251,191,36,0.08)", size: 1.15 },
            { border: "#94a3b8", glow: "rgba(148,163,184,0.4)", bg: "rgba(148,163,184,0.06)", size: 0.95 },
            { border: "#d97706", glow: "rgba(217,119,6,0.4)", bg: "rgba(217,119,6,0.05)", size: 0.85 },
          ][i];
          return (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, type: "spring", stiffness: 200 }}
              style={{
                width: 200 * colors.size,
                padding: "28px 24px",
                borderRadius: 16,
                border: `1.5px solid ${colors.border}`,
                background: colors.bg,
                boxShadow: `0 0 40px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 900,
                  color: colors.border,
                  textShadow: `0 0 30px ${colors.glow}`,
                  lineHeight: 1,
                }}
              >
                {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{name}</span>
              <span style={{ fontSize: 32, fontWeight: 900, color: colors.border, textShadow: `0 0 20px ${colors.glow}` }}>
                {val.toLocaleString()}
              </span>
              <span style={{ fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.3)" }}>分</span>
            </motion.div>
          );
        })}
      </div>

      {/* Ranks 4-10 Bar Race */}
      <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 8 }}>
        {safeGroup.slice(3, 10).map((item: RankItem, i) => {
          const rank = i + 4;
          const name = String(item.name ?? item.groupName ?? "—");
          const val = Number(item.value ?? item.count ?? 0);
          const maxVal = Number(safeGroup[0]?.value ?? safeGroup[0]?.count ?? 1);
          const pct = Math.round((val / Math.max(maxVal, 1)) * 100);
          return (
            <motion.div
              key={name}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                height: 36,
              }}
            >
              <span style={{ width: 28, textAlign: "right", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>
                {rank}
              </span>
              <span style={{ width: 100, fontSize: 13, fontWeight: 700, color: "#e2e8f0", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name}
              </span>
              <div style={{ flex: 1, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.2, delay: i * 0.08, ease: "easeOut" }}
                  style={{
                    height: "100%",
                    borderRadius: 4,
                    background: `linear-gradient(90deg, rgba(59,130,246,0.6), rgba(139,92,246,0.4))`,
                    boxShadow: "0 0 12px rgba(59,130,246,0.25)",
                  }}
                />
              </div>
              <span style={{ width: 56, fontSize: 13, fontWeight: 800, color: "#f1f5f9", textAlign: "right" }}>
                {val.toLocaleString()}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Animal ranking mini bar at bottom */}
      {safeAnimal.length > 0 && (
        <div style={{ width: "100%", maxWidth: 700, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "rgba(255,255,255,0.3)", marginBottom: 10, textAlign: "center" }}>
            动物订购排行
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {safeAnimal.slice(0, 7).map((item: RankItem, i) => {
              const name = String(item.name ?? item.groupName ?? "—");
              const val = Number(item.value ?? item.count ?? 0);
              return (
                <div
                  key={name}
                  style={{
                    textAlign: "center",
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: i === 0 ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${i === 0 ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#fbbf24" : "#e2e8f0" }}>{name}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? "#fbbf24" : "#94a3b8", marginTop: 2 }}>
                    {val}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </section>
  );
}
