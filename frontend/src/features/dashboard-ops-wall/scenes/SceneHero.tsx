import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

type SceneHeroProps = {
  grandTotal: number;
  isConnected: boolean;
  reducedMotion: boolean;
};

function formatHeroCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`;
  return n.toLocaleString();
}

export function SceneHero({ grandTotal, isConnected, reducedMotion }: SceneHeroProps) {
  const rootRef = useRef<HTMLElement>(null);
  const numRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      if (!rootRef.current || reducedMotion) return;
      gsap.fromTo(
        rootRef.current.querySelectorAll("[data-hero-reveal]"),
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.95, stagger: 0.1, ease: "power3.out" },
      );
    },
    { scope: rootRef, dependencies: [reducedMotion] },
  );

  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    if (reducedMotion) {
      el.textContent = formatHeroCount(grandTotal);
      gsap.set(el, { scale: 1 });
      return;
    }
    gsap.fromTo(el, { scale: 0.94, opacity: 0.6 }, { scale: 1, opacity: 1, duration: 1.4, ease: "power2.out" });
    const obj = { val: 0 };
    gsap.to(obj, {
      val: grandTotal,
      duration: 1.5,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = formatHeroCount(Math.round(obj.val));
      },
    });
  }, [grandTotal, reducedMotion]);

  return (
    <section ref={rootRef} data-ops-scene="hero" className="ops-scene ops-scene--hero" aria-label="今日进出">
      <div className="ops-scene__depth ops-scene__depth--hero" aria-hidden />
      <div className="ops-scene__inner ops-scene__inner--hero">
        <p data-hero-reveal className="ops-hero-eyebrow">
          动物房
        </p>
        <h1 data-hero-reveal className="ops-hero-headline">
          今日
          <span className="ops-hero-headline__accent">进出</span>
        </h1>
        <p ref={numRef} data-hero-reveal className="ops-hero-metric" aria-live="polite">
          {formatHeroCount(grandTotal)}
        </p>
        <p data-hero-reveal className="ops-hero-sub">
          人次 · 浦东 + 浦西合计
        </p>
        <p data-hero-reveal className="ops-hero-hint">
          往下翻，看各校区
          <span className="ops-hero-hint__chevron" aria-hidden>
            ↓
          </span>
        </p>
      </div>
      <div data-hero-reveal className="ops-hero-status">
        <span className="ops-hero-status__dot" data-online={isConnected ? "true" : "false"} aria-hidden />
        <span>{isConnected ? "数据连接正常" : "还没连上数据"}</span>
      </div>
    </section>
  );
}
