package com.example.demo.modules.aro.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * 笼盒扫码操作 — 统一入口。
 *
 * 调用前提：用户已进入具体笼架页面（拿到了 roomId + shelveId）。
 * 扫码流程：
 *   笼架页 → 已知 {roomId, shelveId}
 *   扫笼盒码 → cageBoxCode
 *   POST /api/aro/cage-box/action { roomId, shelveId, cageBoxCode, action, ... }
 *     → /back?roomId&shelveId → 匹配 cageBoxCode → 得 cageBoxId + animalCageId
 *     → 调 ARO 业务 API
 */
@RestController
@RequestMapping("/api/aro/cage-box")
@Tag(name = "笼盒扫码操作")
public class CageBoxActionController {

    private static final Logger log = LoggerFactory.getLogger(CageBoxActionController.class);

    private final AuthContextService authContextService;
    private final AroService aroService;
    private final CageShelfService cageShelfService;

    public CageBoxActionController(AuthContextService authContextService,
                                   AroService aroService,
                                   CageShelfService cageShelfService) {
        this.authContextService = authContextService;
        this.aroService = aroService;
        this.cageShelfService = cageShelfService;
    }

    @PostMapping("/action")
    @Operation(summary = "扫码笼盒后执行业务操作（请分笼/特殊饲养/健康检查）")
    public Result<Map<String, Object>> action(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");

        // ── 必填：笼架上下文 + 扫码结果 ──
        String roomIdStr = str(body, "roomId");
        String shelveIdStr = str(body, "shelveId");
        String cageBoxCode = str(body, "cageBoxCode");
        if (anyBlank(roomIdStr, shelveIdStr, cageBoxCode))
            return Result.fail(400, "roomId, shelveId, cageBoxCode 均为必填");

        Long roomId = toLong(roomIdStr);
        Long shelveId = toLong(shelveIdStr);
        if (roomId == null || shelveId == null)
            return Result.fail(400, "roomId/shelveId 格式错误");

        // ── 动作 ──
        String actionStr = str(body, "action");
        if (actionStr == null || actionStr.isBlank())
            return Result.fail(400, "action 不能为空 (DIVIDE / SPECIAL_BREEDING / HEALTH_CHECK)");

        Action action;
        try { action = Action.valueOf(actionStr.toUpperCase()); }
        catch (IllegalArgumentException e) { return Result.fail(400, "无效 action: " + actionStr); }

        // ── 单笼架 O(1) 检索：roomId + shelveId 已确定 → /back 一次命中 ──
        Map<String, Long> ids = aroService.resolveCageBoxIds(roomId, shelveId, cageBoxCode);
        if (ids.isEmpty()) return Result.error("在指定笼架未找到笼盒 " + cageBoxCode);

        Long cageBoxId = ids.get("cageBoxId");
        Long animalCageId = ids.get("animalCageId");

        // ── 执行业务操作 ──
        boolean ok;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cageBoxCode", cageBoxCode);
        result.put("cageBoxId", String.valueOf(cageBoxId));
        result.put("animalCageId", String.valueOf(animalCageId));
        result.put("action", action.name());

        switch (action) {
            case DIVIDE -> {
                ok = aroService.saveAnimalCageBoxPart(animalCageId, cageBoxId);
            }
            case SPECIAL_BREEDING -> {
                ok = aroService.saveSpecialBreeding(cageBoxId,
                        str(body, "specialBreedingName"),
                        str(body, "specialBreedingDescription"));
            }
            case HEALTH_CHECK -> {
                ok = aroService.saveAnimalHealth(cageBoxId,
                        intOrNull(body, "animalHealthDegree"),
                        str(body, "healthDetail"),
                        intOrNull(body, "itching"),
                        str(body, "reportUserName"),
                        str(body, "observeDate"));
            }
            default -> { return Result.fail(400, "未支持: " + action); }
        }

        result.put("success", ok);
        log.info("[cage-box-action] user={} roomId={} shelveId={} action={} cageBoxCode={} → cageBoxId={} ok={}",
                user.getId(), roomId, shelveId, action, cageBoxCode, cageBoxId, ok);
        return Result.success(result);
    }

    // ── 笼盒关联笼位（2026-07-30 新增）──

