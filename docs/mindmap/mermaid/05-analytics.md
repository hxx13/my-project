# analytics

## 模块结构

```mermaid
mindmap
  root((analytics))
    AnalyticsChatController
      GET /api/v1/analytics/chat/sessions
      GET /api/v1/analytics/chat/sessions/{id}/messages
      POST /api/v1/analytics/chat/sessions
      POST /api/v1/analytics/chat/sessions/{id}/messages/stream
      DELETE /api/v1/analytics/chat/sessions/{id}
      PATCH /api/v1/analytics/chat/sessions/{id}
    AnalyticsController
      GET /api/v1/analytics/reports
      GET /api/v1/analytics/isolation-usage/query
      GET /api/v1/analytics/reports/{reportKey}/share
      GET /api/v1/analytics/views/{viewId}/share
      GET /api/v1/analytics/share/preview
      GET /api/v1/analytics/llm/insight-prompt
      ... +21 more
    StudentActivityController
      GET /api/v1/analytics/student-activity/groups
      GET /api/v1/analytics/student-activity/members
      GET /api/v1/analytics/student-activity/heatmap
      GET /api/v1/analytics/student-activity/daily-trend
      GET /api/v1/analytics/student-activity/room-usage
      GET /api/v1/analytics/student-activity/summary
      ... +1 more
    AnalyticsAuditAsyncService
      → AnalyticsUserViewMapper
      → AnalyticsAuditService
    AnalyticsAuditService
      → AnalyticsUserViewMapper
      → AnalyticsAuditLogMapper
      → IsolationUsageReportService
      → CageOccupancyReportService
    AnalyticsCageAuditProgressService
    AnalyticsChatContextService
      → AnalyticsUserViewMapper
      → AnalyticsAuditLogMapper
      → AnalyticsAuditService
      → AnalyticsInsightPayloadService
    AnalyticsChatService
      → AnalyticsChatSessionMapper
      → AnalyticsChatMessageMapper
      → AnalyticsAuditLogMapper
      → AnalyticsUserViewMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/analytics/chat/sessions` | AnalyticsChatController |  |
| GET | `/api/v1/analytics/chat/sessions/{id}/messages` | AnalyticsChatController |  |
| POST | `/api/v1/analytics/chat/sessions` | AnalyticsChatController |  |
| POST | `/api/v1/analytics/chat/sessions/{id}/messages/stream` | AnalyticsChatController |  |
| DELETE | `/api/v1/analytics/chat/sessions/{id}` | AnalyticsChatController |  |
| PATCH | `/api/v1/analytics/chat/sessions/{id}` | AnalyticsChatController |  |
| GET | `/api/v1/analytics/reports` | AnalyticsController |  |
| GET | `/api/v1/analytics/isolation-usage/query` | AnalyticsController |  |
| GET | `/api/v1/analytics/reports/{reportKey}/share` | AnalyticsController |  |
| GET | `/api/v1/analytics/views/{viewId}/share` | AnalyticsController |  |
| GET | `/api/v1/analytics/share/preview` | AnalyticsController |  |
| GET | `/api/v1/analytics/llm/insight-prompt` | AnalyticsController |  |
| GET | `/api/v1/analytics/llm/insight-data-package` | AnalyticsController |  |
| GET | `/api/v1/analytics/llm/insights` | AnalyticsController |  |
| GET | `/api/v1/analytics/llm/insights/generate-batch` | AnalyticsController |  |
| GET | `/api/v1/analytics/llm/insights/generate` | AnalyticsController |  |
| GET | `/api/v1/analytics/audit-logs/{id}/detail` | AnalyticsController |  |
| GET | `/api/v1/analytics/views/{viewId}/cage-audit-progress` | AnalyticsController |  |
| GET | `/api/v1/analytics/audit-logs` | AnalyticsController |  |
| GET | `/api/v1/analytics/views` | AnalyticsController |  |
| POST | `/api/v1/analytics/isolation-usage/preview` | AnalyticsController |  |
| POST | `/api/v1/analytics/reports/{reportKey}/share` | AnalyticsController |  |
| POST | `/api/v1/analytics/views/{viewId}/share` | AnalyticsController |  |
| POST | `/api/v1/analytics/share/import` | AnalyticsController |  |
| POST | `/api/v1/analytics/share/{shareId}/revoke` | AnalyticsController |  |
| POST | `/api/v1/analytics/llm/insights/generate-batch` | AnalyticsController |  |
| POST | `/api/v1/analytics/llm/insights/generate` | AnalyticsController |  |
| POST | `/api/v1/analytics/views` | AnalyticsController |  |
| POST | `/api/v1/analytics/views/{id}/force-recalc-snapshots` | AnalyticsController |  |
| POST | `/api/v1/analytics/views/subscribe` | AnalyticsController |  |
| PUT | `/api/v1/analytics/views/{id}` | AnalyticsController |  |
| PUT | `/api/v1/analytics/views/{id}/subscription` | AnalyticsController |  |
| DELETE | `/api/v1/analytics/views/{id}` | AnalyticsController |  |
| GET | `/api/v1/analytics/student-activity/groups` | StudentActivityController |  |
| GET | `/api/v1/analytics/student-activity/members` | StudentActivityController |  |
| GET | `/api/v1/analytics/student-activity/heatmap` | StudentActivityController |  |
| GET | `/api/v1/analytics/student-activity/daily-trend` | StudentActivityController |  |
| GET | `/api/v1/analytics/student-activity/room-usage` | StudentActivityController |  |
| GET | `/api/v1/analytics/student-activity/summary` | StudentActivityController |  |
| POST | `/api/v1/analytics/student-activity/recalculate` | StudentActivityController |  |
