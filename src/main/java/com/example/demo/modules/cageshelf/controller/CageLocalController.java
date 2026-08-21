package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageCellHistory;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellHistoryMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.service.CageCellDetailService;
import com.example.demo.modules.cageshelf.service.OutboxService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * 本地业务接口 — 笼位分配/绑定/编辑操作，先写本地DB，异步投递ARO。
 */
@RestController
@RequestMapping("/api/local")
@Tag(name = "本地业务操作")
@Transactional
public class CageLocalController {

    private static final Logger log = LoggerFactory.getLogger(CageLocalController.class);

    private final AuthContextService authContextService;
    private final CageCellDetailService detailService;
    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper indexMapper;
    private final CageCellHistoryMapper historyMapper;
    private final OutboxService outboxService;
    private final JdbcTemplate jdbcTemplate;
    private final UserDisplayNameService userDisplayNameService;

    public CageLocalController(AuthContextService authContextService,
                               CageCellDetailService detailService,
                               CageCellDetailMapper detailMapper,
                               CageCellIndexMapper indexMapper,
                               CageCellHistoryMapper historyMapper,
                               OutboxService outboxService,
                               JdbcTemplate jdbcTemplate,
                               UserDisplayNameService userDisplayNameService) {
        this.authContextService = authContextService;
        this.detailService = detailService;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
        this.historyMapper = historyMapper;
        this.outboxService = outboxService;
        this.jdbcTemplate = jdbcTemplate;
        this.userDisplayNameService = userDisplayNameService;
    }

    private String operatorDisplayName(User u) {
        if (u == null || u.getId() == null) {
            return "unknown";
        }
        String name = userDisplayNameService.resolveDisplayName(u.getId());
        return (name != null && !name.isBlank()) ? name : u.getId();
    }

    /** 本地 AUP 注册计划号：aupId → aup_record.register_no（打通本地注册号与笼架）。 */
    private String resolveLocalRegisterNo(Long aupId) {
        if (aupId == null) return null;
        try {
            List<String> rows = jdbcTemplate.queryForList(
                    "SELECT register_no FROM aup_record WHERE id = ?", String.class, aupId);
            return rows.isEmpty() || rows.get(0) == null ? null : rows.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private User resolveUser(String auth) {
        User u = authContextService.resolveUserFromBearer(auth);
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }
    private Result<?> requireRole(User u, RoleEnum min) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole().getLevel() < min.getLevel()) return Result.error("无权限");
        return null;
    }

    // ═══════════════════════════════════════════
    // 绑定/解绑
    // ═══════════════════════════════════════════

    @PostMapping("/bind")
    @Operation(summary = "绑定笼盒 → 写本地 + 异步投递ARO")
    public Result<?> bind(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        String code = str(body, "cageBoxCode");
        if (animalCageId == null || code == null) return Result.fail(400, "animalCageId 和 cageBoxCode 必填");

        detailService.bindCageBox(animalCageId, code);
        String pos = buildPositionLabel(animalCageId);
        String summary = String.format("%s 绑定笼盒 %s → 笼位 %d %s", operatorDisplayName(u), code, animalCageId, pos);
        // 使用 canonical 命名（与 aro_field_mapping.json 对齐）
        outboxService.enqueue("cage_cell", String.valueOf(animalCageId), "bind",
                Map.of("animal_cage_id", animalCageId, "cage_box_code", code), "cageRelatedBox", summary);

        log.info("[local/bind] {}", summary);
        return Result.success(Map.of("ok", true, "local", true));
    }

    @PostMapping("/unbind")
    @Operation(summary = "解绑笼盒 → 写本地 + 异步投递ARO")
    public Result<?> unbind(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");

        detailService.unbindCageBox(animalCageId);
        String pos = buildPositionLabel(animalCageId);
        String summary = String.format("%s 解绑笼盒 → 笼位 %d %s", operatorDisplayName(u), animalCageId, pos);
        outboxService.enqueue("cage_cell", String.valueOf(animalCageId), "unbind",
                Map.of("animal_cage_id", animalCageId), "unbindCageBox", summary);

        log.info("[local/unbind] {}", summary);
        return Result.success(Map.of("ok", true, "local", true));
    }

