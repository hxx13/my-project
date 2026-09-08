package com.example.demo.modules.training.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.entity.PersonnelRoomAuthorization;
import com.example.demo.modules.personnel.mapper.PersonnelRoomAuthorizationMapper;
import com.example.demo.modules.training.entity.Training;
import com.example.demo.modules.training.entity.TrainingEnrollment;
import com.example.demo.modules.training.entity.TrainingFavorite;
import com.example.demo.modules.training.entity.TrainingLocationPreset;
import com.example.demo.modules.training.entity.TrainingOccurrence;
import com.example.demo.modules.training.entity.TrainingTypePreset;
import com.example.demo.modules.training.mapper.TrainingEnrollmentMapper;
import com.example.demo.modules.training.mapper.TrainingFavoriteMapper;
import com.example.demo.modules.training.mapper.TrainingLocationPresetMapper;
import com.example.demo.modules.training.mapper.TrainingMapper;
import com.example.demo.modules.training.mapper.TrainingOccurrenceMapper;
import com.example.demo.modules.training.mapper.TrainingTypePresetMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 培训（系列/场次/报名）CRUD。写操作（系列更新、场次/报名变更、审核、成绩、房间）均校验
 * 当前用户为该培训的所属人（ownerIds，多选）或超级管理员（SUPER_ADMIN 及以上，含 PLATFORM_OWNER），
 * 使 ARO 同步的培训（ownerIds 为空）也可被 SUPER_ADMIN/PLATFORM_OWNER 编辑。
 */
@Service
public class TrainingService {

    private static final DateTimeFormatter SPACE_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TrainingMapper trainingMapper;
    private final TrainingOccurrenceMapper occurrenceMapper;
    private final TrainingEnrollmentMapper enrollmentMapper;
    private final TrainingFavoriteMapper favoriteMapper;
    private final TrainingLocationPresetMapper locationPresetMapper;
    private final TrainingTypePresetMapper typePresetMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final PersonnelRoomAuthorizationMapper roomAuthMapper;
    private final ObjectMapper objectMapper;

    public TrainingService(TrainingMapper trainingMapper,
                           TrainingOccurrenceMapper occurrenceMapper,
                           TrainingEnrollmentMapper enrollmentMapper,
                           TrainingFavoriteMapper favoriteMapper,
                           TrainingLocationPresetMapper locationPresetMapper,
                           TrainingTypePresetMapper typePresetMapper,
                           AroPersonnelMapper aroPersonnelMapper,
                           PersonnelRoomAuthorizationMapper roomAuthMapper,
                           ObjectMapper objectMapper) {
        this.trainingMapper = trainingMapper;
        this.occurrenceMapper = occurrenceMapper;
        this.enrollmentMapper = enrollmentMapper;
        this.favoriteMapper = favoriteMapper;
        this.locationPresetMapper = locationPresetMapper;
        this.typePresetMapper = typePresetMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.roomAuthMapper = roomAuthMapper;
        this.objectMapper = objectMapper;
    }

    // ========================================================================
    // 系列（series）
    // ========================================================================

