import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { listViolationRules } from "@/api/domains/studentViolation.api";
import { listScanPopupAnnouncements } from "@/api/domains/scanPopupAnnouncement.api";
import type { ConfigPageId } from "../violationsTabs";

type ConfigMenuProps = {
  onOpen: (page: ConfigPageId) => void;
};

type MenuEntry = {
  page: ConfigPageId;
  icon: string;
  name: string;
  desc: string;
  count?: number;
  countLabel?: string;
};

function Group({ title, desc, items, onOpen }: { title: string; desc?: string; items: MenuEntry[]; onOpen: (page: ConfigPageId) => void }): JSX.Element {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline gap-2 px-1 pt-2 text-[11px] font-bold tracking-wide text-[var(--app-color-text-tertiary)]">
        {title}
        {desc ? <span className="font-medium tracking-normal text-[var(--app-color-text-tertiary)]/75">{desc}</span> : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--app-color-border-default)]">
        {items.map((it, i) => (
          <button
            key={it.page}
            type="button"
            onClick={() => onOpen(it.page)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--app-color-surface-hover)]"
            style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-color-border-default)" }}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-base">
              {it.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--app-color-text-primary)]">
                {it.name}
                {it.count != null ? (
                  <span className="rounded-full bg-[var(--app-color-surface-hover)] px-1.5 py-px text-[10px] font-bold text-[var(--app-color-text-secondary)]">
                    {it.count}
                  </span>
                ) : null}
                {it.countLabel ? (
                  <span className="rounded-full bg-[var(--app-color-surface-hover)] px-1.5 py-px text-[10px] font-bold text-[var(--app-color-text-secondary)]">
                    {it.countLabel}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--app-color-text-tertiary)]">{it.desc}</span>
            </span>
            <span className="shrink-0 text-sm text-[var(--app-color-text-tertiary)]">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** ⚙ 弹窗菜单页：分类清单 → 页内钻入。规则/公告计数来自共享查询缓存，未加载时不显示。 */
export function ConfigMenu({ onOpen }: ConfigMenuProps): JSX.Element {
  const { data: rules = [] } = useQuery({ queryKey: ["violation-rules"], queryFn: () => listViolationRules() });
  const { data: announcements = [] } = useQuery({ queryKey: ["scanPopupAnnouncements"], queryFn: listScanPopupAnnouncements });

  const triggerCount = rules.filter((r) => r.sourceTag !== "CAGE_STATUS").length;
  const cageCount = rules.filter((r) => r.sourceTag === "CAGE_STATUS").length;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Group
        title="产生与触发"
        desc="什么会生成违规记录"
        onOpen={onOpen}
        items={[
          {
            page: "rules",
            icon: "🧾",
            name: "通用违规规则",
            desc: "手动开具与系统规则库：触发动作、处置与禁入时长",
            count: triggerCount,
          },
          {
            page: "stranded",
            icon: "⏳",
            name: "每日滞留检测",
            desc: "定时检测滞留人员，自动开单并公告；白名单与签退",
            countLabel: "定时",
          },
          {
            page: "cage",
            icon: "🧫",
            name: "笼架联动",
            desc: "按特殊状态（合笼/健康异常等）自动生成违规与公告",
            count: cageCount,
          },
        ]}
      />
      <Group
        title="扫码展示"
        desc="扫码那一刻屏幕出现什么"
        onOpen={onOpen}
        items={[
          {
            page: "announce",
            icon: "📣",
            name: "弹窗公告",
            desc: "扫码弹出的滚动公告，可拖拽排序",
            count: announcements.length,
          },
          { page: "unbound", icon: "🪪", name: "未绑卡提示", desc: "未绑定校园卡人员扫码时的提示文案" },
          { page: "hint", icon: "⛔", name: "禁入文案", desc: "禁入人员扫码时的拦截提示文案" },
        ]}
      />
      <Group
        title="其他"
        onOpen={onOpen}
        items={[
          { page: "homepage", icon: "🏠", name: "主页文案", desc: "首页还卡说明、惩戒公告等面向学生的文案" },
        ]}
      />
    </div>
  );
}
