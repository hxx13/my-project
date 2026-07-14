# supplies

## 模块结构

```mermaid
mindmap
  root((supplies))
    SuppliesAdminController
      GET /api/supplies/admin/categories
      GET /api/supplies/admin/items
      GET /api/supplies/admin/items/recycle
      GET /api/supplies/admin/claims/recycle
      GET /api/supplies/admin/operation-logs
      GET /api/supplies/admin/audit/item-ids-with-records
      ... +21 more
    SuppliesController
      GET /api/supplies/categories
      GET /api/supplies/items
      GET /api/supplies/cart
      GET /api/supplies/items/{id}
      GET /api/supplies/claims/pending-tasks
      GET /api/supplies/claims/recent-closed
      ... +18 more
    SuppliesExcelExportService
    SuppliesService
      → SupplyCategoryMapper
      → SupplyItemMapper
      → SupplyClaimOrderMapper
      → SupplyClaimLineMapper
```

## 前端页面

| 路由 | 组件 | API 调用数 |
|------|------|-----------|
| `/staff-messages` | StaffMessagesPage | 30 |
| `/supplies` | AdminSuppliesMallPage | 13 |
| `/supplies/mine` | AdminSuppliesMinePage | 13 |
| `/supplies/claim-export` | AdminSuppliesClaimExportPage | 13 |
| `/supplies/audit-export` | AdminSuppliesAuditExportPage | 13 |
| `/supplies/manage` | AdminSuppliesManagePage | 13 |
| `/supplies/process` | AdminSuppliesProcessPage | 13 |

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/supplies/admin/categories` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/items` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/items/recycle` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/claims/recycle` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/operation-logs` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/audit/item-ids-with-records` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/audit/inventory-movements` | SuppliesAdminController |  |
| GET | `/api/supplies/admin/audit/items/{itemId}/export/excel` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/categories` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/items` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/items/recycle/{id}/restore` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/items/recycle/purge` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/inbound` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/claims/{id}/fulfill` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/claims/recycle/{id}/restore` | SuppliesAdminController |  |
| POST | `/api/supplies/admin/claims/recycle/purge` | SuppliesAdminController |  |
| PUT | `/api/supplies/admin/claims/{id}/lines` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/categories/{id}` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/items/{id}` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/items/recycle/{id}` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/items/recycle` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/claims/{id}` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/claims/recycle/{id}` | SuppliesAdminController |  |
| DELETE | `/api/supplies/admin/claims/recycle` | SuppliesAdminController |  |
| PATCH | `/api/supplies/admin/categories/{id}` | SuppliesAdminController |  |
| PATCH | `/api/supplies/admin/items/{id}` | SuppliesAdminController |  |
| PATCH | `/api/supplies/admin/items/{id}/stock` | SuppliesAdminController |  |
| GET | `/api/supplies/categories` | SuppliesController |  |
| GET | `/api/supplies/items` | SuppliesController |  |
| GET | `/api/supplies/cart` | SuppliesController |  |
| GET | `/api/supplies/items/{id}` | SuppliesController |  |
| GET | `/api/supplies/claims/pending-tasks` | SuppliesController |  |
| GET | `/api/supplies/claims/recent-closed` | SuppliesController |  |
| GET | `/api/supplies/claims/mine` | SuppliesController |  |
| GET | `/api/supplies/claims/applicant-options` | SuppliesController |  |
| GET | `/api/supplies/claims/mine-range` | SuppliesController |  |
| GET | `/api/supplies/claims/mine-range/export/excel` | SuppliesController |  |
| GET | `/api/supplies/claims/recycle/mine` | SuppliesController |  |
| GET | `/api/supplies/claims/{id}` | SuppliesController |  |
| GET | `/api/supplies/claims/{id}/export/personal/excel` | SuppliesController |  |
| GET | `/api/supplies/claims/{id}/pdf-links` | SuppliesController |  |
| GET | `/api/supplies/claims/download/{token}` | SuppliesController |  |
| POST | `/api/supplies/items/mark-viewed` | SuppliesController |  |
| POST | `/api/supplies/claims` | SuppliesController |  |
| POST | `/api/supplies/claims/{id}/withdraw` | SuppliesController |  |
| POST | `/api/supplies/claims/recycle/{id}/restore` | SuppliesController |  |
| POST | `/api/supplies/claims/{id}/pdf-link` | SuppliesController |  |
| PUT | `/api/supplies/cart` | SuppliesController |  |
| PUT | `/api/supplies/claims/{id}/lines` | SuppliesController |  |
| DELETE | `/api/supplies/claims/{id}` | SuppliesController |  |
| ... | *1 more APIs* | | |
