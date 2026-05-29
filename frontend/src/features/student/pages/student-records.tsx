import { FileText } from "lucide-react";
import { EmptyState } from "../components/ui/empty-state";

export default function StudentRecordsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="出入记录"
      description="此功能即将上线，敬请期待"
    />
  );
}
