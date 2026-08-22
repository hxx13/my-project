/**
 * 流水灯时间线条：横向滚动 + 当前阶段高亮流光，同步 active surgery 的 currentTp。
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNhpVisits, type NhpVisit } from "../api/nhpVisit.api";
import "../nhp.css";

type Props = {
  currentTp?: string | null;
  day0?: string | null;
  lifecycleStage?: string;
};

function visitLabel(v: NhpVisit): string {
  return v.name?.trim() || v.code;
}

export default function NhpOverviewTimelineMarquee({ currentTp, day0, lifecycleStage }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const visitsQuery = useQuery({ queryKey: ["nhp", "visits"], queryFn: fetchNhpVisits, staleTime: 60_000 });
  const visits = visitsQuery.data ?? [];

  const sorted = useMemo(() => [...visits].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), [visits]);
  const currentIdx = sorted.findIndex((v) => v.code === currentTp);
  const currentVisit = currentIdx >= 0 ? sorted[currentIdx] : null;

  useEffect(() => {
    const track = trackRef.current;
    const active = activeRef.current;
    if (!track || !active) return;
    const trackRect = track.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset = activeRect.left - trackRect.left - trackRect.width / 2 + activeRect.width / 2;
    track.scrollTo({ left: track.scrollLeft + offset, behavior: "smooth" });
  }, [currentTp, sorted.length]);

  if (visitsQuery.isLoading) {
    return (
      <div className="nhp-cockpit-marquee nhp-cockpit-marquee--loading">
        <span className="nhp-cockpit-marquee-stage">加载进度…</span>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="nhp-cockpit-marquee nhp-cockpit-marquee--empty">
        <span className="nhp-cockpit-marquee-stage">暂无访视时点</span>
      </div>
    );
  }

  return (
    <div className="nhp-cockpit-marquee">
      <div className="nhp-cockpit-marquee-head">
        <span className="nhp-cockpit-marquee-stage">
          {currentVisit ? visitLabel(currentVisit) : "待入组"}
        </span>
        <span className="nhp-cockpit-marquee-meta">
          {day0 ? `手术日 ${day0}` : "术前"}
          {lifecycleStage ? ` · ${lifecycleStage}` : ""}
        </span>
      </div>
      <div className="nhp-cockpit-marquee-track" ref={trackRef}>
        <div className="nhp-cockpit-marquee-rail">
          {sorted.map((v, idx) => {
            const isDone = currentIdx >= 0 && idx < currentIdx;
            const isCur = v.code === currentTp;
            const isEvent = (v.eventAnchor ?? "").toUpperCase() === "EVENT";
            const cls = [
              "nhp-cockpit-marquee-node",
              isDone ? "done" : "",
              isCur ? "active" : "",
              isEvent ? "event" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={v.code}
                type="button"
                ref={isCur ? activeRef : undefined}
                className={cls}
                title={`${v.code} · ${visitLabel(v)}`}
              >
                <span className="nhp-cockpit-marquee-dot" aria-hidden />
                <span className="nhp-cockpit-marquee-lbl">{visitLabel(v)}</span>
                {isCur ? <span className="nhp-cockpit-marquee-glow" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
