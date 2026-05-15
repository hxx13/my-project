package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 同步 ARO 官方「可进房间」接口中的 {@code level} 到 {@code room_mapping_room}，
 * 并为人员档案生成「浦东/浦西 + 映射房间名」可读列表。
 */
@Service
public class ExamRoomPermissionSyncService {

    private static final Logger log = LoggerFactory.getLogger(ExamRoomPermissionSyncService.class);

    @Autowired
    private AroService aroService;
    @Autowired
    private RoomDictionaryManager roomDictionaryManager;
    @Autowired
    private RoomMappingRoomMapper roomMappingRoomMapper;
    @Autowired
    private AroPersonnelMapper aroPersonnelMapper;

    public void persistLevelsFromOfficialRoomPayload(List<Map<String, Object>> officialRooms) {
        if (officialRooms == null || officialRooms.isEmpty()) {
            return;
        }
        for (Map<String, Object> room : officialRooms) {
            try {
                Object idObj = room.get("id");
                if (idObj == null) {
                    continue;
                }
                String roomId = String.valueOf(idObj).trim();
                if (roomId.isEmpty()) {
                    continue;
                }
                Integer lvl = parseLevel(room.get("level"));
                if (lvl == null) {
                    continue;
                }
                roomMappingRoomMapper.mergeOfficialPermissionLevel(roomId, lvl);
            } catch (Exception e) {
                log.debug("[exam-room-level] skip: {}", e.getMessage());
            }
        }
    }

    public Integer parseLevel(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number n) {
            return n.intValue();
        }
        String s = String.valueOf(raw).trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public String buildAllowedRoomsDisplayZh(String userId) {
        if (userId == null || userId.isBlank()) {
            return "";
        }
        List<Map<String, Object>> rooms = aroService.getExamOfflineRoom(userId);
        if (rooms == null || rooms.isEmpty()) {
            return "";
        }
        record RatedLine(int level, String line) {
        }
        List<RatedLine> list = new ArrayList<>();
        for (Map<String, Object> room : rooms) {
            Object idObj = room.get("id");
            if (idObj == null) {
                continue;
            }
            String roomId = String.valueOf(idObj).trim();
            if (roomId.isEmpty()) {
                continue;
            }
            RoomDictionaryManager.RoomMapping dict = roomDictionaryManager.translate(roomId);
            if (dict == null) {
                continue;
            }
            Integer level = parseLevel(room.get("level"));
            RoomMappingRoom rm = roomMappingRoomMapper.selectByRoomId(roomId);
            String campus = resolveCampusTag(rm, dict.displayName);
            if (campus.isEmpty()) {
                campus = "未知院区";
            }
            String line = campus + "·" + dict.displayName;
            list.add(new RatedLine(level == null ? Integer.MAX_VALUE : level, line));
        }
        list.sort(Comparator.comparingInt(RatedLine::level));
        Set<String> seen = new LinkedHashSet<>();
        List<String> ordered = new ArrayList<>();
        for (RatedLine rl : list) {
            if (seen.add(rl.line)) {
                ordered.add(rl.line);
            }
        }
        return String.join("；", ordered);
    }

    private static String resolveCampusTag(RoomMappingRoom rm, String displayName) {
        String rn = rm != null && rm.getRegionName() != null ? rm.getRegionName() : "";
        if (rn.contains("浦东")) {
            return "浦东";
        }
        if (rn.contains("浦西")) {
            return "浦西";
        }
        if (displayName != null) {
            if (displayName.contains("浦东")) {
                return "浦东";
            }
            if (displayName.contains("浦西")) {
                return "浦西";
            }
        }
        return "";
    }

    public void refreshAllowedRoomsDisplayForPersonnelList(List<AroPersonnel> personnel) {
        if (personnel == null || personnel.isEmpty()) {
            return;
        }
        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        int ok = 0;
        for (AroPersonnel p : personnel) {
            if (p == null || p.getId() == null || p.getId().isBlank()) {
                continue;
            }
            try {
                String zh = buildAllowedRoomsDisplayZh(p.getId());
                int hasPerm = computeHasOfficialRoomPermission(zh, p.getAllowedRoomsJson());
                aroPersonnelMapper.updateAllowedRoomsDisplayZh(p.getId(), zh, hasPerm, now);
                ok++;
            } catch (Exception e) {
                log.warn("[personnel-rooms] userId={} err={}", p.getId(), e.getMessage());
            }
        }
        log.info("[personnel-rooms] 已写入可进房间展示 {} 人（本轮 {} 条）", ok, personnel.size());
    }

    /**
     * 与档案库排序、{@code has_official_room_permission} 列语义一致：展示文案非空优先；否则看原始 JSON 是否明显非空。
     */
    public static int computeHasOfficialRoomPermission(String displayZh, String allowedRoomsJson) {
        if (displayZh != null && !displayZh.isBlank()) {
            return 1;
        }
        if (allowedRoomsJson == null) {
            return 0;
        }
        String j = allowedRoomsJson.trim();
        if (j.isEmpty() || "[]".equals(j) || "{}".equals(j) || "null".equalsIgnoreCase(j)) {
            return 0;
        }
        return 1;
    }
}
