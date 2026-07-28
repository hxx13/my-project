package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.AroPersonalTokenClient;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.function.Supplier;

/**
 * 笼位预约管理 — 代理 ARO 的 room/rent 相关 API。
 * <p>
 * 只读端点优先使用个人 Token，未绑定时降级全局 Token。
 * 写操作（新增/编辑/删除）必须使用个人 Token。
 */
@RestController
@RequestMapping("/api/v1/cage-shelves/booking")
@Tag(name = "笼位预约管理")
public class CageShelfBookingController {

    private static final Logger log = LoggerFactory.getLogger(CageShelfBookingController.class);

    private final AuthContextService authContextService;
    private final AroService aroService;
    private final AroPersonalTokenClient aroPersonalTokenClient;

    public CageShelfBookingController(AuthContextService authContextService,
                                       AroService aroService,
                                       AroPersonalTokenClient aroPersonalTokenClient) {
        this.authContextService = authContextService;
        this.aroService = aroService;
        this.aroPersonalTokenClient = aroPersonalTokenClient;
    }

    /** 只读操作：优先个人Token，失败降级全局Token */
    @SuppressWarnings("unchecked")
    private <T> T tryPersonalOrGlobal(java.util.function.Function<String, T> withToken, Supplier<T> globalFallback) {
        try {
            return aroPersonalTokenClient.execute(withToken);
        } catch (Exception e) {
            log.warn("[booking] 个人Token不可用，降级全局Token: {}", e.getMessage());
            return globalFallback.get();
        }
    }

    // ── 房间预约汇总列表（只读） ──

    @GetMapping("/rooms")
    @Operation(summary = "房间预约汇总列表")
    public Result<?> listRooms(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestParam(defaultValue = "1") int pageNum,
                                @RequestParam(defaultValue = "30") int pageSize) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;

        Map<String, Object> raw = tryPersonalOrGlobal(
                token -> aroService.fetchRoomRentList(pageNum, pageSize, token),
                () -> aroService.fetchRoomRentListGlobal(pageNum, pageSize));
        return Result.success(raw);
    }

    // ── 房间内 AUP 分配明细（只读） ──

    @GetMapping("/rooms/{roomId}/aups")
    @Operation(summary = "房间内 AUP 分配明细")
    public Result<?> listAups(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable String roomId,
                               @RequestParam(defaultValue = "1") int pageNum,
                               @RequestParam(defaultValue = "30") int pageSize) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;

        Map<String, Object> raw = tryPersonalOrGlobal(
                token -> aroService.fetchRoomRentAups(roomId, pageNum, pageSize, token),
                () -> aroService.fetchRoomRentAupsGlobal(roomId, pageNum, pageSize));
        return Result.success(raw);
    }

    // ── 新增/编辑 AUP 分配（写操作，需个人Token） ──

    @SuppressWarnings("unchecked")
    @PostMapping("/rooms/{roomId}/aups")
    @Operation(summary = "新增/编辑 AUP 分配（需CAS绑定）")
    public Result<?> saveAup(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String roomId,
                              @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;

        Map<String, Object> req = new LinkedHashMap<>(body);
        req.put("roomId", roomId);

        Map<String, Object> raw = aroPersonalTokenClient.execute(token ->
                aroService.saveRoomRentPrepare(req, token));
        return Result.success(raw);
    }

    // ── 删除 AUP 分配（写操作，需个人Token） ──

    @PostMapping("/aups/{id}/delete")
    @Operation(summary = "删除 AUP 分配（需CAS绑定）")
    public Result<?> deleteAup(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;

        Map<String, Object> body = Map.of("id", id);
        Map<String, Object> raw = aroPersonalTokenClient.execute(token ->
                aroService.deleteRoomRentPrepare(body, token));
        return Result.success(raw);
    }

    // ── AUP 下拉字典（只读） ──

    @GetMapping("/aups/dict")
    @Operation(summary = "AUP 下拉字典")
    public Result<?> aupDict(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;

        java.util.List<java.util.Map<String, Object>> list = tryPersonalOrGlobal(
                token -> aroService.fetchAuditedAups(token),
                () -> aroService.fetchAuditedAupsGlobal());

        java.util.List<java.util.Map<String, Object>> out = new java.util.ArrayList<>();
        for (java.util.Map<String, Object> aup : list) {
            java.util.Map<String, Object> entry = new java.util.LinkedHashMap<>();
            entry.put("id", String.valueOf(aup.getOrDefault("id", "")));
            entry.put("title", String.valueOf(aup.getOrDefault("title", "")));
            entry.put("registerNumber", String.valueOf(aup.getOrDefault("registerNumber", "")));
            entry.put("projectPiName", String.valueOf(aup.getOrDefault("projectPiName", "")));
            out.add(entry);
        }
        return Result.success(out);
    }

    // ── AUP 跨房间搜索（只读） ──

    @GetMapping("/aups/search")
    @Operation(summary = "跨房间搜索 AUP")
    public Result<?> searchAups(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam("keyword") String keyword) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;

        if (keyword == null || keyword.isBlank()) {
            return Result.success(java.util.Collections.emptyList());
        }

        java.util.List<java.util.Map<String, Object>> hits = tryPersonalOrGlobal(
                token -> aroService.searchAupsAcrossRooms(keyword, token),
                () -> aroService.searchAupsAcrossRoomsGlobal(keyword));
        return Result.success(hits);
    }

    // ── helpers ──

    private User resolveUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) return Result.error("未登录");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        if (user.getRole().getLevel() < minRole.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
