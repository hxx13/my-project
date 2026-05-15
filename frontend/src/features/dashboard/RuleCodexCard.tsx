import { useQuery } from "@tanstack/react-query";
import { Megaphone, Clock, ShieldAlert } from "lucide-react";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { useDashboardSciFiVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";

const K = {
  title: "dashboard.codex.title",
  hoursLabel: "dashboard.codex.hours_label",
  startTime: "dashboard.codex.start_time",
  endTime: "dashboard.codex.end_time",
  returnRules: "dashboard.codex.return_rules",
  disciplineTitle: "dashboard.codex.discipline_title",
  disciplineBody: "dashboard.codex.discipline_body",
  noticeTitle: "dashboard.codex.notice_title",
  noticeBody: "dashboard.codex.notice_body",
  titleFontScale: "dashboard.codex.title_font_scale",
  noticeFontScale: "dashboard.codex.notice_font_scale",
  footerFontScale: "dashboard.codex.footer_font_scale",
  footerHoursFontScale: "dashboard.codex.footer_hours_font_scale",
  footerDisciplineFontScale: "dashboard.codex.footer_discipline_font_scale",
  noticeCardScale: "dashboard.codex.notice_card_scale",
  footerCardScale: "dashboard.codex.footer_card_scale",
} as const;

const SCALE_KEYS = new Set(["sm", "md", "lg", "xl"]);

const FALLBACK = {
  title: "标准还卡与违规惩戒说明",
  hoursLabel: "标准还卡时段",
  startTime: "08:00",
  endTime: "17:30",
  returnRules:
    "每天早 8:00—晚 5:30 为卡片使用时间。超时未还卡可能导致无法退出登录或权限受限，需联系老师解封；如需延长使用请提前与老师沟通。",
  disciplineTitle: "违规惩戒",
  disciplineBody: "暂停实验动物科学部饲养室使用权限",
  noticeTitle: "公告与通知",
  noticeBody: "",
  titleFontScale: "lg",
  noticeFontScale: "xl",
  footerFontScale: "md",
  footerHoursFontScale: "inherit",
  footerDisciplineFontScale: "inherit",
  noticeCardScale: "md",
  footerCardScale: "md",
};

function pick(cfg: Record<string, string> | undefined, key: string, fallback: string) {
  if (!cfg) return fallback;
  const v = cfg[key];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s !== "" ? s : fallback;
}

function normalizeScale(raw: string, fallback: string): "sm" | "md" | "lg" | "xl" {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (SCALE_KEYS.has(s)) return s as "sm" | "md" | "lg" | "xl";
  const fb = String(fallback || "md")
    .trim()
    .toLowerCase();
  if (SCALE_KEYS.has(fb)) return fb as "sm" | "md" | "lg" | "xl";
  return "md";
}

/** inherit / 空 = 使用 base（通常为底部说明档位） */
function resolveOptionalFontScale(raw: string, base: "sm" | "md" | "lg" | "xl"): "sm" | "md" | "lg" | "xl" {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "" || s === "inherit") return base;
  return normalizeScale(s, base);
}

const TITLE_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-4xl",
  xl: "text-3xl md:text-4xl lg:text-5xl",
};

/** 公告区：区块标题行 */
const NOTICE_HEAD_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-sm font-bold",
  md: "text-base font-bold",
  lg: "text-lg font-bold",
  xl: "text-xl font-bold",
};

/** 公告区：正文 */
const NOTICE_BODY_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-sm leading-relaxed",
  md: "text-base leading-relaxed",
  lg: "text-lg leading-relaxed",
  xl: "text-xl leading-relaxed",
};

const FOOTER_SECTION_HEAD_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-xs font-bold",
  md: "text-sm font-bold",
  lg: "text-sm font-bold",
  xl: "text-base font-bold",
};

const FOOTER_BODY_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-[11px] leading-snug",
  md: "text-xs leading-snug",
  lg: "text-sm leading-relaxed",
  xl: "text-base leading-relaxed",
};

const FOOTER_TIME_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-3xl",
};

/** 公告区外框：仅内边距与间距（1080p 下偏紧，避免块之间留白过大） */
const NOTICE_CARD_SHELL: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "gap-1.5 p-2.5",
  md: "gap-1.5 p-3",
  lg: "gap-2 p-3.5",
  xl: "gap-2 p-4",
};

