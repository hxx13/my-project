package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.dto.RoomConfigDTO;
import com.example.demo.modules.twin.entity.RoomConfig;
import com.example.demo.modules.twin.mapper.RoomConfigMapper;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

@Slf4j
@Service
public class RoomConfigService {

    @Autowired
    private RoomConfigMapper roomConfigMapper; // 用于日常 CRUD

    @Autowired
    private TwinDashboardMapper twinDashboardMapper;

    // 🚨 架构铁律：高频字典，单例缓存必须加 volatile
    private volatile List<RoomConfig> roomDictionaryCache = null;

    public List<RoomConfig> getAllActiveRooms() {
        if (roomDictionaryCache == null) {
            synchronized (this) {
                if (roomDictionaryCache == null) {
                    roomDictionaryCache = roomConfigMapper.selectAllActive();
                }
            }
        }
        return roomDictionaryCache;
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveRoomAndReloadCache(RoomConfigDTO dto) {
        RoomConfig entity = new RoomConfig();
        entity.setCampus(dto.getCampus());
        entity.setRoomName(dto.getRoomName());
        entity.setCapacity(dto.getCapacity());
        entity.setMappingAliases(dto.getMappingAliases());
        entity.setCapacityBindRoomId(trimToNull(dto.getCapacityBindRoomId()));

        roomConfigMapper.insert(entity);
        synchronized (this) { roomDictionaryCache = null; }
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteRoomAndReloadCache(Long id) {
        roomConfigMapper.deleteLogic(id);
        synchronized (this) { roomDictionaryCache = null; }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateCapacityAndReload(Long id, Integer capacity) {
        roomConfigMapper.updateCapacity(id, capacity);
        // 🚨 架构铁律：任何写入必须撕毁缓存，触发下一次 DCL 重载
        synchronized (this) { roomDictionaryCache = null; }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateCapacityBindRoomIdAndReload(Long id, String capacityBindRoomId) {
        roomConfigMapper.updateCapacityBindRoomId(id, trimToNull(capacityBindRoomId));
        synchronized (this) { roomDictionaryCache = null; }
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * 与「房卡调度」room_config 对齐：按校区 + 套间键 + 房间名/别名解析容量。
     */
    public Integer resolveCapacityForHeatmap(String suiteId, String physicalRoomDisplayName) {
        RoomConfig match = findMatchingRoomConfig(suiteId, physicalRoomDisplayName);
        return match != null ? match.getCapacity() : null;
    }

    /**
     * 雷达页保存套间限载：写 room_config（若命中）并同步 aro_room_settings（suiteId）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateCapacityFromHeatmap(String suiteId, String physicalRoomDisplayName, int capacity) {
        RoomConfig match = findMatchingRoomConfig(suiteId, physicalRoomDisplayName);
        if (match != null && match.getId() != null) {
            roomConfigMapper.updateCapacity(match.getId(), capacity);
            synchronized (this) { roomDictionaryCache = null; }
        }
        if (suiteId != null && !suiteId.isBlank()) {
            twinDashboardMapper.upsertRoomCapacity(suiteId, capacity);
        }
    }

    private RoomConfig findMatchingRoomConfig(String suiteId, String physicalRoomDisplayName) {
        if (suiteId == null || !suiteId.startsWith("SUITE_")) {
            return null;
        }
        String rest = suiteId.substring("SUITE_".length());
        int underscore = rest.indexOf('_');
        if (underscore < 0) {
            return null;
        }
        String campus = rest.substring(0, underscore);
        String suiteKey = rest.substring(underscore + 1);
        String physicalTail = stripBracketDisplayName(physicalRoomDisplayName);

        for (RoomConfig rc : getAllActiveRooms()) {
            if (rc.getCampus() == null || !rc.getCampus().equals(campus)) {
                continue;
            }
            if (suiteKey.equals(rc.getRoomName())) {
                return rc;
            }
            if (physicalTail != null && physicalTail.equals(rc.getRoomName())) {
                return rc;
            }
            if (rc.getMappingAliases() != null) {
                for (String raw : rc.getMappingAliases().split("[,，;；\\s]+")) {
                    String a = raw.trim();
                    if (a.isEmpty()) {
                        continue;
                    }
                    if (suiteId.equals(a) || suiteKey.equals(a)) {
                        return rc;
                    }
                    if (physicalTail != null && physicalTail.equals(a)) {
                        return rc;
                    }
                }
            }
        }
        return null;
    }

    private static String stripBracketDisplayName(String roomDisplay) {
        if (roomDisplay == null || roomDisplay.isBlank()) {
            return null;
        }
        String s = roomDisplay.trim();
        int br = s.indexOf(']');
        if (br >= 0 && s.startsWith("[")) {
            s = s.substring(br + 1).trim();
        }
        return s.isEmpty() ? null : s;
    }
}