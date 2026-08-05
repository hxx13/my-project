import { createHashRouter, Navigate, useParams } from "react-router-dom";
import TwinLayout from "@/layouts/TwinLayout";
import PortalLandingPage from "@/pages/PortalLandingPage";
import DashboardPage from "@/pages/DashboardPage";
import DashboardPreviewPage from "@/pages/DashboardPreviewPage";
import DebugTablePage from "@/pages/DebugTablePage.tsx";
import DebugPersonnelPage from "@/pages/DebugPersonnelPage.tsx";
import DebugPredictionPage from "@/pages/DebugPredictionPage.tsx";
import DebugOrderPage from "@/pages/DebugOrderPage";
import DebugHeatmapPage from "@/pages/DebugHeatmapPage.tsx";
import DebugCardStatusPage from "@/pages/DebugCardStatusPage.tsx";
import DebugCardMappingPage from "@/pages/DebugCardMappingPage.tsx";
import FaceDebugPage from "@/pages/FaceDebugPage.tsx";
import { TwinDebugRouteShell } from "@/features/twin-chrome/TwinDebugRouteShell";
import LoginPage from "@/pages/LoginPage";
import AuthGuard from "@/router/AuthGuard";
import TwinDebugStaffGuard from "@/router/TwinDebugStaffGuard";
import RegisterStaffPage from "@/pages/RegisterStaffPage";
import AdminLayout from "@/layouts/AdminLayout";
import AdminPersonnelPage from "@/pages/AdminPersonnelPage";
import SuperAdminGuard from "@/router/SuperAdminGuard";
import AdminAccessGuard from "@/router/AdminAccessGuard";
import AdminHomePage from "@/pages/AdminHomePage";
import RepairRequestPage from "@/pages/RepairRequestPage";
import RepairProcessPage from "@/pages/RepairProcessPage";
import PurchaseRequestPage from "@/pages/PurchaseRequestPage";
import PurchaseProcessPage from "@/pages/PurchaseProcessPage";
import AdminNotificationPage from "@/pages/AdminNotificationPage";
import AdminApiDocsPage from "@/pages/AdminApiDocsPage";
import AdminLoggingConsolePage from "@/pages/AdminLoggingConsolePage";
import { MonitorDashboardPage } from "@/features/admin/monitor/MonitorDashboardPage";
import AgvTrackerPage from "@/pages/AgvTrackerPage";
import AgvLogPage from "@/pages/AgvLogPage";
import AgvAnalyticsPage from "@/pages/AgvAnalyticsPage";
import AdminDoorGroupStoragePage from "@/pages/AdminDoorGroupStoragePage";
import AdminDepartmentStoragePage from "@/pages/AdminDepartmentStoragePage";
import AdminDeviceChannelPage from "@/pages/AdminDeviceChannelPage";
import AdminRoomMappingPage from "@/pages/AdminRoomMappingPage";
import AdminAccessRulesPage from "@/pages/AdminAccessRulesPage";
import ProfileSecurityPage from "@/pages/ProfileSecurityPage";
import AdminGuard from "@/router/AdminGuard";
import AdminSuppliesMallPage from "@/pages/AdminSuppliesMallPage";
import AdminSuppliesManagePage from "@/pages/AdminSuppliesManagePage";
import AdminSuppliesProcessPage from "@/pages/AdminSuppliesProcessPage";
import AdminSuppliesAuditExportPage from "@/pages/AdminSuppliesAuditExportPage";
import MaterialReviewPage from "@/pages/MaterialReviewPage";
import MaterialManagePage from "@/pages/MaterialManagePage";
import MaterialAuditExportPage from "@/pages/MaterialAuditExportPage";
import AdminAssetRecordPage from "@/pages/AdminAssetRecordPage";
import AdminFacilityMaintenancePage from "@/pages/AdminFacilityMaintenancePage";
import AdminFileTemplatesPage from "@/pages/AdminFileTemplatesPage";
import AdminAssetTransferRecordPage from "@/pages/AdminAssetTransferRecordPage";
import AdminDahuaSwingTasksPage from "@/pages/AdminDahuaSwingTasksPage";
import AdminDahuaSwingStatsDailyPage from "@/pages/AdminDahuaSwingStatsDailyPage";
import AdminDahuaSwingStatsBackfillPage from "@/pages/AdminDahuaSwingStatsBackfillPage";
import AdminDahuaSwingRecordsPage from "@/pages/AdminDahuaSwingRecordsPage";
import AdminDahuaSwingRulesPage from "@/pages/AdminDahuaSwingRulesPage";
import AdminAccessFusionPage from "@/pages/AdminAccessFusionPage";
import AdminAccessCleanRuleProfilesPage from "@/pages/AdminAccessCleanRuleProfilesPage";
import AdminAccessAuditSourcePage from "@/pages/AdminAccessAuditSourcePage";
import AdminStudentViolationsPage from "@/pages/AdminStudentViolationsPage";
import AdminDoorControlPage from "@/pages/AdminDoorControlPage";
import AdminCageShelfPage from "@/pages/AdminCageShelfPage";
import AdminSpecialStatusOverviewPage from "@/pages/AdminSpecialStatusOverviewPage";
import AdminCageShelfIndexPage from "@/pages/AdminCageShelfIndexPage";
import AdminAutomationLogsPage from "@/pages/AdminAutomationLogsPage";
import AdminAroBindingPage from "@/pages/AdminAroBindingPage";
import AdminExpStatsPage from "@/pages/AdminExpStatsPage";
import AnimalRoomTelemetryPage from "@/pages/AnimalRoomTelemetryPage";
import AnimalRoomCockpitPage from "@/pages/AnimalRoomCockpitPage";
import DigitalTwinScreenPage from "@/pages/DigitalTwinScreenPage";
import DigitalTwin3DPage from "@/pages/DigitalTwin3DPage";
import AdminTelemetryWatchlistsPage from "@/pages/AdminTelemetryWatchlistsPage";
import AdminTelemetryArchivePage from "@/pages/AdminTelemetryArchivePage";
import AdminTelemetryInsightsPage from "@/pages/AdminTelemetryInsightsPage";
import AdminTelemetryInsightsConfigPage from "@/pages/AdminTelemetryInsightsConfigPage";
import StaffMessagesPage from "@/pages/StaffMessagesPage";
import AdminInviteCodesPage from "@/pages/AdminInviteCodesPage";
import AdminContentHubPage from "@/pages/AdminContentHubPage";
import AdminKnowledgeHomePage from "@/pages/AdminKnowledgeHomePage";
import AdminAnalyticsPage from "@/pages/AdminAnalyticsPage";
import AdminNavManager from "@/features/admin/AdminNavManager";
import AdminConversationArchivePage from "@/pages/AdminConversationArchivePage";
import AdminPushConfigPage from "@/pages/AdminPushConfigPage";
import AdminNotificationDigestPage from "@/pages/AdminNotificationDigestPage";
import AdminPushDashboardPage from "@/pages/AdminPushDashboardPage";
import AdminSettingsLayout from "@/features/admin/settings/AdminSettingsLayout";
import GeneralSettings from "@/features/admin/settings/GeneralSettings";
import AppearanceSettings from "@/features/admin/settings/AppearanceSettings";
import NotificationsSettings from "@/features/admin/settings/NotificationsSettings";
import AccessControlSettings from "@/features/admin/settings/AccessControlSettings";
import SchedulerSettings from "@/features/admin/settings/SchedulerSettings";
import IntegrationsSettings from "@/features/admin/settings/IntegrationsSettings";
import PermissionsSettings from "@/features/admin/settings/PermissionsSettings";
import DangerZoneSettings from "@/features/admin/settings/DangerZoneSettings";
import DashboardPreviewSettings from "@/features/admin/settings/DashboardPreviewSettings";
import StudentRegisterPage from "@/features/student/pages/student-register";
import StudentLoginPage from "@/features/student/pages/student-login";
import StudentLayout from "@/features/student/components/layout/student-layout";
import StudentHomePage from "@/features/student/pages/student-home";
import StudentRoomsPage from "@/features/student/pages/student-rooms";
import StudentNotificationsPage from "@/features/student/pages/student-notifications";
import StudentFeedbackPage from "@/features/student/pages/student-feedback";
import StudentSettingsPage from "@/features/student/pages/student-settings";
import StudentCageShelfPage from "@/features/student/pages/student-cage-shelf";
import StudentMaterialPage from "@/features/student/pages/student-material";
import ReportFormListPage from "@/features/report-form/pages/ReportFormListPage";
import ReportFormDesignPage from "@/features/report-form/pages/ReportFormDesignPage";
import ReportFillHubPage from "@/features/report-form/pages/ReportFillHubPage";
import ReportFillPage from "@/features/report-form/pages/ReportFillPage";
import SubmissionManagePage from "@/features/report-form/pages/SubmissionManagePage";
import MobileStudentCenterRoute from "@/pages/mobile/MobileStudentCenterRoute";
import MobileStudentCenterInvalidPage from "@/pages/mobile/MobileStudentCenterInvalidPage";
import MobileLoginPage from "@/pages/mobile/auth/MobileLoginPage";
import MobileRegisterPage from "@/pages/mobile/auth/MobileRegisterPage";
import MobileActivatePage from "@/pages/mobile/auth/MobileActivatePage";
import MobileStudentCenterPage from "@/pages/mobile/MobileStudentCenterPage";
import MobileSettingsPage from "@/pages/mobile/MobileSettingsPage";
import MobileSettingsIndexPage from "@/pages/mobile/MobileSettingsIndexPage";
import MobileAccountSecurityPage from "@/pages/mobile/MobileAccountSecurityPage";

