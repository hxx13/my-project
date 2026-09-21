import { useQuery } from "@tanstack/react-query";
import { fetchCageInfoCodelist } from "@/features/cage-shelf/api/cageForm.api";
import {
  SPECIAL_DETAIL_DICT,
  HEALTH_SEVERITY_DICT,
  HEALTH_ITCH_LABEL,
  compactDetailBadgeText,
  type SpecialDetailBadgeItem,
} from "@/features/cage-shelf/constants";
import { useCageColors } from "./CageColorContext";

/**
 * 笼位格子右上角的悬浮角标：**健康异常严重程度**与**特殊饲养明细**并排。
 *
 * 为什么横排而不是叠两列：两者可以同时出现（一格既标了健康异常、又标了特殊饲养明细），
 * 竖向叠会把角标顶得比格子还高；横排只占一行、都贴右上，互不遮挡。
 *
 * 为什么都落在这个角：这两个子值只在 type 3（饲养中）/ type 4（异常）的格子上出现，
 * 而 type 3 不点类型指示灯，那个角本来就是空的（见 `CageCellOverlays.DOT_VISIBLE_TYPES`）；
 * 与左上认领徽标、底部色条（中间态 / 划分）各占一角。
 *
 * 纯悬浮，**不占内容位置**：不挤位号、不加内边距让位。字号压到 8px 是为了「浮着也不挡字」
 * —— 位号最长的四字坐标（A-10）右端约到格子右侧 6px 处；改字号前先把这段重算一遍。
 *
 * 两族角标的文字规则**不同**：明细压成记号（`+食` / `−水`，见 {@link compactDetailBadgeText}），
 * 严重程度用全名（轻微 / 中度 / 严重，正好两字、本来就不长）。别把明细那套加减号规则套到严重程度上。
 */
export default function CellStatusBadges({
  items,
  health,
}: {
  items: SpecialDetailBadgeItem[];
  /**
   * 健康异常那一族（严重程度 + 瘙痒，**纵排**）。它与明细各占一列、并排 ——
   * 一格里可能同时有「健康异常 + 特殊饲养明细」，横排只占一行，竖着叠会把角标顶得比格子还高。
   */
  health?: SpecialDetailBadgeItem[];
}) {
  const { colors } = useCageColors();
  // 暂存态（状态模式下刚勾、还没提交）只有 item_code、没有中文名，从码表补回来。
  // 查询键与笼架页共用 —— 同一页面只发一次请求，页面已加载过就直接吃缓存。
  const { data: detailOptions = [] } = useQuery({
    queryKey: ["specialDetailOptions"],
    queryFn: async () => (await fetchCageInfoCodelist(SPECIAL_DETAIL_DICT)).items ?? [],
    staleTime: 10 * 60 * 1000,
  });
  const { data: severityOptions = [] } = useQuery({
    queryKey: ["healthSeverityOptions"],
    queryFn: async () => (await fetchCageInfoCodelist(HEALTH_SEVERITY_DICT)).items ?? [],
    staleTime: 10 * 60 * 1000,
  });
  const healthItems = health ?? [];
  if (items.length === 0 && healthItems.length === 0) return null;

  const detailBg = colors.SPECIAL_FEEDING?.border ?? "#ef4444";
  const healthBg = colors.HEALTH_ABNORMAL?.border ?? "#3b82f6";
  const labelOf = (it: SpecialDetailBadgeItem) =>
    it.label?.trim()
      || (it.code === "ITCH"
        ? HEALTH_ITCH_LABEL
        : severityOptions.find((o) => o.itemCode === it.code)?.itemLabel)
      || it.code;

  return (
    <div
      data-cell-status-badges
      className="absolute right-0.5 top-0.5 z-10 flex flex-row items-start gap-[2px]"
    >
      {healthItems.length > 0 && (
        <div className="flex flex-col items-end gap-[1px]">
          {healthItems.map((it) => {
            const full = labelOf(it);
            return (
              <span
                key={it.code}
                title={full}
                className="rounded-[2px] px-[2px] text-[8px] font-bold leading-[11px] text-white shadow-sm"
                style={{ backgroundColor: healthBg }}
              >
                {full}
              </span>
            );
          })}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-col items-end gap-[1px]">
          {items.map((it) => {
            const full = it.label?.trim()
              || detailOptions.find((o) => o.itemCode === it.code)?.itemLabel
              || it.code;
            return (
              <span
                key={it.code}
                title={full}
                className="rounded-[2px] px-[1px] text-[8px] font-bold leading-[11px] text-white shadow-sm"
                style={{ backgroundColor: detailBg }}
              >
                {compactDetailBadgeText(full)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
