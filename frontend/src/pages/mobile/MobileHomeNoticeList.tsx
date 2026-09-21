/** 手机版 — 首页公告列表行（小程序 news-card + van-cell） */
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { MOBILE_NOTICE_LIST_CARD_STYLE } from "./mobileNoticePresentation";
import { splitMobileAnnouncementsBySection } from "./mobileExemptAlertHelpers";
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

  const { general, personal } = splitMobileAnnouncementsBySection(items);

  const renderSection = (title: string, list: MobileAlertItem[]) => {
    if (list.length === 0) return null;
    return (
      <div>
        <p className="px-1 pb-1.5 text-[13px] font-semibold" style={{ color: "#646566" }}>
          {title}
        </p>
        <div style={MOBILE_NOTICE_LIST_CARD_STYLE}>
          {list.slice(0, 4).map((item, idx) => (
            <MobileNoticeListRow
              key={mobileNoticeItemKey(item)}
              item={item}
              html5PrivilegeBypass={html5PrivilegeBypass}
              bordered={idx > 0}
              onSelect={() => onSelect(mobileNoticeItemKey(item))}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {renderSection("通用公告", general)}
      {renderSection("我的提醒", personal)}
    </div>
  );
}
