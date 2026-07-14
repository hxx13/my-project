# student

## 模块结构

```mermaid
mindmap
  root((student))
    StudentAccessRecordController
      GET /api/student/access-records
    StudentAuthController
      POST /api/auth/register/student/verify-qr
    StudentCageShelfController
      GET /api/student/cage-shelves/filter-options
      GET /api/student/cage-shelves/{shelveId}/detail
      GET /api/student/cage-shelves/special-status-overview
      GET /api/student/cage-shelves/{shelveId}/cells/{x}/{y}/refresh
      GET /api/student/cage-shelves/{shelveId}/cells/{x}/{y}/annotation
      GET /api/student/cage-shelves/pinned
      ... +3 more
    StudentDashboardController
      GET /api/student/dashboard
      GET /api/student/ai-profile
      GET /api/student/activity
    StudentFeedbackController
      GET /api/student/feedback/faq
      GET /api/student/feedback/tickets
      POST /api/student/feedback/tickets
    StudentCageShelfService
      → CageShelfService
      → AroService
      → AroPersonnelMapper
      → CageShelfMapper
    StudentDashboardService
      → StudentProfileService
      → AroDatabaseMapper
      → TwinStudentViolationMapper
      → NotificationService
    StudentFeedbackService
      → StudentFeedbackTicketMapper
    StudentNotificationService
      → StudentNotificationMapper
      → AroNewsProxyService
    StudentProfileService
      → AroPersonnelMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/student/access-records` | StudentAccessRecordController |  |
| POST | `/api/auth/register/student/verify-qr` | StudentAuthController |  |
| GET | `/api/student/cage-shelves/filter-options` | StudentCageShelfController |  |
| GET | `/api/student/cage-shelves/{shelveId}/detail` | StudentCageShelfController |  |
| GET | `/api/student/cage-shelves/special-status-overview` | StudentCageShelfController |  |
| GET | `/api/student/cage-shelves/{shelveId}/cells/{x}/{y}/refresh` | StudentCageShelfController |  |
| GET | `/api/student/cage-shelves/{shelveId}/cells/{x}/{y}/annotation` | StudentCageShelfController |  |
| GET | `/api/student/cage-shelves/pinned` | StudentCageShelfController |  |
| POST | `/api/student/cage-shelves/refresh` | StudentCageShelfController |  |
| PUT | `/api/student/cage-shelves/{shelveId}/cells/{x}/{y}/annotation` | StudentCageShelfController |  |
| PUT | `/api/student/cage-shelves/{shelveId}/pin` | StudentCageShelfController |  |
| GET | `/api/student/dashboard` | StudentDashboardController |  |
| GET | `/api/student/ai-profile` | StudentDashboardController |  |
| GET | `/api/student/activity` | StudentDashboardController |  |
| GET | `/api/student/feedback/faq` | StudentFeedbackController |  |
| GET | `/api/student/feedback/tickets` | StudentFeedbackController |  |
| POST | `/api/student/feedback/tickets` | StudentFeedbackController |  |
| GET | `/api/student/notifications` | StudentNotificationController |  |
| PUT | `/api/student/notifications/{id}/read` | StudentNotificationController |  |
| PUT | `/api/student/notifications/read-all` | StudentNotificationController |  |
| GET | `/api/student/profile` | StudentProfileController |  |
| GET | `/api/student/rooms` | StudentRoomController |  |
| PUT | `/api/student/rooms/{roomId}/pin` | StudentRoomController |  |
| GET | `/api/student/stats` | StudentStatsController |  |
| GET | `/api/student/violations` | StudentViolationController |  |
