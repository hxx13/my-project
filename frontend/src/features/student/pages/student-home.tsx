import { useNavigate } from "react-router-dom";
import { useMemo, useRef, useState, useEffect, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { updateMyHead } from "@/api/domains/admin.api";
import MySignatureCard from "@/components/signature/MySignatureCard";
import { fetchMySignature, type MySignature } from "@/api/domains/signature.api";
import { PenLine, IdCard } from "lucide-react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Brain,
  Calendar,
  Clock,
  Expand,
  FileText,
  Grid3X3,
  History,
  Key,
  LayoutGrid,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  X,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { useStudentQuery } from "../hooks/use-student-query";
import { useStudentDashboard } from "../hooks/use-student-dashboard";
import { useStudentAiProfile } from "../hooks/use-student-ai-profile";
import { useStudentStats } from "../hooks/use-student-stats";
import { studentQueryKey } from "../utils/studentQueryScope";
import { StudentActivityDashboard } from "../components/student-activity-dashboard";
import type { StatsData } from "../api/student.api";
import { fetchCageStatusSummary, fetchMyQualifications } from "../api/student.api";
import {
  StudentCard,
  Badge,
  Skeleton,
  ErrorRetry,
  Avatar,
  BarChart,
  AreaChart,
  StatPanel,
  Dialog,
  DialogHeader,
  DialogTitle,
} from "../components/ui";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { displayPosition } from "@/features/cage-shelf/constants";
import { splitGroups } from "@/components/scanner/room-floor-plan/groupMatch";

/* ------------------------------------------------------------------ */
/*  级联入场                                                            */
/* ------------------------------------------------------------------ */

/**
 * 级联入场：复用 tailwind.config.js 里已有的 fade-in（透明+下移 4px → 归位）。
 * 项目里 tw-animate-css 的 animate-in/slide-in-from-* 在 Tailwind 3 下没生成，
 * 所以帧靠 animate-fade-in，延迟/填充靠内联样式（fill-mode:both 让未到点的元素先藏住）。
 */
function cascadeStyle(delayMs: number): CSSProperties {
  return { animationDelay: `${delayMs}ms`, animationFillMode: "both" };
}

/* ------------------------------------------------------------------ */
/*  Shared shells                                                      */
/* ------------------------------------------------------------------ */

/** 分区卡片：描边 + 阴影 + 标题栏 + 可展开弹窗；整页锁高，卡片内部消化剩余空间 */
function SectionCard({
  title,
  subtitle,
  onExpand,
  children,
  className,
  bodyClassName,
  style,
}: {
  title: string;
  subtitle?: ReactNode;
  onExpand?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
}) {
  return (
    <StudentCard
      padding="md"
      style={style}
      className={cn(
        "flex min-h-0 animate-fade-in flex-col border border-[var(--student-border)] shadow-student-card",
        className,
      )}
    >
      <header className="mb-2 flex shrink-0 items-center gap-2">
        <h3 className="text-[15px] font-semibold text-[var(--student-foreground)]">{title}</h3>
        {subtitle}
        <div className="min-w-0 flex-1" />
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="弹窗展开"
            className="shrink-0 cursor-pointer rounded-md p-1 text-[var(--student-mute-foreground)] transition-colors hover:bg-[var(--student-primary-soft)] hover:text-[var(--student-primary)]"
          >
            <Expand className="size-3.5" strokeWidth={1.5} />
          </button>
        )}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", bodyClassName)}>{children}</div>
    </StudentCard>
  );
}

/** 通用弹窗（分区内容详展） */
function SectionModal({
  open,
  title,
  onClose,
  children,
  width = "max-w-3xl",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-[var(--student-surface)] shadow-xl",
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--student-hairline)] px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--student-ink)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 hover:bg-[var(--student-canvas-soft)]"
          >
            <X className="size-4 text-[var(--student-mute)]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  某状态的笼位明细弹窗                                                */
/* ------------------------------------------------------------------ */

/**
 * 点了哪张状态卡就看哪个状态的笼位清单。
 *
 * 数据来自**本地笼位表单**（`/v1/cage-shelves/status-summary?scope=mine&statusCode=`），
 * 不再借用移动端那份「特殊状态总览」—— 那份是 ARO 扫描快照口径，既和本地表单对不上，
 * 又是全库先截断 200 条再按课题组过滤，本组笼位几乎必然被截掉。
 */
