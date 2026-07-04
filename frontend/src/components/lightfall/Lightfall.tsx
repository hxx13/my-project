import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

/* ────────────────────────────────────────────
   Lightfall — WebGL light-streak tunnel background
   Supports live uniform updates without WebGL re-init.
   Only dpr change triggers full re-creation.
   ──────────────────────────────────────────── */

const MAX_COLORS = 8;

const hexToRGB = (hex: string): [number, number, number] => {
  const c = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [r, g, b];
};

const prepColors = (
  input: string[],
): { arr: [number, number, number][]; count: number; avg: [number, number, number] } => {
  const base = (input && input.length ? input : ['#A6C8FF', '#5227FF', '#FF9FFC']).slice(0, MAX_COLORS);
  const count = base.length;
  const arr: [number, number, number][] = [];
  for (let i = 0; i < MAX_COLORS; i++) {
    arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
  }
  const avg: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    avg[0] += arr[i][0];
    avg[1] += arr[i][1];
    avg[2] += arr[i][2];
  }
  avg[0] /= count;
  avg[1] /= count;
  avg[2] /= count;
  return { arr, count, avg };
};

/* ── Shaders ── */

const vertex = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec3  uBgColor;
uniform vec3  uMouseColor;
uniform float uSpeed;
uniform int   uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void mainImage(out vec4 o, vec2 C) {
  vec2 r = iResolution.xy;
  vec2 uv0 = (C + C - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.28318530718 / angRings);

  vec2 c0 = sceneC(C, r);
  vec2 cdx = sceneC(C + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(C + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  C = c0;

  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O = vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0), 0.0);

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mN = (iMouse + iMouse - r) / r.x;
    float md = length(uv0 - mN);
    mGlow = exp(-md * md / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    O.rgb += uMouseColor * mGlow * 0.25;
  }

  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float ic = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 Pp = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h = fract(8663.0 * ic);
    vec3 col = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2 inner = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2 sm = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y), 3.0)) * col * weight;
    C.x += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  o = vec4(colr, uOpacity);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;

/* ── Uniform shape (mutable ref for live updates) ── */

interface LightfallUniforms {
  iResolution: { value: [number, number, number] };
  iMouse: { value: [number, number] };
  iTime: { value: number };
  uColor0: { value: [number, number, number] };
  uColor1: { value: [number, number, number] };
  uColor2: { value: [number, number, number] };
  uColor3: { value: [number, number, number] };
  uColor4: { value: [number, number, number] };
  uColor5: { value: [number, number, number] };
  uColor6: { value: [number, number, number] };
  uColor7: { value: [number, number, number] };
  uColorCount: { value: number };
  uBgColor: { value: [number, number, number] };
  uMouseColor: { value: [number, number, number] };
  uSpeed: { value: number };
  uStreakCount: { value: number };
  uStreakWidth: { value: number };
  uStreakLength: { value: number };
  uGlow: { value: number };
  uDensity: { value: number };
  uTwinkle: { value: number };
  uZoom: { value: number };
  uBgGlow: { value: number };
  uOpacity: { value: number };
  uMouseEnabled: { value: number };
  uMouseStrength: { value: number };
  uMouseRadius: { value: number };
}

/* ── Props ── */

export interface LightfallProps {
  colors?: string[];
  backgroundColor?: string;
  speed?: number;
  streakCount?: number;
  streakWidth?: number;
  streakLength?: number;
  glow?: number;
  density?: number;
  twinkle?: number;
  zoom?: number;
  backgroundGlow?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  mouseRadius?: number;
  mouseDampening?: number;
  mixBlendMode?: string;
  paused?: boolean;
  dpr?: number;
  className?: string;
}

