package com.example.demo.modules.aro.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
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

    public CageBoxActionController(AuthContextService authContextService,
                                   AroService aroService) {
        this.authContextService = authContextService;
        this.aroService = aroService;
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
