package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 审核页聚合：与小程序房间页同源（wechat-overview：房间配置 + 各房间 occupants），
 * 再叠加物理卡映射与人员库课题组。
 */
@Service
public class TwinAuditService {

    private static final String AUDIT_PUDONG = "浦东";
    private static final String AUDIT_PUXI = "浦西";

    private static final Pattern FLOOR_NUM = Pattern.compile("^(\\d+)F$", Pattern.CASE_INSENSITIVE);
    private static final Pattern FLOOR_B = Pattern.compile("^B(\\d+)F$", Pattern.CASE_INSENSITIVE);
    /** 与小程序 roomDashboard.floorPrefix 无连字符分支对齐：从名称中提取楼层 token */
    private static final Pattern FLOOR_TOKEN = Pattern.compile("(\\d+F|B\\d+F)", Pattern.CASE_INSENSITIVE);

    private final TwinDashboardAggregationService aggregationService;
    private final TwinDashboardMapper dashboardMapper;
    private final TwinCardMappingService cardMappingService;

    public TwinAuditService(
            TwinDashboardAggregationService aggregationService,
            TwinDashboardMapper dashboardMapper,
            TwinCardMappingService cardMappingService) {
        this.aggregationService = aggregationService;
        this.dashboardMapper = dashboardMapper;
        this.cardMappingService = cardMappingService;
    }

    public Map<String, Object> buildPendingByFloor() {
        List<RoomDashboardRenderDTO> rooms = aggregationService.getWechatMiniProgramData(null);

        // campus(浦东/浦西) -> floor -> roomId -> bucket
        Map<String, Map<String, Map<String, RoomBucket>>> tree = new LinkedHashMap<>();

        for (RoomDashboardRenderDTO room : rooms) {
            String rawCampus = room.getCampus() != null ? room.getCampus().trim() : "";
            String auditCampus = normalizeAuditCampus(rawCampus);
            if (auditCampus == null) {
                continue;
            }
            String roomName = room.getRoomName() != null ? room.getRoomName().trim() : "未知房间";
            String floor = floorPrefix(roomName);
            String roomId = room.getRoomId() != null ? String.valueOf(room.getRoomId()) : "";

            Map<String, Map<String, RoomBucket>> campusFloors =
                    tree.computeIfAbsent(auditCampus, k -> new LinkedHashMap<>());
            Map<String, RoomBucket> floorRooms = campusFloors.computeIfAbsent(floor, k -> new LinkedHashMap<>());
            RoomBucket bucket = floorRooms.computeIfAbsent(roomId, k -> new RoomBucket(roomId, roomName));

            List<?> occList = room.getOccupants();
            if (occList == null || occList.isEmpty()) {
                continue;
            }
            for (Object raw : occList) {
                if (!(raw instanceof Map)) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> occ = (Map<String, Object>) raw;
                Map<String, Object> person = buildPerson(occ, auditCampus, roomName, roomId, floor);
                bucket.persons.add(person);
            }
        }

        List<Map<String, Object>> campuses = new ArrayList<>();
        for (String campusLabel : Arrays.asList(AUDIT_PUDONG, AUDIT_PUXI)) {
            Map<String, Map<String, RoomBucket>> campusFloors = tree.get(campusLabel);
            List<Map<String, Object>> floors = new ArrayList<>();
            if (campusFloors != null) {
                List<String> floorNames = new ArrayList<>(campusFloors.keySet());
                floorNames.sort(this::compareFloorsDesc);
                for (String floor : floorNames) {
                    Map<String, RoomBucket> floorRooms = campusFloors.get(floor);
                    List<Map<String, Object>> roomMaps = new ArrayList<>();
                    List<Map<String, Object>> flatPersons = new ArrayList<>();
                    if (floorRooms != null) {
                        List<RoomBucket> buckets = new ArrayList<>(floorRooms.values());
                        buckets.sort(Comparator.comparing(b -> b.roomName, Comparator.nullsLast(String::compareTo)));
                        for (RoomBucket b : buckets) {
                            flatPersons.addAll(b.persons);
                            Map<String, Object> rm = new HashMap<>();
                            rm.put("roomId", b.roomId);
                            rm.put("roomName", b.roomName);
                            rm.put("persons", new ArrayList<>(b.persons));
                            roomMaps.add(rm);
                        }
                    }
                    Map<String, Object> fe = new HashMap<>();
                    fe.put("floor", floor);
                    fe.put("persons", flatPersons);
                    fe.put("rooms", roomMaps);
                    floors.add(fe);
                }
            }
            Map<String, Object> c = new HashMap<>();
            c.put("campus", campusLabel);
            c.put("floors", floors);
            campuses.add(c);
        }

        Map<String, Object> root = new HashMap<>();
        root.put("campuses", campuses);
        return root;
    }

