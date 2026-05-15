package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result; // 复用你的标准 Result
import com.example.demo.modules.twin.dto.RoomConfigDTO;
import com.example.demo.modules.twin.entity.RoomConfig;
import com.example.demo.modules.twin.service.RoomConfigService;
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

    @GetMapping
    @Operation(summary = "查询全部房间配置")
    public Result<List<RoomConfig>> getAllRooms() {
        return Result.success(roomConfigService.getAllActiveRooms());
    }

    @PostMapping
    @Operation(summary = "新增房间配置")
    public Result<Void> addRoom(@RequestBody RoomConfigDTO dto) {
        roomConfigService.saveRoomAndReloadCache(dto);
        return Result.success(null);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除房间配置")
    public Result<Void> deleteRoom(@PathVariable Long id) {
        roomConfigService.deleteRoomAndReloadCache(id);
        return Result.success(null);
    }

    @PutMapping("/{id}/capacity")
    @Operation(summary = "更新房间容量")
    public Result<Void> updateCapacity(@PathVariable Long id, @RequestParam Integer capacity) {
        roomConfigService.updateCapacityAndReload(id, capacity);
        return Result.success(null);
    }

    @PutMapping("/{id}/capacity-bind-room-id")
    @Operation(summary = "更新流水 room_id 绑定（满员/监控索引用）")
    public Result<Void> updateCapacityBindRoomId(
            @PathVariable Long id,
            @RequestParam(required = false) String capacityBindRoomId) {
        roomConfigService.updateCapacityBindRoomIdAndReload(id, capacityBindRoomId);
        return Result.success(null);
    }
}