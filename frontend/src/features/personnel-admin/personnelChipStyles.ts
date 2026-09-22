/**
 * 人员模块的小按钮（描边 chip）。原先 PersonnelDetailCard 和 PersonnelDictModal 各抄了一份
 * `inkBtn`，改一次得改两处、极易走形，收到这里。
 *
 * 危险态的文字与描边用 `danger-ink` 而不是 `danger`：后者（红-500）压在 `danger-soft`
 * （红-50）上实测只有 **4.36:1**，11px 标签过不了 WCAG AA；`danger-ink`（浅色主题=红-700）
 * 是 **7.63:1**，深色主题反过来指向亮色。
 *
 * 注意 `inkBtnDanger` 是**独立成串**的，不是往 `inkBtn` 后面拼：两个 `bg-*`/`text-*` 同时
 * 存在时谁生效由 CSS 生成顺序决定，不由 className 里的书写顺序决定。
 */
export const inkBtn =
  "inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40";

export const inkBtnDanger =
  "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-40 border-[color-mix(in_srgb,var(--app-color-feedback-danger-ink)_35%,transparent)] bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger-ink)] hover:bg-[color-mix(in_srgb,var(--app-color-feedback-danger)_18%,transparent)]";

/**
 * 图标小动作（无文字）：配色同 {@link inkBtn}，方形紧凑。
 * 说明文字必须放 `title` + `aria-label` —— 没有可见文字，这是唯一的语义来源。
 *
 * 用途：头像下方那类「轻量、每张卡都出现」的动作。别用文字版 —— 两三个实心按钮并排在
 * 头像下面会撑成一大块、抢走姓名的视觉重心。
 */
export const inkBtnIcon =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40";
