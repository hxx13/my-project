# cageshelf

## 模块结构

```mermaid
mindmap
  root((cageshelf))
    CageShelfController
      GET /api/v1/cage-shelves/filter-options
      GET /api/v1/cage-shelves/{shelveId}/detail
      GET /api/v1/cage-shelves/{shelveId}/cells/{x}/{y}/refresh
      GET /api/v1/cage-shelves/scan-progress
      GET /api/v1/cage-shelves/special-status-overview
      GET /api/v1/cage-shelves/indexes
      ... +6 more
    CageShelfDataController
      GET /api/cage-shelves/{roomId}/{shelveId}/cells
      GET /api/cage-shelves/cells/batch
      GET /api/cage-shelves/bookmarks
      PUT /api/cage-shelves/{roomId}/{shelveId}/bookmark
    CageEventDiffService
      → CageSpecialStatusSnapshotMapper
      → CageEventLogMapper
    CageScanProgressService
    CageShelfService
      → CageShelfMapper
      → CageSpecialStatusSnapshotMapper
      → CageShelfGridCacheMapper
      → CageCellAnnotationMapper
    CageSpecialStatusScanService
      → AroService
      → CageShelfMapper
      → CageSpecialStatusSnapshotMapper
      → CageScanProgressService
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/cage-shelves/filter-options` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/{shelveId}/detail` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/{shelveId}/cells/{x}/{y}/refresh` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/scan-progress` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/special-status-overview` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/indexes` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/user-colors` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/event-logs` | CageShelfController |  |
| GET | `/api/v1/cage-shelves/event-logs/timeline/{cageBoxQrCode}` | CageShelfController |  |
| POST | `/api/v1/cage-shelves/import` | CageShelfController |  |
| POST | `/api/v1/cage-shelves/{shelveId}/refresh` | CageShelfController |  |
| POST | `/api/v1/cage-shelves/user-colors` | CageShelfController |  |
| GET | `/api/cage-shelves/{roomId}/{shelveId}/cells` | CageShelfDataController |  |
| GET | `/api/cage-shelves/cells/batch` | CageShelfDataController |  |
| GET | `/api/cage-shelves/bookmarks` | CageShelfDataController |  |
| PUT | `/api/cage-shelves/{roomId}/{shelveId}/bookmark` | CageShelfDataController |  |
