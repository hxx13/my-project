/** 手机版 — 首页公告列表行（小程序 news-card + van-cell） */
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { MOBILE_NOTICE_LIST_CARD_STYLE } from "./mobileNoticePresentation";
import { sortMobileAnnouncementsForDisplay } from "./mobileExemptAlertHelpers";
import MobileNoticeListRow from "./MobileNoticeListRow";
import { mobileNoticeItemKey } from "./MobileNoticesPanel";

export function MobileHomeNoticeList({
  items,
  html5PrivilegeBypass,
  onSelect,
}: {
  items: MobileAlertItem[];
  html5PrivilegeBypass?: boolean;
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl py-8 text-center" style={MOBILE_NOTICE_LIST_CARD_STYLE}>
        <p className="text-sm" style={{ color: "#969799" }}>
          暂无公告
        </p>
      </div>
    );
  }

  const sorted = sortMobileAnnouncementsForDisplay(items);

  return (
    <div style={MOBILE_NOTICE_LIST_CARD_STYLE}>
      {sorted.slice(0, 4).map((item, idx) => (
        <MobileNoticeListRow
          key={mobileNoticeItemKey(item)}
          item={item}
          html5PrivilegeBypass={html5PrivilegeBypass}
          bordered={idx > 0}
          onSelect={() => onSelect(mobileNoticeItemKey(item))}
        />
      ))}
    </div>
  );
}
