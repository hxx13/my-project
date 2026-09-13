/**
 * 「交互层 / 公告层」分层的唯一判据。
 *
 * <p>扫码弹窗里四种通知原来平权并排，而面板宽度是按**面板数量**算的
 * （见 `styles/scan-announcement-doodle.css` 的 `--doodle-card-width`），
 * 于是唯一需要动手的违规面板被迫和被动公告平分宽度——4 张时每张只有约 196px，
 * 签名画布、答题选项都被挤没。
 *
 * <p>分层规则：需要交互 **且** 尚未完成 → 进「交互层」（独占一行、拿 `--1` 档全宽）；
 * 仅展示、或已完成处置 → 回「公告层」与其它通知并排。
 * 完成那一刻 `interactiveChallengeVerified` 变为 true，本判据自动转假，卡片自己落回公告层。
 */

/** 需要用户动手的处置策略（与 SHOW_ONLY 相对）。 */
export const INTERACTIVE_DISPOSITION_TYPES = ["ACK_READ", "ACK_PUZZLE", "QUIZ", "SIGNATURE"] as const;

export type NoticeLayerInput =
  | {
      dispositionType?: string | null;
      interactiveChallenge?: string | null;
      interactiveChallengeVerified?: boolean | null;
    }
  | null
  | undefined;

const hasPhrase = (n: NoticeLayerInput): boolean =>
  Boolean(n?.interactiveChallenge && n.interactiveChallenge.trim());

/**
 * 该通知实际声明的交互策略；口径与 {@link ScanNoticePanelCard} 的分派保持一致：
 * 老数据没有 `dispositionType` 时，有记录级拼图短语即视为 ACK_PUZZLE；
 * 声明 ACK_PUZZLE 却没有短语则无从作答（卡片也不会渲染面板），按「无策略」处理。
 */
export function declaredInteractiveStrategy(n: NoticeLayerInput): string {
  const declared = (n?.dispositionType || "").trim().toUpperCase();
  if (declared === "ACK_PUZZLE" && !hasPhrase(n)) return "";
  if (declared) return declared;
  return hasPhrase(n) ? "ACK_PUZZLE" : "";
}

/** 是否需要「交互层」：交互类策略且尚未完成处置。 */
export function needsInteractiveLayer(n: NoticeLayerInput): boolean {
  if (!n || n.interactiveChallengeVerified) return false;
  return (INTERACTIVE_DISPOSITION_TYPES as readonly string[]).includes(declaredInteractiveStrategy(n));
}