    @PostMapping("/bind")
    @Operation(summary = "扫码后将笼盒关联到指定笼位，成功后刷新房间缓存")
    public Result<Map<String, Object>> bind(@RequestBody Map<String, Object> body,
                                            HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");

        String animalCageIdStr = str(body, "animalCageId");
        String cageBoxCode = str(body, "cageBoxCode");
        if (anyBlank(animalCageIdStr, cageBoxCode))
            return Result.fail(400, "animalCageId, cageBoxCode 均为必填");

        Long animalCageId = toLong(animalCageIdStr);
        if (animalCageId == null) return Result.fail(400, "animalCageId 格式错误");

        Long roomId = toLong(str(body, "roomId"));

        boolean ok = aroService.saveCageRelatedBox(animalCageId, cageBoxCode);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("animalCageId", animalCageId);
        result.put("cageBoxCode", cageBoxCode);
        result.put("success", ok);
        log.info("[cage-box-bind] user={} animalCageId={} cageBoxCode={} roomId={} ok={}",
                user.getId(), animalCageId, cageBoxCode, roomId, ok);
        if (ok) {
            // 异步刷新缓存，不阻塞响应
            if (roomId != null) {
                final Long rid = roomId;
                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        cageShelfService.forceRefreshAfterMutation(rid);
                        log.info("[cage-box-bind] 异步缓存刷新完成 roomId={}", rid);
                    } catch (Exception e) {
                        log.warn("[cage-box-bind] 异步缓存刷新失败 roomId={} err={}", rid, e.getMessage());
                    }
                });
            }
            return Result.success(result);
        }
        String aroMsg = aroService.getLastAroErrorMessage();
        return Result.error(aroMsg != null && !aroMsg.isBlank() ? aroMsg : "课题组与AUP不符");
    }

    // ── 笼盒解绑（2026-07-31）──

    @PostMapping("/unbind")
    @Operation(summary = "解绑笼盒（批量删除笼盒关联），成功后刷新房间缓存")
    public Result<Map<String, Object>> unbind(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");

        Object idsObj = body.get("animalCageIdList");
        if (!(idsObj instanceof List<?> list) || list.isEmpty())
            return Result.fail(400, "animalCageIdList 不能为空");

        List<Long> animalCageIdList = new ArrayList<>();
        for (Object item : list) {
            Long id = toLong(String.valueOf(item).trim());
            if (id != null) animalCageIdList.add(id);
        }
        if (animalCageIdList.isEmpty()) return Result.fail(400, "无有效笼位ID");

        Long roomId = toLong(str(body, "roomId"));

        boolean ok = aroService.unbindCageBox(animalCageIdList);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("animalCageIdList", animalCageIdList);
        result.put("success", ok);
        log.info("[cage-box-unbind] user={} ids={} roomId={} ok={}",
                user.getId(), animalCageIdList, roomId, ok);
        if (ok) {
            // 异步刷新缓存，不阻塞响应
            if (roomId != null) {
                final Long rid = roomId;
                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        cageShelfService.forceRefreshAfterMutation(rid);
                        log.info("[cage-box-unbind] 异步缓存刷新完成 roomId={}", rid);
                    } catch (Exception e) {
                        log.warn("[cage-box-unbind] 异步缓存刷新失败 roomId={} err={}", rid, e.getMessage());
                    }
                });
            }
            return Result.success(result);
        }
        String aroMsg = aroService.getLastAroErrorMessage();
        return Result.error(aroMsg != null && !aroMsg.isBlank() ? aroMsg : "解绑失败");
    }

    // ── 取消笼盒颜色/状态（2026-07-30 新增）──

    @PostMapping("/cancel")
    @Operation(summary = "取消笼盒颜色标记（反选编辑模式中的状态）")
    public Result<Map<String, Object>> cancel(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");

        String roomIdStr = str(body, "roomId");
        String shelveIdStr = str(body, "shelveId");
        String cageBoxCode = str(body, "cageBoxCode");
        String colorStr = str(body, "color");
        if (anyBlank(roomIdStr, shelveIdStr, cageBoxCode, colorStr))
            return Result.fail(400, "roomId, shelveId, cageBoxCode, color 均为必填");

        Long roomId = toLong(roomIdStr);
        Long shelveId = toLong(shelveIdStr);
        Integer color = intOrNull(body, "color");
        if (roomId == null || shelveId == null) return Result.fail(400, "roomId/shelveId 格式错误");
        if (color == null) return Result.fail(400, "color 格式错误");

        // 解析 cageBoxCode → cageBoxId
        Map<String, Long> ids = aroService.resolveCageBoxIds(roomId, shelveId, cageBoxCode);
        if (ids.isEmpty()) return Result.error("在指定笼架未找到笼盒 " + cageBoxCode);

        Long cageBoxId = ids.get("cageBoxId");
        boolean ok = aroService.cancelCageBoxColor(cageBoxId, color);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cageBoxCode", cageBoxCode);
        result.put("cageBoxId", String.valueOf(cageBoxId));
        result.put("color", color);
        result.put("success", ok);
        log.info("[cage-box-cancel] user={} cageBoxId={} color={} ok={}",
                user.getId(), cageBoxId, color, ok);
        return ok ? Result.success(result) : Result.error("ARO 取消颜色失败，请查看日志");
    }

    // ── 查询课题组成员（2026-07-30 新增）──

    @PostMapping("/members")
    @Operation(summary = "扫码后查询笼盒对应的课题组成员（用于绑定前校验）")
    public Result<Map<String, Object>> members(@RequestBody Map<String, Object> body,
                                               HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录");

        String cageBoxCode = str(body, "cageBoxCode");
        if (cageBoxCode == null || cageBoxCode.isBlank())
            return Result.fail(400, "cageBoxCode 必填");

        // 扫码结果即 cageBoxId（绑定模式下笼盒尚未上架，直接当 ID 用）
        Long cageBoxId;
        try {
            cageBoxId = Long.parseLong(cageBoxCode.trim());
        } catch (NumberFormatException e) {
            return Result.error("笼盒编号格式异常: " + cageBoxCode);
        }

        List<Map<String, Object>> members = aroService.getProjectGroupMembersByCageBoxId(cageBoxId);
        log.info("[cage-box-members] user={} cageBoxCode={} → cageBoxId={} memberCount={}",
                user.getId(), cageBoxCode, cageBoxId, members.size());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cageBoxCode", cageBoxCode);
        result.put("cageBoxId", cageBoxId);
        result.put("members", members);
        return Result.success(result);
    }

    // ── helpers ──

    enum Action { DIVIDE, SPECIAL_BREEDING, HEALTH_CHECK }

    private static String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v == null ? null : String.valueOf(v).trim();
    }

    private static boolean anyBlank(String... vs) {
        for (String v : vs) if (v == null || v.isBlank()) return true;
        return false;
    }

    private static Long toLong(String s) {
        try { return Long.parseLong(s.trim()); } catch (Exception ignored) { return null; }
    }

    private static Integer intOrNull(Map<String, Object> m, String k) {
        Object v = m.get(k);
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s) { try { return Integer.parseInt(s.trim()); } catch (Exception ignored) {} }
        return null;
    }
}
