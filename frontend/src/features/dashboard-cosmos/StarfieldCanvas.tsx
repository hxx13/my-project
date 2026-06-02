import { useEffect, useRef } from "react";

interface Nebula {
  x: number; y: number; r: number;
  vx: number; vy: number;
  hue: number; alpha: number;
}

interface AuroraBand {
  offset: number; // phase offset for sine wave
  speed: number;
  hue: number;
  alpha: number;
  amplitude: number;
}

export default function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0, raf = 0, tick = 0;
    const dpr = window.devicePixelRatio || 1;

    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();
    window.addEventListener("resize", setSize);

    // --- Stars ---
    const stars: { x: number; y: number; r: number; opacity: number; speed: number; twinkle: number }[] = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.8 + 0.2,
        opacity: Math.random() * 0.55 + 0.25,
        speed: Math.random() * 0.3 + 0.03,
        twinkle: Math.random() * Math.PI * 2,
      });
    }

    // --- Nebula clouds ---
    const nebulae: Nebula[] = [];
    for (let i = 0; i < 3; i++) {
      nebulae.push({
        x: Math.random() * W, y: Math.random() * H,
        r: W * (0.35 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.06,
        hue: [220, 260, 290][i],
        alpha: 0.08 + Math.random() * 0.05,
      });
    }

    // --- Aurora bands ---
    const aurorae: AuroraBand[] = [
      { offset: 0, speed: 0.0004, hue: 210, alpha: 0.10, amplitude: H * 0.14 },
      { offset: Math.PI * 0.7, speed: 0.00055, hue: 270, alpha: 0.08, amplitude: H * 0.12 },
      { offset: Math.PI * 1.4, speed: 0.00035, hue: 190, alpha: 0.07, amplitude: H * 0.10 },
    ];

    // --- Shooting star ---
    let shooter: { x: number; y: number; vx: number; vy: number; life: number; length: number } | null = null;
    let nextShooter = performance.now() + 6000 + Math.random() * 8000;

    const spawnShooter = () => {
      const fromLeft = Math.random() > 0.5;
      shooter = {
        x: fromLeft ? Math.random() * W * 0.25 : W - Math.random() * W * 0.25,
        y: Math.random() * H * 0.35,
        vx: (fromLeft ? 1 : -1) * (Math.random() * 4 + 5),
        vy: Math.random() * 2 + 1.5,
        life: 0, length: Math.random() * 70 + 50,
      };
    };

    const render = () => {
      tick++;
      ctx.clearRect(0, 0, W, H);

      // ---- LAYER 1: Nebula clouds ----
      for (const n of nebulae) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -n.r) n.x = W + n.r; if (n.x > W + n.r) n.x = -n.r;
        if (n.y < -n.r) n.y = H + n.r; if (n.y > H + n.r) n.y = -n.r;
        const grad = ctx.createRadialGradient(n.x, n.y, n.r * 0.2, n.x, n.y, n.r);
        grad.addColorStop(0, `hsla(${n.hue},60%,40%,${n.alpha.toFixed(4)})`);
        grad.addColorStop(0.5, `hsla(${n.hue},50%,30%,${(n.alpha * 0.5).toFixed(4)})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // ---- LAYER 2: Aurora ribbons ----
      for (const a of aurorae) {
        a.offset += a.speed;
        ctx.beginPath();
        const baseY = H * 0.25 + Math.sin(tick * 0.003 + a.offset * 0.5) * H * 0.1;
        for (let x = 0; x <= W; x += 4) {
          const nx = x / W;
          const y = baseY + Math.sin(nx * 8 + a.offset) * a.amplitude
                  + Math.sin(nx * 3.5 + a.offset * 1.3) * a.amplitude * 0.6
                  + Math.sin(nx * 15 + a.offset * 0.7) * a.amplitude * 0.25;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // close the ribbon area
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        const ribbonGrad = ctx.createLinearGradient(0, baseY - a.amplitude, 0, baseY + a.amplitude * 2);
        ribbonGrad.addColorStop(0, `hsla(${a.hue},70%,50%,${(a.alpha * 1.0).toFixed(4)})`);
        ribbonGrad.addColorStop(0.4, `hsla(${a.hue},60%,35%,${(a.alpha * 0.6).toFixed(4)})`);
        ribbonGrad.addColorStop(1, "transparent");
        ctx.fillStyle = ribbonGrad;
        ctx.fill();
      }

      // ---- LAYER 3: Subtle perspective grid (bottom half) ----
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.lineWidth = 0.5;
      const horizonY = H * 0.42;
      // horizontal lines
      for (let i = 0; i < 8; i++) {
        const t = (i + 1) / 8;
        const y = horizonY + (H - horizonY) * t * t;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // vertical lines (radiating)
      const vpX = W / 2;
      for (let i = -7; i <= 7; i++) {
        const x = vpX + i * (W / 14) * 4;
        ctx.beginPath(); ctx.moveTo(vpX, horizonY); ctx.lineTo(x, H); ctx.stroke();
      }

      // ---- LAYER 4: Stars ----
      for (const s of stars) {
        s.y += s.speed * 0.12;
        if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
        const ta = s.opacity * (0.5 + 0.5 * Math.sin(tick * 0.025 + s.twinkle));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${ta.toFixed(3)})`; ctx.fill();
        if (s.r > 1.0) {
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,210,255,${(ta * 0.22).toFixed(3)})`; ctx.fill();
        }
      }

      // ---- LAYER 5: Shooting star ----
      const now = performance.now();
      if (!shooter && now > nextShooter) spawnShooter();
      if (shooter) {
        shooter.life += 0.012; shooter.x += shooter.vx; shooter.y += shooter.vy;
        if (shooter.life >= 1 || shooter.x > W + 100 || shooter.x < -100 || shooter.y > H + 50) {
          shooter = null; nextShooter = now + 6000 + Math.random() * 8000;
        } else {
          const alpha = shooter.life < 0.5 ? shooter.life * 2 : (1 - shooter.life) * 2;
          const ex = shooter.x - shooter.vx * shooter.length * 0.06;
          const ey = shooter.y - shooter.vy * shooter.length * 0.06;
          const grad = ctx.createLinearGradient(shooter.x, shooter.y, ex, ey);
          grad.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.beginPath(); ctx.moveTo(shooter.x, shooter.y); ctx.lineTo(ex, ey);
          ctx.strokeStyle = grad; ctx.lineWidth = 1.1; ctx.stroke();
        }
      }

      // ---- LAYER 6: Vignette ----
      const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.5, W / 2, H / 2, W * 0.85);
      vignette.addColorStop(0, "transparent");
      vignette.addColorStop(1, "rgba(3,7,18,0.28)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", setSize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed", top: 0, left: 0,
        width: "100%", height: "100%",
        zIndex: 0, pointerEvents: "none", display: "block",
      }}
    />
  );
}
