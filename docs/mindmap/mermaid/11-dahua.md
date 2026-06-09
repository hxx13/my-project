# dahua

## 模块结构

```mermaid
mindmap
  root((dahua))
    DahuaDoorControlController
      GET /api/v1/dahua/door-control/channels
      POST /api/v1/dahua/door-control/execute
      POST /api/v1/dahua/door-control/status
    DahuaMetaController
      GET /api/v1/dahua/meta/departments
      GET /api/v1/dahua/meta/door-groups
      GET /api/v1/dahua/meta/device-channels
      GET /api/v1/dahua/meta/device-channels/remark-categories
      GET /api/v1/dahua/meta/device-channels/meta
      POST /api/v1/dahua/meta/departments/refresh
      ... +6 more
    DahuaAuthService
      → NotificationSettingsService
    DahuaDepartmentCacheService
      → DahuaDepartmentCacheMapper
      → DahuaOpenApiService
    DahuaDeviceChannelCacheService
      → DahuaDeviceChannelCacheMapper
      → DahuaOpenApiService
      → ObjectMapper
      → DahuaDeviceChannelRemarkCategoryService
    DahuaDeviceChannelRemarkCategoryService
      → DahuaDeviceChannelRemarkCategoryMapper
    DahuaDoorGroupCacheService
      → DahuaDoorGroupCacheMapper
      → DahuaOpenApiService
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/dahua/door-control/channels` | DahuaDoorControlController |  |
| POST | `/api/v1/dahua/door-control/execute` | DahuaDoorControlController |  |
| POST | `/api/v1/dahua/door-control/status` | DahuaDoorControlController |  |
| GET | `/api/v1/dahua/meta/departments` | DahuaMetaController |  |
| GET | `/api/v1/dahua/meta/door-groups` | DahuaMetaController |  |
| GET | `/api/v1/dahua/meta/device-channels` | DahuaMetaController |  |
| GET | `/api/v1/dahua/meta/device-channels/remark-categories` | DahuaMetaController |  |
| GET | `/api/v1/dahua/meta/device-channels/meta` | DahuaMetaController |  |
| POST | `/api/v1/dahua/meta/departments/refresh` | DahuaMetaController |  |
| POST | `/api/v1/dahua/meta/door-groups/refresh` | DahuaMetaController |  |
| POST | `/api/v1/dahua/meta/device-channels/refresh` | DahuaMetaController |  |
| POST | `/api/v1/dahua/meta/device-channels/remark-categories` | DahuaMetaController |  |
| PUT | `/api/v1/dahua/meta/device-channels/remark-categories/{id}` | DahuaMetaController |  |
| DELETE | `/api/v1/dahua/meta/device-channels/remark-categories/{id}` | DahuaMetaController |  |
| PATCH | `/api/v1/dahua/meta/device-channels/{id}/remark` | DahuaMetaController |  |
