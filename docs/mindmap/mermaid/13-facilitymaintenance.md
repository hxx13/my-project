# facilitymaintenance

## 模块结构

```mermaid
mindmap
  root((facilitymaintenance))
    FacilityMaintenanceController
      GET /api/v1/facility-maintenance/sites
      GET /api/v1/facility-maintenance/option-sets
      GET /api/v1/facility-maintenance/templates
      GET /api/v1/facility-maintenance/templates/{id}
      GET /api/v1/facility-maintenance/daily-inspection-sheets/summaries
      GET /api/v1/facility-maintenance/daily-inspection-sheets
      ... +38 more
    FacilityMaintenanceService
      → JdbcTemplate
      → ObjectMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/facility-maintenance/sites` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/option-sets` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/templates` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/templates/{id}` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/daily-inspection-sheets/summaries` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/daily-inspection-sheets` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/daily-inspection-sheets/{id}/export-excel` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/consumable-catalog` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/replacement-filter-presets` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/inspection-records` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/inspection-records/{id}` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/consumable-lines` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/replacement-records` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/replacement-summary` | FacilityMaintenanceController |  |
| GET | `/api/v1/facility-maintenance/export/excel` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/sites` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/option-sets` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/templates` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/daily-inspection-sheets/{id}/submit` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/consumable-catalog` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/replacement-filter-presets` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/inspection-records` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/consumable-lines` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/replacement-records` | FacilityMaintenanceController |  |
| POST | `/api/v1/facility-maintenance/import/excel` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/sites/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/sites/{id}/permanent` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/option-sets/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/templates/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/daily-inspection-sheets/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/consumable-catalog/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/replacement-filter-presets/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/inspection-records/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/consumable-lines/{id}` | FacilityMaintenanceController |  |
| DELETE | `/api/v1/facility-maintenance/replacement-records/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/sites/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/option-sets/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/templates/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/daily-inspection-sheets/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/consumable-catalog/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/replacement-filter-presets/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/inspection-records/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/consumable-lines/{id}` | FacilityMaintenanceController |  |
| PATCH | `/api/v1/facility-maintenance/replacement-records/{id}` | FacilityMaintenanceController |  |
