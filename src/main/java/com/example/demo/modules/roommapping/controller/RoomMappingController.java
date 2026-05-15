package com.example.demo.modules.roommapping.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.roommapping.dto.OfficialPermissionLevelPatchRequest;
import com.example.demo.modules.roommapping.dto.RoomMappingImportStats;
import com.example.demo.modules.roommapping.service.RoomMappingService;
import com.example.demo.modules.twin.service.JobExecutionRegistry;
import com.example.demo.modules.twin.service.JobSchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/room-mapping")
@CrossOrigin("*")
@Tag(name = "房间通道映射", description = "ARO 房间与大华通道编码对照（room_mapping.csv 落库）")
public class RoomMappingController {

    private final RoomMappingService roomMappingService;
    private final AuthContextService authContextService;
    private final JobSchedulerService jobSchedulerService;

    public RoomMappingController(RoomMappingService roomMappingService, AuthContextService authContextService,
                                 JobSchedulerService jobSchedulerService) {
        this.roomMappingService = roomMappingService;
        this.authContextService = authContextService;
        this.jobSchedulerService = jobSchedulerService;
    }

    @GetMapping("/facets")
    @Operation(summary = "区域、楼层标签（用于筛选）")
    public Result<?> facets(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(roomMappingService.facets());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "加载失败");
        }
    }

    @GetMapping("/rooms")
    @Operation(summary = "分页查询房间；includeChannels=false 时不加载通道（仅主数据展示）")
    public Result<?> listRooms(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String regionName,
            @RequestParam(required = false) String floorName,
            @RequestParam(required = false) String tagFilter,
            @RequestParam(defaultValue = "true") boolean includeChannels) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(roomMappingService.listRooms(keyword, regionName, floorName, tagFilter, page, pageSize, includeChannels));
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @GetMapping("/by-room-id/{roomId}")
    @Operation(summary = "按 ARO 房间 ID 查询映射及通道编码列表")
    public Result<?> byRoomId(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("roomId") String roomId) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(roomMappingService.findByRoomIdWithChannels(roomId));
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "查询失败");
        }
    }

    @PatchMapping("/rooms/{roomId}/official-permission-level")
    @Operation(summary = "手动设置或清空房间的官方权限等级（覆盖库内值；JSON 中 officialPermissionLevel 为 null 表示清空）")
    public Result<?> patchOfficialPermissionLevel(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("roomId") String roomId,
            @RequestBody OfficialPermissionLevelPatchRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(roomMappingService.updateOfficialPermissionLevel(roomId, body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "保存失败");
        }
    }

    @PostMapping("/refresh-from-classpath")
    @Operation(summary = "从 classpath 重新导入 room_mapping.csv")
    public Result<?> refreshFromClasspath(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            jobSchedulerService.runManual(JobExecutionRegistry.JOB_ROOM_MAPPING_REFRESH, "manual-api");
            return Result.success("房间映射刷新已触发");
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "导入失败");
        }
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
