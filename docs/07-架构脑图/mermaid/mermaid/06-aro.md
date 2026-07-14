# aro

## 模块结构

```mermaid
mindmap
  root((aro))
    AroController
      GET /api/v1/aro/test-fetch
    PublicAroNewsController
      GET /api/public/aro/news/{id}
    AroDatabaseService
      → AroDatabaseMapper
      → TwinAccessLogCorrelationService
    AroNewsProxyService
      → RestTemplate
      → AroService
    AroPersonnelDatabaseService
      → AroPersonnelMapper
    AroService
      → NotificationSettingsService
    AroStartupAsyncService
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/aro/test-fetch` | AroController |  |
| GET | `/api/public/aro/news/{id}` | PublicAroNewsController |  |