    // ═══════════════════════════════════════════
    // 分配/取消
    // ═══════════════════════════════════════════

    @PostMapping("/allocate")
    @Operation(summary = "分配笼位 → 写本地 + 异步投递ARO")
    public Result<?> allocate(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.ADMIN);
        if (denied != null) return denied;

        Object idsObj = body.get("animalCageIds");
        if (!(idsObj instanceof List<?> list) || list.isEmpty())
            return Result.fail(400, "animalCageIds 必填");

        Long aupId = toLong(body.get("aupId"));
        Long roomId = toLong(body.get("roomId"));
        Long shelveId = toLong(body.get("shelveId"));
        String piName = str(body, "piName");
        String aupNumber = str(body, "aupNumber");
        // 优先用本地 AUP 注册计划号（打通本地 JUMC 号与笼架），回退 ARO aupNumber
        String localNo = resolveLocalRegisterNo(aupId);
        if (localNo != null && !localNo.isBlank()) {
            aupNumber = localNo;
        }

        // ① 本地DB逐笼更新（含PI姓名、AUP编号、院系）
        List<Long> cageIds = new ArrayList<>();
        for (Object id : list) {
            Long animalCageId = toLong(id);
            if (animalCageId == null) continue;
            detailService.allocate(animalCageId, piName, aupNumber);
            cageIds.add(animalCageId);
        }

        // ② 一条 outbox 批量推 ARO（bookCages 接口支持批量）
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("animalCageIds", cageIds);
        payload.put("aupId", aupId);
        payload.put("roomId", roomId);
        payload.put("shelveId", shelveId);
        String summary = String.format("%s 分配 %d 个笼位到 AUP %s", operatorDisplayName(u), cageIds.size(),
                aupId != null ? String.valueOf(aupId) : "?");
        outboxService.enqueue("cage_cell", String.valueOf(cageIds.size()) + "_cages", "allocate",
                payload, "cageBook", summary);

