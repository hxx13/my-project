/** 手机版 — 课题组活跃度（与学生中心 home 同源） */
import { useMemo } from "react";
import {
  fetchMobileGroupActivitySummary,
  fetchMobileGroupActivityMembers,
  fetchMobileGroupActivityHeatmap,
  fetchMobileGroupActivityRoomUsage,
} from "@/api/domains/mobileStudent.api";
import {
  fetchStudentMobileGroupActivitySummary,
  fetchStudentMobileGroupActivityMembers,
  fetchStudentMobileGroupActivityHeatmap,
  fetchStudentMobileGroupActivityRoomUsage,
} from "@/api/domains/studentMobile.api";
import { StudentActivityPanel } from "@/features/analytics/components/StudentActivityPanel";

interface MobileGroupTabProps {
  token: string;
  jwtMode?: boolean;
  groupName: string;
}

export default function MobileGroupTab({ token, jwtMode, groupName }: MobileGroupTabProps) {
  const fetchers = useMemo(
    () => ({
      fetchSummary: (params: Parameters<typeof fetchMobileGroupActivitySummary>[1]) =>
        jwtMode
          ? fetchStudentMobileGroupActivitySummary(params)
          : fetchMobileGroupActivitySummary(token, params),
      fetchMembers: (params: Parameters<typeof fetchMobileGroupActivityMembers>[1]) =>
        jwtMode
          ? fetchStudentMobileGroupActivityMembers(params)
          : fetchMobileGroupActivityMembers(token, params),
      fetchHeatmap: (params: Parameters<typeof fetchMobileGroupActivityHeatmap>[1]) =>
        jwtMode
          ? fetchStudentMobileGroupActivityHeatmap(params)
          : fetchMobileGroupActivityHeatmap(token, params),
      fetchRoomUsage: (params: Parameters<typeof fetchMobileGroupActivityRoomUsage>[1]) =>
        jwtMode
          ? fetchStudentMobileGroupActivityRoomUsage(params)
          : fetchMobileGroupActivityRoomUsage(token, params),
    }),
    [token, jwtMode],
  );

  return (
    <StudentActivityPanel
      groupName={groupName}
      variant="mobile"
      queryKeyPrefix={`mobileGroupActivity:${jwtMode ? "jwt" : token}`}
      fetchers={fetchers}
    />
  );
}