/**
 * 教职工路由统一命名空间。
 * 所有 staff 面路由收敛在 /console 下，方便路由域管理与 WebSocket 隔离。
 */
const STAFF_NS = "/console";

/** 通配符重定向：把旧路由自动转到 /console 命名空间 */
function LegacyRedirect({ to }: { to: string }) {
  const splat = useParams()["*"] ?? "";
  const target = splat ? `${to}/${splat}`.replace(/\/+/g, "/") : to;
  return <Navigate to={target} replace />;
}

// ────────────────── 旧路由路径别名（保留兼容） ──────────────────
const legacyRedirects = [
  { path: "/dashboard", to: `${STAFF_NS}/dashboard` },
  { path: "/profile-security", to: `${STAFF_NS}/admin/profile-security` },
  { path: "/messages", to: `${STAFF_NS}/admin/staff-messages` },
  { path: "/admin/*", to: `${STAFF_NS}/admin` },
  { path: "/debug/*", to: `${STAFF_NS}/debug` },
  { path: "/debug-personnel/*", to: `${STAFF_NS}/debug-personnel` },
  { path: "/debug-prediction/*", to: `${STAFF_NS}/debug-prediction` },
  { path: "/debug-order/*", to: `${STAFF_NS}/debug-order` },
  { path: "/debug-heatmap/*", to: `${STAFF_NS}/debug-heatmap` },
  { path: "/debug-cards/*", to: `${STAFF_NS}/debug-cards` },
  { path: "/dashboard-preview", to: `${STAFF_NS}/dashboard-preview` },
  { path: "/animal-room-telemetry", to: `${STAFF_NS}/animal-room-telemetry` },
  { path: "/animal-room-cockpit", to: `${STAFF_NS}/animal-room-cockpit` },
  { path: "/digital-twin-screen", to: `${STAFF_NS}/digital-twin-screen` },
  { path: "/digital-twin-3d", to: `${STAFF_NS}/digital-twin-3d` },
].map((r) => ({
  path: r.path,
  element: <LegacyRedirect to={r.to} />,
}));

