import { useMemo, useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { DashboardViolationBoardItem } from "@/api/domains/dashboardViolationBoard.api";
import { prepareAnnouncementHtml } from "@/utils/announcementHtml";
import { useOpsSceneReveal } from "../useOpsSceneReveal";

gsap.registerPlugin(ScrollTrigger);

function pick(cfg: Record<string, string> | undefined, key: string, fallback: string) {
  if (!cfg) return fallback;
  const v = cfg[key];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s !== "" ? s : fallback;
}

export type SceneRulesProps = {
  runtimeConfig: Record<string, string> | undefined;
  violationItems: DashboardViolationBoardItem[];
  reducedMotion: boolean;
};

export function SceneRules({ runtimeConfig, violationItems, reducedMotion }: SceneRulesProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => {
    const title = pick(runtimeConfig, "dashboard.codex.title", "还卡说明");
    const rulesText = pick(runtimeConfig, "dashboard.codex.return_rules", "");
    const noticeTitle = pick(runtimeConfig, "dashboard.codex.notice_title", "通知");
    const noticeBody = pick(runtimeConfig, "dashboard.codex.notice_body", "");

    const list: { key: string; title: string; body: string }[] = [
      {
        key: "rules",
        title,
        body:
          rulesText ||
          "每天 8:00—17:30 为正常用卡时段。超时未还卡，可能登出不了或权限被限。",
      },
    ];

    if (noticeBody) {
      list.push({ key: "notice", title: noticeTitle, body: noticeBody });
    }

    for (const item of violationItems) {
      list.push({
        key: `violation-${item.id ?? item.displayName ?? Math.random()}`,
        title: item.displayName ?? "违规记录",
        body: item.summary ?? "",
      });
    }

    return list;
  }, [runtimeConfig, violationItems]);

  useOpsSceneReveal(sectionRef, headerRef, reducedMotion, "fade-up", [blocks.length]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const stream = streamRef.current;
      if (!section || !stream || reducedMotion || blocks.length === 0) return;

      const chapters = stream.querySelectorAll<HTMLElement>("[data-rules-chapter]");
      gsap.fromTo(
        chapters,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.12,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: "top 75%",
            toggleActions: "play none none reverse",
          },
        },
      );
    },
    { scope: sectionRef, dependencies: [blocks, reducedMotion] },
  );

  return (
    <section ref={sectionRef} data-ops-scene="rules" className="ops-scene ops-scene--rules" aria-label="公告与还卡">
      <div className="ops-scene__inner ops-scene__inner--rules">
        <h2 ref={headerRef} className="ops-rules-title">
          公告
          <span>还卡</span>
        </h2>
        <div ref={streamRef} className="ops-rules-stream">
          {blocks.map((block, idx) => (
            <article
              key={block.key}
              data-rules-chapter
              className="ops-rules-chapter"
              style={{ "--ops-rules-offset": `${idx * 3}rem` } as CSSProperties}
            >
              <h3 className="ops-rules-chapter__title">{block.title}</h3>
              <div
                className="ops-rules-chapter__body rich-text-content"
                dangerouslySetInnerHTML={{ __html: prepareAnnouncementHtml(block.body) }}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
