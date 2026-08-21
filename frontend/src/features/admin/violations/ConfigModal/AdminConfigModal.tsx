import { useEffect, useState } from "react";
import type { JSX } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { ConfigModalShell } from "./ConfigModalShell";
import { ConfigMenu } from "./ConfigMenu";
import { HomepageSettingsForm } from "./HomepageSettingsForm";
import { TriggerRulesPanel } from "@/features/admin/violations/rules/TriggerRulesPanel";
import { StrandedRulePanel } from "@/features/admin/violations/rules/StrandedRulePanel";
import { CageRulePanel } from "@/features/admin/violations/rules/CageRulePanel";
import { AnnouncementsPanel } from "@/features/admin/violations/notices/AnnouncementsPanel";
import { UnboundNoticePanel } from "@/features/admin/violations/notices/UnboundNoticePanel";
import { HintTextPanel } from "@/features/admin/violations/notices/HintTextPanel";
import type { ConfigModalView } from "../violationsTabs";

const PAGE_TITLES: Record<ConfigModalView, string> = {
  menu: "配置",
  rules: "通用违规规则",
  stranded: "每日滞留检测",
  cage: "笼架联动",
  announce: "弹窗公告",
  unbound: "未绑卡提示",
  hint: "禁入文案",
  homepage: "主页文案",
};

/** 重编辑器/列表页加宽弹窗；菜单与主页紧凑表单窄窗。 */
const WIDE_PAGES = new Set<ConfigModalView>(["rules", "stranded", "cage", "announce", "unbound", "hint"]);
/** 挂载 ListPageLayout/EditorInspectorLayout 的面板页由子组件自滚（fill）；纯内容页弹窗体滚动。 */
const FILL_PAGES = new Set<ConfigModalView>(["rules", "stranded", "cage", "announce", "unbound", "hint", "homepage"]);

type AdminConfigModalProps = {
  open: boolean;
  /** 入口页（来自书签/齿轮）；弹窗内导航更新 current，不改 URL。 */
  page: ConfigModalView;
  onClose: () => void;
};

/** ⚙ 配置弹窗：分类菜单 → 页内钻入；原 4 tab 配置面板在此原样挂载。 */
export function AdminConfigModal({ open, page, onClose }: AdminConfigModalProps): JSX.Element | null {
  const [current, setCurrent] = useState<ConfigModalView>("menu");

  useEffect(() => {
    if (open) setCurrent(page);
  }, [open, page]);

  if (!open) return null;

  const isMenu = current === "menu";
  const wide = !isMenu && WIDE_PAGES.has(current);
  const fill = !isMenu && FILL_PAGES.has(current);

  const header = isMenu ? (
    <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--app-color-text-primary)]">
      <span className="text-base" aria-hidden>⚙</span> 配置
    </span>
  ) : (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--app-color-text-secondary)]">
      <span className="shrink-0">配置</span>
      <span className="text-[var(--app-color-text-tertiary)]">/</span>
      <span className="truncate font-semibold text-[var(--app-color-text-primary)]">{PAGE_TITLES[current]}</span>
    </div>
  );

  const actions = isMenu ? undefined : (
    <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={() => setCurrent("menu")}>
      返回
    </AdminButton>
  );

  const body =
    current === "menu" ? (
      <ConfigMenu onOpen={setCurrent} />
    ) : current === "rules" ? (
      <TriggerRulesPanel />
    ) : current === "stranded" ? (
      <StrandedRulePanel />
    ) : current === "cage" ? (
      <CageRulePanel />
    ) : current === "announce" ? (
      <AnnouncementsPanel />
    ) : current === "unbound" ? (
      <UnboundNoticePanel />
    ) : current === "hint" ? (
      <HintTextPanel />
    ) : (
      <HomepageSettingsForm />
    );

  return (
    <ConfigModalShell
      open
      onClose={onClose}
      ariaLabel="违规记录配置"
      header={header}
      actions={actions}
      wide={wide}
      fill={fill}
    >
      {body}
    </ConfigModalShell>
  );
}
