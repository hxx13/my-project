import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { OpsPresenceCard } from "../useOpsWallData";
import { getCardKindLabel } from "../useOpsWallData";
import { useOpsSceneReveal } from "../useOpsSceneReveal";

gsap.registerPlugin(ScrollTrigger);

function fmtMins(m: number): string {
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins > 0 ? `${h}小时${mins}分` : `${h}小时`;
}

type ScenePresenceProps = {
  pudongCards: OpsPresenceCard[];
  puxiCards: OpsPresenceCard[];
  loading?: boolean;
  reducedMotion: boolean;
};

export function ScenePresence({ pudongCards, puxiCards, loading, reducedMotion }: ScenePresenceProps) {
  const [campus, setCampus] = useState<"pudong" | "puxi">("pudong");
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const activeCards = campus === "pudong" ? pudongCards : puxiCards;
  const pdKeep = useMemo(() => pudongCards.filter((c) => c.cardKind === "keep").length, [pudongCards]);
  const pxKeep = useMemo(() => puxiCards.filter((c) => c.cardKind === "keep").length, [puxiCards]);

  useOpsSceneReveal(sectionRef, headerRef, reducedMotion, "fade-down", [campus]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const strip = stripRef.current;
      if (!section || !strip || reducedMotion || activeCards.length === 0) return;

      const frames = strip.querySelectorAll<HTMLElement>("[data-presence-frame]");

      gsap.fromTo(
        frames,
        { opacity: 0, y: 20, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.5,
          stagger: 0.045,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: "top 70%",
            toggleActions: "play none none reverse",
          },
        },
      );
    },
    { scope: sectionRef, dependencies: [activeCards, campus, reducedMotion] },
  );

  return (
    <section ref={sectionRef} data-ops-scene="presence" className="ops-scene ops-scene--presence" aria-label="在室人员">
      <div className="ops-scene__inner ops-scene__inner--presence">
        <header ref={headerRef} className="ops-presence-header">
          <h2 className="ops-presence-title">
            谁在
            <em>里面</em>
          </h2>
          <div className="ops-presence-tabs" role="tablist" aria-label="校区">
            {(
              [
                { key: "pudong" as const, label: "浦东", count: pudongCards.length, keep: pdKeep },
                { key: "puxi" as const, label: "浦西", count: puxiCards.length, keep: pxKeep },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={campus === tab.key}
                data-active={campus === tab.key ? "true" : "false"}
                className="ops-presence-tab"
                onClick={() => setCampus(tab.key)}
              >
                {tab.label}
                <span className="ops-presence-tab__count">{tab.count} 人</span>
                {tab.keep > 0 ? <span className="ops-presence-tab__warn">延迟还卡 {tab.keep}</span> : null}
              </button>
            ))}
          </div>
        </header>

        {loading && activeCards.length === 0 ? (
          <div className="ops-presence-strip ops-presence-strip--loading" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="ops-presence-frame ops-presence-frame--skeleton">
                <div className="ops-wall-skeleton h-5 w-24" />
                <div className="ops-wall-skeleton h-4 w-full" />
              </div>
            ))}
          </div>
        ) : activeCards.length === 0 ? (
          <p className="ops-scene-empty">
            {campus === "pudong" ? "浦东" : "浦西"}现在没人在室，有人刷卡进来后会显示
          </p>
        ) : (
          <div ref={stripRef} className="ops-presence-strip" data-ops-wall-scroll tabIndex={0}>
            {activeCards.map((card) => (
              <article
                key={card.id}
                data-presence-frame
                className="ops-presence-frame"
                data-keep={card.cardKind === "keep" ? "true" : undefined}
              >
                <header className="ops-presence-frame__head">
                  <h3>{card.userName}</h3>
                  <span className="ops-presence-frame__kind">{getCardKindLabel(card.cardKind)}</span>
                </header>
                <p className="ops-presence-frame__group">{card.groupName}</p>
                <p className="ops-presence-frame__loc">
                  {card.areaName} · {card.roomName}
                </p>
                <footer className="ops-presence-frame__foot">
                  <time dateTime={`${card.enterDate}T${card.enterClock}`}>
                    {card.enterDate} {card.enterClock} 进
                  </time>
                  <span>待了 {fmtMins(card.passedMins)}</span>
                </footer>
              </article>
            ))}
          </div>
        )}

        {activeCards.length > 8 ? (
          <div className="ops-presence-table-wrap" data-ops-wall-scroll>
            <table className="ops-presence-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>课题组</th>
                  <th>位置</th>
                  <th>进入时间</th>
                  <th>时长</th>
                  <th>卡类型</th>
                </tr>
              </thead>
              <tbody>
                {activeCards.map((card) => (
                  <tr key={`tbl-${card.id}`} data-keep={card.cardKind === "keep" ? "true" : undefined}>
                    <td>{card.userName}</td>
                    <td>{card.groupName}</td>
                    <td>
                      {card.areaName} · {card.roomName}
                    </td>
                    <td>
                      {card.enterDate} {card.enterClock}
                    </td>
                    <td>{fmtMins(card.passedMins)}</td>
                    <td>{getCardKindLabel(card.cardKind)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
