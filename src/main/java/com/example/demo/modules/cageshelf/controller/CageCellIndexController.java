package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageCellIndex;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.service.CageCellIndexService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/api/cage-cell-index")
@Tag(name = "笼位ID索引")
public class CageCellIndexController {

    private static final Logger log = LoggerFactory.getLogger(CageCellIndexController.class);

    private final AuthContextService authContextService;
    private final CageCellIndexService cellIndexService;
    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper indexMapper;
    private final com.example.demo.modules.cageshelf.service.OutboxService outboxService;
    private final com.example.demo.modules.cageshelf.service.CageCellDetailService detailService;
    private final StudentCageShelfService studentCageShelfService;

    public CageCellIndexController(AuthContextService authContextService,
                                   CageCellIndexService cellIndexService,
                                   CageCellDetailMapper detailMapper,
                                   CageCellIndexMapper indexMapper,
                                   com.example.demo.modules.cageshelf.service.OutboxService outboxService,
                                   com.example.demo.modules.cageshelf.service.CageCellDetailService detailService,
                                   StudentCageShelfService studentCageShelfService) {
        this.authContextService = authContextService;
        this.cellIndexService = cellIndexService;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
        this.outboxService = outboxService;
        this.detailService = detailService;
        this.studentCageShelfService = studentCageShelfService;
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.MEMBER);
        return user;
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) return Result.error("未登录或Token无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        if (user.getRole().getLevel() < minRole.getLevel()) return Result.error("无权限访问");
        return null;
    }

    /** 非 admin 用户对本地 DB 网格按课题组脱敏（复用 StudentCageShelfService.maskGridForUser）。 */
    private void applyGroupMask(User user, Map<String, Object> result) {
        if (user == null || user.getRole() == null || user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) {
            return;
        }
        Object gridObj = result.get("grid");
        if (gridObj instanceof List<?> list) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> grid = (List<Map<String, Object>>) list;
            result.put("grid", studentCageShelfService.maskGridForUser(user, grid));
        }
    }

    // ── 架子汇总列表 ──

    @GetMapping("/summary")
    @Operation(summary = "笼位索引架子汇总（分页，含 syncedCells/totalCells 统计）")
    public Result<Map<String, Object>> summary(
            @RequestParam(required = false) Long roomId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "30") int pageSize,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Map<String, Object> data = cellIndexService.shelfCellSummary(roomId, keyword, page, pageSize);
        return Result.success(data);
    }

    // ── 单个架子的 80 格笼位 ──

    @GetMapping("/shelf/{shelfIndexId}/cells")
    @Operation(summary = "查单个架子的全部笼位ID索引")
    public Result<List<CageCellIndex>> cellsByShelf(
            @PathVariable Long shelfIndexId,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());
        List<CageCellIndex> cells = cellIndexService.getCellsByShelfIndexId(shelfIndexId);
        return Result.success(cells);
    }

    // ── 全量同步 ──

    @PostMapping("/sync")
    @Operation(summary = "从ARO全量拉取所有笼架笼位ID并入库")
    public Result<Map<String, Object>> sync(
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long roomId = body != null ? toLong(body.get("roomId")) : null;
        log.info("[cell-sync] 管理员 {} 触发笼位ID全量同步 roomId={}", user.getId(), roomId);
        Map<String, Object> stats = cellIndexService.syncAllCells(roomId);
        return Result.success(stats);
    }

    // ── 详情补全同步 ──

    @PostMapping("/sync-details")
    @Operation(summary = "从ARO /{id} 详情接口补全动物品系/性别/周龄/实验员等字段")
    public Result<Map<String, Object>> syncDetails(
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long roomId = body != null ? toLong(body.get("roomId")) : null;
        log.info("[detail-sync] 管理员 {} 触发详情补全 roomId={}", user.getId(), roomId);
        Map<String, Object> stats = cellIndexService.syncDetailFields(roomId);
        return Result.success(stats);
    }

    // ── 独立 /book 状态同步（不删ID，只更新状态字段）──

    @PostMapping("/sync-status")
    @Operation(summary = "从ARO /book 接口独立同步笼位状态（cageType/state/rentType），不删ID索引")
    public Result<Map<String, Object>> syncStatus(
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long roomId = body != null ? toLong(body.get("roomId")) : null;
        log.info("[book-sync] 管理员 {} 触发独立状态同步 roomId={}", user.getId(), roomId);
        Map<String, Object> stats = cellIndexService.syncStatusFromBook(roomId);
        return Result.success(stats);
    }

    // ── 本地写入（先写DB，异步投递ARO）──

    @PostMapping("/local-action")
    @Operation(summary = "本地操作：先写cage_cell_detail，入队outbox异步推ARO")
    public Result<Map<String, Object>> localAction(@RequestBody Map<String, Object> body,
                                                    HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());

        String action = str(body, "action"); // DIVIDE / SPECIAL_BREEDING / HEALTH_CHECK / BIND / UNBIND
        Long animalCageId = toLong(body.get("animalCageId"));
        String cageBoxCode = str(body, "cageBoxCode");
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");
        if (action == null || action.isBlank()) return Result.fail(400, "action 必填");

        // ① 本地业务服务处理
        String aroEndpoint;
        Map<String, Object> outboxPayload = new LinkedHashMap<>();
        // 使用 canonical 命名（与 aro_field_mapping.json 对齐）
        outboxPayload.put("animal_cage_id", animalCageId);

        switch (action.toUpperCase()) {
            case "DIVIDE" -> {
                detailService.toggleStatus(animalCageId, "needs_division");
                aroEndpoint = "updateAnimalCage";
            }
            case "SPECIAL_BREEDING" -> {
                detailService.toggleStatus(animalCageId, "needs_special_feeding");
                aroEndpoint = "updateAnimalCage";
            }
            case "HEALTH_CHECK" -> {
                detailService.toggleStatus(animalCageId, "has_health_abnormality");
                aroEndpoint = "updateAnimalCage";
            }
            case "BIND" -> {
                if (cageBoxCode == null || cageBoxCode.isBlank())
                    return Result.fail(400, "BIND 操作需要 cageBoxCode");
                detailService.bindCageBox(animalCageId, cageBoxCode);
                aroEndpoint = "cageRelatedBox";
                outboxPayload.put("cage_box_code", cageBoxCode);
            }
            case "UNBIND" -> {
                detailService.unbindCageBox(animalCageId);
                aroEndpoint = "unbindCageBox";
            }
            case "ALLOCATE" -> {
                detailService.allocate(animalCageId);
                aroEndpoint = "cageBook";
                // 从 cage_cell_index 解析 roomId/shelveId，补全投递所需字段
                var idx = indexMapper.selectByAnimalCageId(animalCageId);
                if (idx != null) {
                    outboxPayload.put("roomId", toLong(idx.get("roomId")));
                    outboxPayload.put("shelveId", toLong(idx.get("shelve_id")));
                }
                Long aupId = toLong(body.get("aupId"));
                if (aupId != null) outboxPayload.put("aupId", aupId);
                outboxPayload.put("animalCageIds", java.util.List.of(animalCageId));
            }
            case "CANCEL_ALLOCATE" -> {
                detailService.cancelAllocate(animalCageId);
                aroEndpoint = "cancelBook";
                outboxPayload.put("animalCageIds", java.util.List.of(animalCageId));
            }
            default -> { return Result.fail(400, "未支持: " + action); }
        }

        // ② 入队 Outbox
        String operatorName = user.getUsername() != null ? user.getUsername() : String.valueOf(user.getId());
        String pos = buildPositionLabel(animalCageId);
        String summary = String.format("%s %s → 笼位 %d %s", operatorName, action, animalCageId, pos);
        outboxService.enqueue("cage_cell", String.valueOf(animalCageId),
                "cell_updated", outboxPayload, aroEndpoint, summary);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("animalCageId", animalCageId);
        result.put("action", action);
        result.put("local", true);
        result.put("syncedToAro", false); // 异步，稍后投递
        log.info("[local-action] {}", summary);
        return Result.success(result);
    }

    // ── Outbox 投递状态 ──

    @GetMapping("/outbox-stats")
    @Operation(summary = "Outbox投递统计+最近记录")
    public Result<Map<String, Object>> outboxStats(HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(outboxService.stats());
    }

    // ── 单笼位编辑 ──

    @PutMapping("/cell")
    @Operation(summary = "手动修改单个笼位的 animalCageId")
    public Result<Map<String, Object>> updateCell(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long shelfIndexId = toLong(body.get("shelfIndexId"));
        Integer x = toInt(body.get("positionX"));
        Integer y = toInt(body.get("positionY"));
        Long animalCageId = toLong(body.get("animalCageId"));

        if (shelfIndexId == null || x == null || y == null) {
            return Result.fail(400, "shelfIndexId, positionX, positionY 必填");
        }
        boolean ok = cellIndexService.updateCell(shelfIndexId, x, y, animalCageId);
        return ok ? Result.success(Map.of("ok", true))
                : Result.fail(404, "未找到该笼位或未变更");
    }

    // ── 全局反查：animalCageId → 架子+坐标 ──

    @GetMapping("/lookup")
    @Operation(summary = "根据 animalCageId 反查所属架子、坐标、位置路径")
    public Result<Map<String, Object>> lookup(
            @RequestParam Long animalCageId,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Map<String, Object> result = cellIndexService.lookupByAnimalCageId(animalCageId);
        if (result == null || result.isEmpty()) {
            return Result.error("未找到该 animalCageId: " + animalCageId);
        }
        return Result.success(result);
    }

    // ── 笼位详情查询 ──

    @GetMapping("/detail/{animalCageId}")
    @Operation(summary = "根据 animalCageId 查笼位完整详情（类型/状态/PI/AUP/特殊状态/动物信息）")
    public Result<Map<String, Object>> detail(
            @PathVariable Long animalCageId,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());

        CageCellDetail detail = detailMapper.selectByAnimalCageId(animalCageId);
        if (detail == null) return Result.error("未找到该笼位详情: " + animalCageId);
        // 非 admin 按课题组脱敏（PI/部门/AUP/实验员等敏感字段）
        detail = studentCageShelfService.maskDetailForUser(user, detail);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("detail", detail);
        result.put("position", cellIndexService.lookupByAnimalCageId(animalCageId));
        return Result.success(result);
    }

    // ── 本地数据源：笼架网格（对齐 ARO 格式，支持 shelveId 或 shelfIndexId）──

    @GetMapping("/shelf/{shelfIndexId}/local-grid")
    @Operation(summary = "从本地DB加载笼架网格（格式对齐CageShelfDetail，用于本地数据源切换）")
    public Result<Map<String, Object>> localGrid(
            @PathVariable Long shelfIndexId,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Map<String, Object> grid = cellIndexService.getLocalShelfGrid(shelfIndexId);
        if (grid.containsKey("error")) return Result.error(String.valueOf(grid.get("error")));
        applyGroupMask(user, grid);
        return Result.success(grid);
    }

    @GetMapping("/local-grid/by-shelve/{shelveId}")
    @Operation(summary = "通过 shelveId 从本地DB加载笼架网格")
    public Result<Map<String, Object>> localGridByShelveId(
            @PathVariable Long shelveId,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Map<String, Object> grid = cellIndexService.getLocalShelfGridByShelveId(shelveId);
        if (grid.containsKey("error")) return Result.error(String.valueOf(grid.get("error")));
        applyGroupMask(user, grid);
        return Result.success(grid);
    }

    // ── 按架子查详情列表 ──

    @GetMapping("/shelf/{shelfIndexId}/details")
    @Operation(summary = "查单个架子的全部笼位详情（含位置JOIN）")
    public Result<List<CageCellDetail>> detailsByShelf(
            @PathVariable Long shelfIndexId,
            HttpServletRequest request) {
        User user = resolveUser(request.getHeader("Authorization"));
        Result<?> denied = requireMinRole(user, RoleEnum.MEMBER);
        if (denied != null) return Result.fail(403, denied.getMessage());
        List<CageCellDetail> details = detailMapper.selectByShelfIndexId(shelfIndexId);
        // 非 admin 按课题组脱敏
        if (user.getRole() != null && user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) {
            details = details.stream()
                    .map(d -> studentCageShelfService.maskDetailForUser(user, d))
                    .toList();
        }
        return Result.success(details);
    }

    // ── helpers ──

    private String buildPositionLabel(Long animalCageId) {
        try {
            Map<String, Object> idx = indexMapper.selectByAnimalCageId(animalCageId);
            if (idx != null) {
                String room = String.valueOf(idx.getOrDefault("room_name", "?"));
                String shelf = String.valueOf(idx.getOrDefault("shelve_name", "?"));
                int x = toInt(idx.get("position_x"));
                int y = toInt(idx.get("position_y"));
                return String.format("(%s/%s %d,%d)", room, shelf, x, y);
            }
        } catch (Exception e) {
            log.warn("[cell-index] buildPositionLabel 查询失败 animalCageId={}: {}", animalCageId, e.getMessage());
        }
        return "";
    }

    private static String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v == null ? null : String.valueOf(v).trim();
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }
}
