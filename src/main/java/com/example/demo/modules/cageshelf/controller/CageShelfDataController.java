package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.mapper.CageShelfBookmarkMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfRoomBookmarkMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfCellSnapshotMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import com.example.demo.modules.cageshelf.service.CageShelfLocalAggCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/api/cage-shelves")
public class CageShelfDataController {

    private static final Logger log = LoggerFactory.getLogger(CageShelfDataController.class);

    private final AuthContextService auth;
    private final CageShelfCellSnapshotMapper cellMapper;
    private final CageShelfBookmarkMapper bookmarkMapper;
    private final CageShelfRoomBookmarkMapper roomBookmarkMapper;
    private final CageShelfMapper shelfMapper;
    private final CageSpecialStatusSnapshotMapper snapshotMapper;
    private final CageShelfLocalAggCache localAggCache;

    public CageShelfDataController(AuthContextService auth,
                                    CageShelfCellSnapshotMapper cellMapper,
                                    CageShelfBookmarkMapper bookmarkMapper,
                                    CageShelfRoomBookmarkMapper roomBookmarkMapper,
                                    CageShelfMapper shelfMapper,
                                    CageSpecialStatusSnapshotMapper snapshotMapper,
                                    CageShelfLocalAggCache localAggCache) {
        this.auth = auth;
        this.cellMapper = cellMapper;
        this.bookmarkMapper = bookmarkMapper;
        this.roomBookmarkMapper = roomBookmarkMapper;
        this.shelfMapper = shelfMapper;
        this.snapshotMapper = snapshotMapper;
        this.localAggCache = localAggCache;
    }

    // ── Cell snapshot ──────────────────────────────────────────────

    /** GET /api/cage-shelves/{roomId}/{shelveId}/cells — 单个笼架的80个笼位快照 */
    @GetMapping("/{roomId}/{shelveId}/cells")
    public Result<?> getCells(@PathVariable Long roomId, @PathVariable Long shelveId, HttpServletRequest request) {
        if (resolveUser(request) == null) return Result.fail(401, "未登录");
        log.info("[CageShelf] GET cells roomId={} shelveId={}", roomId, shelveId);
        List<Map<String, Object>> cells = cellMapper.selectLatestByRoomAndShelve(roomId, shelveId);
        if (cells.isEmpty()) {
            // Return empty 8x10 template so frontend can render positions
            return Result.success(buildEmptyGrid(roomId, shelveId));
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("roomId", String.valueOf(roomId));
        resp.put("shelveId", String.valueOf(shelveId));
        resp.put("cells", cells);
        return Result.success(resp);
    }

    /** GET /api/cage-shelves/cells/batch?pairs=1:2,3:4 — 批量查多个笼架 */
    @GetMapping("/cells/batch")
    public Result<?> getCellsBatch(@RequestParam String pairs, HttpServletRequest request) {
        if (resolveUser(request) == null) return Result.fail(401, "未登录");
        log.info("[CageShelf] GET cells/batch pairs={}", pairs);
        List<Map<String, Object>> pairList = new ArrayList<>();
        for (String p : pairs.split(",")) {
            String[] parts = p.trim().split(":");
            if (parts.length == 2) {
                Map<String, Object> map = new HashMap<>();
                map.put("roomId", Long.parseLong(parts[0].trim()));
                map.put("shelveId", Long.parseLong(parts[1].trim()));
                pairList.add(map);
            }
        }
        if (pairList.isEmpty()) return Result.success(Collections.emptyList());
        List<Map<String, Object>> cells = cellMapper.selectLatestByPairs(pairList);
        return Result.success(groupByShelf(cells));
    }

    /** GET /api/cage-shelves/full-tree — 全量校区→区域→楼层→房间→笼架树，前端一次拉取无需级联 */
    @GetMapping("/full-tree")
    public Result<?> getFullTree(HttpServletRequest request) {
        if (resolveUser(request) == null) return Result.fail(401, "未登录");
        List<Map<String, Object>> rows = localAggCache.typeCounts();
        return Result.success(rows == null ? List.of() : rows);
    }

    /** GET /api/cage-shelves/snapshot-batches — 列出所有扫描批次（快照数据源列表） */
    @GetMapping("/snapshot-batches")
    public Result<?> getSnapshotBatches(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        if (user.getRole() == null || user.getRole().getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.fail(403, "无权限");
        }
        snapshotMapper.ensureTable();
        List<Map<String, Object>> rows = snapshotMapper.selectBatchList();
        return Result.success(rows == null ? List.of() : rows);
    }

    // ── Bookmark ───────────────────────────────────────────────────

    /** PUT /api/cage-shelves/{roomId}/{shelveId}/bookmark — 切换收藏 */
    @PutMapping("/{roomId}/{shelveId}/bookmark")
    @Transactional
    public Result<?> toggleBookmark(HttpServletRequest request,
                                     @PathVariable Long roomId,
                                     @PathVariable Long shelveId) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        log.info("[CageShelf] BOOKMARK toggle userId={} roomId={} shelveId={}", user.getId(), roomId, shelveId);
        int deleted = bookmarkMapper.delete(user.getId(), roomId, shelveId);
        if (deleted == 0) {
            bookmarkMapper.insert(user.getId(), roomId, shelveId);
        }
        boolean bookmarked = bookmarkMapper.countByUserRoomShelve(user.getId(), roomId, shelveId) > 0;
        Map<String, Object> bm = new LinkedHashMap<>();
        bm.put("roomId", String.valueOf(roomId));
        bm.put("shelveId", String.valueOf(shelveId));
        bm.put("bookmarked", bookmarked);
        return Result.success(bm);
    }

