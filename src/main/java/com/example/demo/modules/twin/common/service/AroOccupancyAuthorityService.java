package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.aro.service.AroDatabaseService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.card.mapper.TwinCardMappingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 在馆权威：以 ARO {@link AroService#getNoLeaveRoom} 为准；本地 {@code aro_access_log} 仅作配平。
 */
@Service
public class AroOccupancyAuthorityService {

    private static final Logger log = LoggerFactory.getLogger(AroOccupancyAuthorityService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public enum OfficialPresence {
        /** 官方仍有滞留房间 */
        INSIDE,
        /** 官方无滞留（含查询成功且列表为空） */
        NOT_INSIDE,
        /** 上游查询失败，不可当作已离开 */
        QUERY_FAILED
    }

    private final AroService aroService;
    private final TwinCardMappingMapper mappingMapper;
    private final AroDatabaseMapper aroDatabaseMapper;
    private final AroDatabaseService aroDatabaseService;
    private final TwinAutomationLogService automationLogService;

    public AroOccupancyAuthorityService(
            AroService aroService,
            TwinCardMappingMapper mappingMapper,
            AroDatabaseMapper aroDatabaseMapper,
            AroDatabaseService aroDatabaseService,
            TwinAutomationLogService automationLogService) {
        this.aroService = aroService;
        this.mappingMapper = mappingMapper;
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.aroDatabaseService = aroDatabaseService;
        this.automationLogService = automationLogService;
    }

    public OfficialPresence queryOfficialPresence(String userId) {
        if (userId == null || userId.isBlank()) {
            return OfficialPresence.QUERY_FAILED;
        }
        List<Map<String, Object>> rooms = aroService.getNoLeaveRoom(userId.trim());
        if (rooms == null) {
            return OfficialPresence.QUERY_FAILED;
        }
        return rooms.isEmpty() ? OfficialPresence.NOT_INSIDE : OfficialPresence.INSIDE;
    }

    public boolean isLocallyStrandedToday(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        List<String> stranded = mappingMapper.findTodayStrandedUserIds(today + "%");
        return stranded != null && stranded.contains(userId.trim());
    }

    /**
     * 官方已无滞留、本地仍有今日未配平进入：补写本地 EXIT(2) 流水并记审计（不调 ARO）。
     *
     * @return 补写的离开条数
     */
    public int reconcileLocalOrphanExitsWhenOfficialEmpty(
            String userId, String triggerType, String triggerReason, String detailPrefix) {
        if (userId == null || userId.isBlank()) {
            return 0;
        }
        String uid = userId.trim();
        if (queryOfficialPresence(uid) != OfficialPresence.NOT_INSIDE) {
            return 0;
        }
        List<Map<String, Object>> orphans = aroDatabaseMapper.findTodayUnexitedEntersForUser(uid);
        if (orphans == null || orphans.isEmpty()) {
            return 0;
        }
        String now = LocalDateTime.now().format(DT);
        List<AroRecord> exits = new ArrayList<>();
        for (Map<String, Object> row : orphans) {
            AroRecord rec = new AroRecord();
            rec.setId("reconcile-" + UUID.randomUUID().toString().replace("-", ""));
            rec.setAccessType(2);
            rec.setCreateTime(now);
            rec.setUserId(uid);
            rec.setName(asString(row.get("name")));
            rec.setRoomId(asString(row.get("roomId")));
            rec.setRoomName(asString(row.get("roomName")));
            rec.setAreaName(asString(row.get("areaName")));
            rec.setFloorName(asString(row.get("floorName")));
            rec.setProjectGroupNames(asString(row.get("projectGroupNames")));
            rec.setFeedSource("SYSTEM_RECONCILE");
            rec.setFeedSummaryZh("官方已清退，本地流水对齐离开");
            rec.setFeedDetailZh((detailPrefix != null ? detailPrefix : "")
                    + " 对齐房间=" + asString(row.get("roomName"))
                    + " roomId=" + asString(row.get("roomId")));
            exits.add(rec);
        }
        aroDatabaseService.batchInsert(exits);
        automationLogService.write(
                TwinAutomationLogService.TYPE_EXEMPTION,
                "ARO_LOCAL_EXIT_RECONCILE",
                triggerType,
                triggerReason,
                uid,
                null,
                true,
                "ARO 官方 noLeaveRoom 为空，本地补写离开流水 " + exits.size() + " 条。"
                        + (detailPrefix != null && !detailPrefix.isBlank() ? " " + detailPrefix : ""),
                "aro-occupancy-reconcile");
        log.info("[occupancy-reconcile] userId={} localExitRows={}", uid, exits.size());
        return exits.size();
    }

    private static String asString(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
