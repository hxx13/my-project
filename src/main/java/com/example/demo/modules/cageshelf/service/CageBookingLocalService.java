package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageBookingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位预约（booking）本地读写服务。
 * <p>
 * 读优先本地表（cage_booking_room / cage_booking_room_aup / aup_record 计划书表）；
 * 写只写本地（新增/编辑 upsert、删除软删），不再异步投递 ARO；
 * 同步由手动端点触发 {@link #syncFromAro()}，从 ARO 拉取后按唯一键去重 upsert，不清空、不复活软删。
 * ARO「已通过 AUP」以计划书形式写入 aup_record（current_stage=approved）。
 */
@Service
public class CageBookingLocalService {

    private static final Logger log = LoggerFactory.getLogger(CageBookingLocalService.class);

    private final CageBookingMapper mapper;
    private final AupRecordMapper aupRecordMapper;
    private final AroService aroService;
    private final JdbcTemplate jdbcTemplate;

    public CageBookingLocalService(CageBookingMapper mapper, AupRecordMapper aupRecordMapper,
                                   AroService aroService, JdbcTemplate jdbcTemplate) {
        this.mapper = mapper;
        this.aupRecordMapper = aupRecordMapper;
        this.aroService = aroService;
        this.jdbcTemplate = jdbcTemplate;
    }

    // ═══════════════════════════════════════════════════════════
    // 读
    // ═══════════════════════════════════════════════════════════

    /** 房间预约汇总列表，返回形状对齐原 ARO /room/rent/list：{data:{list, total}, status:0} */
    public Map<String, Object> listRooms() {
        List<Map<String, Object>> rooms = mapper.selectRooms();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("list", rooms);
        data.put("total", rooms.size());
        data.put("pageNum", 1);
        data.put("pageSize", rooms.isEmpty() ? 30 : rooms.size());
        data.put("page", 1);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", data);
        out.put("status", 0);
        return out;
    }

    /** 房间内 AUP 分配明细，返回形状对齐原 ARO /room/rent/prepare/aups：{data:[...], status:0} */
    public Map<String, Object> listRoomAups(String roomId) {
        List<Map<String, Object>> aups = mapper.selectRoomAups(roomId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", aups);
        out.put("status", 0);
        return out;
    }

    /** AUP 下拉字典（自己的字段口径），返回 [{id,registerNo,projectGroupName}]，来自 aup_record approved 记录 */
    public List<Map<String, Object>> aupDict() {
        return aupRecordMapper.selectApprovedForDict();
    }

    /** 跨房间搜索 AUP，返回 [{roomId,roomName,piName,registerNumber,aupId,rentNumber}] */
    public List<Map<String, Object>> searchAups(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return new ArrayList<>();
        }
        return mapper.searchAups(keyword.trim());
    }

    // ═══════════════════════════════════════════════════════════
    // 写（本地化，不再投递 ARO）
    // ═══════════════════════════════════════════════════════════

    /** 新增/编辑 AUP 分配。body 含 id(编辑)/aupId/rentNumber/memo。 */
    public Map<String, Object> saveRoomAup(String roomId, Map<String, Object> body) {
        String aroId = str(body.get("id"));
        String aupId = str(body.get("aupId"));
        Integer rentNumber = toInt(body.get("rentNumber"));
        String memo = str(body.get("memo"));

        // 从 aup_record 反查课题组名 + AUP 编号（自己的字段口径）
        String groupName = null;
        String registerNo = null;
        if (aupId != null && !aupId.isBlank()) {
            Long regId = toLong(aupId);
            if (regId != null) {
                var reg = aupRecordMapper.selectById(regId);
                if (reg != null) {
                    groupName = reg.getProjectGroupName();
                    registerNo = reg.getRegisterNo();
                }
            }
        }
        if (aroId == null || aroId.isBlank() || "new".equals(aroId)) {
            // 新增：aro_id 用 aupId + roomId 合成，保证 upsert 幂等（同房间同 AUP 唯一）
            aroId = (roomId == null ? "0" : roomId) + "_" + (aupId == null ? "x" : aupId);
        }
        mapper.upsertRoomAup(aroId, roomId, null, groupName, registerNo, aupId, rentNumber, memo);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", Map.of("ok", true));
        out.put("status", 0);
        return out;
    }

    /** 删除 AUP 分配（本地软删）。 */
    public Map<String, Object> deleteRoomAup(String id) {
        mapper.softDeleteRoomAup(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", Map.of("ok", true));
        out.put("status", 0);
        return out;
    }

    // ═══════════════════════════════════════════════════════════
    // 同步（手动触发）
    // ═══════════════════════════════════════════════════════════

    /**
     * 从 ARO 拉取房间预约汇总 + 各房间 AUP 明细 + AUP 字典，按唯一键 upsert 到本地。
     * 不清空、不删除本地行；cage_booking_room_aup 的 deleted=1 行不会被复活。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> syncFromAro() {
        int rooms = 0;
        int aups = 0;

        // 1) 房间预约汇总
        Map<String, Object> roomRaw = aroService.fetchRoomRentListGlobal(1, 200);
        List<Map<String, Object>> roomRows = extractList(roomRaw.get("data"));
        List<Map<String, Object>> roomBatch = new ArrayList<>();
        List<String> roomIds = new ArrayList<>();
        for (Map<String, Object> r : roomRows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("roomId", str(r.get("roomId")));
            row.put("name", str(r.get("name")));
            row.put("description", str(r.get("description")));
            row.put("shelveNumber", toInt(r.get("shelveNumber")));
            row.put("animalCageNumber", toInt(r.get("animalCageNumber")));
            row.put("rentAnimalCageNumber", toInt(r.get("rentAnimalCageNumber")));
            row.put("usedAnimalCageNumber", toInt(r.get("usedAnimalCageNumber")));
            row.put("lastRentNumber", toInt(r.get("lastRentNumber")));
            row.put("memo", str(r.get("memo")));
            String roomId = str(r.get("roomId"));
            if (roomId != null && !roomId.isBlank()) roomIds.add(roomId);
            roomBatch.add(row);
        }
        if (!roomBatch.isEmpty()) {
            rooms = roomBatch.size();
            try { mapper.upsertRooms(roomBatch); } catch (Exception e) {
                log.warn("[booking-sync] 房间汇总 upsert 失败: {}", e.getMessage());
            }
        }

        // 2) 逐房间 AUP 明细
        List<Map<String, Object>> aupBatch = new ArrayList<>();
        for (String roomId : roomIds) {
            Map<String, Object> aupRaw = aroService.fetchRoomRentAupsGlobal(roomId, 1, 200);
            List<Map<String, Object>> aupRows = extractList(aupRaw.get("data"));
            for (Map<String, Object> a : aupRows) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("aroId", str(a.get("id")));
                row.put("roomId", roomId);
                row.put("name", str(a.get("name")));
                row.put("piName", str(a.get("piName")));
                row.put("registerNumber", str(a.get("registerNumber")));
                row.put("aupId", str(a.get("aupId")));
                row.put("rentNumber", toInt(a.get("rentNumber")));
                row.put("usedAnimalCageNumber", toInt(a.get("usedAnimalCageNumber")));
                row.put("memo", str(a.get("memo")));
                row.put("beginTime", str(a.get("beginTime")));
                row.put("endTime", str(a.get("endTime")));
                aupBatch.add(row);
            }
        }
        if (!aupBatch.isEmpty()) {
            aups = aupBatch.size();
            try { mapper.upsertRoomAups(aupBatch); } catch (Exception e) {
                log.warn("[booking-sync] AUP 明细 upsert 失败: {}", e.getMessage());
            }
        }

        // 3) 已通过 AUP → aup_record 已迁移到 AupAroSyncService.syncFromAro（全量 + 正文 + 评审记录）。
        //    此处不再用旧的 audited 接口写 aup_record，避免覆盖新同步写入的完整字段（部门/来源/审核人/快照）。

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("rooms", rooms);
        out.put("aups", aups);
        log.info("[booking-sync] 完成 rooms={} aups={}", rooms, aups);
        return out;
    }

    /** 当前 PUBLISHED 的 aup 模板 [id, version]；无则返回 null（不抛异常，同步侧降级） */
    private long[] resolvePublishedTemplateOrNull() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, version FROM form_template WHERE form_key = 'aup' AND status = 'PUBLISHED' "
                            + "ORDER BY version DESC LIMIT 1");
            if (rows.isEmpty()) return null;
            Map<String, Object> row = rows.get(0);
            long id = ((Number) row.get("id")).longValue();
            long version = row.get("version") == null ? 1 : ((Number) row.get("version")).longValue();
            return new long[]{id, version};
        } catch (Exception e) {
            log.warn("[booking-sync] 查询 PUBLISHED aup 模板失败: {}", e.getMessage());
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // helpers
    // ═══════════════════════════════════════════════════════════

    /** 从 ARO 响应 data 中提取 list；兼容 data 是 List 或嵌套 {list:[...]}/{data:[...]}。 */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractList(Object data) {
        if (data instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
            }
            return out;
        }
        if (data instanceof Map<?, ?> dm) {
            Object nested = dm.get("list");
            if (nested == null) nested = dm.get("data");
            if (nested instanceof List<?> list) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
                }
                return out;
            }
        }
        return new ArrayList<>();
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }
}
