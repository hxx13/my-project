# admin

## 模块结构

```mermaid
mindmap
  root((admin))
    AdminAccountBindingController
      GET /api/admin/account/binding
      GET /api/admin/aro-bindings
      POST /api/admin/account/bind-aro
      DELETE /api/admin/account/bind-aro
      DELETE /api/admin/personnel/{userId}/aro-binding
    AdminController
      GET /api/admin/personnel
      GET /api/admin/system-users
      POST /api/admin/system-users
      POST /api/admin/users/{id}/reset-password
      POST /api/admin/users/{id}/reset-openid
      DELETE /api/admin/users/{id}
      ... +3 more
    AdminNavConfigController
      GET /api/admin-nav/config
      POST /api/admin-nav/groups
      POST /api/admin-nav/reset
      PUT /api/admin-nav/groups/{id}
      PUT /api/admin-nav/items/{id}/move
      PUT /api/admin-nav/items/reorder
      ... +1 more
    AdminSystemDiagnosticsController
      GET /api/admin/diagnostics/latency-probe
    LoggingAdminController
      GET /api/admin/logging/levels
      GET /api/admin/logging/toggles
      GET /api/admin/logging/recent
      POST /api/admin/logging/level
      POST /api/admin/logging/reset
      POST /api/admin/logging/sync-from-db
      ... +1 more
    AdminPageHelpController
      POST /api/admin/page-help/messages
    AdminNavConfigService
      → JdbcTemplate
    AdminService
      → AdminMapper
      → UserMapper
      → PasswordCredentialService
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/admin/account/binding` | AdminAccountBindingController |  |
| GET | `/api/admin/aro-bindings` | AdminAccountBindingController |  |
| POST | `/api/admin/account/bind-aro` | AdminAccountBindingController |  |
| DELETE | `/api/admin/account/bind-aro` | AdminAccountBindingController |  |
| DELETE | `/api/admin/personnel/{userId}/aro-binding` | AdminAccountBindingController |  |
| GET | `/api/admin/personnel` | AdminController |  |
| GET | `/api/admin/system-users` | AdminController |  |
| POST | `/api/admin/system-users` | AdminController |  |
| POST | `/api/admin/users/{id}/reset-password` | AdminController |  |
| POST | `/api/admin/users/{id}/reset-openid` | AdminController |  |
| DELETE | `/api/admin/users/{id}` | AdminController |  |
| PATCH | `/api/admin/users/{id}/role` | AdminController |  |
| PATCH | `/api/admin/users/{id}/status` | AdminController |  |
| PATCH | `/api/admin/users/{id}/display-nickname` | AdminController |  |
| GET | `/api/admin-nav/config` | AdminNavConfigController |  |
| POST | `/api/admin-nav/groups` | AdminNavConfigController |  |
| POST | `/api/admin-nav/reset` | AdminNavConfigController |  |
| PUT | `/api/admin-nav/groups/{id}` | AdminNavConfigController |  |
| PUT | `/api/admin-nav/items/{id}/move` | AdminNavConfigController |  |
| PUT | `/api/admin-nav/items/reorder` | AdminNavConfigController |  |
| DELETE | `/api/admin-nav/groups/{id}` | AdminNavConfigController |  |
| GET | `/api/admin/diagnostics/latency-probe` | AdminSystemDiagnosticsController |  |
| GET | `/api/admin/logging/levels` | LoggingAdminController |  |
| GET | `/api/admin/logging/toggles` | LoggingAdminController |  |
| GET | `/api/admin/logging/recent` | LoggingAdminController |  |
| POST | `/api/admin/logging/level` | LoggingAdminController |  |
| POST | `/api/admin/logging/reset` | LoggingAdminController |  |
| POST | `/api/admin/logging/sync-from-db` | LoggingAdminController |  |
| POST | `/api/admin/logging/clear-buffer` | LoggingAdminController |  |
| POST | `/api/admin/page-help/messages` | AdminPageHelpController |  |
