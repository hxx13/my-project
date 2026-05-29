package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.mapper.StudentRoomPinMapper;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class StudentRoomService {

    private static final Logger log = LoggerFactory.getLogger(StudentRoomService.class);
    private static final int DEFAULT_CAPACITY = 20;

    private final TwinDashboardAggregationService aggregationService;
    private final StudentRoomPinMapper pinMapper;
    private final TwinDashboardMapper dashboardMapper;
    private final AroService aroService;

    public StudentRoomService(TwinDashboardAggregationService aggregationService,
                               StudentRoomPinMapper pinMapper,
                               TwinDashboardMapper dashboardMapper,
                               AroService aroService) {
        this.aggregationService = aggregationService;
        this.pinMapper = pinMapper;
        this.dashboardMapper = dashboardMapper;
        this.aroService = aroService;
    }

    public Map<String, Object> getRooms(User user, String pinned, String floor,
                                         String status, String search,
                                         int page, int size) {
        boolean myRoomsOnly = "1".equals(pinned);

        if (myRoomsOnly) {
            return getMyRooms(user);
        }

        return getFilteredRooms(user, floor, search, page, size);
    }

    /**
     * "我的" tab: call ARO examOfflineRoom API to get user's room permissions,
     * then match via capacityBindRoomId tokens against dashboard rooms.
     * Favorited rooms are sorted first.
     */
    private Map<String, Object> getMyRooms(User user) {
        Set<String> aroRoomIds = resolveAllowedAroRoomIds(user.getId());
        List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);
        Set<String> favRoomIds = new HashSet<>(pinMapper.selectPinnedRoomIds(user.getId()));

        List<Map<String, Object>> data = new ArrayList<>();
        for (RoomDashboardRenderDTO room : allRooms) {
            Set<String> bindTokens = splitCapacityBindTokens(room.getCapacityBindRoomId());
            if (bindTokens.isEmpty()) continue;
            // Check if any of the user's ARO room IDs matches a capacityBind token
            boolean hasAccess = bindTokens.stream().anyMatch(aroRoomIds::contains);
            if (!hasAccess) continue;
            boolean isFav = favRoomIds.contains(String.valueOf(room.getRoomId()));
            data.add(buildRoomItemFromDashboard(room, isFav));
        }

        // Favorites first
        data.sort((a, b) -> {
            boolean aFav = Boolean.TRUE.equals(a.get("isPinned"));
            boolean bFav = Boolean.TRUE.equals(b.get("isPinned"));
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });

        return Map.of("data", data, "total", data.size(), "page", 1, "size", data.size());
    }

    /**
     * Call ARO API to get the user's permitted room IDs.
     * Returns a set of ARO room ID strings (e.g. "1374909123426246657").
     */
    private Set<String> resolveAllowedAroRoomIds(String userId) {
        Set<String> ids = new LinkedHashSet<>();
        try {
            List<Map<String, Object>> rooms = aroService.getExamOfflineRoom(userId);
            for (Map<String, Object> room : rooms) {
                Object idObj = room.get("id");
                if (idObj != null) {
                    ids.add(String.valueOf(idObj));
                }
            }
        } catch (Exception e) {
            log.warn("[student-room] ARO examOfflineRoom failed for userId={}: {}", userId, e.getMessage());
        }
        return ids;
    }

    /**
     * Split capacityBindRoomId into a set of individual ARO room ID tokens.
     * Supports comma, Chinese comma, semicolon, and whitespace delimiters.
     */
    private Set<String> splitCapacityBindTokens(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        Set<String> tokens = new LinkedHashSet<>();
        for (String part : raw.split("[;；,，\\s]+")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                tokens.add(trimmed);
            }
        }
        return tokens;
    }

    /** All rooms: based on room_config with live ARO occupancy, paginated */
    private Map<String, Object> getFilteredRooms(User user, String floor, String search,
                                                   int page, int size) {
        List<RoomDashboardRenderDTO> allRooms = aggregationService.getWechatMiniProgramData(null);

        // Floor / search filter
        List<RoomDashboardRenderDTO> filtered = allRooms.stream()
                .filter(r -> {
                    if (floor != null && !floor.isEmpty()) {
                        String roomName = r.getRoomName() != null ? r.getRoomName() : "";
                        if (!roomName.startsWith(floor)) return false;
                    }
                    if (search != null && !search.isEmpty()) {
                        String kw = search.toLowerCase();
                        String roomName = r.getRoomName() != null ? r.getRoomName().toLowerCase() : "";
                        String campus = r.getCampus() != null ? r.getCampus().toLowerCase() : "";
                        if (!roomName.contains(kw) && !campus.contains(kw)) return false;
                    }
                    return true;
                })
                .collect(Collectors.toList());

        int total = filtered.size();
        int offset = (page - 1) * size;
        List<RoomDashboardRenderDTO> paged = filtered.stream().skip(offset).limit(size).toList();

        Set<String> pinnedIds = new HashSet<>(pinMapper.selectPinnedRoomIds(user.getId()));

        List<Map<String, Object>> data = paged.stream()
                .map(r -> buildRoomItemFromDashboard(r, pinnedIds.contains(String.valueOf(r.getRoomId()))))
                .collect(Collectors.toList());

        return Map.of("data", data, "total", total, "page", page, "size", size);
    }

    public void togglePin(User user, String roomId) {
        if (pinMapper.exists(user.getId(), roomId) > 0) {
            pinMapper.delete(user.getId(), roomId);
        } else {
            pinMapper.insert(user.getId(), roomId);
        }
    }

    private Map<String, Object> buildRoomItemFromDashboard(RoomDashboardRenderDTO room, boolean isPinned) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("roomId", String.valueOf(room.getRoomId()));
        item.put("roomName", room.getRoomName() != null ? room.getRoomName() : "");
        item.put("floor", deriveFloor(room.getRoomName()));
        item.put("zone", room.getCampus() != null ? room.getCampus() : "");

        int occupants = room.getOccupants() != null ? room.getOccupants().size() : 0;
        int capacity = room.getTotalCapacity() > 0 ? room.getTotalCapacity() : getRoomCapacity(String.valueOf(room.getRoomId()));
        double rate = capacity > 0 ? (occupants * 100.0 / capacity) : 0;

        item.put("occupantCount", occupants);
        item.put("capacity", capacity);
        item.put("occupancyRate", (int) Math.round(rate));

        String roomStatus;
        if (rate > 90) roomStatus = "full";
        else if (rate >= 50) roomStatus = "busy";
        else roomStatus = "idle";
        item.put("status", roomStatus);
        item.put("isPinned", isPinned);

        return item;
    }

    private String deriveFloor(String roomName) {
        if (roomName == null) return "";
        for (int i = 0; i < roomName.length(); i++) {
            char c = roomName.charAt(i);
            if (c >= '1' && c <= '9') {
                return c + "F";
            }
        }
        return "";
    }

    private int getRoomCapacity(String roomId) {
        try {
            Integer cap = dashboardMapper.getRoomCapacityByRoomId(roomId);
            return cap != null && cap > 0 ? cap : DEFAULT_CAPACITY;
        } catch (Exception e) {
            log.warn("Failed to get capacity for room {}", roomId, e);
            return DEFAULT_CAPACITY;
        }
    }
}
