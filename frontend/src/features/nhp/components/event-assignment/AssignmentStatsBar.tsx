import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { AssignmentMatrixStats } from "../../event-assignment/eventAssignment.types";

gsap.registerPlugin(useGSAP);

interface AssignmentStatsBarProps {
  stats: AssignmentMatrixStats;
}

export function AssignmentStatsBar({ stats }: AssignmentStatsBarProps) {
  const countRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!countRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      gsap.fromTo(
        countRef.current,
        { scale: 1 },
        { scale: 1.12, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.out", clearProps: "transform" },
      );
    },
    { dependencies: [stats.assignedCells] },
  );

  const pct = stats.totalCells > 0 ? Math.round((stats.assignedCells / stats.totalCells) * 100) : 0;

  return (
    <div className="nhp-assign-stats">
      <span className="nhp-assign-stats-chip">
        表单 <strong>{stats.formCount}</strong>
      </span>
      <span className="nhp-assign-stats-chip">
        事件 <strong>{stats.visitCount}</strong>
      </span>
      <span className="nhp-assign-stats-chip nhp-assign-stats-chip--accent">
        已指派 <strong ref={countRef}>{stats.assignedCells}</strong>/{stats.totalCells}
        <span className="nhp-assign-stats-pct">({pct}%)</span>
      </span>
    </div>
  );
}
