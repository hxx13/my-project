import { ShieldCheck } from "lucide-react";
import { useStudentProfile } from "../hooks/use-student-profile";
import { Avatar } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { ErrorRetry } from "../components/ui/error-retry";
import { StudentCard } from "../components/ui/card";

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" className="size-14" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      {/* Info grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <StudentCard key={i} padding="lg">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-4 w-24" />
          </StudentCard>
        ))}
      </div>
    </div>
  );
}

export default function StudentProfilePage() {
  const { data, isLoading, isError, error, refetch } = useStudentProfile();

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (isError || !data) {
    return (
      <ErrorRetry
        message={error instanceof Error ? error.message : "加载档案失败"}
        onRetry={() => refetch()}
      />
    );
  }

  const p = data.personnel;
  const hasPersonnel = !!p;

  const infoFields: { label: string; value: string | undefined }[] = [
    { label: "邮箱", value: p?.email },
    { label: "手机", value: p?.mobilePhone },
    { label: "部门", value: p?.departmentName },
    { label: "课题组", value: p?.projectGroupName },
    { label: "人员类型", value: p?.userTypeNames },
    { label: "RPG 经验", value: p?.totalExp != null ? String(p.totalExp) : undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Header: Avatar + Name + userId + Badge */}
      <div className="flex items-center gap-4">
        <Avatar
          src={p?.head}
          name={p?.name ?? data.account.username}
          size="lg"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-[var(--student-foreground)] truncate">
              {p?.name ?? data.account.username}
            </h2>
            {p?.hasOfficialRoomPermission && (
              <Badge variant="profile">
                <ShieldCheck className="size-3 mr-1" />
                官方授权
              </Badge>
            )}
          </div>
          {hasPersonnel && (
            <p className="text-xs font-mono text-[var(--student-mute-foreground)] mt-0.5">
              {p.userId}
            </p>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {infoFields.map((field) => (
          <StudentCard key={field.label} padding="lg">
            <p className="text-xs text-[var(--student-mute-foreground)] mb-1">
              {field.label}
            </p>
            <p className="text-sm font-medium text-[var(--student-foreground)]">
              {field.value || "-"}
            </p>
          </StudentCard>
        ))}
      </div>

      {/* Allowed rooms card */}
      {p?.allowedRoomsDisplayZh && (
        <StudentCard padding="lg">
          <p className="text-xs text-[var(--student-mute-foreground)] mb-2">
            可进入房间
          </p>
          <p className="text-sm text-[var(--student-foreground)] leading-relaxed whitespace-pre-wrap">
            {p.allowedRoomsDisplayZh}
          </p>
        </StudentCard>
      )}
    </div>
  );
}
