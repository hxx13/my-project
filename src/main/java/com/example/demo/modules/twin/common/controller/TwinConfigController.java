package com.example.demo.modules.twin.common.controller;

import com.example.demo.common.dto.Result; // 复用你的标准 Result
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.dto.RoomConfigDTO;
import com.example.demo.modules.twin.common.entity.RoomConfig;
import com.example.demo.modules.twin.common.service.RoomConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/twin/config/rooms")
@Tag(name = "房间配置", description = "房间容量与配置管理")
public class TwinConfigController {

    @Autowired
    private RoomConfigService roomConfigService;

    @Autowired
    private AuthContextService authContextService;

    /** 读操作：任意已认证用户均可查询。 */
    @GetMapping
    @Operation(summary = "查询全部房间配置")
    public Result<List<RoomConfig>> getAllRooms() {
        return Result.success(roomConfigService.getAllActiveRooms());
    }

    /** 写操作（增/删/改）：仅 ADMIN 及以上角色。 */
    private Result<Void> requireAdmin(String bearer) {
        User user = authContextService.resolveUserFromBearer(bearer);
        if (user == null) {
            return Result.error("请先登录");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("权限不足，仅管理员可修改房间配置");
        }
        return null;
    }

    @PostMapping
    @Operation(summary = "新增房间配置")
    public Result<Void> addRoom(@RequestBody RoomConfigDTO dto,
                                @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<Void> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        roomConfigService.saveRoomAndReloadCache(dto);
        return Result.success(null);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除房间配置")
    public Result<Void> deleteRoom(@PathVariable Long id,
                                   @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<Void> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        roomConfigService.deleteRoomAndReloadCache(id);
        return Result.success(null);
    }

    @PutMapping("/{id}/capacity")
    @Operation(summary = "更新房间容量")
    public Result<Void> updateCapacity(@PathVariable Long id,
                                       @RequestParam Integer capacity,
                                       @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<Void> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        roomConfigService.updateCapacityAndReload(id, capacity);
        return Result.success(null);
    }

    @PutMapping("/{id}/capacity-bind-room-id")
    @Operation(summary = "更新流水 room_id 绑定（满员/监控索引用）")
    public Result<Void> updateCapacityBindRoomId(
            @PathVariable Long id,
            @RequestParam(required = false) String capacityBindRoomId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<Void> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        roomConfigService.updateCapacityBindRoomIdAndReload(id, capacityBindRoomId);
        return Result.success(null);
    }
}