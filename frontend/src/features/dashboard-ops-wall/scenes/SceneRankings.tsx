import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useOpsWallRankings } from "../useOpsWallData";
import { useOpsSceneReveal } from "../useOpsSceneReveal";

gsap.registerPlugin(ScrollTrigger);

type RankItem = { name?: string; groupName?: string; value?: number; count?: number };

const REGIONS = [
  { key: "TOTAL" as const, label: "全部" },
  { key: "PUDONG" as const, label: "浦东" },
  { key: "PUXI" as const, label: "浦西" },
];

function pickName(item: RankItem): string {
  return String(item.name ?? item.groupName ?? "—");
}

function pickValue(item: RankItem): number {
  return Number(item.value ?? item.count ?? 0);
}

type SceneRankingsProps = {
  reducedMotion: boolean;
};

export function SceneRankings({ reducedMotion }: SceneRankingsProps) {
  const [region, setRegion] = useState<"TOTAL" | "PUDONG" | "PUXI">("TOTAL");
  const { groupRank, animalRank, isLoading } = useOpsWallRankings(region);
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const topTen = useMemo(() => groupRank.slice(0, 10), [groupRank]);
  const maxVal = useMemo(() => Math.max(pickValue(topTen[0] ?? {}), 1), [topTen]);
  const animalTop = useMemo(() => animalRank.slice(0, 5), [animalRank]);

  useOpsSceneReveal(sectionRef, headerRef, reducedMotion, "fade-left", [region]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const list = listRef.current;
      if (!section || !list || reducedMotion || topTen.length === 0) return;

      const rows = list.querySelectorAll<HTMLElement>("[data-race-row]");
      const bars = list.querySelectorAll<HTMLElement>("[data-race-bar]");

      gsap.fromTo(
        rows,
        { opacity: 0, x: -16 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          stagger: 0.05,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: "top 65%",
            toggleActions: "play none none reverse",
          },
        },
      );

      gsap.set(bars, { scaleX: 0, transformOrigin: "left center" });
      gsap.to(bars, {
        scaleX: 1,
        duration: 0.85,
        stagger: 0.06,
        ease: "power3.out",
        transformOrigin: "left center",
        scrollTrigger: {
          trigger: section,
          start: "top 65%",
          toggleActions: "play none none reverse",
        },
      });
    },
    { scope: sectionRef, dependencies: [topTen, region, reducedMotion] },
  );

  return (
    <section ref={sectionRef} data-ops-scene="ranking" className="ops-scene ops-scene--ranking" aria-label="课题组排行">
      <div className="ops-scene__inner ops-scene__inner--ranking">
        <header ref={headerRef} className="ops-ranking-header">
          <h2 className="ops-ranking-title">
            课题组
            <span>本月</span>
          </h2>
          <div className="ops-ranking-tabs" role="tablist" aria-label="校区筛选">
            {REGIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={region === r.key}
                data-active={region === r.key ? "true" : "false"}
                className="ops-ranking-tab"
                onClick={() => setRegion(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading && topTen.length === 0 ? (
          <div className="ops-ranking-list" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="ops-ranking-row ops-ranking-row--skeleton">
                <div className="ops-wall-skeleton h-4 w-8" />
                <div className="ops-wall-skeleton h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : topTen.length === 0 ? (
          <p className="ops-scene-empty">这个月还没有排行数据</p>
        ) : (
          <div ref={listRef} className="ops-ranking-list">
            {topTen.map((item, i) => {
              const name = pickName(item as RankItem);
              const val = pickValue(item as RankItem);
              const pct = Math.round((val / maxVal) * 100);
              return (
                <div key={`${region}-${name}`} data-race-row className="ops-ranking-row">
                  <span className="ops-ranking-row__rank">{String(i + 1).padStart(2, "0")}</span>
                  <div className="ops-ranking-row__body">
                    <div className="ops-ranking-row__meta">
                      <span className="ops-ranking-row__name">{name}</span>
                      <span className="ops-ranking-row__val">{val.toLocaleString()}</span>
                    </div>
                    <div className="ops-ranking-row__track">
                      <div
                        data-race-bar
                        className="ops-ranking-row__bar"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {animalTop.length > 0 ? (
          <aside className="ops-ranking-animal" aria-label="动物订购">
            <h3 className="ops-ranking-animal__title">动物订购量</h3>
            <ul className="ops-ranking-animal__list">
              {animalTop.map((item) => {
                const name = pickName(item as RankItem);
                const val = pickValue(item as RankItem);
                return (
                  <li key={name}>
                    <span>{name}</span>
                    <strong>{val}</strong>
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