    /** GET /api/cage-shelves/bookmarks — 当前用户收藏列表 */
    @GetMapping("/bookmarks")
    public Result<?> getBookmarks(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        log.info("[CageShelf] BOOKMARKS list userId={}", user.getId());
        List<Map<String, Object>> rows = bookmarkMapper.selectByUserId(user.getId());
        // Enrich with shelf index metadata
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Long sid = toLong(row.get("shelveId"));
            Long rid = toLong(row.get("roomId"));
            CageShelfIndex idx = (sid != null) ? shelfMapper.findByShelveId(String.valueOf(sid)) : null;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("roomId", rid != null ? String.valueOf(rid) : "");
            item.put("shelveId", sid != null ? String.valueOf(sid) : "");
            item.put("shelveName", idx != null ? idx.getShelveName() : String.valueOf(sid));
            item.put("campusName", idx != null ? idx.getCampusName() : "");
            item.put("roomName", idx != null ? idx.getRoomName() : "");
            item.put("createdAt", row.get("createdAt"));
            result.add(item);
        }
        return Result.success(result);
    }

    // ── Room bookmark ──────────────────────────────────────────────
    // 2026-09-19 起笼架信息页左侧树只收藏**房间**（笼架粒度实用性不强）：房间名后面那枚星标走这两个口。
    // 上面那对笼架级接口与其表保留只读，不再由界面写入。

    /** PUT /api/cage-shelves/rooms/{roomId}/bookmark — 切换房间收藏 */
    @PutMapping("/rooms/{roomId}/bookmark")
    @Transactional
    public Result<?> toggleRoomBookmark(HttpServletRequest request, @PathVariable Long roomId) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        boolean bookmarked;
        int deleted = roomBookmarkMapper.delete(user.getId(), roomId);
        if (deleted > 0) {
            bookmarked = false;
        } else {
            roomBookmarkMapper.insert(user.getId(), roomId);
            bookmarked = true;
        }
        log.info("[CageShelf] ROOM BOOKMARK toggle userId={} roomId={} bookmarked={}", user.getId(), roomId, bookmarked);
        Map<String, Object> bm = new LinkedHashMap<>();
        bm.put("roomId", String.valueOf(roomId));
        bm.put("bookmarked", bookmarked);
        return Result.success(bm);
    }

    /**
     * GET /api/cage-shelves/room-bookmarks — 当前用户收藏过的房间 id 列表。
     *
     * <p>只给 id：房间名/校区/楼层前端从自己那棵全量树里取（那边本来就有，且能跟可见范围对齐），
     * 后端再查一遍 cage_shelf_index 拼名字纯属重复。
     */
    @GetMapping("/room-bookmarks")
    public Result<?> getRoomBookmarks(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        List<String> ids = new ArrayList<>();
        for (Long id : roomBookmarkMapper.selectRoomIdsByUserId(user.getId())) {
            if (id != null) ids.add(String.valueOf(id));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("roomIds", ids);
        return Result.success(data);
    }

    // ── Helpers ────────────────────────────────────────────────────

    private User resolveUser(HttpServletRequest request) {
        return auth.resolveUserFromBearer(request.getHeader("Authorization"));
    }

    private Map<String, Object> buildEmptyGrid(Long roomId, Long shelveId) {
        List<Map<String, Object>> cells = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                Map<String, Object> cell = new LinkedHashMap<>();
                cell.put("roomId", roomId);
                cell.put("shelveId", shelveId);
                cell.put("positionX", x);
                cell.put("positionY", y);
                cell.put("positionLabel", (char)('A' + x - 1) + "-" + y);
                cell.put("empty", true);
                cells.add(cell);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("roomId", String.valueOf(roomId));
        result.put("shelveId", String.valueOf(shelveId));
        result.put("cells", cells);
        result.put("isEmpty", true);
        return result;
    }

    private List<Map<String, Object>> groupByShelf(List<Map<String, Object>> flatCells) {
        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> cell : flatCells) {
            String key = cell.get("roomId") + ":" + cell.get("shelveId");
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(cell);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (var entry : grouped.entrySet()) {
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("key", entry.getKey());
            group.put("cells", entry.getValue());
            result.add(group);
        }
        return result;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); }
        catch (Exception e) { return null; }
    }
}
