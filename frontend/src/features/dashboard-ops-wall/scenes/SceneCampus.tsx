import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

type SceneCampusProps = {
  grandTotal: number;
  pudongTotal: number;
  puxiTotal: number;
  reducedMotion: boolean;
};

function fmt(n: number): string {
  return n.toLocaleString();
}

export function SceneCampus({ grandTotal, pudongTotal, puxiTotal, reducedMotion }: SceneCampusProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLParagraphElement>(null);
  const pdRef = useRef<HTMLParagraphElement>(null);
  const pxRef = useRef<HTMLParagraphElement>(null);
  const labelRef = useRef<HTMLHeadingElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const sticky = stickyRef.current;
      if (!section || !sticky || reducedMotion) return;

      gsap.set(pdRef.current, { opacity: 0, x: -48, filter: "blur(4px)" });
      gsap.set(pxRef.current, { opacity: 0, x: 48, filter: "blur(4px)" });
      gsap.set(barRef.current, { scaleX: 0, transformOrigin: "left center" });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=220%",
          pin: sticky,
          scrub: 0.65,
        },
      });

      tl.fromTo(
        totalRef.current,
        { opacity: 1, scale: 1, filter: "blur(0px)" },
        { opacity: 0, scale: 0.88, filter: "blur(6px)", duration: 0.32, ease: "power2.inOut" },
        0,
      )
        .fromTo(
          pdRef.current,
          { opacity: 0, x: -48, filter: "blur(4px)" },
          { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.38, ease: "power2.out" },
          0.26,
        )
        .fromTo(
          pxRef.current,
          { opacity: 0, x: 48, filter: "blur(4px)" },
          { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.38, ease: "power2.out" },
          0.38,
        )
        .fromTo(labelRef.current, { opacity: 0.4, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power1.out" }, 0.12)
        .fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power2.out" }, 0.45);

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    },
    { scope: sectionRef, dependencies: [reducedMotion, grandTotal, pudongTotal, puxiTotal] },
  );

  const pdShare = grandTotal > 0 ? Math.round((pudongTotal / grandTotal) * 100) : 0;
  const pxShare = grandTotal > 0 ? 100 - pdShare : 0;

  return (
    <section ref={sectionRef} data-ops-scene="campus" className="ops-scene ops-scene--campus" aria-label="校区对比">
      <div ref={stickyRef} className="ops-scene__sticky">
        <div className="ops-scene__inner ops-scene__inner--campus">
          <h2 ref={labelRef} className="ops-campus-title">
            两个校区
            <em>分开看</em>
          </h2>

          <div className="ops-campus-stage">
            <p ref={totalRef} className="ops-campus-total" aria-hidden={reducedMotion ? undefined : true}>
              <span className="ops-campus-total__num">{fmt(grandTotal)}</span>
              <span className="ops-campus-total__unit">合计人次</span>
            </p>

            <div className="ops-campus-split">
              <div className="ops-campus-split__side ops-campus-split__side--pd">
                <p ref={pdRef} className="ops-campus-metric">
                  <span className="ops-campus-metric__label">浦东</span>
                  <span className="ops-campus-metric__value">{fmt(pudongTotal)}</span>
                  <span className="ops-campus-metric__share">占 {pdShare}%</span>
                </p>
              </div>
              <div className="ops-campus-split__divider" aria-hidden />
              <div className="ops-campus-split__side ops-campus-split__side--px">
                <p ref={pxRef} className="ops-campus-metric">
                  <span className="ops-campus-metric__label">浦西</span>
                  <span className="ops-campus-metric__value">{fmt(puxiTotal)}</span>
                  <span className="ops-campus-metric__share">占 {pxShare}%</span>
                </p>
              </div>
            </div>
          </div>

          <div ref={barRef} className="ops-campus-bar" aria-hidden>
            <div className="ops-campus-bar__pd" style={{ width: `${pdShare}%` }} />
            <div className="ops-campus-bar__px" style={{ width: `${pxShare}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
