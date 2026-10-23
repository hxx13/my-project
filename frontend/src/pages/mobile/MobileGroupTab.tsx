/** 手机版 — 课题组活跃度（与学生中心 home 同源） */
import { useMemo } from "react";
import {
  fetchStudentMobileGroupActivitySummary,
  fetchStudentMobileGroupActivityMembers,
  fetchStudentMobileGroupActivityHeatmap,
  fetchStudentMobileGroupActivityRoomUsage,
} from "@/api/domains/studentMobile.api";
import { StudentActivityPanel } from "@/features/analytics/components/StudentActivityPanel";

interface MobileGroupTabProps {
  groupName: string;
}

export default function MobileGroupTab({ groupName }: MobileGroupTabProps) {
  const fetchers = useMemo(
    () => ({
      fetchSummary: (params: Parameters<typeof fetchStudentMobileGroupActivitySummary>[0]) =>
        fetchStudentMobileGroupActivitySummary(params),
      fetchMembers: (params: Parameters<typeof fetchStudentMobileGroupActivityMembers>[0]) =>
        fetchStudentMobileGroupActivityMembers(params),
      fetchHeatmap: (params: Parameters<typeof fetchStudentMobileGroupActivityHeatmap>[0]) =>
        fetchStudentMobileGroupActivityHeatmap(params),
      fetchRoomUsage: (params: Parameters<typeof fetchStudentMobileGroupActivityRoomUsage>[0]) =>
        fetchStudentMobileGroupActivityRoomUsage(params),
    }),
    [],
  );

  return (
    <StudentActivityPanel
      groupName={groupName}
      variant="mobile"
      queryKeyPrefix="mobileGroupActivity:jwt"
      fetchers={fetchers}
    />
  );
}
