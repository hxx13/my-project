package com.example.demo.modules.aro.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.example.demo.modules.aro.entity.AroTrainingSession;
import com.example.demo.modules.aro.entity.AroTrainingTrainee;
import com.example.demo.modules.aro.mapper.AroTrainingSessionMapper;
import com.example.demo.modules.aro.mapper.AroTrainingTraineeMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AroTrainingSyncService {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingSyncService.class);
    private static final String ARO = "https://aro.shsmu.edu.cn/jtu/api";

    private final RestTemplate restTemplate;
    private final AroTrainingSessionMapper sessionMapper;
    private final AroTrainingTraineeMapper traineeMapper;
    private final AroService aroService;
    private final JdbcTemplate jdbcTemplate;

    public AroTrainingSyncService(
            @org.springframework.beans.factory.annotation.Qualifier("aroRestTemplate") RestTemplate restTemplate,
            AroTrainingSessionMapper sessionMapper,
            AroTrainingTraineeMapper traineeMapper,
            AroService aroService,
            JdbcTemplate jdbcTemplate) {
        this.restTemplate = restTemplate;
        this.sessionMapper = sessionMapper;
        this.traineeMapper = traineeMapper;
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

    /** 全量同步所有培训场次及学员 */
    @Transactional
    public void syncAll() {
        String token = aroService.requireJtuApiToken();
        if (token == null || token.isBlank()) {
            log.warn("[AroSync] 共享 Token 不可用，跳过同步");
            return;
        }
        log.info("[AroSync] 开始全量同步...");

        // 1. 拉取所有 sessions
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

        // 2. 清空旧数据
        traineeMapper.deleteAll();
        sessionMapper.deleteAll();

        // 3. 逐场次拉取学员
        int totalTrainees = 0;
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        for (JSONObject s : allSessions) {
            Long sessionId = s.getLong("id");
            // save session
            AroTrainingSession session = new AroTrainingSession();
            session.setId(sessionId);
            session.setTitle(s.getString("title"));
            session.setTestContent(s.getString("testContent"));
            session.setAddress(s.getString("address"));
            try { session.setStartTime(LocalDateTime.parse(s.getString("startTime"), fmt)); } catch (Exception ignored) {}
            try { session.setEndTime(LocalDateTime.parse(s.getString("endTime"), fmt)); } catch (Exception ignored) {}
            session.setSignNumber(s.getInteger("signNumber"));
            session.setExaminerName(s.getString("examinerName"));
            session.setExaminerNumber(s.getString("examinerNumber"));
            session.setExamCertType(s.getInteger("examCertType"));
            session.setExamState(s.getInteger("examState"));
            session.setState(s.getInteger("state"));
            sessionMapper.upsert(session);

            // pull trainees (in batches for large sessions)
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
                            AroTrainingTrainee t = new AroTrainingTrainee();
                            t.setSessionId(sessionId);
                            t.setExamSignId(toLong(tm.get("examSignId")));
                            t.setName(toString(tm.get("name")));
                            t.setJobNumber(toString(tm.get("jobNumber")));
                            t.setMobilePhone(toString(tm.get("mobilePhone")));
                            t.setProjectGroup(toString(tm.get("projectGroupName")));
                            t.setTestYn(toInt(tm.get("testYn")));
                            t.setTestFraction(toInt(tm.get("testFraction")));
                            t.setUserId(toStr(tm.get("userId")));
                            t.setRoomIdsJson(JSON.toJSONString(tm.get("roomIds")));
                            t.setRoomsJson(JSON.toJSONString(tm.get("userJoinRooms")));
                            traineeMapper.insert(t);
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

    /** 单场次增量刷新 */
    @Transactional
    public void syncSession(Long sessionId) {
        String token = aroService.requireJtuApiToken();
        if (token == null || token.isBlank()) return;
        log.info("[AroSync] 刷新场次 {}", sessionId);
        traineeMapper.deleteBySessionId(sessionId);
        int tp = 1, count = 0;
        while (true) {
            try {
                String url = ARO + "/admin/examUserOffline/listExamUser_v2?pageSize=30&pageNum=" + tp + "&examId=" + sessionId;
                ResponseEntity<Map> resp = restTemplate.exchange(url, HttpMethod.GET, authHeaders(token), Map.class);
                Map<String, Object> body = resp.getBody();
                if (body == null) break;
                Object dObj = body.get("data");
                if (!(dObj instanceof Map<?, ?> dm)) break;
                Object lObj = dm.get("list");
                if (!(lObj instanceof List<?> tl) || tl.isEmpty()) break;
                for (Object o : tl) {
                    if (o instanceof Map<?, ?> tm) {
                        AroTrainingTrainee t = new AroTrainingTrainee();
                        t.setSessionId(sessionId);
                        t.setExamSignId(toLong(tm.get("examSignId")));
                        t.setName(toString(tm.get("name")));
                        t.setJobNumber(toString(tm.get("jobNumber")));
                        t.setMobilePhone(toString(tm.get("mobilePhone")));
                        t.setProjectGroup(toString(tm.get("projectGroupName")));
                        t.setTestYn(toInt(tm.get("testYn")));
                        t.setTestFraction(toInt(tm.get("testFraction")));
                        t.setUserId(toStr(tm.get("userId")));
                        t.setRoomIdsJson(JSON.toJSONString(tm.get("roomIds")));
                        t.setRoomsJson(JSON.toJSONString(tm.get("userJoinRooms")));
                        traineeMapper.insert(t);
                        count++;
                    }
                }
                int tt = dm.get("total") instanceof Number n ? n.intValue() : 0;
                if (tp * 30 >= tt) break;
                tp++;
            } catch (Exception e) {
                log.error("[AroSync] 刷新 session={} 学员第{}页失败: {}", sessionId, tp, e.getMessage());
                break;
            }
        }
        log.info("[AroSync] 场次 {} 刷新完成: {} 学员", sessionId, count);
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
