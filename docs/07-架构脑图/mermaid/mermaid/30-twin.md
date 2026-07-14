# twin

## 模块结构

```mermaid
mindmap
  root((twin))
    TwinAuditController
      GET /api/v1/twin/audit/pending-by-floor
      POST /api/v1/twin/audit/manual-exit
    TwinAutomationDisplayMapController
      PUT /api/v1/twin/automation-display-map/{id}
      DELETE /api/v1/twin/automation-display-map/{id}
    TwinAuditService
      → TwinDashboardAggregationService
      → TwinDashboardMapper
      → TwinCardMappingService
    TwinCardStatusController
      GET /api/v1/twin/cards/status
      POST /api/v1/twin/cards/manual-sync
    TwinMappingController
      GET /api/v1/twin/mappings/search
      GET /api/v1/twin/mappings/user/{userId}
      GET /api/v1/twin/mappings/freeze-config
      GET /api/v1/twin/mappings/access-rule-scan-linkage-config
      GET /api/v1/twin/mappings/dahua-issue/access-prefill
      POST /api/v1/twin/mappings/exempt
      ... +7 more
    TwinAccessLogCorrelationService
      → TwinAccessCorrelationPendingMapper
      → TwinDashboardMapper
    TwinCardMappingInitService
    TwinCardMappingService
      → TwinCardMappingMapper
      → BusinessTimeWindow
      → TwinAutomationLogService
      → DahuaAutoSignoutService
    TwinFreezeConfigService
      → TwinFreezeConfigMapper
    TwinConfigController
      PUT /api/v1/twin/config/rooms/{id}/capacity
      PUT /api/v1/twin/config/rooms/{id}/capacity-bind-room-id
      DELETE /api/v1/twin/config/rooms/{id}
    TwinScheduleController
      POST /api/v1/twin/schedules/{jobKey}/run
      PUT /api/v1/twin/schedules/{jobKey}
    AnimalOrderSyncService
      → TwinDashboardMapper
      → AroService
      → LongRunningSyncCancel
    AroMiniPenetrationSyncService
      → AroService
      → AroDatabaseService
      → RealtimeEventDedupService
      → SocketIOServer
    AroOccupancyAuthorityService
      → AroService
      → TwinCardMappingMapper
      → AroDatabaseMapper
      → AroDatabaseService
    ClientReloadBroadcastService
      → SocketIOServer
    ExamRoomPermissionSyncService
      → AroService
      → RoomDictionaryManager
      → RoomMappingRoomMapper
      → AroPersonnelMapper
    AdminDahuaSwingController
      GET /api/admin/twin/dahua/tasks
      GET /api/admin/twin/dahua/records
      GET /api/admin/twin/dahua/rules/config
      POST /api/admin/twin/dahua/tasks
      POST /api/admin/twin/dahua/tasks/{id}/execute
      POST /api/admin/twin/dahua/tasks/execute-all
      ... +4 more
    AdminDahuaSwingStatsPullController
      GET /api/admin/twin/dahua/stats-tasks/health
      POST /api/admin/twin/dahua/stats-tasks/{id}/execute
      POST /api/admin/twin/dahua/stats-tasks/execute-all-in-plan
      POST /api/admin/twin/dahua/stats-tasks/{id}/retry
      POST /api/admin/twin/dahua/stats-tasks/retry-all-failed
      PUT /api/admin/twin/dahua/stats-tasks/{id}
      ... +1 more
    DahuaAutoSignoutService
      → AroService
      → TwinCardMappingService
      → DahuaSwingRuleConfigService
      → AccessRuleDispatchService
    DahuaSwingPullService
      → DahuaSwingMapper
      → DahuaOpenApiService
      → TwinCardMappingService
      → DahuaSwingRuleEngineService
    DahuaSwingRuleConfigService
      → JdbcTemplate
    DahuaSwingRuleEngineService
      → DahuaSwingMapper
      → DahuaAutoSignoutService
      → DahuaSwingRuleConfigService
      → TwinCardMappingService
    DahuaSwingStatsPullService
      → DahuaSwingStatsPullMapper
      → DahuaSwingMapper
      → DahuaOpenApiService
      → TwinCardMappingService
    AdminTwinScanPopupAnnouncementController
      GET /api/admin/twin/scan-popup-announcements/settings
      GET /api/admin/twin/scan-popup-announcements/{id}
      PUT /api/admin/twin/scan-popup-announcements/settings
      PUT /api/admin/twin/scan-popup-announcements/{id}
      DELETE /api/admin/twin/scan-popup-announcements/{id}
    AdminTwinStudentViolationController
      GET /api/admin/twin/student-violations/unbound-notice-settings
      GET /api/admin/twin/student-violations/personnel/project-groups/search
      GET /api/admin/twin/student-violations/personnel/by-project-group
      GET /api/admin/twin/student-violations/text-templates
      GET /api/admin/twin/student-violations/stranded-config
      POST /api/admin/twin/student-violations/batch
      ... +10 more
    TwinApiController
      GET /api/v1/twin/dashboard/proxy/personnel-avatar
      GET /api/v1/twin/dashboard/proxy/personnel-avatar/h/{encoded:.+}
      GET /api/v1/twin/dashboard/debug/logs
      GET /api/v1/twin/dashboard/debug/sync-personnel
      GET /api/v1/twin/dashboard/debug/personnel/list
      GET /api/v1/twin/dashboard/retention-warnings
      ... +21 more
    TwinPredictionController
      GET /api/v1/twin/prediction/admin/trigger
      GET /api/v1/twin/prediction/dashboard
      GET /api/v1/twin/prediction/rooms
      GET /api/v1/twin/prediction/admin/print-console
      GET /api/v1/twin/prediction/admin/list
      GET /api/v1/twin/prediction/admin/recalc-group
      ... +4 more
    PredictionDebugAssemblerService
      → TwinPredictionEngineService
    StrandedViolationService
      → DahuaSwingMapper
      → AroService
      → DahuaAutoSignoutService
      → TwinStudentViolationService
    TwinDashboardAggregationService
      → RoomConfigService
      → TwinCardStatusController
    TwinDashboardService
      → TwinDashboardMapper
      → BusinessTimeWindow
    TwinPredictionEngineService
      → BuildingAccessPolicy
    AnimalOrderController
      GET /api/v1/twin/order/admin/grouped-all
      GET /api/v1/twin/order/admin/sync
      GET /api/v1/twin/order/admin/sync/full
      GET /api/v1/twin/order/ranking
      POST /api/v1/twin/order/admin/sync/cancel
    RpgController
      GET /api/v1/twin/rpg/exp/{userId}
      GET /api/v1/twin/rpg/recalculate-all
      POST /api/v1/twin/rpg/personnel/sync-all
    RpgDatabaseService
      → AroDatabaseMapper
    RpgEngineService
      → RpgDatabaseService
      → RpgMapper
    TwinScanController
      GET /api/v1/twin/scan/analyze
      GET /api/v1/twin/scan/user-status
      GET /api/v1/twin/scan/card-mapping
      GET /api/v1/twin/scan/room/card-status
      POST /api/v1/twin/scan/violation-interactive-ack
      POST /api/v1/twin/scan/execute
      ... +3 more
    DahuaIssueAccessRulePrefillService
      → AroService
      → AccessRuleService
      → AccessRuleMapper
    DahuaIssueCardOrchestratorService
      → DahuaOpenApiService
      → TwinCardMappingService
    ScanCampusEnterConfigService
      → NotificationSettingsMapper
    TwinAccessRuleScanConfigService
      → TwinAccessRuleScanConfigMapper
      → TwinAccessRuleScanConfigSchemaMigrator
    TwinScanAppService
      → TwinScanService
      → TwinDashboardMapper
      → RpgEngineService
      → TwinCardMappingService
    TwinSyncController
      POST /api/v1/twin/personnel/sync-all
      POST /api/v1/twin/dashboard/sync-logs
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/twin/audit/pending-by-floor` | TwinAuditController |  |
| POST | `/api/v1/twin/audit/manual-exit` | TwinAuditController |  |
| PUT | `/api/v1/twin/automation-display-map/{id}` | TwinAutomationDisplayMapController |  |
| DELETE | `/api/v1/twin/automation-display-map/{id}` | TwinAutomationDisplayMapController |  |
| GET | `/api/v1/twin/cards/status` | TwinCardStatusController |  |
| POST | `/api/v1/twin/cards/manual-sync` | TwinCardStatusController |  |
| GET | `/api/v1/twin/mappings/search` | TwinMappingController |  |
| GET | `/api/v1/twin/mappings/user/{userId}` | TwinMappingController |  |
| GET | `/api/v1/twin/mappings/freeze-config` | TwinMappingController |  |
| GET | `/api/v1/twin/mappings/access-rule-scan-linkage-config` | TwinMappingController |  |
| GET | `/api/v1/twin/mappings/dahua-issue/access-prefill` | TwinMappingController |  |
| POST | `/api/v1/twin/mappings/exempt` | TwinMappingController |  |
| POST | `/api/v1/twin/mappings/status` | TwinMappingController |  |
| POST | `/api/v1/twin/mappings/add` | TwinMappingController |  |
| POST | `/api/v1/twin/mappings/dahua-issue` | TwinMappingController |  |
| POST | `/api/v1/twin/mappings/debug/run-reaper` | TwinMappingController |  |
| PUT | `/api/v1/twin/mappings/access-rule-scan-linkage-config` | TwinMappingController |  |
| PUT | `/api/v1/twin/mappings/freeze-config` | TwinMappingController |  |
| DELETE | `/api/v1/twin/mappings/{cardNo}` | TwinMappingController |  |
| PUT | `/api/v1/twin/config/rooms/{id}/capacity` | TwinConfigController |  |
| PUT | `/api/v1/twin/config/rooms/{id}/capacity-bind-room-id` | TwinConfigController |  |
| DELETE | `/api/v1/twin/config/rooms/{id}` | TwinConfigController |  |
| POST | `/api/v1/twin/schedules/{jobKey}/run` | TwinScheduleController |  |
| PUT | `/api/v1/twin/schedules/{jobKey}` | TwinScheduleController |  |
| GET | `/api/admin/twin/dahua/tasks` | AdminDahuaSwingController |  |
| GET | `/api/admin/twin/dahua/records` | AdminDahuaSwingController |  |
| GET | `/api/admin/twin/dahua/rules/config` | AdminDahuaSwingController |  |
| POST | `/api/admin/twin/dahua/tasks` | AdminDahuaSwingController |  |
| POST | `/api/admin/twin/dahua/tasks/{id}/execute` | AdminDahuaSwingController |  |
| POST | `/api/admin/twin/dahua/tasks/execute-all` | AdminDahuaSwingController |  |
| POST | `/api/admin/twin/dahua/rules/dry-run` | AdminDahuaSwingController |  |
| PUT | `/api/admin/twin/dahua/tasks/{id}` | AdminDahuaSwingController |  |
| PUT | `/api/admin/twin/dahua/rules/config` | AdminDahuaSwingController |  |
| DELETE | `/api/admin/twin/dahua/tasks/{id}` | AdminDahuaSwingController |  |
| GET | `/api/admin/twin/dahua/stats-tasks/health` | AdminDahuaSwingStatsPullController |  |
| POST | `/api/admin/twin/dahua/stats-tasks/{id}/execute` | AdminDahuaSwingStatsPullController |  |
| POST | `/api/admin/twin/dahua/stats-tasks/execute-all-in-plan` | AdminDahuaSwingStatsPullController |  |
| POST | `/api/admin/twin/dahua/stats-tasks/{id}/retry` | AdminDahuaSwingStatsPullController |  |
| POST | `/api/admin/twin/dahua/stats-tasks/retry-all-failed` | AdminDahuaSwingStatsPullController |  |
| PUT | `/api/admin/twin/dahua/stats-tasks/{id}` | AdminDahuaSwingStatsPullController |  |
| DELETE | `/api/admin/twin/dahua/stats-tasks/{id}` | AdminDahuaSwingStatsPullController |  |
| GET | `/api/admin/twin/scan-popup-announcements/settings` | AdminTwinScanPopupAnnouncementController |  |
| GET | `/api/admin/twin/scan-popup-announcements/{id}` | AdminTwinScanPopupAnnouncementController |  |
| PUT | `/api/admin/twin/scan-popup-announcements/settings` | AdminTwinScanPopupAnnouncementController |  |
| PUT | `/api/admin/twin/scan-popup-announcements/{id}` | AdminTwinScanPopupAnnouncementController |  |
| DELETE | `/api/admin/twin/scan-popup-announcements/{id}` | AdminTwinScanPopupAnnouncementController |  |
| GET | `/api/admin/twin/student-violations/unbound-notice-settings` | AdminTwinStudentViolationController |  |
| GET | `/api/admin/twin/student-violations/personnel/project-groups/search` | AdminTwinStudentViolationController |  |
| GET | `/api/admin/twin/student-violations/personnel/by-project-group` | AdminTwinStudentViolationController |  |
| GET | `/api/admin/twin/student-violations/text-templates` | AdminTwinStudentViolationController |  |
| ... | *68 more APIs* | | |
