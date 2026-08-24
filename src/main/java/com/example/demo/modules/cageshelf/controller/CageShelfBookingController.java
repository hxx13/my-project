package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageBookingLocalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 笼位预约管理 — 本地化（读优先本地、写只写本地、同步手动触发）。
 * <p>
 * 原直连 ARO room/rent 系列接口已切换为本地三张表（cage_booking_room /
 * cage_booking_room_aup / cage_booking_aup_dict）。写操作不再异步投递 ARO。
 */
@RestController
@RequestMapping("/api/v1/cage-shelves/booking")
@Tag(name = "笼位预约管理")
public class CageShelfBookingController {

    private static final Logger log = LoggerFactory.getLogger(CageShelfBookingController.class);

    private final AuthContextService authContextService;
    private final CageBookingLocalService bookingLocalService;

    public CageShelfBookingController(AuthContextService authContextService,
                                      CageBookingLocalService bookingLocalService) {
        this.authContextService = authContextService;
        this.bookingLocalService = bookingLocalService;
    }

    // ── 手动同步（从 ARO 拉取落本地）──

    @PostMapping("/sync")
    @Operation(summary = "手动同步：从 ARO 拉取房间预约汇总 + AUP 明细 + AUP 字典，upsert 落本地")
    public Result<?> sync(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            return Result.success(bookingLocalService.syncFromAro());
        } catch (Exception e) {
            log.warn("[booking] 同步失败: {}", e.getMessage(), e);
            return Result.error("同步失败: " + e.getMessage());
        }
    }

    // ── 房间预约汇总列表（本地） ──

    @GetMapping("/rooms")
    @Operation(summary = "房间预约汇总列表（本地）")
    public Result<?> listRooms(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestParam(defaultValue = "1") int pageNum,
                               @RequestParam(defaultValue = "30") int pageSize) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(bookingLocalService.listRooms());
    }

    // ── 房间内 AUP 分配明细（本地） ──

    @GetMapping("/rooms/{roomId}/aups")
    @Operation(summary = "房间内 AUP 分配明细（本地）")
    public Result<?> listAups(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String roomId,
                              @RequestParam(defaultValue = "1") int pageNum,
                              @RequestParam(defaultValue = "30") int pageSize) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(bookingLocalService.listRoomAups(roomId));
    }

    // ── 新增/编辑 AUP 分配（本地写） ──

    @PostMapping("/rooms/{roomId}/aups")
    @Operation(summary = "新增/编辑 AUP 分配（本地）")
    public Result<?> saveAup(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @PathVariable String roomId,
                             @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        return Result.success(bookingLocalService.saveRoomAup(roomId, body));
    }

    // ── 保存房间上限（本地写，改低校验） ──

    @PostMapping("/rooms/{roomId}/capacity")
    @Operation(summary = "保存房间上限（本地，改低校验不低于已切配额）")
    public Result<?> saveCapacity(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @PathVariable String roomId,
                                  @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        Integer capacity = null;
        Object cap = body.get("capacity");
        if (cap instanceof Number n) capacity = n.intValue();
        else if (cap != null) {
            try { capacity = Integer.parseInt(String.valueOf(cap).trim()); } catch (NumberFormatException ignored) {}
        }
        if (capacity == null) return Result.error("capacity 必填");
        return Result.success(bookingLocalService.saveRoomCapacity(roomId, capacity));
    }

    // ── 删除 AUP 分配（本地软删） ──

    @PostMapping("/aups/{id}/delete")
    @Operation(summary = "删除 AUP 分配（本地软删）")
    public Result<?> deleteAup(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        return Result.success(bookingLocalService.deleteRoomAup(id));
    }

    // ── AUP 下拉字典（本地） ──

    @GetMapping("/aups/dict")
    @Operation(summary = "AUP 下拉字典（本地）")
    public Result<?> aupDict(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(bookingLocalService.aupDict());
    }

    // ── AUP 跨房间搜索（本地 JOIN） ──

    @GetMapping("/aups/search")
    @Operation(summary = "跨房间搜索 AUP（本地）")
    public Result<?> searchAups(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestParam("keyword") String keyword) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        if (keyword == null || keyword.isBlank()) {
            return Result.success(Collections.emptyList());
        }
        return Result.success(bookingLocalService.searchAups(keyword));
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
