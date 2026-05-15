package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.controller.TwinCardStatusController;
import com.example.demo.modules.twin.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.entity.RoomConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class TwinDashboardAggregationService {

    @Autowired
    private RoomConfigService roomConfigService; // 拿配置

    // 💥 暴力缝合：直接注入你原来的旧 Controller，榨取它的散装 Map 数据！
    @Autowired
    private TwinCardStatusController twinCardStatusController;

    public List<RoomDashboardRenderDTO> getWechatMiniProgramData(String campus) {
        // 1. 获取防腐层静态配置字典
        List<RoomConfig> configs = roomConfigService.getAllActiveRooms();

        // 2. 榨取旧接口的实时散装流水
        List<Map<String, Object>> liveStatuses = twinCardStatusController.getRoomStatus();

        List<RoomDashboardRenderDTO> renderList = new ArrayList<>();

        // 3. 核心缝合引擎
        for (RoomConfig config : configs) {
            // 过滤校区
            if (campus != null && !campus.isEmpty() && !config.getCampus().equals(campus)) {
                continue;
            }

            RoomDashboardRenderDTO dto = new RoomDashboardRenderDTO();
            dto.setRoomId(config.getId());
            dto.setCapacityBindRoomId(config.getCapacityBindRoomId());
            dto.setCampus(config.getCampus());
            dto.setRoomName(config.getRoomName());
            dto.setTotalCapacity(config.getCapacity());

            // 💥 多条流水（多 room_id / 多别名）合并为一条前室配置的在场与剩余容量
            Map<String, Object> matchedStatus = mergeMatchedStatuses(findAllMatchingStatuses(config, liveStatuses));

            if (matchedStatus != null) {
                // 安全解包 Map 并强转类型
                int campusUserCount = (int) matchedStatus.getOrDefault("campusUserCount", 0);
                int borrowedCardCount = (int) matchedStatus.getOrDefault("borrowedCardCount", 0);
                int followingCount = (int) matchedStatus.getOrDefault("followingCount", 0);
                List<Object> occupants = (List<Object>) matchedStatus.get("occupants");

                dto.setCampusUserCount(campusUserCount);
                dto.setBorrowedCardCount(borrowedCardCount);
                dto.setFollowingCount(followingCount);

                // 给微信小程序的 payload，直接把 occupants 塞进去 (Spring 会自动转成 JSON 数组)
                dto.setOccupants(occupants != null ? occupants : new ArrayList<>());

                // 计算剩余容量 (以 SQLite 的配置上限为准，不再相信旧接口里的 20)
                int totalOccupants = campusUserCount + borrowedCardCount + followingCount;
                dto.setRemainingCards(Math.max(0, config.getCapacity() - totalOccupants));
            } else {
                // 防腐降级：如果没有流水，输出干净的空房间
                dto.setRemainingCards(config.getCapacity());
                dto.setCampusUserCount(0);
                dto.setBorrowedCardCount(0);
                dto.setFollowingCount(0);
            }
            renderList.add(dto);
        }
        return renderList;
    }

    /**
     * 与 mapping_aliases 类似：capacity_bind_room_id 支持英文逗号、中文逗号、分号、空白分隔的多个流水 room_id，
     * 多个后室共用前室一条配置的容量上限时，合并各流水分组的在场人数。
     */
    private List<Map<String, Object>> findAllMatchingStatuses(RoomConfig config, List<Map<String, Object>> statuses) {
        Set<String> bindSet = new HashSet<>(splitCapacityBindTokens(config.getCapacityBindRoomId()));
        String dictName = config.getRoomName() != null ? config.getRoomName().trim() : "";
        LinkedHashMap<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Map<String, Object> status : statuses) {
            if (isLiveStatusMatched(config, status, bindSet, dictName)) {
                byKey.putIfAbsent(statusDedupeKey(status), status);
            }
        }
        return new ArrayList<>(byKey.values());
    }

    private static boolean isLiveStatusMatched(
            RoomConfig config,
            Map<String, Object> status,
            Set<String> bindSet,
            String dictName) {
        String rid = statusRoomIdString(status.get("roomId"));
        if (!bindSet.isEmpty() && !rid.isEmpty() && bindSet.contains(rid)) {
            return true;
        }
        String rawName = status.get("roomName") != null ? status.get("roomName").toString().trim() : "";
        if (rawName.equals(dictName)) {
            return true;
        }
        if (config.getMappingAliases() != null && !config.getMappingAliases().isEmpty()) {
            String[] aliases = config.getMappingAliases().replaceAll("，", ",").split(",");
            for (String alias : aliases) {
                if (alias.trim().equals(rawName)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static Map<String, Object> mergeMatchedStatuses(List<Map<String, Object>> matched) {
        if (matched == null || matched.isEmpty()) {
            return null;
        }
        if (matched.size() == 1) {
            return matched.get(0);
        }
        int campus = 0;
        int borrowed = 0;
        int following = 0;
        List<Object> allOcc = new ArrayList<>();
        for (Map<String, Object> m : matched) {
            campus += intFromMap(m.get("campusUserCount"));
            borrowed += intFromMap(m.get("borrowedCardCount"));
            following += intFromMap(m.get("followingCount"));
            @SuppressWarnings("unchecked")
            List<Object> occ = (List<Object>) m.get("occupants");
            if (occ != null) {
                allOcc.addAll(occ);
            }
        }
        Map<String, Object> merged = new HashMap<>();
        merged.put("campusUserCount", campus);
        merged.put("borrowedCardCount", borrowed);
        merged.put("followingCount", following);
        merged.put("occupants", allOcc);
        return merged;
    }

    private static int intFromMap(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof Number) {
            return ((Number) o).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static List<String> splitCapacityBindTokens(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return out;
        }
        String normalized = raw.replace('，', ',');
        for (String part : normalized.split("[,;；\\s]+")) {
            String t = part.trim();
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }

    private static String statusDedupeKey(Map<String, Object> status) {
        String area = status.get("areaName") != null ? status.get("areaName").toString() : "";
        String name = status.get("roomName") != null ? status.get("roomName").toString() : "";
        return area + "|" + name + "|" + statusRoomIdString(status.get("roomId"));
    }

    private static String statusRoomIdString(Object roomId) {
        if (roomId == null) {
            return "";
        }
        return String.valueOf(roomId).trim();
    }
}