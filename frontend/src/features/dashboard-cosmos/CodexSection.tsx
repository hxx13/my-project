import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { fetchDashboardViolationBoard, type DashboardViolationBoardItem } from "@/api/domains/dashboardViolationBoard.api";

function pick(cfg: Record<string, string> | undefined, key: string, fallback: string) {
  if (!cfg) return fallback;
  const v = cfg[key];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s !== "" ? s : fallback;
}

export default function CodexSection() {
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [items, setItems] = useState<DashboardViolationBoardItem[]>([]);
  const [activePanel, setActivePanel] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [c, vb] = await Promise.all([
          fetchPublicRuntimeConfig(),
          fetchDashboardViolationBoard(),
        ]);
        if (!cancelled) {
          setCfg(c);
          setItems(vb?.items ?? []);
        }
      } catch {
        // silently fail
      }
    };
    load();
    const iv = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const title = pick(cfg ?? undefined, "dashboard.codex.title", "标准还卡与违规惩戒说明");
  const rulesText = pick(cfg ?? undefined, "dashboard.codex.return_rules", "");
  const noticeTitle = pick(cfg ?? undefined, "dashboard.codex.notice_title", "公告与通知");
  const noticeBody = pick(cfg ?? undefined, "dashboard.codex.notice_body", "");

  // cycle active panel
  const totalPanels = 1 + (rulesText ? 1 : 0) + (noticeBody ? 1 : 0) + items.length;
  useEffect(() => {
    if (totalPanels <= 1) return;
    const iv = setInterval(() => {
      setActivePanel((p) => (p + 1) % totalPanels);
    }, 6000);
    return () => clearInterval(iv);
  }, [totalPanels]);

  const panelIndex = 0;
  const allPanels: { key: string; title: string; body: string; accent: string }[] = [];

  // main codex panel
  allPanels.push({
    key: "codex",
    title,
    body: rulesText || "每天早 8:00—晚 5:30 为卡片使用时间。超时未还卡可能导致无法退出登录或权限受限。",
    accent: "#06b6d4",
  });

  // notice panel
  if (noticeBody) {
    allPanels.push({
      key: "notice",
      title: noticeTitle,
      body: noticeBody,
      accent: "#a78bfa",
    });
  }

  // violation items
  for (const item of items) {
    allPanels.push({
      key: `violation-${item.id ?? Math.random()}`,
      title: item.displayName ?? "违规记录",
      body: item.summary ?? "",
      accent: "#f97316",
    });
  }

  if (allPanels.length === 0) {
    allPanels.push({
      key: "empty",
      title: "规则法典",
      body: "暂无规则数据。",
      accent: "#06b6d4",
    });
  }

  const current = allPanels[activePanel % allPanels.length];

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
        padding: "60px 40px",
        gap: 48,
      }}
    >
      {/* Section title */}
      <div style={{ textAlign: "center" }}>
        <span
          style={{
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 10,
            color: "rgba(255,255,255,0.6)",
            textShadow: "0 0 40px rgba(168,85,247,0.3)",
          }}
        >
          AI 智能规则法典
        </span>
      </div>

      {/* Orbiting panel ring */}
      <div
        style={{
          position: "relative",
          width: 560,
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Background orbit panels (smaller, dimmer) */}
        {allPanels.map((panel, i) => {
          if (i === activePanel % allPanels.length) return null; // skip active
          const angle = ((i - activePanel) / allPanels.length) * Math.PI * 2;
          const orbitR = 260;
          const ox = Math.cos(angle) * orbitR;
          const oy = Math.sin(angle) * orbitR * 0.4;
          const dist = Math.abs(i - activePanel);
          const closest = Math.min(dist, allPanels.length - dist);
          const alpha = Math.max(0.1, 1 - closest * 0.45);

          return (
            <motion.div
              key={panel.key}
              animate={{ x: ox, y: oy, opacity: alpha }}
              transition={{ duration: 3, ease: "easeInOut" }}
              style={{
                position: "absolute",
                width: 160,
                padding: "12px",
                borderRadius: 10,
                border: `1px solid ${panel.accent}33`,
                background: "rgba(255,255,255,0.02)",
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: panel.accent, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {panel.title}
              </div>
            </motion.div>
          );
        })}

        {/* Active panel — front and center */}
        <motion.div
          key={current.key}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
          style={{
            width: 420,
            maxHeight: 280,
            padding: "36px 40px",
            borderRadius: 20,
            border: `1.5px solid ${current.accent}66`,
            background: `radial-gradient(ellipse at center, ${current.accent}10 0%, transparent 70%)`,
            boxShadow: `0 0 80px ${current.accent}22, 0 0 160px ${current.accent}08`,
            textAlign: "center",
            zIndex: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: current.accent,
              textShadow: `0 0 30px ${current.accent}66`,
              marginBottom: 20,
              letterSpacing: 2,
            }}
          >
            {current.title}
          </div>
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.8,
              color: "rgba(255,255,255,0.7)",
              whiteSpace: "pre-wrap",
              maxHeight: 160,
              overflowY: "auto",
            }}
          >
            {current.body}
          </div>
        </motion.div>
      </div>

      {/* Panel dots indicator */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {allPanels.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActivePanel(i)}
            aria-label={`Panel ${i + 1}`}
            style={{
              width: i === activePanel % allPanels.length ? 20 : 6,
              height: 6,
              borderRadius: 3,
              border: "none",
              background: i === activePanel % allPanels.length ? allPanels[i].accent : "rgba(255,255,255,0.15)",
              cursor: "pointer",
              transition: "all 0.4s ease",
            }}
          />
        ))}
      </div>

    </section>
  );
}