/** 底部两栏之间的间距 */
const FOOTER_STACK_GAP: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
  xl: "gap-2.5",
};

/** 底部每个小卡片：内边距与圆角层次 */
const FOOTER_SECTION_SHELL: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "rounded-lg p-2 shadow-sm",
  md: "rounded-xl p-2.5 shadow-sm",
  lg: "rounded-xl p-3 shadow-sm",
  xl: "rounded-xl p-3.5 shadow-md",
};

const FOOTER_ICON_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-[1.125rem] w-[1.125rem]",
  xl: "h-5 w-5",
};

const NOTICE_MEGAPHONE_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
};

function ProseBlock({
  children,
  className = "",
  lineClassName = "",
}: {
  children: string;
  className?: string;
  lineClassName?: string;
}) {
  const lines = children.split(/\r?\n/);
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p
          key={i}
          className={
            line.trim() === ""
              ? "min-h-[0.6em]"
              : `whitespace-pre-wrap break-words ${lineClassName}`.trim()
          }
        >
          {line}
        </p>
      ))}
    </div>
  );
}

export function RuleCodexCard() {
  const sf = useDashboardSciFiVisual();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-runtime-config"],
    queryFn: fetchPublicRuntimeConfig,
    staleTime: 60_000,
  });

  const title = pick(data, K.title, FALLBACK.title);
  const hoursLabel = pick(data, K.hoursLabel, FALLBACK.hoursLabel);
  const startTime = pick(data, K.startTime, FALLBACK.startTime);
  const endTime = pick(data, K.endTime, FALLBACK.endTime);
  const returnRules = pick(data, K.returnRules, FALLBACK.returnRules);
  const disciplineTitle = pick(data, K.disciplineTitle, FALLBACK.disciplineTitle);
  const disciplineBody = pick(data, K.disciplineBody, FALLBACK.disciplineBody);
  const noticeTitle = pick(data, K.noticeTitle, FALLBACK.noticeTitle);
  const noticeBody = pick(data, K.noticeBody, FALLBACK.noticeBody);

  const titleScale = normalizeScale(pick(data, K.titleFontScale, FALLBACK.titleFontScale), FALLBACK.titleFontScale);
  const noticeScale = normalizeScale(pick(data, K.noticeFontScale, FALLBACK.noticeFontScale), FALLBACK.noticeFontScale);
  const footerBaseScale = normalizeScale(pick(data, K.footerFontScale, FALLBACK.footerFontScale), FALLBACK.footerFontScale);
  const hoursFontScale = resolveOptionalFontScale(
    pick(data, K.footerHoursFontScale, FALLBACK.footerHoursFontScale),
    footerBaseScale
  );
  const disciplineFontScale = resolveOptionalFontScale(
    pick(data, K.footerDisciplineFontScale, FALLBACK.footerDisciplineFontScale),
    footerBaseScale
  );
  const noticeCardScale = normalizeScale(pick(data, K.noticeCardScale, FALLBACK.noticeCardScale), FALLBACK.noticeCardScale);
  const footerCardScale = normalizeScale(pick(data, K.footerCardScale, FALLBACK.footerCardScale), FALLBACK.footerCardScale);

  const noticeMegaphoneClass = NOTICE_MEGAPHONE_CLASS[noticeCardScale];

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <div className={`shrink-0 border-b pb-2 ${sf ? "border-cyan-500/25" : "border-slate-200/70"}`}>
        <h3
          className={`font-black tracking-tight ${sf ? "text-slate-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.25)]" : "text-slate-900"} ${TITLE_CLASS[titleScale]}`}
        >
          {title}
        </h3>
      </div>

      <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
        {isError ? (
          <div className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            暂时无法从服务器同步公告配置，下方为默认文案；请检查网络或稍后刷新。
          </div>
        ) : null}
        {isLoading ? (
          <div className={`shrink-0 text-center text-[11px] ${sf ? "text-slate-400" : "text-slate-400"}`}>正在同步配置…</div>
        ) : null}

        {/* 公告区：占据中间全部剩余高度，正文可滚动 */}
        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm ${
            sf
              ? `border-cyan-500/30 bg-gradient-to-br from-slate-950/90 via-indigo-950/50 to-slate-900/80 shadow-[0_0_28px_rgba(56,189,248,0.12)] ${NOTICE_CARD_SHELL[noticeCardScale]}`
              : `border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 ${NOTICE_CARD_SHELL[noticeCardScale]}`
          }`}
        >
          <div
            className={`flex min-w-0 shrink-0 items-center gap-2 ${sf ? "text-cyan-100" : "text-amber-950"} ${NOTICE_HEAD_CLASS[noticeScale]}`}
          >
            <Megaphone className={`${noticeMegaphoneClass} shrink-0 ${sf ? "text-cyan-400" : "text-amber-600"}`} />
            <span className="min-w-0 break-words">{noticeTitle}</span>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
            {noticeBody.trim() ? (
              <ProseBlock
                className={`${sf ? "text-slate-200" : "text-amber-950/95"} ${NOTICE_BODY_CLASS[noticeScale]}`}
                lineClassName="text-inherit"
              >
                {noticeBody}
              </ProseBlock>
            ) : (
              <p className={`${sf ? "text-slate-400" : "text-amber-800/75"} ${NOTICE_BODY_CLASS[noticeScale]}`}>暂无公告内容。</p>
            )}
          </div>
        </section>

        {/* 标准还卡 + 惩戒：整体落底，字号独立可调、默认偏小以让出公告空间 */}
        <div
          className={`mt-auto flex shrink-0 flex-col border-t pt-1.5 ${sf ? "border-cyan-500/20" : "border-slate-200/60"} ${FOOTER_STACK_GAP[footerCardScale]}`}
        >
          <section
            className={`border ${sf ? "border-cyan-500/25 bg-slate-950/55" : "border-slate-200/80 bg-white/90"} ${FOOTER_SECTION_SHELL[footerCardScale]}`}
          >
            <div
              className={`flex items-center gap-1.5 ${sf ? "text-slate-200" : "text-slate-700"} ${FOOTER_SECTION_HEAD_CLASS[hoursFontScale]}`}
            >
              <Clock className={`${FOOTER_ICON_CLASS[footerCardScale]} shrink-0 ${sf ? "text-cyan-400" : "text-amber-500"}`} />
              <span>{hoursLabel}</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span
                className={`font-black tracking-tight tabular-nums ${sf ? "text-cyan-100" : "text-slate-800"} ${FOOTER_TIME_CLASS[hoursFontScale]}`}
              >
                {startTime}
              </span>
              <span className={`text-base font-black ${sf ? "text-slate-500" : "text-slate-400"}`}>—</span>
              <span
                className={`font-black tracking-tight tabular-nums ${sf ? "text-cyan-100" : "text-slate-800"} ${FOOTER_TIME_CLASS[hoursFontScale]}`}
              >
                {endTime}
              </span>
            </div>
            <div className={`mt-1.5 border-t pt-1.5 ${sf ? "border-cyan-500/15" : "border-slate-100"}`}>
              <ProseBlock
                className={`${sf ? "text-slate-300" : "text-slate-600"} ${FOOTER_BODY_CLASS[hoursFontScale]}`}
                lineClassName="text-inherit"
              >
                {returnRules}
              </ProseBlock>
            </div>
          </section>

          <section
            className={`border ${sf ? "border-fuchsia-500/35 bg-fuchsia-950/35" : "border-rose-200/70 bg-rose-50/40"} ${FOOTER_SECTION_SHELL[footerCardScale]}`}
          >
            <div
              className={`mb-1 flex items-center gap-1.5 ${sf ? "text-fuchsia-100" : "text-rose-900"} ${FOOTER_SECTION_HEAD_CLASS[disciplineFontScale]}`}
            >
              <ShieldAlert className={`${FOOTER_ICON_CLASS[footerCardScale]} shrink-0 ${sf ? "text-fuchsia-400" : "text-rose-600"}`} />
              <span>{disciplineTitle}</span>
            </div>
            <ProseBlock
              className={`${sf ? "text-fuchsia-100/95" : "text-rose-950/90"} ${FOOTER_BODY_CLASS[disciplineFontScale]}`}
              lineClassName="text-inherit"
            >
              {disciplineBody}
            </ProseBlock>
          </section>
        </div>
      </div>
    </div>
  );
}
