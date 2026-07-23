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
}

export function StudentActivityDashboard({ groupName, className }: Props) {
  return (
    <StudentActivityPanel
      groupName={groupName}
      className={className}
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
