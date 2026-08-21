export type ViolationsTabId = "records" | "rules" | "notices" | "homepage";
export type RulesSubId = "trigger" | "stranded" | "cage";
export type NoticesSubId = "announce" | "unbound" | "hint";

export const VIOLATIONS_TABS: { id: ViolationsTabId; label: string }[] = [
  { id: "records", label: "违规记录" },
  { id: "rules", label: "违规规则" },
  { id: "notices", label: "扫码提示" },
  { id: "homepage", label: "主页文案" },
];

export const RULES_SUBS: { id: RulesSubId; label: string }[] = [
  { id: "trigger", label: "触发规则" },
  { id: "stranded", label: "滞留检测" },
  { id: "cage", label: "笼架联动" },
];

export const NOTICES_SUBS: { id: NoticesSubId; label: string }[] = [
  { id: "announce", label: "弹窗公告" },
  { id: "unbound", label: "未绑卡提示" },
  { id: "hint", label: "文案提示" },
];

/** records tab 的 sub 哨兵：命中即直达「新建违规（手动）」表单，仅 records 页使用。 */
export const RECORDS_CREATE_SUB = "create";

/** ⚙ 配置弹窗内的页面 id（记录为主页后，原 4 tab 的配置能力折叠至此）。 */
export type ConfigPageId = "rules" | "stranded" | "cage" | "announce" | "unbound" | "hint" | "homepage";
/** 弹窗视图 = 分类菜单 | 各配置页。menu 仅弹窗内部可达，URL 映射永不返回它。 */
export type ConfigModalView = ConfigPageId | "menu";

const TAB_TO_CONFIG: Partial<Record<ViolationsTabId, ConfigPageId>> = {
  rules: "rules",
  notices: "announce",
  homepage: "homepage",
};

const SUB_TO_CONFIG: Record<string, ConfigPageId> = {
  trigger: "rules",
  stranded: "stranded",
  cage: "cage",
  announce: "announce",
  unbound: "unbound",
  hint: "hint",
};

/**
 * tab/sub → ⚙ 弹窗页映射。sub 优先（原子面板），否则回退 tab（原顶层）。
 * records 永远返回 null（记录即页面主体，弹窗不打开）。
 */
export function configPageFromTab(tab: ViolationsTabId, sub?: string): ConfigPageId | null {
  if (sub && SUB_TO_CONFIG[sub]) return SUB_TO_CONFIG[sub];
  return TAB_TO_CONFIG[tab] ?? null;
}

/**
 * 旧 6-tab IA → 新 4-tab IA 的书签重定向映射。
 * 旧子面板（manual/stranded/records/rules/hint-text/submit）是页内局部 state，
 * 从未写入 URL，故只重定向顶层 tab id。「records」新旧同名，走直通分支以保留 sub。
 */
const LEGACY_TAB_MAP: Record<string, { tab: ViolationsTabId; sub?: string }> = {
  unbound: { tab: "notices", sub: "unbound" },
  announcement: { tab: "notices", sub: "announce" },
  create: { tab: "records", sub: RECORDS_CREATE_SUB },
  "cage-linkage": { tab: "rules", sub: "cage" },
  "homepage-content": { tab: "homepage" },
};

/** 各 tab 合法 sub 白名单：非白名单 sub 解析时被丢弃，避免脏 URL 残留。 */
const VALID_SUBS: Record<ViolationsTabId, readonly string[]> = {
  records: [RECORDS_CREATE_SUB],
  rules: RULES_SUBS.map((s) => s.id),
  notices: NOTICES_SUBS.map((s) => s.id),
  homepage: [],
};

function normalizeSub(tab: ViolationsTabId, sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  return VALID_SUBS[tab].includes(sub) ? sub : undefined;
}

export function parseTabFromSearch(search: string): { tab: ViolationsTabId; sub?: string } {
  const params = new URLSearchParams(search);
  const rawTab = params.get("tab") ?? "records";
  const rawSub = params.get("sub") ?? undefined;

  const legacy = LEGACY_TAB_MAP[rawTab];
  if (legacy) return legacy;

  const tab: ViolationsTabId = VIOLATIONS_TABS.some((t) => t.id === rawTab)
    ? (rawTab as ViolationsTabId)
    : "records";
  return { tab, sub: normalizeSub(tab, rawSub) };
}

/** 序列化为 URL 查询串（不含前导 `?`），供 `setSearchParams` 直接消费。 */
export function tabToSearch(tab: ViolationsTabId, sub?: string): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (sub) params.set("sub", sub);
  return params.toString();
}
