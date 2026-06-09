# accessfusion

## 模块结构

```mermaid
mindmap
  root((accessfusion))
    AccessFusionController
      GET /api/v1/access-fusion/door-rules
      GET /api/v1/access-fusion/clean/batches
      GET /api/v1/access-fusion/clean/batches/{batchId}/events
      GET /api/v1/access-fusion/review-queue
      POST /api/v1/access-fusion/door-rules
      POST /api/v1/access-fusion/raw/backfill
      ... +6 more
    AdminAccessAuditController
      GET /api/admin/twin/access-audit/configs
      GET /api/admin/twin/access-audit/preview/swing
      GET /api/admin/twin/access-audit/preview/raw
      GET /api/admin/twin/access-audit/quality-summary
      POST /api/admin/twin/access-audit/configs
      POST /api/admin/twin/access-audit/records/enrich
      ... +3 more
    AdminAccessFusionBridgeController
      GET /api/admin/twin/access-fusion/rule-profiles
      GET /api/admin/twin/access-fusion/library/query
      GET /api/admin/twin/access-fusion/execution-logs
      GET /api/admin/twin/access-fusion/execution-logs/{id}/detail
      GET /api/admin/twin/access-fusion/door-rules
      GET /api/admin/twin/access-fusion/workspace/enabled-channels
      ... +35 more
    AccessAuditSourceService
      → AccessAuditSourceConfigMapper
      → AccessRawEventMapper
      → AccessRawEventIngestService
      → DahuaSwingMapper
    AccessCleanChannelScopeService
      → AccessCleanChannelScopeMapper
    AccessCleanExecutionLogService
      → AccessCleanExecutionLogMapper
      → ObjectMapper
    AccessCleanIngestService
      → AccessSwingCleanWorkspaceService
      → AccessCleanRuleProfileService
      → AccessCleanExecutionLogService
    AccessCleanLibraryPurgeService
      → AccessCleanPackageItemMapper
      → AccessCleanPackageMapper
      → AccessCleanExecutionLogMapper
```

## 前端页面

| 路由 | 组件 | API 调用数 |
|------|------|-----------|
| `/file-templates` | AdminFileTemplatesPage | 1 |
| `/asset-records` | AdminAssetRecordPage | 1 |
| `/asset-transfer-records` | AdminAssetTransferRecordPage | 1 |

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/access-fusion/door-rules` | AccessFusionController |  |
| GET | `/api/v1/access-fusion/clean/batches` | AccessFusionController |  |
| GET | `/api/v1/access-fusion/clean/batches/{batchId}/events` | AccessFusionController |  |
| GET | `/api/v1/access-fusion/review-queue` | AccessFusionController |  |
| POST | `/api/v1/access-fusion/door-rules` | AccessFusionController |  |
| POST | `/api/v1/access-fusion/raw/backfill` | AccessFusionController |  |
| POST | `/api/v1/access-fusion/clean/run` | AccessFusionController |  |
| POST | `/api/v1/access-fusion/review/{id}/confirm` | AccessFusionController |  |
| POST | `/api/v1/access-fusion/review/{id}/ai-suggest` | AccessFusionController |  |
| POST | `/api/v1/access-fusion/compare/isolation-7d` | AccessFusionController |  |
| PUT | `/api/v1/access-fusion/door-rules/{id}` | AccessFusionController |  |
| DELETE | `/api/v1/access-fusion/door-rules/{id}` | AccessFusionController |  |
| GET | `/api/admin/twin/access-audit/configs` | AdminAccessAuditController |  |
| GET | `/api/admin/twin/access-audit/preview/swing` | AdminAccessAuditController |  |
| GET | `/api/admin/twin/access-audit/preview/raw` | AdminAccessAuditController |  |
| GET | `/api/admin/twin/access-audit/quality-summary` | AdminAccessAuditController |  |
| POST | `/api/admin/twin/access-audit/configs` | AdminAccessAuditController |  |
| POST | `/api/admin/twin/access-audit/records/enrich` | AdminAccessAuditController |  |
| POST | `/api/admin/twin/access-audit/records/recalculate-audience` | AdminAccessAuditController |  |
| POST | `/api/admin/twin/access-audit/configs/{id}/sync` | AdminAccessAuditController |  |
| DELETE | `/api/admin/twin/access-audit/configs/{id}` | AdminAccessAuditController |  |
| GET | `/api/admin/twin/access-fusion/rule-profiles` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/library/query` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/execution-logs` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/execution-logs/{id}/detail` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/door-rules` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/enabled-channels` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/library-global-summary` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/clean-runs` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/clean-runs/{id}` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/library/items` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/packages` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/packages/living` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/channel-scope` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/channel-scope/suggestions` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/task-settings` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/workspace/packages/{id}` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/clean/batches` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/clean/batches/{batchId}/events` | AdminAccessFusionBridgeController |  |
| GET | `/api/admin/twin/access-fusion/review-queue` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/rule-profiles` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/library/purge` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/workspace/execute-clean` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/workspace/preview` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/workspace/packages` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/workspace/clean-runs/{id}/rerun` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/door-rules` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/raw/backfill` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/clean/run` | AdminAccessFusionBridgeController |  |
| POST | `/api/admin/twin/access-fusion/review/{id}/confirm` | AdminAccessFusionBridgeController |  |
| ... | *12 more APIs* | | |
