/**
 * 球球面板「详情」视图的纯逻辑：接口载荷归一化 + 提交体拼装 + 列表追加 + 列表请求参数。
 *
 * <p>全是无副作用的纯函数（不 import 任何 api / React），便于单测；组件只负责接线与渲染。
 */

/** 一次能带的反馈附图上限，与后端 {@code AiDrawerFeedbackService.MAX_IMAGES} 一致。 */
export const MAX_FEEDBACK_IMAGES = 6;

export type FeedbackStatus = "PENDING" | "REPLIED";

export interface CapabilityItem {
  id: number;
  title: string;
  promptText: string;
  /** 操作备注：点了会做什么。给用户看的说明，可空（空则不显示那一行） */
  note: string;
}

/**
 * 把 `/recommended` 的原始载荷归一成可渲染的行。
 *
 * 脏数据（非对象、id 或正文缺失）直接丢 —— 指令条是锦上添花，宁可少一条，
 * 也不要渲染出一张点不动的空卡。
 *
 * 返回的就是本文件既有的 `CapabilityItem`（**只有 id / title / promptText / note**），
 * 不为指令条另造类型；分组与排序是详情页才需要的东西。
 */
export function normalizeRecommended(raw: unknown): CapabilityItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CapabilityItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = Number(o.id);
    const promptText = typeof o.promptText === "string" ? o.promptText : "";
    if (!Number.isFinite(id) || !promptText) continue;
    out.push({
      id,
      title: typeof o.title === "string" ? o.title : "",
      promptText,
      note: typeof o.note === "string" ? o.note : "",
    });
  }
  return out;
}

export interface CapabilityGroup {
  groupName: string;
  items: CapabilityItem[];
}

export interface FeedbackReply {
  content: string;
  imageUrls: string[];
  repliedBy: string;
  /** 作者展示名：后端解析出的名字；解析不到时归一化已回落到 repliedBy（原始 id）。 */
  repliedByName: string;
  repliedAt: string;
}

export interface FeedbackRow {
  id: number;
  userName: string;
  content: string;
  imageUrls: string[];
  status: FeedbackStatus;
  /** 回复串（升序，逐条累积）；没有回复时为空数组 */
  replies: FeedbackReply[];
  createdAt: string;
}

/**
 * 能力清单归一化：丢掉空组、丢掉缺 `promptText` 的条目（点它没有可填的话，等于点了个空）。
 * 结构异常给空表，**绝不抛** —— 详情视图不能开成空白或报错。
 * 服务端已按视角过滤，这里**不做视角判定**。
 */
export function normalizeCapabilityGroups(raw: unknown): CapabilityGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => {
      const gg = (g ?? {}) as { groupName?: unknown; items?: unknown };
      const items = Array.isArray(gg.items)
        ? gg.items
            .map((it) => (it ?? {}) as { id?: unknown; title?: unknown; promptText?: unknown; note?: unknown })
            .filter((it) => String(it.promptText ?? "").trim().length > 0)
            .map((it) => ({
              id: Number(it.id ?? 0),
              title: String(it.title ?? ""),
              promptText: String(it.promptText ?? ""),
              note: String(it.note ?? ""),
            }))
        : [];
      return { groupName: String(gg.groupName ?? ""), items };
    })
    .filter((g) => g.items.length > 0);
}

/** 反馈行归一化：补缺省、把非字符串/空的图地址滤掉（后端已把 JSON 解成数组，这里只防脏）。 */
export function normalizeFeedbackRows(raw: unknown): FeedbackRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const src = (r ?? {}) as Record<string, unknown>;
    const status: FeedbackStatus = src.status === "REPLIED" ? "REPLIED" : "PENDING";
    const pickUrls = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
    const replies: FeedbackReply[] = Array.isArray(src.replies)
      ? src.replies
          .map((x) => (x ?? {}) as Record<string, unknown>)
          .map((x) => {
            const repliedBy = String(x.repliedBy ?? "");
            const byName = String(x.repliedByName ?? "").trim();
            return {
              content: String(x.content ?? ""),
              imageUrls: pickUrls(x.imageUrls),
              repliedBy,
              // 作者展示名：优先后端解析出的名字，拿不到再退回原始 id
              repliedByName: byName.length > 0 ? byName : repliedBy,
              repliedAt: String(x.repliedAt ?? ""),
            };
          })
          .filter((x) => x.content.length > 0)
      : [];
    return {
      id: Number(src.id ?? 0),
      userName: String(src.userName ?? ""),
      content: String(src.content ?? ""),
      imageUrls: pickUrls(src.imageUrls),
      status,
      replies,
      createdAt: String(src.createdAt ?? ""),
    };
  });
}

