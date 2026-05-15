package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.task.AroSyncTask;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

@RestController
@RequestMapping("/api/v1/twin/cards")
@Tag(name = "房卡状态", description = "房卡状态大盘与手动同步")
public class TwinCardStatusController {

    private final TwinDashboardMapper dashboardMapper;
    private final AroSyncTask aroSyncTask;
    private final AuthContextService authContextService;

    public TwinCardStatusController(
            TwinDashboardMapper dashboardMapper,
            AroSyncTask aroSyncTask,
            AuthContextService authContextService) {
        this.dashboardMapper = dashboardMapper;
        this.aroSyncTask = aroSyncTask;
        this.authContextService = authContextService;
    }

    @GetMapping("/status")
    @Operation(summary = "获取房卡状态总览")
    public List<Map<String, Object>> getRoomStatus() {
        List<Map<String, Object>> activeUsers = dashboardMapper.getTodayActiveUsersForRoomStatus();
        Map<String, Map<String, Object>> roomGroups = new LinkedHashMap<>();

        for (Map<String, Object> user : activeUsers) {
            final String area = user.get("areaName") != null ? (String) user.get("areaName") : "未知校区";
            final String roomName = user.get("roomName") != null ? (String) user.get("roomName") : "未知房间";
            String key = area + "_" + roomName;

            Map<String, Object> room = roomGroups.computeIfAbsent(key, k -> {
                Map<String, Object> newRoom = new HashMap<>();
                newRoom.put("areaName", area);
                newRoom.put("roomName", roomName);
                Object rid = user.get("roomId");
                if (rid != null) {
                    newRoom.put("roomId", rid);
                }
                newRoom.put("totalCapacity", 20);
                newRoom.put("campusUserCount", 0);
                newRoom.put("borrowedCardCount", 0);
                newRoom.put("occupants", new ArrayList<Map<String, Object>>());
                return newRoom;
            });
            if (!room.containsKey("roomId") || room.get("roomId") == null) {
                Object rid = user.get("roomId");
                if (rid != null) {
                    room.put("roomId", rid);
                }
            }

            Object borrowedObj = user.get("is_borrowed_card");
            boolean isBorrowed = intVal(borrowedObj) == 1;

            String entryType = "OWN_CARD";
            if (isBorrowed) {
                entryType = "BORROWED_CARD";
                room.put("borrowedCardCount", (int) room.get("borrowedCardCount") + 1);
            } else {
                room.put("campusUserCount", (int) room.get("campusUserCount") + 1);
            }

            Map<String, Object> occupant = new HashMap<>();
            occupant.put("userId", user.get("user_id"));
            occupant.put("userName", user.get("userName"));
            occupant.put("entryTime", user.get("entryTime"));
            occupant.put("entryType", entryType);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> occ = (List<Map<String, Object>>) room.get("occupants");
            occ.add(occupant);
        }

        for (Map<String, Object> room : roomGroups.values()) {
            int total = (int) room.get("totalCapacity");
            int borrowed = (int) room.get("borrowedCardCount");
            room.put("remainingCards", Math.max(0, total - borrowed));
        }

        return new ArrayList<>(roomGroups.values());
    }

    private static int intVal(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof Number) {
            return ((Number) o).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    @PostMapping("/manual-sync")
    @Operation(summary = "手动触发流水同步")
    public Result<?> triggerManualSync(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.SENIOR.getLevel()) {
            return Result.error("无权限访问");
        }
        try {
            aroSyncTask.executeIncrementalSync();
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "流水同步成功！大屏已动态重组。");
            return Result.success(result);
        } catch (Exception e) {
            return Result.error("同步失败：" + e.getMessage());
        }
    }
}
