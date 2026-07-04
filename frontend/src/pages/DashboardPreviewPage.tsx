import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightfall } from '@/components/lightfall';
import type { LightfallProps } from '@/components/lightfall';
import { SplitText } from '@/components/split-text';
import { ScrollReveal } from '@/components/scroll-reveal';
import { DecryptedText } from '@/components/decrypted-text';
import { TextType } from '@/components/text-type';
import { SHSMU_LOGO_URL } from '@/constants/shsmuBranding';
import { useScrollSnap } from '@/hooks/useScrollSnap';
import { notifyLastSectionReached } from '@/features/dashboard-ops-wall/useAutoPageSwitch';
import '@/features/dashboard-ops-wall/dashboardPreviewPage.css';

/* ═══════════════════════════════════════════
   Dashboard Preview — Scroll Narrative
   ═══════════════════════════════════════════ */

const SECTION_COUNT = 5;
const SECTION_LABELS = ['欢迎', '设施', '品种', '技术', '支撑'];
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 2.5;

const BASE_CONFIG: LightfallProps = {
  colors: ['#A6C8FF', '#7B61FF', '#C084FC'],
  backgroundColor: '#1E1B4B',
  speed: 0.5, streakCount: 2, streakWidth: 1, streakLength: 1,
  glow: 1, density: 0.6, twinkle: 1, backgroundGlow: 0.5, opacity: 1,
  mouseInteraction: true, mouseStrength: 0.5, mouseRadius: 1, mouseDampening: 0.15,
};