const Lightfall = ({
  className,
  dpr,
  paused = false,
  colors = ['#A6C8FF', '#5227FF', '#FF9FFC'],
  backgroundColor = '#0A29FF',
  speed = 0.5,
  streakCount = 2,
  streakWidth = 1,
  streakLength = 1,
  glow = 1,
  density = 0.6,
  twinkle = 1,
  zoom = 3,
  backgroundGlow = 0.5,
  opacity = 1,
  mouseInteraction = true,
  mouseStrength = 0.5,
  mouseRadius = 1,
  mouseDampening = 0.15,
  mixBlendMode,
}: LightfallProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const uniformsRef = useRef<LightfallUniforms | null>(null);
  const programRef = useRef<Program | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const geometryRef = useRef<Triangle | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const mouseTargetRef = useRef<[number, number]>([0, 0]);
  const lastTimeRef = useRef<number>(0);
  const pausedRef = useRef(paused);
  const mouseDampeningRef = useRef(mouseDampening);
  const mouseInteractionRef = useRef(mouseInteraction);
  const onPointerMoveRef = useRef<((e: PointerEvent) => void) | null>(null);

  /* keep refs in sync */
  pausedRef.current = paused;
  mouseDampeningRef.current = mouseDampening;
  mouseInteractionRef.current = mouseInteraction;

  /* ── Create WebGL context (once, only re-create on dpr change) ── */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resolvedDpr = dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

    const renderer = new Renderer({
      dpr: resolvedDpr,
      alpha: true,
      antialias: true,
    });
    rendererRef.current = renderer;
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;

    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    if (mixBlendMode) {
      canvas.style.mixBlendMode = mixBlendMode;
    }
    container.appendChild(canvas);

    const { arr, count, avg } = prepColors(colors);

    const uniforms: LightfallUniforms = {
      iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] },
      iTime: { value: 0 },
      uColor0: { value: arr[0] },
      uColor1: { value: arr[1] },
      uColor2: { value: arr[2] },
      uColor3: { value: arr[3] },
      uColor4: { value: arr[4] },
      uColor5: { value: arr[5] },
      uColor6: { value: arr[6] },
      uColor7: { value: arr[7] },
      uColorCount: { value: count },
      uBgColor: { value: hexToRGB(backgroundColor) },
      uMouseColor: { value: avg },
      uSpeed: { value: speed },
      uStreakCount: { value: Math.max(1, Math.min(16, Math.round(streakCount))) },
      uStreakWidth: { value: streakWidth },
      uStreakLength: { value: streakLength },
      uGlow: { value: glow },
      uDensity: { value: density },
      uTwinkle: { value: twinkle },
      uZoom: { value: zoom },
      uBgGlow: { value: backgroundGlow },
      uOpacity: { value: opacity },
      uMouseEnabled: { value: mouseInteraction ? 1 : 0 },
      uMouseStrength: { value: mouseStrength },
      uMouseRadius: { value: mouseRadius },
    };
    uniformsRef.current = uniforms;

    const program = new Program(gl, { vertex, fragment, uniforms });
    programRef.current = program;

    const geometry = new Triangle(gl);
    geometryRef.current = geometry;
    const mesh = new Mesh(gl, { geometry, program });
    meshRef.current = mesh;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scale = renderer.dpr || 1;
      const x = (e.clientX - rect.left) * scale;
      const y = (rect.height - (e.clientY - rect.top)) * scale;
      mouseTargetRef.current = [x, y];
      if (mouseDampeningRef.current <= 0) {
        uniforms.iMouse.value = [x, y];
      }
    };
    onPointerMoveRef.current = onPointerMove;
    if (mouseInteraction) {
      canvas.addEventListener('pointermove', onPointerMove);
    }

    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const u = uniformsRef.current;
      if (!u) return;
      u.iTime.value = t * 0.001;
      const damp = mouseDampeningRef.current;
      if (damp > 0) {
        if (!lastTimeRef.current) lastTimeRef.current = t;
        const dt = (t - lastTimeRef.current) / 1000;
        lastTimeRef.current = t;
        const tau = Math.max(1e-4, damp);
        let factor = 1 - Math.exp(-dt / tau);
        if (factor > 1) factor = 1;
        const target = mouseTargetRef.current;
        const cur = u.iMouse.value;
        cur[0] += (target[0] - cur[0]) * factor;
        cur[1] += (target[1] - cur[1]) * factor;
      } else {
        lastTimeRef.current = t;
      }
      if (!pausedRef.current && programRef.current && meshRef.current && rendererRef.current) {
        try {
          rendererRef.current.render({ scene: meshRef.current });
        } catch (e) {
          console.error(e);
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (onPointerMoveRef.current) {
        canvas.removeEventListener('pointermove', onPointerMoveRef.current);
      }
      ro.disconnect();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      const callIfFn = (obj: unknown, key: string) => {
        if (obj && typeof (obj as Record<string, unknown>)[key] === 'function') {
          ((obj as Record<string, unknown>)[key] as () => void).call(obj);
        }
      };
      callIfFn(programRef.current, 'remove');
      callIfFn(geometryRef.current, 'remove');
      callIfFn(meshRef.current, 'remove');
      callIfFn(rendererRef.current, 'destroy');
      programRef.current = null;
      geometryRef.current = null;
      meshRef.current = null;
      rendererRef.current = null;
      uniformsRef.current = null;
    };
    /* only re-create on dpr change */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr]);

  /* ── Live-update uniforms (no WebGL re-creation) ── */

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;

    const { arr, count, avg } = prepColors(colors);
    u.uColor0.value = arr[0];
    u.uColor1.value = arr[1];
    u.uColor2.value = arr[2];
    u.uColor3.value = arr[3];
    u.uColor4.value = arr[4];
    u.uColor5.value = arr[5];
    u.uColor6.value = arr[6];
    u.uColor7.value = arr[7];
    u.uColorCount.value = count;
    u.uBgColor.value = hexToRGB(backgroundColor);
    u.uMouseColor.value = avg;
    u.uSpeed.value = speed;
    u.uStreakCount.value = Math.max(1, Math.min(16, Math.round(streakCount)));
    u.uStreakWidth.value = streakWidth;
    u.uStreakLength.value = streakLength;
    u.uGlow.value = glow;
    u.uDensity.value = density;
    u.uTwinkle.value = twinkle;
    u.uZoom.value = zoom;
    u.uBgGlow.value = backgroundGlow;
    u.uOpacity.value = opacity;
    u.uMouseEnabled.value = mouseInteraction ? 1 : 0;
    u.uMouseStrength.value = mouseStrength;
    u.uMouseRadius.value = mouseRadius;
  }, [
    colors,
    backgroundColor,
    speed,
    streakCount,
    streakWidth,
    streakLength,
    glow,
    density,
    twinkle,
    zoom,
    backgroundGlow,
    opacity,
    mouseInteraction,
    mouseStrength,
    mouseRadius,
  ]);

  /* ── Manage pointermove listener ── */

  useEffect(() => {
    const canvas = rendererRef.current?.gl?.canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;
    const handler = onPointerMoveRef.current;

    if (mouseInteraction) {
      canvas.addEventListener('pointermove', handler!);
      return () => {
        canvas.removeEventListener('pointermove', handler!);
      };
    } else {
      canvas.removeEventListener('pointermove', handler!);
    }
  }, [mouseInteraction]);

  /* ── Update mixBlendMode on canvas ── */

  useEffect(() => {
    const canvas = rendererRef.current?.gl?.canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;
    if (mixBlendMode) {
      canvas.style.mixBlendMode = mixBlendMode;
    } else {
      canvas.style.mixBlendMode = '';
    }
  }, [mixBlendMode]);

  return (
    <div
      ref={containerRef}
      className={`lightfall-container ${className ?? ''}`}
    />
  );
};

export default Lightfall;