export const router = createHashRouter([
  // ═══════════════════════════════════════════════════════
  //  公开路由（无需登录）
  // ═══════════════════════════════════════════════════════
  { path: "/m", element: <Navigate to="/m/login" replace /> },
  { path: "/m/sc", element: <MobileStudentCenterInvalidPage /> },
  { path: "/m/sc/", element: <MobileStudentCenterInvalidPage /> },
  { path: "/m/sc/:token", element: <MobileStudentCenterRoute /> },
  { path: "/m/login", element: <MobileLoginPage /> },
  { path: "/m/register", element: <MobileRegisterPage /> },
  { path: "/m/activate", element: <MobileActivatePage /> },
  { path: "/m/settings", element: <AuthGuard><MobileSettingsIndexPage /></AuthGuard> },
  { path: "/m/settings/notifications", element: <AuthGuard><MobileSettingsPage /></AuthGuard> },
  { path: "/m/settings/account-security", element: <AuthGuard><MobileAccountSecurityPage /></AuthGuard> },
  { path: "/m/home", element: <AuthGuard><MobileStudentCenterPage /></AuthGuard> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterStaffPage /> },
  { path: "/student/login", element: <StudentLoginPage /> },

  // ═══════════════════════════════════════════════════════
  //  学生端路由
  // ═══════════════════════════════════════════════════════
  { path: "/student/register", element: <StudentRegisterPage /> },
  {
    path: "/student",
    element: <AuthGuard><StudentLayout /></AuthGuard>,
    children: [
      { index: true, element: <Navigate to="/student/home" replace /> },
      { path: "home", element: <StudentHomePage /> },
      { path: "records", element: <Navigate to="/student/rooms?view=records" replace /> },
      { path: "rooms", element: <StudentRoomsPage /> },
      { path: "notifications", element: <StudentNotificationsPage /> },
      { path: "feedback", element: <StudentFeedbackPage /> },
      { path: "settings", element: <StudentSettingsPage /> },
      { path: "cage-shelf", element: <StudentCageShelfPage /> },
      { path: "material", element: <StudentMaterialPage /> },
      { path: "material/requests", element: <Navigate to="/student/material?view=requests" replace /> },
    ],
  },

  // ═══════════════════════════════════════════════════════
  //  教职工路由 — 统一在 /console 命名空间下
  // ═══════════════════════════════════════════════════════
  {
    path: STAFF_NS,
    element: <AuthGuard />,
    children: [
      // ── Twin 骨架页：所有下列路由共享 TwinLayout（主屏 + debug + 大屏等） ──
      {
        element: <TwinLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "dashboard", element: <DashboardPage /> },
          {
            element: <TwinDebugStaffGuard />,
            children: [
              { path: "debug", element: <TwinDebugRouteShell title="流水线日志"><DebugTablePage /></TwinDebugRouteShell> },
              { path: "debug-personnel", element: <TwinDebugRouteShell title="档案库"><DebugPersonnelPage /></TwinDebugRouteShell> },
              { path: "debug-prediction", element: <TwinDebugRouteShell title="AI 推演"><DebugPredictionPage /></TwinDebugRouteShell> },
              { path: "debug-order", element: <TwinDebugRouteShell title="订单库"><DebugOrderPage /></TwinDebugRouteShell> },
              { path: "debug-heatmap", element: <TwinDebugRouteShell title="空间雷达"><DebugHeatmapPage /></TwinDebugRouteShell> },
              { path: "debug-cards", element: <TwinDebugRouteShell title="房卡调度"><DebugCardStatusPage /></TwinDebugRouteShell> },
            ],
          },
          { path: "dashboard-preview", element: <DashboardPreviewPage /> },
          {
            element: <AdminGuard />,
            children: [
              { path: "animal-room-telemetry", element: <AnimalRoomTelemetryPage /> },
              { path: "animal-room-cockpit", element: <AnimalRoomCockpitPage /> },
              { path: "digital-twin-screen", element: <DigitalTwinScreenPage /> },
              { path: "digital-twin-3d", element: <DigitalTwin3DPage /> },
            ],
          },
          { path: "profile-security", element: <Navigate to={`${STAFF_NS}/admin/profile-security`} replace /> },
          { path: "messages", element: <Navigate to={`${STAFF_NS}/admin/staff-messages`} replace /> },
        ],
      },

      // ── Admin 管理后台 ──
      {
        element: <AdminAccessGuard />,
        children: [
          {
            path: "admin",
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminHomePage /> },
              { path: "staff-messages", element: <StaffMessagesPage /> },
              { path: "profile-security", element: <ProfileSecurityPage /> },
              { path: "notifications", element: <AdminNotificationPage /> },
              { path: "repair-request", element: <RepairRequestPage /> },
              { path: "purchase-request", element: <PurchaseRequestPage /> },
              { path: "facility-maintenance", element: <AdminFacilityMaintenancePage /> },
              { path: "file-templates", element: <AdminFileTemplatesPage /> },
              { path: "knowledge", element: <AdminKnowledgeHomePage /> },
              { path: "report-fill", element: <ReportFillHubPage /> },
              { path: "report-fill/:id", element: <ReportFillPage /> },
              { path: "analytics", element: <AdminAnalyticsPage /> },
              { path: "asset-records", element: <AdminAssetRecordPage /> },
              { path: "asset-transfer-records", element: <AdminAssetTransferRecordPage /> },
              { path: "cage-shelves", element: <AdminCageShelfPage /> },
              { path: "cage-shelves/special-status", element: <AdminSpecialStatusOverviewPage /> },
              { path: "cage-shelf-indexes", element: <AdminCageShelfIndexPage /> },
              { path: "automation-logs", element: <AdminAutomationLogsPage /> },
              { path: "aro-binding", element: <AdminAroBindingPage /> },
              { path: "notification-digest", element: <AdminNotificationDigestPage /> },
              { path: "exp-stats", element: <AdminExpStatsPage /> },
              { path: "supplies/audit-export", element: <AdminSuppliesAuditExportPage /> },

              {
                element: <AdminGuard />,
                children: [
                  { path: "monitor", element: <MonitorDashboardPage /> },
                  { path: "agv-tracker", element: <AgvTrackerPage /> },
                  { path: "agv-tracker/logs", element: <AgvLogPage /> },
                  { path: "agv-tracker/analytics", element: <AgvAnalyticsPage /> },
                  { path: "door-group-storage", element: <AdminDoorGroupStoragePage /> },
                  { path: "device-channels", element: <AdminDeviceChannelPage /> },
                  { path: "aro-rooms", element: <AdminRoomMappingPage /> },
                  { path: "room-mapping", element: <Navigate to={`${STAFF_NS}/admin/aro-rooms`} replace /> },
                  { path: "access-rules", element: <AdminAccessRulesPage /> },
                  { path: "department-storage", element: <AdminDepartmentStoragePage /> },
                  { path: "dahua-issue", element: <DebugCardMappingPage /> },
                  { path: "registration-invites", element: <AdminInviteCodesPage /> },
                  { path: "content-hub", element: <AdminContentHubPage /> },
                  { path: "report-form", element: <ReportFormListPage /> },
                  { path: "report-form/:id/design", element: <ReportFormDesignPage /> },
                  { path: "report-form/:id/submissions", element: <SubmissionManagePage /> },
                  { path: "telemetry-insights", element: <AdminTelemetryInsightsPage /> },
                  { path: "telemetry-insights-config", element: <AdminTelemetryInsightsConfigPage /> },
                  { path: "dahua-swing-tasks", element: <AdminDahuaSwingTasksPage /> },
                  { path: "dahua-swing-stats-tasks", element: <AdminDahuaSwingStatsDailyPage /> },
                  { path: "dahua-swing-stats-backfill", element: <AdminDahuaSwingStatsBackfillPage /> },
                  { path: "dahua-swing-rules", element: <AdminDahuaSwingRulesPage /> },
                  { path: "dahua-swing-records", element: <AdminDahuaSwingRecordsPage /> },
                  { path: "access-audit-source", element: <AdminAccessAuditSourcePage /> },
                  { path: "access-fusion", element: <AdminAccessFusionPage /> },
                  { path: "access-clean-rule-profiles", element: <AdminAccessCleanRuleProfilesPage /> },
                  { path: "student-violations", element: <AdminStudentViolationsPage /> },
                  { path: "supplies", element: <AdminSuppliesMallPage /> },
                  { path: "supplies/mine", element: <Navigate to={`${STAFF_NS}/admin/supplies`} replace /> },
                  { path: "supplies/claim-export", element: <Navigate to={`${STAFF_NS}/admin/supplies`} replace /> },
                  { path: "material/review", element: <MaterialReviewPage /> },
                  { path: "material/manage", element: <MaterialManagePage /> },
                  { path: "material/audit", element: <Navigate to={`${STAFF_NS}/admin/analytics?report=material_stats`} replace /> },
                  { path: "material/audit-export", element: <MaterialAuditExportPage /> },
                  { path: "schedule-manager", element: <Navigate to={`${STAFF_NS}/admin/settings/scheduler`} replace /> },
                  { path: "external-comm-config", element: <Navigate to={`${STAFF_NS}/admin/settings/access-control`} replace /> },
                  { path: "page-permissions", element: <Navigate to={`${STAFF_NS}/admin/settings/permissions`} replace /> },
                  { path: "login-branding", element: <Navigate to={`${STAFF_NS}/admin/settings/appearance`} replace /> },
                  { path: "conversation-archive", element: <AdminConversationArchivePage /> },
                ],
              },
              {
                element: <SuperAdminGuard />,
                children: [
                  { path: "personnel", element: <AdminPersonnelPage /> },
                  { path: "logging-console", element: <AdminLoggingConsolePage /> },
                  { path: "api-docs", element: <AdminApiDocsPage /> },
                  { path: "repair-process", element: <RepairProcessPage /> },
                  { path: "purchase-process", element: <PurchaseProcessPage /> },
                  { path: "supplies/manage", element: <AdminSuppliesManagePage /> },
                  { path: "supplies/process", element: <AdminSuppliesProcessPage /> },
                  { path: "nav-manager", element: <AdminNavManager /> },
                  { path: "push-config", element: <AdminPushConfigPage /> },
                  { path: "push-dashboard", element: <AdminPushDashboardPage /> },
                  { path: "face-debug", element: <FaceDebugPage /> },
                  { path: "door-control", element: <AdminDoorControlPage /> },
                  { path: "telemetry-watchlists", element: <AdminTelemetryWatchlistsPage /> },
                  { path: "telemetry-archive", element: <AdminTelemetryArchivePage /> },
                  {
                    path: "settings",
                    element: <AdminSettingsLayout />,
                    children: [
                      { index: true, element: <Navigate to={`${STAFF_NS}/admin/settings/general`} replace /> },
                      { path: "general", element: <GeneralSettings /> },
                      { path: "appearance", element: <AppearanceSettings /> },
                      { path: "notifications", element: <NotificationsSettings /> },
                      { path: "access-control", element: <AccessControlSettings /> },
                      { path: "scheduler", element: <SchedulerSettings /> },
                      { path: "integrations", element: <IntegrationsSettings /> },
                      { path: "permissions", element: <PermissionsSettings /> },
                      { path: "danger-zone", element: <DangerZoneSettings /> },
                      { path: "dashboard-preview", element: <DashboardPreviewSettings /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  //  旧路由兼容重定向（渐进迁移，无感知）
  // ═══════════════════════════════════════════════════════
  { path: "/", element: <PortalLandingPage /> },
  ...legacyRedirects,
]);