export default function DashboardPreviewPage() {
  const { bindScroll, activeSection, scrollTop, scrollHeight, viewHeight, isSnapping } =
    useScrollSnap(SECTION_COUNT, 0.4, 0.25, 400);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const maxScroll = Math.max(1, scrollHeight - viewHeight);
  const zoom = ZOOM_MIN + Math.max(0, Math.min(1, scrollTop / maxScroll)) * (ZOOM_MAX - ZOOM_MIN);
  const lightfallConfig = useMemo(() => ({ ...BASE_CONFIG, zoom }), [zoom]);

  const scrollToSection = useCallback((index: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: index * el.clientHeight, behavior: 'smooth' });
  }, []);

  /* ── Auto-scroll page turning (stop at last section) ── */
  // Section 2 (4 sentences × ~4s each ≈ 16s) needs time to finish typewriter cycle
  const SCENE_DURATIONS = [4000, 4000, 20000, 4000, 0];
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allTextDone, setAllTextDone] = useState(false);
  const completedSentencesRef = useRef<Set<string>>(new Set());
  const TOTAL_SENTENCES = 9; // scene 2: 4 sentences + scene 4: 5 sentences

  const onSentenceDone = useCallback((sentence: string) => {
    completedSentencesRef.current.add(sentence);
    if (completedSentencesRef.current.size >= TOTAL_SENTENCES) {
      setAllTextDone(true);
    }
  }, []);

  // Reset on page mount
  useEffect(() => {
    completedSentencesRef.current = new Set();
    setAllTextDone(false);
  }, []);

  // Auto-advance to next section (stop at last)
  useEffect(() => {
    if (autoScrollPaused || activeSection >= SECTION_COUNT - 1) return;
    const duration = SCENE_DURATIONS[activeSection] || 4000;
    const timer = setTimeout(() => {
      scrollToSection(activeSection + 1);
    }, duration);
    return () => clearTimeout(timer);
  }, [activeSection, autoScrollPaused, scrollToSection]);

  // Pause auto-scroll on user interaction, resume after 10s
  const pauseAutoScroll = useCallback(() => {
    setAutoScrollPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setAutoScrollPaused(false), 10000);
  }, []);

  // Detect user scroll (non-snap) or dot nav click
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onUserScroll = () => {
      if (!isSnapping) pauseAutoScroll();
    };
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchstart', onUserScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchstart', onUserScroll);
    };
  }, [isSnapping, pauseAutoScroll]);

  // Cleanup pause timer on unmount
  useEffect(() => {
    return () => { if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current); };
  }, []);

  // Notify auto-page-switch when last section reached + text animations done
  useEffect(() => {
    if (activeSection === 4 && allTextDone) notifyLastSectionReached();
  }, [activeSection, allTextDone]);

  return (
    <div className="dash-preview-root">
      <div className="dash-preview-bg"><Lightfall {...lightfallConfig} /></div>

      <header className="dash-preview-header">
        <img className="dash-preview-logo" src={SHSMU_LOGO_URL} alt="上海交通大学医学院" />
      </header>

      <nav className="dash-section-nav">
        {SECTION_LABELS.map((label, i) => (
          <button key={label} type="button"
            className={`dash-section-nav__dot ${i === activeSection ? 'dash-section-nav__dot--active' : ''}`}
            onClick={() => { scrollToSection(i); pauseAutoScroll(); }} title={label}>
            <span className="dash-section-nav__mark" />
            <span className="dash-section-nav__label">{label}</span>
          </button>
        ))}
      </nav>

      <div id="dash-scroll-root"
        ref={(el) => { scrollContainerRef.current = el; bindScroll(el); }}
        className={`dash-scroll-root ${isSnapping ? 'dash-scroll-root--snapping' : ''}`}>

        {/* ═══ Scene 0 — Welcome ═══ */}
        <section className="dash-scene" data-scene={0}>
          <div className="dash-scene__content dash-scene__content--hero">
            <SplitText text="欢迎来到 实验动物科学部" tag="h1" className="dash-scene-headline"
              delay={100} duration={0.6} ease="power3.out" splitType="chars"
              from={{ opacity: 0, y: 40 }} to={{ opacity: 1, y: 0 }}
              threshold={0.1} rootMargin="-100px" textAlign="center" />
            <p className="dash-scene-subtitle">上海交通大学医学院 · 实验动物科学部</p>
          </div>
        </section>

        {/* ═══ Scene 1 — 设施规模 ═══ */}
        <section className="dash-scene dash-scene--content-page" data-scene={1}>
          <div className="dash-scene__content dash-scene__content--page">
            <h2 className="dash-page-title">
              <DecryptedText text="实验动物设施单体最大" speed={40} maxIterations={15} sequential
                revealDirection="center" animateOn="view" useOriginalCharsOnly rootRef={scrollContainerRef} className="dash-decrypted" />
            </h2>
            <div className="dash-body-wide">
              <ScrollReveal scrollContainerRef={scrollContainerRef}
                containerClassName="dash-reveal-container" textClassName="dash-reveal-text"
                baseOpacity={0.1} enableBlur blurStrength={4} baseRotation={1}
                rotationEnd="top center" wordAnimationEnd="top center">
                实验动物科学部占地面积约2482.72m²，建筑面积17602m²，地上5层，地下1层，设计笼位5.2万。第5层为华东地区唯一可从事非人灵长类实验的高等级生物安全设施（ABSL3）。
              </ScrollReveal>
            </div>
            <div className="dash-stat-row">
              <div className="dash-stat-chip">
                <span className="dash-stat-chip__label">饲养体量</span>
                <span className="dash-stat-chip__value">17,602m² · 5.2万笼</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Scene 2 — 品种品系 ═══ */}
        <section className="dash-scene dash-scene--content-page" data-scene={2}>
          <div className="dash-scene__content dash-scene__content--page">
            <h2 className="dash-page-title">
              <DecryptedText text="动物品种品系最齐全" speed={40} maxIterations={12} sequential
                revealDirection="center" animateOn="view" useOriginalCharsOnly rootRef={scrollContainerRef} className="dash-decrypted" />
            </h2>
            <div className="dash-typewriter">
              <TextType
                text={[
                  '普通动物饲养品种：犬、猴、猪、兔、仓鼠、豚鼠、小鼠、大鼠',
                  '特殊实验动物品种：裸鼹鼠、地松鼠等',
                  '依托胚胎生物技术平台，保有2122个基因编辑动物品系',
                  '教育部生物样本库项目重要组成部分',
                ]}
                typingSpeed={60} pauseDuration={2000} deletingSpeed={25} loop
                showCursor cursorCharacter="▍" cursorBlinkDuration={0.4}
                cursorClassName="dash-cursor" startOnVisible onSentenceComplete={onSentenceDone} rootRef={scrollContainerRef}
              />
            </div>
            <div className="dash-stat-row">
              <div className="dash-stat-chip">
                <span className="dash-stat-chip__label">动物品种</span>
                <span className="dash-stat-chip__value">10个品种 · 2122个品系</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Scene 3 — 技术服务 ═══ */}
        <section className="dash-scene dash-scene--content-page" data-scene={3}>
          <div className="dash-scene__content dash-scene__content--page">
            <h2 className="dash-page-title">
              <DecryptedText text="技术服务资质最完善" speed={40} maxIterations={12} sequential
                revealDirection="center" animateOn="view" useOriginalCharsOnly rootRef={scrollContainerRef} className="dash-decrypted" />
            </h2>
            <div className="dash-body-wide">
              <ScrollReveal scrollContainerRef={scrollContainerRef}
                containerClassName="dash-reveal-container" textClassName="dash-reveal-text"
                baseOpacity={0.1} enableBlur blurStrength={4} baseRotation={1}
                rotationEnd="top center" wordAnimationEnd="top center">
                建设有实验动物代谢研究平台、实验动物影像技术平台等20多个实验动物研究平台，全国高校唯一同时拥有国内（CNAS）和国际（AAALAC）认可的实验动物技术服务平台。
              </ScrollReveal>
            </div>
            <div className="dash-badge-row">
              <span className="dash-badge">
                <span className="dash-badge-text">国内 CNAS</span>
              </span>
              <span className="dash-badge">
                <span className="dash-badge-text">国际 AAALAC 认可</span>
              </span>
            </div>
            <div className="dash-stat-row">
              <div className="dash-stat-chip">
                <span className="dash-stat-chip__label">技术服务</span>
                <span className="dash-stat-chip__value">100多项技术检测</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Scene 4 — 科研支撑 ═══ */}
        <section className="dash-scene dash-scene--content-page" data-scene={4}>
          <div className="dash-scene__content dash-scene__content--page">
            <h2 className="dash-page-title">
              <DecryptedText text="科研及产业最强支撑" speed={40} maxIterations={12} sequential
                revealDirection="center" animateOn="view" useOriginalCharsOnly rootRef={scrollContainerRef} className="dash-decrypted" />
            </h2>
            <div className="dash-typewriter">
              <TextType
                text={[
                  '坚持临床科研一体化，服务医学院本部、13家附属医院及校外企业共计302个项目',
                  '2025年协助医学院系统获得920项国家自然科学基金',
                  '连续十六年保持全国医学院校第一',
                  '勇当全球生物医药创新主力军，协助张江加快打造原始创新策源地',
                  '浦东打造世界级生物医药产业集群，为上海建设世界级科创中心贡献硬核力量',
                ]}
                typingSpeed={50} pauseDuration={2500} deletingSpeed={25} loop
                showCursor cursorCharacter="▍" cursorBlinkDuration={0.4}
                cursorClassName="dash-cursor" startOnVisible onSentenceComplete={onSentenceDone} rootRef={scrollContainerRef}
              />
            </div>
            <div className="dash-stat-row">
              <div className="dash-stat-chip">
                <span className="dash-stat-chip__label">科研 / 产业支撑</span>
                <span className="dash-stat-chip__value">302个课题组 · 920项国自然</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="dash-scene-indicator">
        <span className="dash-scene-indicator__label">
          {SECTION_LABELS[activeSection]} · zoom {zoom.toFixed(1)}×
        </span>
      </div>
    </div>
  );
}