/**
 * 提交体拼装：文字**去空白后必填**（空 → 返回 null，调用点据此不发请求、按钮置灰）；
 * 附图截到 {@link MAX_FEEDBACK_IMAGES} 张，冗余超量的部分直接砍掉（后端也只收 6 张）。
 */
export function buildFeedbackPayload(
  content: string,
  imageUrls: string[],
): { content: string; imageUrls: string[] } | null {
  const text = content.trim();
  if (!text) return null;
  return { content: text, imageUrls: imageUrls.slice(0, MAX_FEEDBACK_IMAGES) };
}

/** 列表追加：把新一页拼在后面，**绝不清空已展示的**（触底翻页不能一翻就跳）。 */
export function appendFeedbackRows(prev: FeedbackRow[], incoming: FeedbackRow[]): FeedbackRow[] {
  return [...prev, ...incoming];
}

/**
 * 列表请求参数：**只有超管切到「全部」才带 `all=true`**；其余一律不带。
 * 非超管传 true 会被后端**直接拒**（不是回落成「只看自己的」），所以这里必须卡死在超管分支上。
 */
export function feedbackListParams(
  isAdmin: boolean,
  scope: "mine" | "all",
  page: number,
  size: number,
): { page: number; size: number; all?: boolean } {
  const params: { page: number; size: number; all?: boolean } = { page, size };
  if (isAdmin && scope === "all") params.all = true;
  return params;
}

/* ── 编辑态（仅 ≥超管）：整份读 → 改 → 整份存 ────────────────────────── */

/**
 * 可见范围白名单。**必须与后端 `AiDrawerContentService#visibleTo` 一致**：
 * 空 = 全员；STAFF/STUDENT = 视角；ADMIN/SUPER_ADMIN = 角色档。
 *
 * <p>后端对白名单外的值是「按全员放行 + 记一条 WARN」，而编辑器是**整份提交** ——
 * 界面上产生一个后端不认识的值，保存后就等于把它放开给了所有人，且悄无声息。
 */
export const AUDIENCE_VALUES = ["", "STAFF", "STUDENT", "ADMIN", "SUPER_ADMIN"] as const;

/** 编辑态一行。`uid` 是本地键：id 由后端发、新增行没有，增删移动时不能用它当 key。 */
export interface CapRow {
  uid: string;
  id: number | null;
  groupName: string;
  title: string;
  promptText: string;
  /** 操作备注：点了会做什么 */
  note: string;
  enabled: boolean;
  audience: string;
}

export function normalizeAudience(v: unknown): string {
  const s = v == null ? "" : String(v);
  return (AUDIENCE_VALUES as readonly string[]).includes(s) ? s : "";
}

/** 管理端整份清单（扁平、含停用行）→ 编辑行。结构异常给空表，**绝不抛**。 */
export function buildCapRows(raw: unknown): CapRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => {
    const r = (it ?? {}) as Record<string, unknown>;
    return {
      uid: "r" + i + "_" + String(r.id ?? "new"),
      id: r.id == null ? null : Number(r.id),
      groupName: String(r.groupName ?? ""),
      title: String(r.title ?? ""),
      promptText: String(r.promptText ?? ""),
      note: String(r.note ?? ""),
      enabled: r.enabled !== false,
      audience: normalizeAudience(r.audience),
    };
  });
}

/** 上下移一行。越界或没动就返回**原数组**（调用方据此跳过 setState）。 */
export function moveCapRow(rows: CapRow[], index: number, delta: number): CapRow[] {
  const to = index + delta;
  if (index < 0 || index >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = rows.slice();
  const [row] = next.splice(index, 1);
  next.splice(to, 0, row);
  return next;
}

/**
 * 编辑行 → 整份提交体：`sortOrder` 按**当前顺序**重排（步长 10），
 * 标题与提示词都为空的整行丢掉（点了没字可填 = 一条废卡）。
 */
export function buildCapSavePayload(rows: CapRow[]): Array<{
  id: number | null;
  groupName: string;
  title: string;
  promptText: string;
  note: string;
  sortOrder: number;
  enabled: boolean;
  audience: string;
}> {
  return rows
    .filter((r) => r.title.trim() !== "" || r.promptText.trim() !== "")
    .map((r, i) => ({
      id: r.id,
      groupName: r.groupName.trim() || "未分组",
      title: r.title.trim(),
      promptText: r.promptText.trim(),
      note: r.note.trim(),
      sortOrder: (i + 1) * 10,
      enabled: r.enabled,
      audience: normalizeAudience(r.audience),
    }));
}
