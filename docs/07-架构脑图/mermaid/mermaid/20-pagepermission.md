# pagepermission

## 模块结构

```mermaid
mindmap
  root((pagepermission))
    AdminPagePermissionController
      GET /api/admin/page-permissions/tree
      GET /api/admin/page-permissions/lookup
      POST /api/admin/page-permissions/scan
      POST /api/admin/page-permissions/batch
      POST /api/admin/page-permissions/reset-defaults
      PATCH /api/admin/page-permissions/{nodeKey}
    PagePermissionService
      → PagePermissionMapper
      → ObjectMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/admin/page-permissions/tree` | AdminPagePermissionController |  |
| GET | `/api/admin/page-permissions/lookup` | AdminPagePermissionController |  |
| POST | `/api/admin/page-permissions/scan` | AdminPagePermissionController |  |
| POST | `/api/admin/page-permissions/batch` | AdminPagePermissionController |  |
| POST | `/api/admin/page-permissions/reset-defaults` | AdminPagePermissionController |  |
| PATCH | `/api/admin/page-permissions/{nodeKey}` | AdminPagePermissionController |  |
