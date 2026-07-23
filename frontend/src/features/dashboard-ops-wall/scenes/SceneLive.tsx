import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { UniversalEvent } from "@/store/useEventStore";
import { useOpsSceneReveal } from "../useOpsSceneReveal";

function campusColor(campus: string): string {
  return campus.includes("浦西") ? "var(--ops-wall-campus-puxi)" : "var(--ops-wall-campus-pudong)";
}

export type SceneLiveProps = {
  events: UniversalEvent[];
  reducedMotion: boolean;
};

export function SceneLive({ events, reducedMotion }: SceneLiveProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const entries = useMemo(
    () => events.filter((e) => e.action === "ENTER").slice(0, 14),
    [events],
  );

  useOpsSceneReveal(sectionRef, headerRef, reducedMotion, "fade-only", [entries.length]);

  useEffect(() => {
    const track = trackRef.current;
    tweenRef.current?.kill();
    tweenRef.current = null;

    if (!track || reducedMotion || entries.length === 0) {
      if (track) gsap.set(track, { x: 0 });
      return;
    }

    const startTicker = () => {
      tweenRef.current?.kill();
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth <= 0) return;

      gsap.set(track, { x: 0 });
      tweenRef.current = gsap.to(track, {
        x: -halfWidth,
        duration: Math.max(28, entries.length * 3.5),
        ease: "none",
        repeat: -1,
      });
    };

    startTicker();
    const ro = new ResizeObserver(startTicker);
    ro.observe(track);

    return () => {
      ro.disconnect();
      tweenRef.current?.kill();
      gsap.set(track, { x: 0 });
    };
  }, [entries, reducedMotion]);

  const renderFrame = (evt: UniversalEvent, suffix: string) => {
    const timeStr = evt.timestamp ? evt.timestamp.split(" ")[1]?.substring(0, 5) ?? "--:--" : "--:--";
    const color = campusColor(evt.location?.campus || "");
    return (
      <figure key={`${evt.eventId}${suffix}`} className="ops-live-frame">
        <figcaption className="ops-live-frame__name">{evt.person?.name || "—"}</figcaption>
        <p className="ops-live-frame__group">{evt.person?.group || ""}</p>
        <p className="ops-live-frame__room" style={{ color }}>
          {evt.location?.room || ""}
        </p>
        <time className="ops-live-frame__time">{timeStr}</time>
      </figure>
    );
  };

  return (
    <section ref={sectionRef} data-ops-scene="live" className="ops-scene ops-scene--live" aria-label="最近进入">
      <div className="ops-scene__inner ops-scene__inner--live">
        <h2 ref={headerRef} className="ops-live-title">
          最近
          <em>刷卡</em>
        </h2>

        {entries.length === 0 ? (
          <p className="ops-scene-empty">还没有人刷卡进来，有进出后会自动刷出来</p>
        ) : reducedMotion ? (
          <div className="ops-live-strip ops-live-strip--static">
            {entries.map((e) => renderFrame(e, ""))}
          </div>
        ) : (
          <div className="ops-live-reel" aria-hidden={false}>
            <div ref={trackRef} className="ops-live-reel__track">
              {entries.map((e) => renderFrame(e, "-a"))}
              {entries.map((e) => renderFrame(e, "-b"))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
