# Cage Shelf Bookmark — Full Redesign

**Date:** 2026-06-03  
**Status:** Design Approved

## Context

The existing bookmark system (`student_cage_shelf_pin`) was broken at every layer: corrupted database table with missing unique key and duplicate rows, backend APIs that couldn't consistently toggle or read bookmarks, and a frontend that tried to compensate with localStorage hacks. This is a complete rewrite based on the existing weekly full-scan infrastructure.

## Design

### New Snapshot Table: `cage_shelf_cell_snapshot`

Each cage position gets its own row. A single shelf produces 80 rows. Indexed by `(room_id, shelve_id)` for fast lookup.

```sql
CREATE TABLE cage_shelf_cell_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scan_batch_id VARCHAR(32) NOT NULL,
    room_id BIGINT NOT NULL,
    shelve_id BIGINT NOT NULL,
    position_x INT NOT NULL,
    position_y INT NOT NULL,
    position_label VARCHAR(16) NOT NULL,
    animal_cage_type INT,
    cage_box_json TEXT COMMENT 'Full ARO cageBoxVo JSON',
    special_statuses_json TEXT COMMENT 'SpecialStatusEntry[] JSON',
    scanned_at DATETIME NOT NULL,
    INDEX idx_room_shelve_batch (room_id, shelve_id, scan_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### New Bookmark Table: `cage_shelf_bookmark`

Stores `(user_id, room_id, shelve_id)` as the unique bookmark coordinate.

```sql
CREATE TABLE cage_shelf_bookmark (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    room_id BIGINT NOT NULL,
    shelve_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_room_shelve (user_id, room_id, shelve_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### APIs

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/cage-shelves/{roomId}/{shelveId}/cells` | Single shelf: returns 80 cell rows |
| `GET` | `/api/cage-shelves/bookmarked?pairs=r1:s1,r2:s2` | Batch: returns cells for multiple shelves |
| `PUT` | `/api/cage-shelves/{roomId}/{shelveId}/bookmark` | Toggle bookmark (returns `{roomId, shelveId, isBookmarked}`) |
| `GET` | `/api/cage-shelves/bookmarks` | Current user's bookmarks list `[{roomId, shelveId, shelveName, campusName, ...}]` |

### Scan Integration

Extend `CageSpecialStatusScanService.executeFullScan()`: after fetching ARO data for each shelf, write ALL 80 cage positions to `cage_shelf_cell_snapshot` with the current `scan_batch_id`. Old batches are retained (purged after N weeks by a cleanup job).

### Frontend

- **Bookmark toggle**: `PUT /{roomId}/{shelveId}/bookmark` → response determines state; frontend updates local Set optimistically
- **Bookmark list**: `GET /bookmarks` returns `[{roomId, shelveId, ...}]` → render tag buttons
- **Bookmark detail**: select a bookmark → `GET /{roomId}/{shelveId}/cells` → render 8x10 grid
- **Filter tab shelf detail**: `GET /{roomId}/{shelveId}/cells` (same endpoint)

### Cleanup

- Remove `student_cage_shelf_pin` table and all related mapper code
- Remove `CageShelfBookmarkMapper` (unused new mapper from previous attempt)
- Remove all localStorage bookmark hacks from frontend
- Remove all `[CageShelf-Pin-*]`, `[DEBUG-IDS]`, `[RENDER-BOOKMARKS]` debug logs
- New logging uses `[CageShelf]` prefix at INFO level for key operations