        log.info("[local/allocate] {}", summary);
        return Result.success(Map.of("ok", true, "count", cageIds.size(), "local", true));
    }

    @PostMapping("/cancel-allocate")
    @Operation(summary = "取消分配 → 写本地 + 异步投递ARO")
    public Result<?> cancelAllocate(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.ADMIN);
        if (denied != null) return denied;

        Object idsObj = body.get("animalCageIds");
        if (!(idsObj instanceof List<?> list) || list.isEmpty())
            return Result.fail(400, "animalCageIds 必填");

        // ① 本地DB逐笼更新
        List<Long> cageIds = new ArrayList<>();
        for (Object id : list) {
            Long animalCageId = toLong(id);
            if (animalCageId == null) continue;
            detailService.cancelAllocate(animalCageId);
            cageIds.add(animalCageId);
        }

        // ② 一条 outbox 批量推 ARO
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("animalCageIds", cageIds);
        String summary = String.format("%s 取消 %d 个笼位分配", operatorDisplayName(u), cageIds.size());
        outboxService.enqueue("cage_cell", String.valueOf(cageIds.size()) + "_cages", "cancel_allocate",
                payload, "cancelBook", summary);

        log.info("[local/cancel-allocate] {}", summary);
        return Result.success(Map.of("ok", true, "count", cageIds.size(), "local", true));
    }

    // ═══════════════════════════════════════════
    // 编辑（特殊状态标记）
    // ═══════════════════════════════════════════

    @PostMapping("/edit")
    @Operation(summary = "编辑笼位状态标记 → 写本地 + 异步投递ARO")
    public Result<?> edit(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        String toggle = str(body, "toggle");
        Boolean enable = body.get("enable") instanceof Boolean b ? b : "true".equals(str(body, "enable"));
        if (animalCageId == null || toggle == null)
            return Result.fail(400, "animalCageId 和 toggle 必填");

        detailService.toggleStatus(animalCageId, toggle, operatorDisplayName(u));
        String cageBoxCode = body.get("cageBoxCode") != null ? str(body, "cageBoxCode") : null;
        if (cageBoxCode == null || cageBoxCode.isEmpty()) {
            var detail = detailMapper.selectByAnimalCageId(animalCageId);
            cageBoxCode = detail != null ? detail.getCageBoxCode() : null;
        }

        // enable=true → 标记（add 接口）; enable=false → 取消（cancelColor 接口）
        String endpoint;
        Map<String, Object> payload = new LinkedHashMap<>();
        // 使用 canonical 命名（与 aro_field_mapping.json 对齐），同时保留 camelCase 兼容旧代码
        payload.put("animal_cage_id", animalCageId);
        payload.put("cage_box_code", cageBoxCode != null ? cageBoxCode : "");
        // 关键：将业务字段写入 payload，供 OutboxService 通过 CageFieldMappingService 翻译为 ARO 字段
        // e.g. "needs_division": true → mapping.applyPush("cageBoxAction") → {NeedDivideYn: 1}
        payload.put(toggle, Boolean.TRUE.equals(enable));

        if (Boolean.TRUE.equals(enable)) {
            // 仅 needs_division 走专用端点 cageBoxAction（其映射 target: NeedDivideYn）
            // needs_special_feeding / has_health_abnormality 走 updateAnimalCage
            // （映射分别有 needFeedingYn / abnormalHealthYn），避免空映射端点
            endpoint = switch (toggle) {
                case "needs_division" -> "cageBoxAction";
                default -> "updateAnimalCage";
            };
        } else {
            endpoint = "cancelColor";
            int color = switch (toggle) {
                case "needs_special_feeding" -> 1;
                case "needs_division" -> 2;
                case "has_health_abnormality" -> 3;
                default -> 0;
            };
            payload.put("color", color);
        }
        String toggleLabel = switch (toggle) {
            case "needs_division" -> "需分笼";
            case "needs_special_feeding" -> "需特殊饲养";
            case "has_health_abnormality" -> "健康异常";
            case "needs_transfer" -> "动物转移";
            default -> toggle;
        };
        String action = Boolean.TRUE.equals(enable) ? "标记" : "取消";
        String pos = buildPositionLabel(animalCageId);
        String summary = String.format("%s %s [%s] → 笼位 %d %s", operatorDisplayName(u), action, toggleLabel, animalCageId, pos);
        outboxService.enqueue("cage_cell", String.valueOf(animalCageId), "edit", payload, endpoint, summary);

        log.info("[local/edit] {}", summary);
        return Result.success(Map.of("ok", true, "local", true));
    }

    // ═══════════════════════════════════════════
    // 实验记录 & 照片
    // ═══════════════════════════════════════════

    @GetMapping("/annotate/{animalCageId}")
    @Operation(summary = "读取笼位实验记录和照片")
    public Result<?> getAnnotate(@PathVariable Long animalCageId, HttpServletRequest req) {
        if (resolveUser(req.getHeader("Authorization")) == null) return Result.fail(401, "未登录");
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) return Result.success(Map.of("experimentDesc", "", "imagesJson", "[]", "statusPhotos", "{}"));
        return Result.success(Map.of(
            "experimentDesc", d.getExperimentDesc() != null ? d.getExperimentDesc() : "",
            "imagesJson", d.getImagesJson() != null ? d.getImagesJson() : "[]",
            "statusPhotos", d.getExtraData() != null ? d.getExtraData() : "{}"
        ));
    }

    @PostMapping("/annotate")
    @Operation(summary = "写入笼位实验记录和照片")
    public Result<?> annotate(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.MEMBER);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");

        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) {
            d = new CageCellDetail();
            d.setAnimalCageId(animalCageId);
        }
        if (body.containsKey("experimentDesc")) d.setExperimentDesc(str(body, "experimentDesc"));
        if (body.containsKey("imagesJson")) d.setImagesJson(str(body, "imagesJson"));
        if (body.containsKey("statusPhotos")) {
            // 特殊状态照片仅教职工（STAFF+）可写，学生只能写实验记录/照片
            if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.STAFF.getLevel()) {
                d.setExtraData(str(body, "statusPhotos"));
            }
        }
        detailMapper.batchUpsert(List.of(d));

        // 同时写入历史归档（标注类操作，statusField="_annotation"）
        CageCellHistory h = new CageCellHistory();
        h.setAnimalCageId(animalCageId);
        h.setStatusField("_annotation");
        h.setImagesJson(d.getImagesJson());
        h.setExperimentDesc(d.getExperimentDesc());
        h.setToggledBy(operatorDisplayName(u));
        h.setAction("annotated");
        historyMapper.insert(h);

        log.info("[local/annotate] user={} animalCageId={}", operatorDisplayName(u), animalCageId);
        return Result.success(Map.of("ok", true));
    }

    // ═══════════════════════════════════════════
    // 图片笔记历史归档
    // ═══════════════════════════════════════════

    @GetMapping("/history/{animalCageId}")
    @Operation(summary = "读取笼位图片笔记归档历史")
    public Result<?> getHistory(@PathVariable Long animalCageId, HttpServletRequest req) {
        if (resolveUser(req.getHeader("Authorization")) == null) return Result.fail(401, "未登录");
        List<CageCellHistory> list = historyMapper.selectByAnimalCageId(animalCageId);
        return Result.success(list);
    }

    @DeleteMapping("/history/{id}")
    @Operation(summary = "删除单条归档历史记录")
    public Result<?> deleteHistory(@PathVariable Long id, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;
        int affected = historyMapper.deleteById(id);
        return affected > 0 ? Result.success("已删除") : Result.fail(404, "记录不存在");
    }

    // ═══════════════════════════════════════════
    // 本地扫码检索
    // ═══════════════════════════════════════════

    @GetMapping("/scan-lookup")
    @Operation(summary = "本地DB扫码检索：先查 cage_box_code，再查 animal_cage_id")
    public Result<?> scanLookup(@RequestParam String code, HttpServletRequest req) {
        if (resolveUser(req.getHeader("Authorization")) == null) return Result.fail(401, "未登录");
        if (code == null || code.isBlank()) return Result.fail(400, "code 不能为空");
        String q = code.trim();

        // ① 查 cage_box_code
        CageCellDetail d = detailMapper.selectByCageBoxCode(q);
        if (d != null) {
            Map<String, Object> pos = indexMapper.selectByAnimalCageId(d.getAnimalCageId());
            return Result.success(buildScanResult(d.getAnimalCageId(), q, pos, "CAGE_BOX"));
        }

        // ② 尝试作为 animalCageId 数字检索
        try {
            Long aid = Long.parseLong(q);
            Map<String, Object> pos = indexMapper.selectByAnimalCageId(aid);
            if (pos != null) {
                return Result.success(buildScanResult(aid, q, pos, "CAGE_ID"));
            }
        } catch (NumberFormatException ignored) {}

        return Result.success(Map.of("type", "NOT_FOUND", "message", "未找到对应笼位: " + q));
    }

    private Map<String, Object> buildScanResult(Long animalCageId, String code, Map<String, Object> pos, String type) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("type", type);
        r.put("animalCageId", animalCageId);
        r.put("code", code);
        if (pos != null) {
            r.put("roomId", pos.get("roomId"));
            r.put("roomName", pos.get("room_name"));
            // shelf_index_id = cage_shelf_index.id (主键)，后端用 findById 直接加载
            Object sid = pos.get("shelf_index_id");
            if (sid == null) sid = pos.get("shelve_id");
            r.put("shelveId", sid);
            r.put("shelveName", pos.get("shelve_name"));
            r.put("positionX", pos.get("position_x"));
            r.put("positionY", pos.get("position_y"));
        }
        return r;
    }

    // ═══════════════════════════════════════════
    // helpers
    // ═══════════════════════════════════════════

    /** 根据 animalCageId 查出位置信息，生成可读的位置标签 */
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
            log.warn("[local] buildPositionLabel 查询失败 animalCageId={}: {}", animalCageId, e.getMessage());
        }
        return "";
    }

    private static int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return 0; }
    }

    private static String str(Map<String, Object> m, String k) { Object v = m.get(k); return v == null ? null : String.valueOf(v).trim(); }
    private static Long toLong(Object v) {
        if (v == null) return null; if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
}
