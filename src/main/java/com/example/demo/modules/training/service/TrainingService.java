package com.example.demo.modules.training.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.entity.PersonnelRoomAuthorization;
import com.example.demo.modules.personnel.mapper.PersonnelRoomAuthorizationMapper;
import com.example.demo.modules.training.entity.Training;
import com.example.demo.modules.training.entity.TrainingEnrollment;
import com.example.demo.modules.training.entity.TrainingOccurrence;
import com.example.demo.modules.training.mapper.TrainingEnrollmentMapper;
import com.example.demo.modules.training.mapper.TrainingMapper;
import com.example.demo.modules.training.mapper.TrainingOccurrenceMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 培训（系列/场次/报名）CRUD。写操作（系列更新、场次/报名变更、审核、成绩、房间）均校验
 * 当前用户为该培训的所属人（ownerId）或平台所有者（PLATFORM_OWNER 及以上）。
 */
@Service
public class TrainingService {

    private static final DateTimeFormatter SPACE_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TrainingMapper trainingMapper;
    private final TrainingOccurrenceMapper occurrenceMapper;
    private final TrainingEnrollmentMapper enrollmentMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final PersonnelRoomAuthorizationMapper roomAuthMapper;
    private final ObjectMapper objectMapper;

    public TrainingService(TrainingMapper trainingMapper,
                           TrainingOccurrenceMapper occurrenceMapper,
                           TrainingEnrollmentMapper enrollmentMapper,
                           AroPersonnelMapper aroPersonnelMapper,
                           PersonnelRoomAuthorizationMapper roomAuthMapper,
                           ObjectMapper objectMapper) {
        this.trainingMapper = trainingMapper;
        this.occurrenceMapper = occurrenceMapper;
        this.enrollmentMapper = enrollmentMapper;
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
        t.setPaperId(toLong(body.get("paperId")));
        t.setOwnerId(str(body.get("ownerId")) != null ? str(body.get("ownerId")) : operatorId);
        t.setTimeLimit(toInt(body.get("timeLimit")));
        t.setRecurrence(str(body.get("recurrence")));
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
        if (body.containsKey("paperId")) t.setPaperId(toLong(body.get("paperId")));
        if (body.containsKey("ownerId")) t.setOwnerId(str(body.get("ownerId")));
        if (body.containsKey("timeLimit")) t.setTimeLimit(toInt(body.get("timeLimit")));
        if (body.containsKey("recurrence")) t.setRecurrence(str(body.get("recurrence")));
        trainingMapper.update(t);
        return get(id);
    }

    @Transactional
    public Map<String, Object> publish(Long id, User user) {
        Training t = requireTraining(id);
        checkOwner(user, t);
        trainingMapper.updateStatus(id, "PUBLISHED");
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

    /** 待审核/待评分学员（跨全部培训，含培训/场次信息） */
    public List<Map<String, Object>> listPending() {
        return enrollmentMapper.listPending();
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
            aroPersonnelMapper.updateRoomAuthManaged(traineeId, 1);
            roomAuthMapper.deleteByUser(traineeId);
            LocalDateTime now = LocalDateTime.now();
            for (String roomId : roomIds) {
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

    /** 所属人或平台所有者（PLATFORM_OWNER 及以上）可写。 */
    private void checkOwner(User user, Training training) {
        if (user.getId() != null && user.getId().equals(training.getOwnerId())) return;
        if (user.getRole() != null && user.getRole().getLevel() >= RoleEnum.PLATFORM_OWNER.getLevel()) return;
        throw TwinBusinessException.of(403, "仅培训所属人或平台所有者可操作");
    }

    private Map<String, Object> toSeriesJson(Training t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("code", t.getCode());
        m.put("name", t.getName());
        m.put("type", t.getType());
        m.put("paperId", t.getPaperId());
        m.put("ownerId", t.getOwnerId());
        m.put("timeLimit", t.getTimeLimit());
        m.put("recurrence", t.getRecurrence());
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

    private Long toLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    private boolean contains(String v, String k) {
        return v != null && v.toLowerCase().contains(k);
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
