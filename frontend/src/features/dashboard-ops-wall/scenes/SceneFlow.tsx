import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { LineStats } from "@/api/twinApi";
import { drawFlowCurve, parseFlowLineStats } from "../utils/drawFlowCurve";
import { useOpsSceneReveal } from "../useOpsSceneReveal";

gsap.registerPlugin(ScrollTrigger);

function resolveCssColor(scope: Element | null, varName: string, fallback: string): string {
  if (!scope) return fallback;
  const raw = getComputedStyle(scope).getPropertyValue(varName).trim();
  return raw || fallback;
}

type SceneFlowProps = {
  lineData: LineStats | null;
  reducedMotion: boolean;
};

export function SceneFlow({ lineData, reducedMotion }: SceneFlowProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawProgressRef = useRef(1);
  const parsed = useMemo(() => parseFlowLineStats(lineData), [lineData]);

  useOpsSceneReveal(sectionRef, headerRef, reducedMotion, "fade-only", [parsed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !parsed) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scope = container.closest("[data-ops-wall-root]");

    const render = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.save();
      if (drawProgressRef.current < 1) {
        ctx.beginPath();
        ctx.rect(0, 0, w * drawProgressRef.current, h);
        ctx.clip();
      }

      drawFlowCurve(ctx, {
        width: w,
        height: h,
        parsed,
        pudongColor: resolveCssColor(scope, "--ops-wall-campus-pudong", "#38bdf8"),
        puxiColor: resolveCssColor(scope, "--ops-wall-campus-puxi", "#f472b6"),
        reducedMotion,
      });
      ctx.restore();
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(container);
    return () => ro.disconnect();
  }, [parsed, reducedMotion]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const container = containerRef.current;
      if (!section || !container || !parsed || reducedMotion) {
        drawProgressRef.current = 1;
        return;
      }

      drawProgressRef.current = 0;
      const tween = gsap.to(drawProgressRef, {
        current: 1,
        ease: "none",
        onUpdate: () => {
          container.dispatchEvent(new Event("ops-flow-redraw"));
        },
        scrollTrigger: {
          trigger: section,
          start: "top 72%",
          end: "top 28%",
          scrub: 0.4,
        },
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    },
    { scope: sectionRef, dependencies: [parsed, reducedMotion] },
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => {
      const canvas = canvasRef.current;
      if (!canvas || !parsed) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (drawProgressRef.current < 1) {
        ctx.beginPath();
        ctx.rect(0, 0, w * drawProgressRef.current, h);
        ctx.clip();
      }
      const scope = container.closest("[data-ops-wall-root]");
      drawFlowCurve(ctx, {
        width: w,
        height: h,
        parsed,
        pudongColor: resolveCssColor(scope, "--ops-wall-campus-pudong", "#38bdf8"),
        puxiColor: resolveCssColor(scope, "--ops-wall-campus-puxi", "#f472b6"),
        reducedMotion,
      });
      ctx.restore();
    };
    container.addEventListener("ops-flow-redraw", handler);
    return () => container.removeEventListener("ops-flow-redraw", handler);
  }, [parsed, reducedMotion]);

  const stats = parsed
    ? {
        grandTotal: parsed.pdTotal + parsed.pxTotal,
        pdPeak: parsed.pdPeak,
        pxPeak: parsed.pxPeak,
        pdPeakTime: parsed.times[parsed.pdPeakIdx] ?? "—",
        pxPeakTime: parsed.times[parsed.pxPeakIdx] ?? "—",
      }
    : null;

  return (
    <section ref={sectionRef} data-ops-scene="flow" className="ops-scene ops-scene--flow" aria-label="分时段流量">
      <div className="ops-scene__inner ops-scene__inner--flow">
        <header ref={headerRef} className="ops-flow-header">
          <h2 className="ops-flow-title">
            今日
            <span>流量</span>
          </h2>
          {stats ? (
            <dl className="ops-flow-stats">
              <div>
                <dt>累计</dt>
                <dd>{stats.grandTotal.toLocaleString()}</dd>
              </div>
              <div>
                <dt>浦东高峰</dt>
                <dd>
                  {stats.pdPeak}
                  <small>{stats.pdPeakTime}</small>
                </dd>
              </div>
              <div>
                <dt>浦西高峰</dt>
                <dd>
                  {stats.pxPeak}
                  <small>{stats.pxPeakTime}</small>
                </dd>
              </div>
            </dl>
          ) : null}
        </header>

        <div ref={containerRef} className="ops-flow-canvas-wrap">
          {!parsed ? (
            <div className="ops-flow-skeleton" aria-busy="true">
              <div className="ops-wall-skeleton ops-flow-skeleton__line" />
              <div className="ops-wall-skeleton ops-flow-skeleton__area" />
            </div>
          ) : (
            <canvas ref={canvasRef} className="ops-flow-canvas" aria-hidden />
          )}
        </div>
      </div>
    </section>
  );
}
