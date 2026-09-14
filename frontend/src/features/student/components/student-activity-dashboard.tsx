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
}

export function StudentActivityDashboard({ groupName, className, headerExtra }: Props) {
  return (
    <StudentActivityPanel
      groupName={groupName}
      className={className}
      headerExtra={headerExtra}
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
