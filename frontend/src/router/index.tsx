import { createHashRouter, Navigate } from "react-router-dom";
import TwinLayout from "@/layouts/TwinLayout";
import DashboardPage from "@/pages/DashboardPage";
import DebugTablePage from "@/pages/DebugTablePage.tsx";
import DebugPersonnelPage from "@/pages/DebugPersonnelPage.tsx";
import DebugPredictionPage from "@/pages/DebugPredictionPage.tsx";
import DebugOrderPage from "@/pages/DebugOrderPage";
import DebugHeatmapPage from "@/pages/DebugHeatmapPage.tsx";
import DebugCardStatusPage from "@/pages/DebugCardStatusPage.tsx";
import DebugCardMappingPage from "@/pages/DebugCardMappingPage.tsx";
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
import AdminSettingsPage from "@/pages/AdminSettingsPage";
import AdminApiDocsPage from "@/pages/AdminApiDocsPage";
import AdminExternalCommConfigPage from "@/pages/AdminExternalCommConfigPage";
import AdminLoggingConsolePage from "@/pages/AdminLoggingConsolePage";
import AdminDoorGroupStoragePage from "@/pages/AdminDoorGroupStoragePage";
import AdminDepartmentStoragePage from "@/pages/AdminDepartmentStoragePage";
import AdminDeviceChannelPage from "@/pages/AdminDeviceChannelPage";
import AdminRoomMappingPage from "@/pages/AdminRoomMappingPage";
import AdminAccessRulesPage from "@/pages/AdminAccessRulesPage";
import ProfileSecurityPage from "@/pages/ProfileSecurityPage";
import AdminGuard from "@/router/AdminGuard";
import AdminSuppliesMallPage from "@/pages/AdminSuppliesMallPage";
import AdminSuppliesMinePage from "@/pages/AdminSuppliesMinePage";
import AdminSuppliesClaimExportPage from "@/pages/AdminSuppliesClaimExportPage";
import AdminSuppliesManagePage from "@/pages/AdminSuppliesManagePage";
import AdminSuppliesProcessPage from "@/pages/AdminSuppliesProcessPage";
import AdminSuppliesAuditExportPage from "@/pages/AdminSuppliesAuditExportPage";
import AdminAssetRecordPage from "@/pages/AdminAssetRecordPage";
import AdminFacilityMaintenancePage from "@/pages/AdminFacilityMaintenancePage";
import AdminFileTemplatesPage from "@/pages/AdminFileTemplatesPage";
import AdminAssetTransferRecordPage from "@/pages/AdminAssetTransferRecordPage";
import AdminPagePermissionSettingsPage from "@/pages/AdminPagePermissionSettingsPage";
import AdminScheduleManagerPage from "@/pages/AdminScheduleManagerPage";
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
import AdminAutomationLogsPage from "@/pages/AdminAutomationLogsPage";
import AnimalRoomTelemetryPage from "@/pages/AnimalRoomTelemetryPage";
import AnimalRoomCockpitPage from "@/pages/AnimalRoomCockpitPage";
import DigitalTwinScreenPage from "@/pages/DigitalTwinScreenPage";
import AdminTelemetryWatchlistsPage from "@/pages/AdminTelemetryWatchlistsPage";
import AdminTelemetryArchivePage from "@/pages/AdminTelemetryArchivePage";
import StaffMessagesPage from "@/pages/StaffMessagesPage";
import AdminLoginBrandingPage from "@/pages/AdminLoginBrandingPage";
import AdminInviteCodesPage from "@/pages/AdminInviteCodesPage";
import AdminContentHubPage from "@/pages/AdminContentHubPage";
import AdminAnalyticsPage from "@/pages/AdminAnalyticsPage";
import StudentRegisterPage from "@/features/student/pages/student-register";
import StudentLayout from "@/features/student/components/layout/student-layout";
import StudentHomePage from "@/features/student/pages/student-home";
import StudentRecordsPage from "@/features/student/pages/student-records";
import StudentRoomsPage from "@/features/student/pages/student-rooms";
import StudentStatsPage from "@/features/student/pages/student-stats";
import StudentNotificationsPage from "@/features/student/pages/student-notifications";
import StudentFeedbackPage from "@/features/student/pages/student-feedback";
import StudentSettingsPage from "@/features/student/pages/student-settings";
import StudentCageShelfPage from "@/features/student/pages/student-cage-shelf";

