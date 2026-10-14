import type { ReactNode } from "react";
import {
  fetchStudentActivitySummary,
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityRoomUsage,
} from "@/api/domains/analytics.api";
import { StudentActivityPanel } from "@/features/analytics/components/StudentActivityPanel";

interface Props {
  groupName: string;
  className?: string;
  /** 塞进面板标题栏右侧控件组末尾（如「弹窗展开」按钮），不必在卡片外另起一行 */
  headerExtra?: ReactNode;
  /** 只渲染指定分区：charts=只图表，members=只成员表，all=两者都出（默认） */
  sections?: "all" | "charts" | "members";
  title?: string;
  /** 嵌入外部合并板块（不出卡片/标题） */
  embedded?: boolean;
  /** 嵌入时塞在标题行最前的内容（如外层主 tab），与控件同一行 */
  headerPrefix?: ReactNode;
}

export function StudentActivityDashboard({ groupName, className, headerExtra, sections, title, embedded, headerPrefix }: Props) {
  return (
    <StudentActivityPanel
      groupName={groupName}
      className={className}
      headerExtra={headerExtra}
      headerPrefix={headerPrefix}
      sections={sections}
      title={title}
      embedded={embedded}
      variant="student"
      queryKeyPrefix="studentActivity"
      fetchers={{
        fetchSummary: fetchStudentActivitySummary,
        fetchMembers: fetchStudentActivityMembers,
        fetchHeatmap: fetchStudentActivityHeatmap,
        fetchRoomUsage: fetchStudentActivityRoomUsage,
      }}
    />
  );
}