    public List<Map<String, Object>> list(String keyword) {
        List<Training> all = trainingMapper.list();
        String k = keyword == null ? null : keyword.trim().toLowerCase();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Training t : all) {
            if (k != null && !k.isEmpty()
                    && !contains(t.getCode(), k) && !contains(t.getName(), k)) {
                continue;
            }
            out.add(toSeriesJson(t));
        }
        return out;
    }

    public Map<String, Object> get(Long id) {
        Training t = trainingMapper.findById(id);
        if (t == null) return null;
        Map<String, Object> out = toSeriesJson(t);
        List<Map<String, Object>> occurrences = new ArrayList<>();
        for (TrainingOccurrence o : occurrenceMapper.listByTrainingId(id)) {
            occurrences.add(toOccurrenceJson(o, true));
        }
        out.put("occurrences", occurrences);
        return out;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> body, String operatorId) {
        Training t = new Training();
        t.setCode(str(body.get("code")));
        t.setName(str(body.get("name")));
        t.setType(toInt(body.get("type")));
        t.setTypeName(str(body.get("typeName")));
        t.setPaperIdsJson(toJson(body.get("paperIds")));
        List<String> ownerIds = strList(body.get("ownerIds"));
        t.setOwnerIdsJson(toJson(ownerIds != null && !ownerIds.isEmpty() ? ownerIds : List.of(operatorId)));
        t.setRecurrence(str(body.get("recurrence")));
        t.setRecurrenceDay(toInt(body.get("recurrenceDay")));
        t.setRecurrenceTime(str(body.get("recurrenceTime")));
        t.setStatus("DRAFT");
        t.setCreatedBy(operatorId);
        trainingMapper.insert(t);
        return get(t.getId());
    }

    @Transactional
    public Map<String, Object> update(Long id, Map<String, Object> body, User user) {
        Training t = requireTraining(id);
        checkOwner(user, t);
        if (body.containsKey("name")) t.setName(str(body.get("name")));
        if (body.containsKey("type")) t.setType(toInt(body.get("type")));
        if (body.containsKey("typeName")) t.setTypeName(str(body.get("typeName")));
        if (body.containsKey("paperIds")) t.setPaperIdsJson(toJson(body.get("paperIds")));
        if (body.containsKey("ownerIds")) t.setOwnerIdsJson(toJson(strList(body.get("ownerIds"))));
        if (body.containsKey("recurrence")) t.setRecurrence(str(body.get("recurrence")));
        if (body.containsKey("recurrenceDay")) t.setRecurrenceDay(toInt(body.get("recurrenceDay")));
        if (body.containsKey("recurrenceTime")) t.setRecurrenceTime(str(body.get("recurrenceTime")));
        trainingMapper.update(t);
        return get(id);
    }

    @Transactional
    public Map<String, Object> publish(Long id, User user) {
        Training t = requireTraining(id);
        checkOwner(user, t);
        trainingMapper.publishNow(id);
        return get(id);
    }

    @Transactional
    public Map<String, Object> unpublish(Long id, User user) {
        Training t = requireTraining(id);
        checkOwner(user, t);
        trainingMapper.unpublish(id);
        return get(id);
    }

    @Transactional
    public int delete(Long id, User user) {
        Training t = requireTraining(id);
        checkOwner(user, t);
        for (TrainingOccurrence o : occurrenceMapper.listByTrainingId(id)) {
            enrollmentMapper.deleteByOccurrenceId(o.getId());
        }
        occurrenceMapper.deleteByTrainingId(id);
        return trainingMapper.delete(id);
    }

    // ========================================================================
    // 地点预设库（location preset）
    // ========================================================================

    public List<Map<String, Object>> listLocations() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TrainingLocationPreset p : locationPresetMapper.list()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("name", p.getName());
            m.put("address", p.getAddress());
            out.add(m);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> addLocation(String name, String address) {
        TrainingLocationPreset p = new TrainingLocationPreset();
        p.setName(name);
        p.setAddress(address);
        locationPresetMapper.insert(p);
        return Map.of("id", p.getId(), "name", p.getName(), "address", p.getAddress());
    }

    @Transactional
    public int deleteLocation(Long id) {
        return locationPresetMapper.delete(id);
    }

    // ========================================================================
    // 类型预设库（type preset）
    // ========================================================================

    public List<Map<String, Object>> listTypePresets() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TrainingTypePreset p : typePresetMapper.list()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("name", p.getName());
            out.add(m);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> createTypePreset(String name) {
        TrainingTypePreset p = new TrainingTypePreset();
        p.setName(name);
        typePresetMapper.insert(p);
        return Map.of("id", p.getId(), "name", p.getName());
    }

    @Transactional
    public int deleteTypePreset(Long id) {
        return typePresetMapper.delete(id);
    }

    // ========================================================================
    // 场次（occurrence）
    // ========================================================================

    @Transactional
    public Map<String, Object> addOccurrence(Long trainingId, Map<String, Object> body, User user) {
        Training t = requireTraining(trainingId);
        checkOwner(user, t);
        TrainingOccurrence o = new TrainingOccurrence();
        o.setTrainingId(trainingId);
        o.setStartTime(toDateTime(body.get("startTime")));
        o.setEndTime(toDateTime(body.get("endTime")));
        o.setAddress(str(body.get("address")));
        o.setTimeLimit(toInt(body.get("timeLimit")));
        o.setExaminerName(str(body.get("examinerName")));
        o.setExaminerNumber(str(body.get("examinerNumber")));
        o.setStatus(str(body.get("status")) != null ? str(body.get("status")) : "DRAFT");
        occurrenceMapper.insert(o);
        return toOccurrenceJson(o, false);
    }

    @Transactional
    public Map<String, Object> updateOccurrence(Long id, Map<String, Object> body, User user) {
        TrainingOccurrence o = requireOccurrence(id);
        checkOwner(user, requireTraining(o.getTrainingId()));
        if (body.containsKey("startTime")) o.setStartTime(toDateTime(body.get("startTime")));
        if (body.containsKey("endTime")) o.setEndTime(toDateTime(body.get("endTime")));
        if (body.containsKey("address")) o.setAddress(str(body.get("address")));
        if (body.containsKey("timeLimit")) o.setTimeLimit(toInt(body.get("timeLimit")));
        if (body.containsKey("examinerName")) o.setExaminerName(str(body.get("examinerName")));
        if (body.containsKey("examinerNumber")) o.setExaminerNumber(str(body.get("examinerNumber")));
        if (body.containsKey("status")) o.setStatus(str(body.get("status")));
        occurrenceMapper.update(o);
        return toOccurrenceJson(o, false);
    }

    @Transactional
    public int deleteOccurrence(Long id, User user) {
        TrainingOccurrence o = requireOccurrence(id);
        checkOwner(user, requireTraining(o.getTrainingId()));
        enrollmentMapper.deleteByOccurrenceId(id);
        return occurrenceMapper.delete(id);
    }

    /**
     * 按循环规则补齐未来场次。由定时任务每日调用，无需用户校验。
     * WEEKLY 匹配 recurrenceDay（1=周一..7=周日）；MONTHLY/QUARTERLY/YEARLY 匹配
     * recurrenceDay（1..31，超出当月天数时回退到月末）；DAILY 为遗留值，每天一次。
     * 起始时刻为 recurrenceTime（"HH:mm"），结束 = 起始 + 2 小时；同一 (trainingId, startTime) 去重。
     * 返回本次新增场次数。
     */
    @Transactional
    public int generateOccurrences(Long trainingId) {
        Training t = trainingMapper.findById(trainingId);
        if (t == null) return 0;
        String rec = t.getRecurrence() == null ? null : t.getRecurrence().trim().toUpperCase();

        LocalTime time = parseTime(t.getRecurrenceTime());
        if (time == null) return 0;

        List<TrainingOccurrence> existing = occurrenceMapper.listByTrainingId(trainingId);

        LocalDate today = LocalDate.now();
        int generated = 0;
        for (LocalDate day : candidateDates(today, rec, t.getRecurrenceDay())) {
            LocalDateTime start = LocalDateTime.of(day, time);
            LocalDateTime end = start.plusHours(2);
            if (overlaps(existing, start, end)) continue;
            TrainingOccurrence o = new TrainingOccurrence();
            o.setTrainingId(trainingId);
            o.setStartTime(start);
            o.setEndTime(end);
            o.setStatus("AUTO");
            occurrenceMapper.insert(o);
            existing.add(o);
            generated++;
        }
        return generated;
    }

    /** 判断候选时间段是否与已有场次（手动+自动）重叠，避免时间冲突。 */
    private static boolean overlaps(List<TrainingOccurrence> existing, LocalDateTime start, LocalDateTime end) {
        for (TrainingOccurrence o : existing) {
            if (o.getStartTime() == null || o.getEndTime() == null) continue;
            if (o.getStartTime().isBefore(end) && start.isBefore(o.getEndTime())) return true;
        }
        return false;
    }

    /** 按循环类型生成未来候选日期列表。 */
    private static List<LocalDate> candidateDates(LocalDate today, String rec, Integer recurrenceDay) {
        List<LocalDate> out = new ArrayList<>();
        if ("WEEKLY".equals(rec)) {
            if (recurrenceDay == null) return out;
            LocalDate next = today.plusDays(1);
            while (next.getDayOfWeek().getValue() != recurrenceDay) next = next.plusDays(1);
            for (int k = 0; k < 12; k++) out.add(next.plusDays(7L * k));
        } else if ("MONTHLY".equals(rec)) {
            for (int k = 1; k <= 12; k++) out.add(clampDay(today.plusMonths(k), recurrenceDay));
        } else if ("QUARTERLY".equals(rec)) {
            for (int k = 1; k <= 8; k++) out.add(clampDay(today.plusMonths(3L * k), recurrenceDay));
        } else if ("YEARLY".equals(rec)) {
            for (int k = 1; k <= 3; k++) out.add(clampDay(today.plusYears(k), recurrenceDay));
        } else if ("DAILY".equals(rec)) {
            for (int i = 0; i < 28; i++) out.add(today.plusDays(i));
        }
        return out;
    }

    /** 取指定月的第 recurrenceDay 天，超出当月天数时回退到月末。 */
    private static LocalDate clampDay(LocalDate base, Integer recurrenceDay) {
        int rd = recurrenceDay == null ? 1 : recurrenceDay;
        return base.withDayOfMonth(Math.min(rd, base.lengthOfMonth()));
    }

    // ========================================================================
    // 报名（enrollment）
    // ========================================================================

    public List<Map<String, Object>> listEnrollments(Long occurrenceId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TrainingEnrollment e : enrollmentMapper.listByOccurrenceId(occurrenceId)) {
            out.add(toEnrollmentJson(e));
        }
        return out;
    }

    /** 待审核/待评分学员（仅当前用户作为所属人的培训，含培训/场次信息） */
    public List<Map<String, Object>> listPending(String userId) {
        return enrollmentMapper.listPendingByOwner(userId);
    }

    // ========================================================================
    // 收藏订阅（favorite）
    // ========================================================================

    public List<Long> listFavorites(String userId) {
        return favoriteMapper.listTrainingIdsByUser(userId);
    }

    public void star(Long trainingId, String userId) {
        requireTraining(trainingId);
        if (favoriteMapper.exists(userId, trainingId) == 0) {
            TrainingFavorite f = new TrainingFavorite();
            f.setUserId(userId);
            f.setTrainingId(trainingId);
            favoriteMapper.insert(f);
        }
    }

    public void unstar(Long trainingId, String userId) {
        favoriteMapper.delete(userId, trainingId);
    }

    @Transactional
    public List<Map<String, Object>> addEnrollments(Long occurrenceId, List<Map<String, Object>> rows, User user) {
        TrainingOccurrence o = requireOccurrence(occurrenceId);
        checkOwner(user, requireTraining(o.getTrainingId()));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            TrainingEnrollment e = new TrainingEnrollment();
            e.setOccurrenceId(occurrenceId);
            e.setTraineeId(str(row.get("traineeId")));
            e.setName(str(row.get("name")));
            e.setJobNumber(str(row.get("jobNumber")));
            e.setProjectGroup(str(row.get("projectGroup")));
            enrollmentMapper.insert(e);
            out.add(toEnrollmentJson(e));
        }
        return out;
    }

    @Transactional
    public int deleteEnrollment(Long id, User user) {
        TrainingEnrollment e = requireEnrollment(id);
        checkOwner(user, trainingOfEnrollment(id));
        return enrollmentMapper.delete(id);
    }

    @Transactional
    public int audit(Long enrollmentId, int state, User user) {
        requireEnrollment(enrollmentId);
        checkOwner(user, trainingOfEnrollment(enrollmentId));
        return enrollmentMapper.updateTestYn(enrollmentId, state);
    }

    @Transactional
    public int score(Long enrollmentId, int state, User user) {
        requireEnrollment(enrollmentId);
        checkOwner(user, trainingOfEnrollment(enrollmentId));
        return enrollmentMapper.updateTestFraction(enrollmentId, state);
    }

    @Transactional
    public Map<String, Object> setRooms(Long enrollmentId, List<String> roomIds, User user) {
        TrainingEnrollment e = requireEnrollment(enrollmentId);
        checkOwner(user, trainingOfEnrollment(enrollmentId));
        String traineeId = e.getTraineeId();
        String json = toJson(roomIds);
        enrollmentMapper.updateRooms(enrollmentId, json, json);
        if (traineeId != null && !traineeId.isBlank()) {
            // 重新计算该人「所有报名场次」的房间并集，避免改一场清掉其它培训授的房间
            HashSet<String> union = new HashSet<>();
            for (TrainingEnrollment en : enrollmentMapper.listByTraineeId(traineeId)) {
                Object o = fromJson(en.getRoomIdsJson());
                if (o instanceof List<?> l) {
                    for (Object x : l) if (x != null) union.add(String.valueOf(x));
                }
            }
            aroPersonnelMapper.updateRoomAuthManaged(traineeId, 1);
            roomAuthMapper.deleteByUser(traineeId);
            LocalDateTime now = LocalDateTime.now();
            for (String roomId : union) {
                PersonnelRoomAuthorization row = new PersonnelRoomAuthorization();
                row.setAroUserId(traineeId);
                row.setRoomId(roomId);
                row.setUpdatedAt(now);
                row.setUpdatedBy(user.getId());
                roomAuthMapper.insert(row);
            }
        }
        e.setRoomIdsJson(json);
        e.setRoomsJson(json);
        return toEnrollmentJson(e);
    }

    // ========================================================================
    // 内部工具
    // ========================================================================

    private Training requireTraining(Long id) {
        Training t = trainingMapper.findById(id);
        if (t == null) throw TwinBusinessException.of(404, "培训不存在");
        return t;
    }

    private TrainingOccurrence requireOccurrence(Long id) {
        TrainingOccurrence o = occurrenceMapper.findById(id);
        if (o == null) throw TwinBusinessException.of(404, "场次不存在");
        return o;
    }

    private TrainingEnrollment requireEnrollment(Long id) {
        TrainingEnrollment e = enrollmentMapper.findById(id);
        if (e == null) throw TwinBusinessException.of(404, "报名记录不存在");
        return e;
    }

    /** 由场次 id 反查其所属培训系列。 */
    private Training trainingOfOccurrence(Long occurrenceId) {
        return requireTraining(requireOccurrence(occurrenceId).getTrainingId());
    }

    /** 由报名 id 反查其所属培训系列（报名 → 场次 → 系列）。 */
    private Training trainingOfEnrollment(Long enrollmentId) {
        return trainingOfOccurrence(requireEnrollment(enrollmentId).getOccurrenceId());
    }

    /** 所属人或超级管理员（SUPER_ADMIN 及以上，含 PLATFORM_OWNER）可写。 */
    private void checkOwner(User user, Training training) {
        if (user.getRole() != null && user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel()) return;
        if (user.getId() != null && parseOwnerIds(training.getOwnerIdsJson()).contains(user.getId())) return;
        throw TwinBusinessException.of(403, "仅培训所属人或超级管理员可操作");
    }

    private Map<String, Object> toSeriesJson(Training t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("code", t.getCode());
        m.put("name", t.getName());
        m.put("type", t.getType());
        m.put("typeName", t.getTypeName());
        m.put("paperIds", roomList(t.getPaperIdsJson()));
        m.put("ownerIds", parseOwnerIds(t.getOwnerIdsJson()));
        m.put("recurrence", t.getRecurrence());
        m.put("recurrenceDay", t.getRecurrenceDay());
        m.put("recurrenceTime", t.getRecurrenceTime());
        m.put("status", t.getStatus());
        m.put("createdBy", t.getCreatedBy());
        m.put("createdAt", t.getCreatedAt());
        m.put("updatedAt", t.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toOccurrenceJson(TrainingOccurrence o, boolean withEnrollments) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", o.getId());
        m.put("trainingId", o.getTrainingId());
        m.put("startTime", o.getStartTime());
        m.put("endTime", o.getEndTime());
        m.put("address", o.getAddress());
        m.put("timeLimit", o.getTimeLimit());
        m.put("examinerName", o.getExaminerName());
        m.put("examinerNumber", o.getExaminerNumber());
        m.put("status", o.getStatus());
        m.put("createdAt", o.getCreatedAt());
        m.put("updatedAt", o.getUpdatedAt());
        if (withEnrollments) {
            List<Map<String, Object>> enrollments = new ArrayList<>();
            for (TrainingEnrollment e : enrollmentMapper.listByOccurrenceId(o.getId())) {
                enrollments.add(toEnrollmentJson(e));
            }
            m.put("enrollments", enrollments);
        }
        return m;
    }

    private Map<String, Object> toEnrollmentJson(TrainingEnrollment e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("occurrenceId", e.getOccurrenceId());
        m.put("traineeId", e.getTraineeId());
        m.put("name", e.getName());
        m.put("jobNumber", e.getJobNumber());
        m.put("projectGroup", e.getProjectGroup());
        m.put("testYn", e.getTestYn());
        m.put("testFraction", e.getTestFraction());
        m.put("roomIds", roomList(e.getRoomIdsJson()));
        m.put("rooms", roomList(e.getRoomsJson()));
        m.put("createdAt", e.getCreatedAt());
        m.put("updatedAt", e.getUpdatedAt());
        return m;
    }

    private Object roomList(String json) {
        Object o = fromJson(json);
        return o != null ? o : List.of();
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private Integer toInt(Object v) {
        return v instanceof Number n ? n.intValue() : null;
    }

    private boolean contains(String v, String k) {
        return v != null && v.toLowerCase().contains(k);
    }

    /** owner_ids_json → List<String>（解析失败/空返回空列表）。 */
    private List<String> parseOwnerIds(String json) {
        Object o = fromJson(json);
        if (!(o instanceof List<?> list)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object x : list) if (x != null) out.add(String.valueOf(x));
        return out;
    }

    /** 请求体里的字符串数组 → 去空 List；非数组返回 null。 */
    private List<String> strList(Object v) {
        if (!(v instanceof List<?> list)) return null;
        List<String> out = new ArrayList<>();
        for (Object x : list) {
            String s = str(x);
            if (s != null) out.add(s);
        }
        return out;
    }

    private String toJson(Object o) {
        if (o == null) return null;
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    private Object fromJson(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return objectMapper.readValue(s, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    /** "HH:mm"（也接受 "HH:mm:ss"）→ LocalTime，解析失败返回 null。 */
    private static LocalTime parseTime(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalTime.parse(s.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDateTime toDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.util.Date d) return d.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return LocalDateTime.parse(s);
        } catch (Exception ignore) {
            // 尝试 "yyyy-MM-dd HH:mm:ss"
        }
        try {
            return LocalDateTime.parse(s.replace('T', ' ').substring(0, Math.min(s.length(), 19)), SPACE_DT);
        } catch (Exception ignore) {
            // 尝试 Instant（带时区 ISO）
        }
        try {
            return Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDateTime();
        } catch (Exception ignore) {
            return null;
        }
    }
}