export const router = createHashRouter([
    {
        path: "/login",
        element: <LoginPage/>,
    },
    {
        path: "/register",
        element: <RegisterStaffPage/>,
    },
    // 学生端公开路由
    { path: "/student/register", element: <StudentRegisterPage /> },
    // 学生端受保护路由
    {
        path: "/student",
        element: <AuthGuard requireRole="STUDENT"><StudentLayout /></AuthGuard>,
        children: [
            { index: true, element: <Navigate to="/student/home" replace /> },
            { path: "home", element: <StudentHomePage /> },
            { path: "records", element: <StudentRecordsPage /> },
            { path: "rooms", element: <StudentRoomsPage /> },
            { path: "stats", element: <StudentStatsPage /> },
            { path: "notifications", element: <StudentNotificationsPage /> },
            { path: "feedback", element: <StudentFeedbackPage /> },
            { path: "settings", element: <StudentSettingsPage /> },
            { path: "cage-shelf", element: <StudentCageShelfPage /> },
        ],
    },
    {
        element: <AuthGuard/>,
        children: [
            {
                path: "/",
                element: <TwinLayout/>, // 💥 整个应用的唯一骨架！
                // 👇 所有页面都必须作为它的 children！
                children: [
                    {
                        index: true, // 默认重定向到大屏
                        element: <DashboardPage/>,
                    },
                    {
                        path: "dashboard",
                        element: <DashboardPage/>,
                    },
                    {
                        element: <TwinDebugStaffGuard />,
                        children: [
                    {
                        path: "debug", // 注意这里去掉了开头的斜杠
                        element: (
                            <TwinDebugRouteShell title="流水线日志">
                                <DebugTablePage />
                            </TwinDebugRouteShell>
                        ),
                    },
                    {
                        path: "debug-personnel", // 注意这里去掉了开头的斜杠
                        element: (
                            <TwinDebugRouteShell title="档案库">
                                <DebugPersonnelPage />
                            </TwinDebugRouteShell>
                        ),
                    },
                    {
                        path: "debug-prediction", // 注意这里去掉了开头的斜杠
                        element: (
                            <TwinDebugRouteShell title="AI 推演">
                                <DebugPredictionPage />
                            </TwinDebugRouteShell>
                        ),
                    },
                    // 💥 挂载新路由
                    {
                        path: "debug-order",
                        element: (
                            <TwinDebugRouteShell title="订单库">
                                <DebugOrderPage />
                            </TwinDebugRouteShell>
                        ),
                    },
                    {
                        path: "debug-heatmap",
                        element: (
                            <TwinDebugRouteShell title="空间雷达">
                                <DebugHeatmapPage />
                            </TwinDebugRouteShell>
                        ),
                    },
                    {
                        path: "debug-cards",
                        element: (
                            <TwinDebugRouteShell title="房卡调度">
                                <DebugCardStatusPage />
                            </TwinDebugRouteShell>
                        ),
                    },
                        ],
                    },
                    {path: "animal-room-telemetry", element: <AnimalRoomTelemetryPage/>},
                    {path: "animal-room-cockpit", element: <AnimalRoomCockpitPage/>},
                    {path: "digital-twin-screen", element: <DigitalTwinScreenPage/>},
                    { path: "profile-security", element: <Navigate to="/admin/profile-security" replace /> },
                    {path: "messages", element: <Navigate to="/admin/staff-messages" replace />},
                ],
            },
            {
                element: <AdminAccessGuard/>,
                children: [
                    {
                        path: "/admin",
                        element: <AdminLayout/>,
                        children: [
                            { index: true, element: <AdminHomePage/>},
                            { path: "staff-messages", element: <StaffMessagesPage/>},
                            { path: "profile-security", element: <ProfileSecurityPage /> },
                            { path: "notifications", element: <AdminNotificationPage/>},
                            { path: "repair-request", element: <RepairRequestPage/>},
                            { path: "purchase-request", element: <PurchaseRequestPage/>},
                            { path: "facility-maintenance", element: <AdminFacilityMaintenancePage/>},
                            { path: "file-templates", element: <AdminFileTemplatesPage/>},
                            { path: "content-hub", element: <AdminContentHubPage/>},
                            { path: "analytics", element: <AdminAnalyticsPage/>},
                            { path: "asset-records", element: <AdminAssetRecordPage/>},
                            { path: "asset-transfer-records", element: <AdminAssetTransferRecordPage/>},
                            { path: "cage-shelves", element: <AdminCageShelfPage/>},
                            { path: "automation-logs", element: <AdminAutomationLogsPage/>},
                                    { path: "telemetry-watchlists", element: <AdminTelemetryWatchlistsPage/>},
                                    { path: "telemetry-archive", element: <AdminTelemetryArchivePage/>},
                                    {
                                        element: <AdminGuard/>,
                                        children: [
                                    { path: "door-group-storage", element: <AdminDoorGroupStoragePage/>},
                                    { path: "device-channels", element: <AdminDeviceChannelPage/>},
                                    { path: "aro-rooms", element: <AdminRoomMappingPage/>},
                                    { path: "room-mapping", element: <Navigate to="/admin/aro-rooms" replace />},
                                    { path: "access-rules", element: <AdminAccessRulesPage/>},
                                    { path: "department-storage", element: <AdminDepartmentStoragePage/>},
                                    { path: "dahua-issue", element: <DebugCardMappingPage/>},
                                    { path: "door-control", element: <AdminDoorControlPage/>},
                                    { path: "login-branding", element: <AdminLoginBrandingPage/>},
                                    { path: "registration-invites", element: <AdminInviteCodesPage/>},
                                    { path: "schedule-manager", element: <AdminScheduleManagerPage/>},
                                    { path: "dahua-swing-tasks", element: <AdminDahuaSwingTasksPage/>},
                                    { path: "dahua-swing-stats-tasks", element: <AdminDahuaSwingStatsDailyPage/>},
                                    { path: "dahua-swing-stats-backfill", element: <AdminDahuaSwingStatsBackfillPage/>},
                                    { path: "dahua-swing-rules", element: <AdminDahuaSwingRulesPage/>},
                                    { path: "dahua-swing-records", element: <AdminDahuaSwingRecordsPage/>},
                                    { path: "access-audit-source", element: <AdminAccessAuditSourcePage/>},
                                    { path: "access-fusion", element: <AdminAccessFusionPage/>},
                                    { path: "access-clean-rule-profiles", element: <AdminAccessCleanRuleProfilesPage/>},
                                    { path: "student-violations", element: <AdminStudentViolationsPage/>},
                                    { path: "supplies", element: <AdminSuppliesMallPage/>},
                                    { path: "supplies/mine", element: <AdminSuppliesMinePage/>},
                                    { path: "supplies/claim-export", element: <AdminSuppliesClaimExportPage/>},
                                    { path: "supplies/audit-export", element: <AdminSuppliesAuditExportPage/>},
                                ],
                            },
                            {
                                element: <SuperAdminGuard/>,
                                children: [
                                    { path: "personnel", element: <AdminPersonnelPage/>},
                                    { path: "settings", element: <AdminSettingsPage/>},
                                    { path: "logging-console", element: <AdminLoggingConsolePage/>},
                                    { path: "external-comm-config", element: <AdminExternalCommConfigPage/>},
                                    { path: "api-docs", element: <AdminApiDocsPage/>},
                                    { path: "page-permissions", element: <AdminPagePermissionSettingsPage/>},
                                    { path: "repair-process", element: <RepairProcessPage/>},
                                    { path: "purchase-process", element: <PurchaseProcessPage/>},
                                    { path: "supplies/manage", element: <AdminSuppliesManagePage/>},
                                    { path: "supplies/process", element: <AdminSuppliesProcessPage/>},
                                ]
                            },
                        ]
                    }
                ]
            }
        ],
    }
]);