    private Map<String, Object> buildPerson(
            Map<String, Object> occ,
            String auditCampus,
            String roomName,
            String roomId,
            String floor) {
        String userId = occ.get("userId") != null ? String.valueOf(occ.get("userId")).trim() : "";
        String userName = occ.get("userName") != null ? String.valueOf(occ.get("userName")) : "";
        String entryType = occ.get("entryType") != null ? String.valueOf(occ.get("entryType")) : "OWN_CARD";

        Map<String, Object> person = new HashMap<>();
        person.put("userId", userId);
        person.put("userName", userName);
        person.put("roomId", roomId);
        person.put("roomName", roomName);
        person.put("areaName", auditCampus);
        person.put("campus", auditCampus);
        person.put("floor", floor);
        person.put("entryTime", occ.get("entryTime"));
        person.put("entryType", entryType);

        Map<String, Object> basic = null;
        if (!userId.isEmpty()) {
            basic = dashboardMapper.getPersonnelBasicInfo(userId);
        }
        if (basic != null) {
            person.put("projectGroupName", basic.get("project_group_name"));
        } else {
            person.put("projectGroupName", null);
        }

        TwinCardMapping mapping = userId.isEmpty() ? null : cardMappingService.getByAroUserId(userId);
        if (mapping != null) {
            person.put("cardNo", mapping.getCardNo());
            person.put("dahuaSeq", mapping.getDahuaSeq());
            person.put("cardStatus", mapping.getCardStatus());
            person.put("freezeExemptFlag", mapping.getFreezeExemptFlag());
            person.put("jobNumber", mapping.getJobNumber());
            if (mapping.getUserName() != null && !mapping.getUserName().isBlank()) {
                person.put("mappingUserName", mapping.getUserName());
            } else {
                person.put("mappingUserName", null);
            }
            person.put("hasMapping", true);
        } else {
            person.put("cardNo", null);
            person.put("dahuaSeq", null);
            person.put("cardStatus", null);
            person.put("freezeExemptFlag", null);
            person.put("jobNumber", null);
            person.put("mappingUserName", null);
            person.put("hasMapping", false);
        }
        return person;
    }

    /** 审核页仅保留浦东、浦西；校区名兼容「上海浦东校区」等写法 */
    private static String normalizeAuditCampus(String campus) {
        if (campus == null || campus.isBlank()) {
            return null;
        }
        String c = campus.trim();
        if (c.contains("浦东")) {
            return AUDIT_PUDONG;
        }
        if (c.contains("浦西")) {
            return AUDIT_PUXI;
        }
        return null;
    }

    /**
     * 与小程序 roomDashboard.floorPrefix 对齐：有连字符取首段；否则用正则提取 \d+F / B\d+F；否则「其它」。
     */
    private static String floorPrefix(String roomName) {
        if (roomName == null || roomName.isBlank()) {
            return "UNKNOWN";
        }
        String raw = roomName.trim();
        int idx = raw.indexOf('-');
        if (idx >= 0) {
            String prefix = raw.substring(0, idx).trim();
            if (!prefix.isEmpty()) {
                return prefix;
            }
        }
        Matcher m = FLOOR_TOKEN.matcher(raw);
        if (m.find()) {
            return m.group(1).toUpperCase(Locale.ROOT);
        }
        return "其它";
    }

    private int floorSortKey(String prefix) {
        if (prefix == null) {
            return -9999;
        }
        String p = prefix.trim().toUpperCase(Locale.ROOT);
        Matcher g = FLOOR_NUM.matcher(p);
        if (g.find()) {
            return Integer.parseInt(g.group(1));
        }
        Matcher b = FLOOR_B.matcher(p);
        if (b.find()) {
            return -Integer.parseInt(b.group(1));
        }
        return -9999;
    }

    private int compareFloorsDesc(String a, String b) {
        int sa = floorSortKey(a);
        int sb = floorSortKey(b);
        if (sa != sb) {
            return Integer.compare(sb, sa);
        }
        return String.valueOf(a).compareTo(String.valueOf(b));
    }

    private static final class RoomBucket {
        final String roomId;
        final String roomName;
        final List<Map<String, Object>> persons = new ArrayList<>();

        RoomBucket(String roomId, String roomName) {
            this.roomId = roomId;
            this.roomName = roomName;
        }
    }
}
