import { useQuery } from "@tanstack/react-query";
import { fetchCageInfoCodelist } from "@/features/cage-shelf/api/cageForm.api";
import {
  SPECIAL_DETAIL_DICT,
  compactDetailBadgeText,
  type SpecialDetailBadgeItem,
} from "@/features/cage-shelf/constants";
import { useCageColors } from "./CageColorContext";

/**
 * 特殊饲养明细的格子角标 —— 右上角竖排的小药丸，形如 `+食` / `−水`（记法见 compactDetailBadgeText）。
 *
 * 为什么落在右上角：明细强绑定「需特殊饲养」，而该状态下的笼位必是 type 3（饲养中），
 * type 3 不点类型指示灯（见 `CageCellOverlays.DOT_VISIBLE_TYPES`），那个角本来就是空的；
 * 且五状态只用底色表达、格内没有文字标签，角标是唯一不挤占「位号/PI/实验员」的落点。
 *
 * 底色取父状态「需特殊饲养」的描边色 —— 明细是它的一族，不另开一套可调色（也就不会与
 * 五状态的配色/图例打架）。尺寸由调用方的容器决定：Web 用 px 档，平面图用 cqw 档覆盖
 * （见 `CompactCell.css`），与右上角类型指示灯同一套覆盖手法。
 *
 * 纯悬浮，**不占内容位置**：不挤位号、不加内边距让位，就压在那个角上。字号压到 7px 是为了
 * 「浮着也不挡字」—— 位号最长的四字坐标（A-10）右端约到格子右侧 6px 处，两字药丸宽约 14px、
 * 贴右 2px，正好错开；改字号前先把这两个数重算一遍。
 *
 * 显示与否由调用方用 `specialDetailItemsFor` 判定（同源门控 + 强绑定），本组件只管画。
 */
export default function SpecialDetailBadges({ items }: { items: SpecialDetailBadgeItem[] }) {
  const { colors } = useCageColors();
  // 暂存态（状态模式下刚勾、还没提交）只有 item_code、没有中文名，从码表补回来。
  // 查询键与笼架页共用 —— 同一页面只发一次请求，页面已加载过就直接吃缓存。
  const { data: options = [] } = useQuery({
    queryKey: ["specialDetailOptions"],
    queryFn: async () => (await fetchCageInfoCodelist(SPECIAL_DETAIL_DICT)).items ?? [],
    staleTime: 10 * 60 * 1000,
  });
  if (items.length === 0) return null;
  const labelOf = (it: SpecialDetailBadgeItem) =>
    it.label?.trim() || options.find((o) => o.itemCode === it.code)?.itemLabel || it.code;
  const bg = colors.SPECIAL_FEEDING?.border ?? "#ef4444";
  return (
    <div
      data-special-detail-badges
      className="absolute right-0.5 top-0.5 z-10 flex flex-col items-end gap-[1px]"
    >
      {items.map((it) => {
        const full = labelOf(it);
        return (
          <span
            key={it.code}
            title={full}
            className="rounded-[2px] px-[1px] text-[8px] font-bold leading-[11px] text-white shadow-sm"
            style={{ backgroundColor: bg }}
          >
            {compactDetailBadgeText(full)}
          </span>
        );
      })}
    </div>
  );
}