function StatusCagesModal({
  status,
  groupName,
  onClose,
}: {
  status: { code: string; label: string } | null;
  groupName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-home-status-cages", status?.code ?? ""],
    queryFn: () => fetchCageStatusSummary({ scope: "mine", statusCode: status ? status.code : undefined, size: 200 }),
    enabled: !!status,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (!status) return null;

  const cages = data?.items ?? [];
  const total = data?.statusCounts?.[status.code] ?? 0;
  const showFeedingDetail = status.code === "SPECIAL_FEEDING";

  return (
    <SectionModal open title={`${status.label} · 本课题组`} onClose={onClose} width="max-w-4xl">
      <p className="mb-3 text-[12px] text-[var(--student-mute-foreground)]">
        {groupName || "未关联课题组"} · 共{" "}
        <span className="font-semibold tabular-nums text-[var(--student-ink)]">{total}</span> 个笼位
        {data?.hasMore && `（明细仅列前 ${cages.length} 条）`}
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : cages.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-[var(--student-mute-foreground)]">
          本课题组暂无该状态笼位
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--student-mute-foreground)]">
              <th className="py-1.5 font-medium">房间</th>
              <th className="py-1.5 font-medium">笼架</th>
              <th className="py-1.5 font-medium">位置</th>
              <th className="py-1.5 font-medium">笼盒</th>
              <th className="py-1.5 font-medium">实验员</th>
              <th className="py-1.5 font-medium">品系</th>
              {showFeedingDetail && <th className="py-1.5 font-medium">饲养明细</th>}
            </tr>
          </thead>
          <tbody>
            {cages.map((c, i) => (
              <tr
                key={`${c.shelveName}-${c.positionX}-${c.positionY}-${i}`}
                className="border-t border-[var(--student-hairline)]"
              >
                <td className="py-1.5 text-[var(--student-ink)]">{c.roomName || "—"}</td>
                <td className="py-1.5 text-[var(--student-mute-foreground)]">{c.shelveName || "—"}</td>
                <td className="py-1.5 tabular-nums text-[var(--student-mute-foreground)]">
                  {c.positionX && c.positionY ? displayPosition(`${c.positionX}-${c.positionY}`) : "—"}
                </td>
                <td className="py-1.5 tabular-nums text-[var(--student-mute-foreground)]">
                  {c.cageBoxCode || "—"}
                </td>
                <td className="py-1.5 text-[var(--student-mute-foreground)]">{c.experimenterName || "—"}</td>
                <td className="py-1.5 text-[var(--student-mute-foreground)]">{c.animalStrainName || "—"}</td>
                {showFeedingDetail && (
                  <td
                    className="py-1.5 text-[var(--student-mute-foreground)]"
                    title={c.detailDescription || ""}
                  >
                    {c.detailName || "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionModal>
  );
}

/* ------------------------------------------------------------------ */
/*  指标卡片                                                            */
/* ------------------------------------------------------------------ */

interface TileSpec {
  key: string;
  icon: LucideIcon;
  label: string;
  value?: number | string;
  hint?: string;
  onClick?: () => void;
}

function StatTile({ tile, index = 0 }: { tile: TileSpec; index?: number }) {
  const Icon = tile.icon;
  const interactive = !!tile.onClick;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={tile.onClick}
      title={tile.hint}
      style={cascadeStyle(index * 35)}
      className={cn(
        "flex animate-fade-in items-center gap-2.5 rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-white px-3 py-2 text-left shadow-student-card transition-all duration-200",
        interactive
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-student-card-hover active:scale-[0.98]"
          : "cursor-default",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-[var(--student-mute-foreground)]">
          {tile.label}
        </span>
        <span className="mt-0.5 block truncate text-[19px] font-bold leading-tight text-[var(--student-ink)] tabular-nums">
          {tile.value ?? "—"}
        </span>
      </span>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-primary-soft)]">
        <Icon
          aria-hidden="true"
          className="size-4 text-[var(--student-primary)]"
          strokeWidth={1.6}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  左侧人员卡                                                          */
/* ------------------------------------------------------------------ */

function genderLabel(g?: number): string {
  if (g === 1) return "男";
  if (g === 2) return "女";
  return "未知";
}

function InfoRow({ icon: Icon, iconClass, children }: { icon: LucideIcon; iconClass?: string; children: ReactNode }) {
  const title = typeof children === "string" ? children : undefined;
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-[var(--student-mute-foreground)]" title={title}>
      <Icon className={cn("size-3 shrink-0", iconClass)} strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

interface ProfileLike {
  name?: string;
  jobNumber?: string;
  departmentName?: string;
  projectGroupName?: string;
  /** 本地身份标识系统的标签名（person_identity_tag.label），可能多个 */
  identityLabels?: string[];
  authStatus?: string;
  head?: string;
  gender?: number;
  mobilePhone?: string;
  email?: string;
  isSchool?: number;
  allowedRoomsDisplayZh?: string;
}

/**
 * 人员信息块 —— 左上角一小块（不是整列）。上面头像是本人，中间几行关键档案，
 * 底部把原来左栏的 5 个文字按钮压成一排小图标入口。
 */
function PersonnelBlock({
  profile,
  onAi,
  onStats,
}: {
  profile: ProfileLike;
  onAi: () => void;
  onStats: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const headFileRef = useRef<HTMLInputElement>(null);

  // 健康报告状态：与「培训报名」同一份资格数据（fileRef 有值即已提交）
  const { data: quals = [] } = useStudentQuery(["my-qualifications"], fetchMyQualifications);
  const healthOk = !!(quals.find((q) => q.itemKey === "health_report")?.fileRef);

  /** 电子签名小窗：签名不可更改，这里只做小窗展示 + 点开弹窗（画 / 扫码直链）。 */
  const [signOpen, setSignOpen] = useState(false);
  const [sig, setSig] = useState<MySignature | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const s = await fetchMySignature();
        if (!dead) setSig(s);
      } catch {
        if (!dead) setSig({ hasSignature: false });
      }
    })();
    return () => { dead = true; };
  }, [signOpen]);

  const onPickHead = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { url } = await uploadSingleImage(file);
      await updateMyHead(url);
      toast.success("头像已更新");
      qc.invalidateQueries({ queryKey: studentQueryKey("dashboard") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const quick: { key: string; icon: LucideIcon; label: string; onClick: () => void }[] = [
    { key: "rooms", icon: Key, label: "门禁", onClick: () => navigate("/student/rooms") },
    { key: "records", icon: History, label: "出入记录", onClick: () => navigate("/student/rooms?view=records") },
    { key: "stats", icon: BarChart3, label: "出入统计", onClick: onStats },
    { key: "violation", icon: AlertTriangle, label: "违规", onClick: () => navigate("/student/rooms?view=records") },
    { key: "material", icon: Package, label: "申领物品", onClick: () => navigate("/student/material") },
    { key: "group", icon: Users, label: "我的课题组", onClick: () => navigate("/student/group") },
    { key: "ai", icon: Brain, label: "AI 画像", onClick: onAi },
  ];

  const meta = [profile.gender != null ? genderLabel(profile.gender) : "", profile.isSchool === 1 ? "校内" : profile.isSchool === 0 ? "校外" : ""]
    .filter(Boolean)
    .join(" · ");
  const identityLabels = profile.identityLabels ?? [];

  return (
    <StudentCard
      padding="md"
      className="flex w-full animate-fade-in flex-col gap-3 border border-[var(--student-border)] shadow-student-card lg:h-full lg:min-h-0 lg:overflow-y-auto"
    >
      <div className="flex items-center gap-2.5">
        <Avatar
          src={profile.head ? resolvePersonnelAvatarUrl(profile.head) : undefined}
          name={profile.name || ""}
          size="sm"
          onClick={() => headFileRef.current?.click()}
          title="点击更换头像"
          className="cursor-pointer ring-2 ring-[var(--student-primary-soft)] transition-shadow hover:ring-[var(--student-primary)]"
        />
        <input ref={headFileRef} type="file" accept="image/*" className="hidden" onChange={onPickHead} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h2 className="truncate text-[15px] font-bold text-[var(--student-foreground)]">
              {profile.name || "--"}
            </h2>
            {profile.authStatus === "已授权" ? (
              <Badge variant="success">{profile.authStatus}</Badge>
            ) : (
              <Badge variant="warning">{profile.authStatus || "待授权"}</Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--student-mute-foreground)]">
            {[profile.jobNumber ? `工号 ${profile.jobNumber}` : "", meta].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {/* 电子签名小窗：有签名展示缩略图，没有就是可点的上传入口。点开弹窗可画 / 扫码直链。 */}
        <button
          type="button"
          onClick={() => setSignOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--student-border)] px-2 py-1 text-left transition-colors hover:bg-[var(--student-canvas-soft)]"
        >
          {sig?.hasSignature ? (
            <img src={sig.imageData} alt="电子签名"
              className="h-7 w-auto max-w-[96px] rounded bg-white object-contain" />
          ) : (
            <PenLine className="h-4 w-4 text-[var(--student-mute-foreground)]" />
          )}
          <span className="text-[10px] text-[var(--student-mute-foreground)]">
            {sig?.hasSignature ? "电子签名" : "点击上传签名"}
          </span>
        </button>
      </div>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogHeader>
          <DialogTitle>我的电子签名</DialogTitle>
        </DialogHeader>
        <MySignatureCard />
      </Dialog>

      {/* 左栏竖向空间充足，信息单列排，比双列更清晰 */}
      <div className="space-y-1.5 border-t border-[var(--student-border)] pt-2">
        <InfoRow icon={IdCard}>
          {identityLabels.length > 0 ? identityLabels.join(" · ") : "未标识身份"}
        </InfoRow>
        {healthOk ? (
          <InfoRow icon={HeartPulse} iconClass="text-green-500">健康报告 已提交</InfoRow>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/student/health-survey")}
            className="flex w-full cursor-pointer items-start gap-1.5 text-left text-[12px] text-[var(--student-primary)] hover:underline"
          >
            <HeartPulse className="mt-0.5 size-3 shrink-0 text-amber-500" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 break-words">健康报告 未提交 · 去提交</span>
          </button>
        )}
        {profile.departmentName && <InfoRow icon={MapPin}>{profile.departmentName}</InfoRow>}
        {profile.projectGroupName && <InfoRow icon={Users}>{profile.projectGroupName}</InfoRow>}
        {!profile.projectGroupName && (
          <button
            type="button"
            onClick={() => navigate("/student/group")}
            className="flex w-full cursor-pointer items-start gap-1.5 text-left text-[12px] text-[var(--student-primary)] hover:underline"
          >
            <Users className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 break-words">申请加入课题组</span>
          </button>
        )}
        {profile.mobilePhone && <InfoRow icon={Phone}>{profile.mobilePhone}</InfoRow>}
        {profile.email && <InfoRow icon={Mail}>{profile.email}</InfoRow>}
        {profile.allowedRoomsDisplayZh ? (
          <InfoRow icon={ShieldCheck} iconClass="text-green-500">
            {profile.allowedRoomsDisplayZh}
          </InfoRow>
        ) : (
          <InfoRow icon={ShieldAlert} iconClass="text-amber-500">
            暂无房间权限
          </InfoRow>
        )}
      </div>

      <div className="mt-auto grid grid-cols-4 gap-0.5 border-t border-[var(--student-border)] pt-2">
        {quick.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            title={it.label}
            className="flex cursor-pointer flex-col items-center gap-0.5 rounded-[var(--student-radius-sm)] px-1 py-1 transition-colors hover:bg-[var(--student-primary-soft)] active:scale-[0.98]"
          >
            <it.icon className="size-4 text-[var(--student-primary)]" strokeWidth={1.5} />
            <span className="truncate text-[10px] text-[var(--student-mute-foreground)]">
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </StudentCard>
  );
}

/* ------------------------------------------------------------------ */
/*  出入统计内容                                                         */
/* ------------------------------------------------------------------ */

const PERIOD_LABEL: Record<string, string> = { "7d": "近 7 天", "30d": "近 30 天", "90d": "近 90 天" };

function StatsSummaryBar({
  period,
  onCycle,
  data,
}: {
  period: string;
  onCycle: () => void;
  data: StatsData;
}) {
  const cells = [
    { label: "总进出次数", value: data.summary.totalAccess, unit: "次" },
    { label: "日均进出", value: data.summary.dailyAvg, unit: "次/天" },
    { label: "出勤天数", value: data.summary.attendanceDays, unit: "天" },
    { label: "涉及房间", value: data.summary.roomCount, unit: "间" },
    { label: "违规记录", value: data.summary.violationCount, unit: "次" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onCycle}
        title={`统计周期 · 点击切换（${PERIOD_LABEL[period] ?? period}）`}
        className="group flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
      >
        <Calendar className="size-4 shrink-0 text-[var(--student-mute-foreground)] transition-colors group-hover:text-[var(--student-primary)]" strokeWidth={1.5} />
        <span className="text-left">
          <span className="text-[11px] text-[var(--student-mute-foreground)]">
            统计周期 · <span className="font-medium text-[var(--student-primary)]">{PERIOD_LABEL[period] ?? period}</span>
          </span>
          <span className="ml-2 text-[13px] font-semibold tabular-nums text-[var(--student-ink)]">
            {data.period.start}
            <span className="mx-1 font-normal text-[var(--student-mute-foreground)]">~</span>
            {data.period.end}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {cells.map((c) => (
          <div key={c.label} className="shrink-0">
            <span className="block text-[11px] text-[var(--student-mute-foreground)]">{c.label}</span>
            <span className="mt-0.5 block">
              <span className="text-lg font-bold tabular-nums text-[var(--student-ink)]">{c.value.toLocaleString()}</span>
              <span className="ml-1 text-[11px] text-[var(--student-mute-foreground)]">{c.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendLegend({ single = false }: { single?: boolean }) {
  return (
    <div className="mb-2 flex items-center gap-3 text-[11px]">
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-[var(--student-primary)]" /> 进入
      </span>
      {!single && (
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[var(--student-primary-soft)]" /> 离开
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentHomePage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useStudentDashboard();
  const { data: aiData } = useStudentAiProfile();
  const [period, setPeriod] = useState("7d");
  const { data: statsData, isLoading: statsLoading } = useStudentStats(period);
  const [showAiModal, setShowAiModal] = useState(false);
  /** 点开的特殊状态（本地表单口径的明细弹窗） */
  const [detailStatus, setDetailStatus] = useState<{ code: string; label: string } | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showRemainingModal, setShowRemainingModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  /** 出入统计 / 课题组活跃度 合并成一个板块，tab 切换，默认「出入统计」 */
  const [mainTab, setMainTab] = useState<"stats" | "activity">("stats");

  // 本课题组特殊状态：本地笼位表单口径（cage_cell_detail），不用 ARO 扫描快照
  const { data: statusSummary } = useQuery({
    queryKey: ["student-home-status-summary"],
    queryFn: () => fetchCageStatusSummary({ scope: "mine" }),
    staleTime: 60 * 1000,
    retry: 1,
  });
  const statusCounts = statusSummary?.statusCounts ?? {};
  const openStatus = (code: string, label: string) => setDetailStatus({ code, label });

  if (isLoading) return <DashboardSkeleton />;

  // 查询空闲（未登录）或拉取失败时也要给出口：原来 `if (!data) return null` 会渲染一片空白
  if (isError || !data) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <ErrorRetry
          message={error instanceof Error ? error.message : "加载仪表盘数据失败"}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const { profile, homeSummary } = data;
  // 一个人可能挂多个课题组（project_group_name 是逗号分隔的多值字段）。
  // 活跃度接口只认单个组名，整串传下去会拼成 "A, B" 去 LIKE 匹配 → 命中不到任何人。
  // 取主课题组（第一个）查询，全部组名留作 tooltip。
  const groupNames = splitGroups(profile.projectGroupName);
  const primaryGroup = groupNames[0] ?? "";
  const cyclePeriod = () => setPeriod(period === "7d" ? "30d" : period === "30d" ? "90d" : "7d");
  const stats = statsData && statsData.period.days >= 7 ? statsData : null;

  const tiles: TileSpec[] = [
    {
      key: "remaining",
      icon: Grid3X3,
      label: "剩余笼位",
      value: homeSummary?.cageRemaining ?? 0,
      hint: "本课题组各 AUP 预约额度剩余（跨房间合并）",
      onClick: () => setShowRemainingModal(true),
    },
    {
      // 只显示人数：不给名单查看入口（用户 2026-09-14 口径）
      key: "members",
      icon: Users,
      label: "课题组人员",
      value: homeSummary?.groupMemberCount ?? 0,
      hint: "本课题组人员数",
    },
    {
      key: "aup",
      icon: FileText,
      label: "AUP 总数",
      value: homeSummary?.aupCount ?? 0,
      hint: "本课题组 AUP 计划书数",
      onClick: () => navigate("/student/aup"),
    },
    {
      key: "special",
      icon: FileText,
      label: "特殊饲养",
      value: statusCounts.SPECIAL_FEEDING ?? 0,
      hint: "本课题组「需特殊饲养」笼位数",
      onClick: () => openStatus("SPECIAL_FEEDING", "特殊饲养"),
    },
    {
      key: "density",
      icon: LayoutGrid,
      label: "密度超标",
      value: statusCounts.NEED_DIVIDE ?? 0,
      hint: "本课题组「需分笼」笼位数",
      onClick: () => openStatus("NEED_DIVIDE", "密度超标"),
    },
    {
      key: "health",
      icon: Target,
      label: "健康异常",
      value: statusCounts.HEALTH_ABNORMAL ?? 0,
      hint: "本课题组「健康异常」笼位数",
      onClick: () => openStatus("HEALTH_ABNORMAL", "健康异常"),
    },
    {
      key: "cohabit",
      icon: Users,
      label: "合笼",
      value: statusCounts.COHABITATION ?? 0,
      hint: "本课题组「合笼」笼位数",
      onClick: () => openStatus("COHABITATION", "合笼"),
    },
    {
      key: "transfer",
      icon: ArrowRightLeft,
      label: "动物转移",
      value: statusCounts.ANIMAL_TRANSFER ?? 0,
      hint: "本课题组「动物转移」笼位数",
      onClick: () => openStatus("ANIMAL_TRANSFER", "动物转移"),
    },
  ];

  // 出入统计 / 课题组活跃度 的主 tab（复用在两个位置：stats 版放在板块标题行，activity 版传给活跃度面板当 headerPrefix）
  const mainTabs = (
    <>
      {([
        { k: "stats", label: "出入统计" },
        { k: "activity", label: "课题组活跃度" },
      ] as const).map((t) => (
        <button
          key={t.k}
          type="button"
          onClick={() => setMainTab(t.k)}
          className={cn(
            "shrink-0 rounded-[var(--student-radius-sm)] px-2.5 py-1 text-[12px] font-semibold transition-colors",
            mainTab === t.k
              ? "bg-[var(--student-primary)] text-white"
              : "bg-[var(--student-card-soft-bg)] text-[var(--student-mute)] hover:text-[var(--student-ink)]",
          )}
        >
          {t.label}
        </button>
      ))}
    </>
  );

  return (
    <AdminFullWidthPage>
      {/* 整页固定比例：高度锁一屏、按比例切分各板块，内容各自内部滚动，整页不滚 */}
      <div className="flex h-[calc(100dvh-var(--student-chrome-offset,64px))] flex-col gap-3 overflow-hidden px-4 py-3">
        {/* ── 资料未完善引导（仅缺手机号时出现，轻量提醒 + 链接，不整页拦截） ── */}
        {!profile.mobilePhone && (
          <div className="flex shrink-0 items-center gap-2 rounded-[var(--student-radius-md)] border border-[var(--student-border)] bg-[var(--student-primary-soft)] px-4 py-2 text-[13px] text-[var(--student-ink)]">
            <Phone className="size-4 shrink-0 text-[var(--student-primary)]" strokeWidth={1.6} />
            <span className="min-w-0 flex-1">你的资料尚未完善（缺少手机号），补全后便于接收通知。</span>
            <button
              type="button"
              onClick={() => navigate("/student/profile")}
              className="shrink-0 cursor-pointer font-medium text-[var(--student-primary)] hover:underline"
            >
              去完善
            </button>
          </div>
        )}

        {/* ── 左栏（~22%）：人员卡 + 左下角 8 指标；右栏：Bento ── */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          {/* 左栏 */}
          <div className="flex min-h-0 w-full flex-col gap-3 lg:w-[clamp(260px,22%,330px)] lg:shrink-0">
            {/* 人员卡：定高，内容内部滚动 */}
            <div className="flex min-h-0 flex-[1.35] flex-col">
              <PersonnelBlock
                profile={profile}
                onAi={() => setShowAiModal(true)}
                onStats={() => setShowStatsModal(true)}
              />
            </div>
            {/* 左下角：8 个指标 2×4，行均分填满整块（不留底部空白） */}
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2.5">
              {tiles.map((t, i) => (
                <StatTile key={t.key} tile={t} index={i} />
              ))}
            </div>
          </div>

          {/* 右栏 Bento */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {/* 出入统计 + 课题组活跃度 合并为一个板块，tab 切换，默认「出入统计」，占满整行不再挤 */}
            <StudentCard
              padding="md"
              className="flex min-h-0 flex-[2] flex-col border border-[var(--student-border)]"
              style={cascadeStyle(160)}
            >
              {mainTab === "stats" ? (
                <>
                  {/* 标题行：主 tab + 展开 */}
                  <div className="mb-3 flex shrink-0 items-center gap-1.5">
                    {mainTabs}
                    <span className="ml-auto">
                      {stats ? (
                        <button
                          type="button"
                          onClick={() => setShowStatsModal(true)}
                          title="弹窗展开"
                          className="cursor-pointer rounded-[var(--student-radius-sm)] p-1.5 text-[var(--student-mute)] transition-colors hover:bg-[var(--student-primary-soft)] hover:text-[var(--student-primary)]"
                        >
                          <Expand className="size-3.5" strokeWidth={1.5} />
                        </button>
                      ) : null}
                    </span>
                  </div>

                  <div className="min-h-0 flex-1">
                    {statsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-4 w-full" />
                        ))}
                      </div>
                    ) : !stats ? (
                      <div className="py-6 text-center text-[12px] text-[var(--student-mute-foreground)]">
                        暂无出入统计数据
                      </div>
                    ) : (
                      <div className="flex h-full min-h-0 flex-col">
                        <div className="shrink-0">
                          <StatsSummaryBar period={period} onCycle={cyclePeriod} data={stats} />
                        </div>
                        <div className="mt-3 flex min-h-0 flex-1 flex-col">
                          <TrendLegend single />
                          {/* 单序列面积图：进出趋势（进入），撑满剩余高度 */}
                          <div className="min-h-0 flex-1">
                            <AreaChart
                              data={stats.dailyTrend.map((d) => ({ label: d.date.slice(5), value: d.entryCount }))}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 活跃度：主 tab 作为 headerPrefix 与时间范围/校区/图表 tab 同处一行，把高度留给图表 */
                <StudentActivityDashboard
                  groupName={primaryGroup}
                  sections="charts"
                  embedded
                  className="h-full min-h-0"
                  headerPrefix={mainTabs}
                  headerExtra={
                    <button
                      type="button"
                      onClick={() => setShowActivityModal(true)}
                      title="弹窗展开"
                      className="cursor-pointer rounded-[var(--student-radius-sm)] p-1.5 text-[var(--student-mute)] transition-colors hover:bg-[var(--student-primary-soft)] hover:text-[var(--student-primary)]"
                    >
                      <Expand className="size-3.5" strokeWidth={1.5} />
                    </button>
                  }
                />
              )}
            </StudentCard>

            {/* 下排：课题组成员表——表格本身即板块（自带边框），无外层卡片/标题，自然撑满 */}
            <div className="flex min-h-0 flex-[3] animate-fade-in flex-col" style={cascadeStyle(280)}>
              <StudentActivityDashboard
                groupName={primaryGroup}
                sections="members"
                className="h-full min-h-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 弹窗：本课题组剩余笼位明细 ── */}
      <SectionModal
        open={showRemainingModal}
        title="剩余笼位"
        onClose={() => setShowRemainingModal(false)}
        width="max-w-xl"
      >
        <p className="mb-3 text-[12px] text-[var(--student-mute-foreground)]">
          本课题组各 AUP 预约额度剩余（预约数量 − 已使用），跨房间合并共{" "}
          <span className="font-semibold tabular-nums text-[var(--student-ink)]">{homeSummary?.cageRemaining ?? 0}</span> 个
        </p>
        {(homeSummary?.remainingByRoom ?? []).length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[var(--student-mute-foreground)]">
            暂无笼位预约额度
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] text-[var(--student-mute-foreground)]">
                <th className="py-1.5 font-medium">房间</th>
                <th className="py-1.5 text-right font-medium">预约</th>
                <th className="py-1.5 text-right font-medium">已使用</th>
                <th className="py-1.5 text-right font-medium">剩余</th>
              </tr>
            </thead>
            <tbody>
              {(homeSummary?.remainingByRoom ?? []).map((r, i) => (
                <tr key={`${r.roomName}-${i}`} className="border-t border-[var(--student-hairline)]">
                  <td className="py-1.5 text-[var(--student-ink)]">{r.roomName}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--student-mute-foreground)]">{r.rentNumber}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--student-mute-foreground)]">{r.usedNumber}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-[var(--student-ink)]">{r.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionModal>

      {/* ── 弹窗：出入统计四联 ── */}
      <SectionModal
        open={showStatsModal}
        title="出入统计"
        onClose={() => setShowStatsModal(false)}
        width="max-w-4xl"
      >
        {statsData ? (
          <div className="space-y-4">
            <StatsSummaryBar period={period} onCycle={cyclePeriod} data={statsData} />
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 320px" }}>
              <StatPanel title="进出趋势">
                <TrendLegend single />
                <AreaChart
                  data={statsData.dailyTrend.map((d) => ({ label: d.date.slice(5), value: d.entryCount }))}
                  height={160}
                />
              </StatPanel>
              <StatPanel
                title="房间访问分布"
                isEmpty={statsData.roomDistribution.length === 0}
                emptyText="暂无房间访问数据"
              >
                <div className="overflow-y-auto">
                  {statsData.roomDistribution.map((r) => (
                    <div key={r.roomName} className="mb-3 flex items-center gap-2 last:mb-0">
                      <span className="flex-1 truncate text-[13px] text-[var(--student-foreground)]">{r.roomName}</span>
                      <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--student-mute-foreground)]">
                        {r.count}次
                      </span>
                      <span className="w-10 text-right text-[11px] font-medium tabular-nums text-[var(--student-ink)]">
                        {r.percentage}%
                      </span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--student-mute)]">
                        <div
                          className="h-full rounded-full bg-[var(--student-primary)] transition-all"
                          style={{ width: `${Math.min(r.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </StatPanel>
              <StatPanel title="时段分布">
                <TrendLegend />
                <BarChart
                  data={statsData.hourlyDistribution
                    // 与热力图口径一致：不显示 0–6 点的统计区间
                    .filter((d) => parseInt(d.bucket.slice(0, 2), 10) >= 6)
                    .map((d) => ({
                      label: d.bucket.slice(0, 5),
                      value: d.entryCount,
                      value2: d.exitCount,
                    }))}
                  height={100}
                  barColor="var(--student-primary)"
                  barColor2="var(--student-primary-soft)"
                />
              </StatPanel>
              <StatPanel
                title="平均进入时长"
                isEmpty={statsData.avgStayDuration.length === 0}
                emptyText="暂无在室时长数据"
              >
                <div className="overflow-y-auto">
                  {statsData.avgStayDuration.map((d) => (
                    <div key={d.roomName} className="mb-2 flex items-center justify-between text-[13px] last:mb-0">
                      <span className="min-w-0 flex-1 truncate text-[var(--student-foreground)]">{d.roomName}</span>
                      <span className="ml-2 shrink-0 font-semibold tabular-nums text-[var(--student-ink)]">
                        {d.durationMinutes} 分钟
                      </span>
                    </div>
                  ))}
                </div>
              </StatPanel>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-[12px] text-[var(--student-mute-foreground)]">暂无出入统计数据</p>
        )}
      </SectionModal>

      {/* ── 弹窗：课题组活跃度 ── */}
      <SectionModal
        open={showActivityModal}
        title={`课题组活跃度 · ${primaryGroup || "未关联课题组"}`}
        onClose={() => setShowActivityModal(false)}
        width="max-w-4xl"
      >
        <StudentActivityDashboard groupName={primaryGroup} />
      </SectionModal>

      {/* ── 弹窗：本课题组某状态的笼位明细（本地表单口径） ── */}
      <StatusCagesModal
        status={detailStatus}
        groupName={profile.projectGroupName || ""}
        onClose={() => setDetailStatus(null)}
      />

      {/* ── 弹窗：AI 个人画像 ── */}
      <SectionModal
        open={showAiModal}
        title="AI 个人画像"
        onClose={() => setShowAiModal(false)}
        width="max-w-lg"
      >
        <div className="mb-3 flex items-center gap-2">
          <Brain className="size-4 text-indigo-500" strokeWidth={1.6} />
          <span className="text-[12px] text-[var(--student-mute-foreground)]">基于历史进出行为生成</span>
        </div>
        {aiData && aiData.length > 0 ? (
          <div className="divide-y divide-[var(--student-hairline)]">
            {aiData.map((item, i) => (
              <div key={i} className="space-y-2 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--student-ink)]">{item.room_name}</span>
                  <span className="text-[11px] text-[var(--student-mute)]">访问 {item.visit_count ?? "?"} 次</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  {item.median_duration_mins != null && (
                    <div className="flex items-center gap-1 text-[var(--student-mute)]">
                      <Clock className="size-3" />
                      平均停留 {item.median_duration_mins} 分钟
                    </div>
                  )}
                  {item.peak_entry_time && (
                    <div className="flex items-center gap-1 text-[var(--student-mute)]">
                      <TrendingUp className="size-3" />
                      高峰 {item.peak_entry_time}
                    </div>
                  )}
                  {item.predicted_exit_label && (
                    <div className="col-span-2 text-[var(--student-mute)]">
                      预计离开: <span className="font-medium text-[var(--student-ink)]">{item.predicted_exit_label}</span>
                    </div>
                  )}
                  {item.overtime_prob != null && item.overtime_prob > 0.5 && (
                    <div className="col-span-2">
                      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        超时风险 {Math.round(item.overtime_prob * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-[13px] text-[var(--student-mute)]">
            <Brain className="mx-auto mb-3 size-10 text-[color-mix(in_srgb,var(--student-mute)_40%,transparent)]" />
            暂无 AI 行为预测数据
            <p className="mt-1 text-[11px]">数据积累足够后系统将自动生成行为画像</p>
          </div>
        )}
      </SectionModal>
    </AdminFullWidthPage>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <AdminFullWidthPage>
      <div className="flex min-h-[calc(100dvh-var(--student-chrome-offset,64px))] flex-col gap-4 px-5 py-4">
        <div className="flex shrink-0 flex-wrap items-stretch gap-4">
          <StudentCard
            padding="md"
            className="flex w-full flex-col gap-3 border border-[var(--student-border)] shadow-student-card lg:w-[360px] lg:shrink-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" className="size-10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-auto h-10 w-full" />
          </StudentCard>
          <div className="grid min-w-[300px] flex-1 content-start auto-rows-min grid-cols-2 gap-2.5 self-start sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[61px] w-full" />
            ))}
          </div>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
        <Skeleton className="h-[320px] w-full" />
      </div>
    </AdminFullWidthPage>
  );
}
