import { useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { RoomStats } from "@/api/twinApi";
import { useOpsSceneReveal } from "../useOpsSceneReveal";

gsap.registerPlugin(ScrollTrigger);

type RoomRow = {
  name: string;
  value: number;
  campus: "pudong" | "puxi";
};

type SceneRoomsProps = {
  pudongRooms: RoomStats[];
  puxiRooms: RoomStats[];
  loading?: boolean;
  reducedMotion: boolean;
};

export function SceneRooms({ pudongRooms, puxiRooms, loading, reducedMotion }: SceneRoomsProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<RoomRow[]>(() => {
    const list: RoomRow[] = [
      ...pudongRooms.map((r) => ({ name: r.name, value: r.value, campus: "pudong" as const })),
      ...puxiRooms.map((r) => ({ name: r.name, value: r.value, campus: "puxi" as const })),
    ];
    return list.sort((a, b) => b.value - a.value);
  }, [pudongRooms, puxiRooms]);

  const maxVal = useMemo(() => Math.max(...rows.map((r) => r.value), 1), [rows]);

  useOpsSceneReveal(sectionRef, headerRef, reducedMotion, "fade-up", [rows.length]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const strip = stripRef.current;
      if (!section || !strip || reducedMotion || rows.length === 0) return;

      const items = strip.querySelectorAll<HTMLElement>("[data-room-col]");
      const bars = strip.querySelectorAll<HTMLElement>("[data-room-bar]");

      gsap.fromTo(
        items,
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.035,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 68%",
            toggleActions: "play none none reverse",
          },
        },
      );

      gsap.fromTo(
        bars,
        { scaleY: 0, transformOrigin: "bottom center" },
        {
          scaleY: 1,
          duration: 0.85,
          stagger: 0.035,
          ease: "power2.out",
          transformOrigin: "bottom center",
          scrollTrigger: {
            trigger: section,
            start: "top 68%",
            toggleActions: "play none none reverse",
          },
        },
      );
    },
    { scope: sectionRef, dependencies: [rows, reducedMotion] },
  );

  return (
    <section ref={sectionRef} data-ops-scene="rooms" className="ops-scene ops-scene--rooms" aria-label="各房间人次">
      <div className="ops-scene__inner ops-scene__inner--rooms">
        <header ref={headerRef} className="ops-rooms-header">
          <h2 className="ops-rooms-title">
            各房间
            <em>人次</em>
          </h2>
          <p className="ops-rooms-hint">左右滑 · 共 {rows.length} 间</p>
        </header>

        {loading && rows.length === 0 ? (
          <div className="ops-rooms-strip ops-rooms-strip--loading" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="ops-room-col ops-room-col--skeleton">
                <div className="ops-wall-skeleton ops-room-col__bar" />
                <div className="ops-wall-skeleton ops-room-col__name" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="ops-scene-empty">今天还没有刷卡记录，等有人进出后会显示在这里</p>
        ) : (
          <div ref={stripRef} className="ops-rooms-strip" data-ops-wall-scroll tabIndex={0}>
            {rows.map((row) => {
              const heightPct = Math.max(8, Math.round((row.value / maxVal) * 100));
              const campusClass =
                row.campus === "pudong" ? "ops-room-col--pd" : "ops-room-col--px";
              return (
                <article key={`${row.campus}-${row.name}`} data-room-col className={`ops-room-col ${campusClass}`}>
                  <span className="ops-room-col__value">{row.value}</span>
                  <div className="ops-room-col__bar-wrap">
                    <div
                      data-room-bar
                      className="ops-room-col__bar"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <h3 className="ops-room-col__name">{row.name}</h3>
                  <span className="ops-room-col__campus">{row.campus === "pudong" ? "浦东" : "浦西"}</span>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
