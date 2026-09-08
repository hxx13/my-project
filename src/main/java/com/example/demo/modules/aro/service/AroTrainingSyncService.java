package com.example.demo.modules.aro.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.example.demo.modules.training.entity.Training;
import com.example.demo.modules.training.entity.TrainingEnrollment;
import com.example.demo.modules.training.entity.TrainingOccurrence;
import com.example.demo.modules.training.mapper.TrainingEnrollmentMapper;
import com.example.demo.modules.training.mapper.TrainingMapper;
import com.example.demo.modules.training.mapper.TrainingOccurrenceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 拉取 ARO 培训场次/学员，直接写入本地 training / training_occurrence / training_enrollment 表。
 * 全量同步：先删掉所有 ARO 同步来的培训（code 前缀 aro-），再重新拉取重建。
 */
@Service
public class AroTrainingSyncService {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingSyncService.class);
    private static final String ARO = "https://aro.shsmu.edu.cn/jtu/api";
    private static final String CODE_PREFIX = "aro-%";

    private final RestTemplate restTemplate;
    private final TrainingMapper trainingMapper;
    private final TrainingOccurrenceMapper occurrenceMapper;
    private final TrainingEnrollmentMapper enrollmentMapper;
    private final AroService aroService;
    private final JdbcTemplate jdbcTemplate;

    public AroTrainingSyncService(
            @org.springframework.beans.factory.annotation.Qualifier("aroRestTemplate") RestTemplate restTemplate,
            TrainingMapper trainingMapper,
            TrainingOccurrenceMapper occurrenceMapper,
            TrainingEnrollmentMapper enrollmentMapper,
            AroService aroService,
            JdbcTemplate jdbcTemplate) {
        this.restTemplate = restTemplate;
        this.trainingMapper = trainingMapper;
        this.occurrenceMapper = occurrenceMapper;
        this.enrollmentMapper = enrollmentMapper;
        this.aroService = aroService;
        this.jdbcTemplate = jdbcTemplate;
    }

    public Map<String, String> getLastSyncInfo() {
        Map<String, String> result = new LinkedHashMap<>();
        try {
            var rows = jdbcTemplate.queryForList(
                "SELECT last_run_at, last_success_at FROM twin_job_schedule_config WHERE job_key = 'ARO_TRAINING_SYNC'");
            if (!rows.isEmpty()) {
                var r = rows.get(0);
                result.put("lastRun", String.valueOf(r.getOrDefault("last_run_at", "")));
                result.put("lastSuccess", String.valueOf(r.getOrDefault("last_success_at", "")));
            }
        } catch (Exception ignored) {}
        result.putIfAbsent("lastRun", "");
        result.putIfAbsent("lastSuccess", "");
        return result;
    }

    /** 全量同步：拉取 ARO 培训场次 + 学员，写入本地 training 表 */
    @Transactional
    public void syncAll() {
        String token = aroService.requireJtuApiToken();
        if (token == null || token.isBlank()) {
            log.warn("[AroSync] 共享 Token 不可用，跳过同步");
            return;
        }
        log.info("[AroSync] 开始全量同步...");

        // 1. 拉取所有场次
        List<JSONObject> allSessions = new ArrayList<>();
        int page = 1;
        while (true) {
            try {
                String url = ARO + "/admin/examUserOffline/2?pageSize=50&pageNum=" + page;
                ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, authHeaders(token), Map.class);
                Map<String, Object> body = resp.getBody();
                if (body == null) break;
                Object dataObj = body.get("data");
                if (!(dataObj instanceof Map<?, ?> dm)) break;
                Object listObj = dm.get("list");
                if (!(listObj instanceof List<?> l) || l.isEmpty()) break;
                for (Object o : l) {
                    if (o instanceof Map<?, ?> m) {
                        JSONObject jo = new JSONObject();
                        jo.putAll((Map<String, Object>) m);
                        allSessions.add(jo);
                    }
                }
                int total = dm.get("total") instanceof Number n ? n.intValue() : 0;
                if (page * 50 >= total) break;
                page++;
            } catch (Exception e) {
                log.error("[AroSync] 拉取 session 第{}页失败: {}", page, e.getMessage());
                break;
            }
        }
        log.info("[AroSync] 拉取到 {} 个培训场次", allSessions.size());

        // 2. 清掉上一次同步的 ARO 培训（先子后父）
        enrollmentMapper.deleteByTrainingCodePrefix(CODE_PREFIX);
        occurrenceMapper.deleteByTrainingCodePrefix(CODE_PREFIX);
        trainingMapper.deleteByCodePrefix(CODE_PREFIX);

        // 3. 逐场次写入 training + occurrence + enrollment
        int totalTrainees = 0;
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        for (JSONObject s : allSessions) {
            Long sessionId = s.getLong("id");
            Training training = new Training();
            training.setCode("aro-" + sessionId);
            training.setName(s.getString("title"));
            Integer certType = s.getInteger("examCertType");
            training.setType(certType != null && certType == 2 ? 2 : 1);
            training.setTypeName(certType != null && certType == 2 ? "手术培训" : "准入培训");
            training.setStatus("PUBLISHED");
            training.setCreatedBy("ARO_SYNC");
            trainingMapper.insert(training);

            TrainingOccurrence occ = new TrainingOccurrence();
            occ.setTrainingId(training.getId());
            occ.setAddress(s.getString("address"));
            occ.setExaminerName(s.getString("examinerName"));
            occ.setExaminerNumber(s.getString("examinerNumber"));
            occ.setStatus("DONE");
            try { occ.setStartTime(LocalDateTime.parse(s.getString("startTime"), fmt)); } catch (Exception ignored) {}
            try { occ.setEndTime(LocalDateTime.parse(s.getString("endTime"), fmt)); } catch (Exception ignored) {}
            occurrenceMapper.insert(occ);

            // 拉学员（大批量分页）
            int tp = 1;
            while (true) {
                try {
                    String url = ARO + "/admin/examUserOffline/listExamUser_v2?pageSize=30&pageNum=" + tp + "&examId=" + sessionId;
                    ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, authHeaders(token), Map.class);
                    Map<String, Object> body = resp.getBody();
                    if (body == null) break;
                    Object dObj = body.get("data");
                    if (!(dObj instanceof Map<?, ?> dm2)) break;
                    Object lObj = dm2.get("list");
                    if (!(lObj instanceof List<?> tl) || tl.isEmpty()) break;
                    for (Object o : tl) {
                        if (o instanceof Map<?, ?> tm) {
                            TrainingEnrollment e = new TrainingEnrollment();
                            e.setOccurrenceId(occ.getId());
                            e.setTraineeId(toStr(tm.get("userId")));
                            e.setName(toString(tm.get("name")));
                            e.setJobNumber(toString(tm.get("jobNumber")));
                            e.setProjectGroup(toString(tm.get("projectGroupName")));
                            e.setTestYn(toInt(tm.get("testYn")));
                            e.setTestFraction(toInt(tm.get("testFraction")));
                            e.setRoomIdsJson(JSON.toJSONString(tm.get("roomIds")));
                            e.setRoomsJson(JSON.toJSONString(tm.get("userJoinRooms")));
                            enrollmentMapper.insert(e);
                            totalTrainees++;
                        }
                    }
                    int tt = dm2.get("total") instanceof Number n ? n.intValue() : 0;
                    if (tp * 30 >= tt) break;
                    tp++;
                } catch (Exception e) {
                    log.error("[AroSync] 拉取 session={} 学员第{}页失败: {}", sessionId, tp, e.getMessage());
                    break;
                }
            }
        }
        log.info("[AroSync] 同步完成: {} 场次, {} 学员", allSessions.size(), totalTrainees);
    }

    private HttpEntity<Void> authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("token", token);
        headers.set("Accept", "application/json");
        headers.set("Referer", "https://aro.shsmu.edu.cn/");
        return new HttpEntity<>(headers);
    }

    private String toString(Object o) { return o == null ? null : o.toString(); }
    private String toStr(Object o) { return o == null ? null : String.valueOf(o); }
    private Long toLong(Object o) { return o instanceof Number n ? n.longValue() : null; }
    private Integer toInt(Object o) { return o instanceof Number n ? n.intValue() : null; }
}
