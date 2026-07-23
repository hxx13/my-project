/** 公告/通知列表行 — 首页与全屏面板共用（两行：类型+标题 / 副标题） */
import { ChevronRight } from "lucide-react";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import {
  alertKindColors,
  alertKindLabel,
  formatNoticeListSubtitle,
} from "./mobileNoticePresentation";
import {
  buildExemptListPreview,
  parseExemptFields,
  resolveExemptAlertTitle,
} from "./mobileExemptAlertHelpers";

export default function MobileNoticeListRow({
  item,
  html5PrivilegeBypass,
  bordered,
  onSelect,
}: {
  item: MobileAlertItem;
  html5PrivilegeBypass?: boolean;
  bordered?: boolean;
  onSelect: () => void;
}) {
  const colors = alertKindColors(item.kind);
  const needK = item.interactiveRequired && !html5PrivilegeBypass;
  const subtitle =
    item.kind === "exempt"
      ? buildExemptListPreview(parseExemptFields(item))
      : formatNoticeListSubtitle(item);
  const title = item.kind === "exempt" ? resolveExemptAlertTitle() : item.title;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-2.5 w-full text-left active:bg-black/[0.03] transition-colors"
      style={{
        padding: "12px 16px",
        borderTop: bordered ? "1px solid rgba(30,55,90,0.06)" : undefined,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
            style={{ background: colors.bg, color: colors.color }}
          >
            {alertKindLabel(item.kind, item.source)}
          </span>
          <span
            className="flex-1 min-w-0 text-[14px] font-medium truncate leading-snug"
            style={{ color: "#323233" }}
          >
            {title}
          </span>
          {needK && (
            <span className="shrink-0 text-[10px] font-semibold" style={{ color: "#d97706" }}>
              ⚠️自助机
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[12px] mt-1 truncate leading-snug" style={{ color: "#969799" }}>
            {subtitle}
          </p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0" style={{ color: "#c8c9cc" }} />
    </button>
  );
}
