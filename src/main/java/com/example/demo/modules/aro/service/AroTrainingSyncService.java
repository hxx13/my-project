package com.example.demo.modules.aro.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.example.demo.modules.aro.entity.AroTrainingSession;
import com.example.demo.modules.aro.entity.AroTrainingTrainee;
import com.example.demo.modules.aro.mapper.AroTrainingFavoriteMapper;
import com.example.demo.modules.aro.mapper.AroTrainingSessionMapper;
import com.example.demo.modules.aro.mapper.AroTrainingTraineeMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.notification.service.NotificationPushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class AroTrainingSyncService {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingSyncService.class);
    private static final String ARO = "https://aro.shsmu.edu.cn/jtu/api";

    private final RestTemplate restTemplate;
    private final AroTrainingSessionMapper sessionMapper;
    private final AroTrainingTraineeMapper traineeMapper;
    private final AroTrainingFavoriteMapper favoriteMapper;
    private final AroService aroService;
    private final JdbcTemplate jdbcTemplate;
    private final PushService pushService;
    private final NotificationPushService notificationPushService;

    public AroTrainingSyncService(
            @org.springframework.beans.factory.annotation.Qualifier("aroRestTemplate") RestTemplate restTemplate,
            AroTrainingSessionMapper sessionMapper,
            AroTrainingTraineeMapper traineeMapper,
            AroTrainingFavoriteMapper favoriteMapper,
            AroService aroService,
            JdbcTemplate jdbcTemplate,
            PushService pushService,
            NotificationPushService notificationPushService) {
        this.restTemplate = restTemplate;
        this.sessionMapper = sessionMapper;
        this.traineeMapper = traineeMapper;
        this.favoriteMapper = favoriteMapper;
        this.aroService = aroService;
        this.jdbcTemplate = jdbcTemplate;
        this.pushService = pushService;
        this.notificationPushService = notificationPushService;
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

    /** 单场次增量刷新，同步完成后向订阅者推送新增待审核学员 */
    @Transactional
    public void syncSession(Long sessionId) {
        String token = aroService.requireJtuApiToken();
        if (token == null || token.isBlank()) return;
        log.info("[AroSync] 刷新场次 {}", sessionId);

        // 0. 刷新前记录旧学员状态（examSignId -> testYn）
        List<AroTrainingTrainee> oldTrainees = traineeMapper.selectBySessionId(sessionId);
        Map<Long, Integer> oldTestYnMap = new LinkedHashMap<>();
        for (AroTrainingTrainee t : oldTrainees) {
            if (t.getExamSignId() != null) {
                oldTestYnMap.put(t.getExamSignId(), t.getTestYn());
            }
        }
        AroTrainingSession session = sessionMapper.selectById(sessionId);
        String sessionTitle = session != null && session.getTitle() != null ? session.getTitle() : String.valueOf(sessionId);

        // 1. 清空旧学员数据
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

        // 2. 找出新增的待审核学员（testYn=0 且旧数据中不存在或旧 testYn != 0）
        List<AroTrainingTrainee> newTrainees = traineeMapper.selectBySessionId(sessionId);
        List<AroTrainingTrainee> newPending = new ArrayList<>();
        for (AroTrainingTrainee t : newTrainees) {
            if (t.getTestYn() == null || t.getTestYn() == 0) {
                Integer oldTestYn = oldTestYnMap.get(t.getExamSignId());
                if (oldTestYn == null || oldTestYn != 0) {
                    newPending.add(t);
                }
            }
        }

        if (newPending.isEmpty()) {
            log.info("[AroSync] 场次 {} 无新增待审核学员，跳过推送", sessionId);
            return;
        }

        // 3. 查订阅者
        List<String> subscriberIds = favoriteMapper.findSubscribersBySessionId(String.valueOf(sessionId));
        if (subscriberIds.isEmpty()) {
            log.info("[AroSync] 场次 {} 无订阅者，跳过推送", sessionId);
            return;
        }
        Set<String> subscriberSet = new HashSet<>(subscriberIds);

        // 4. 逐学员推送
        for (AroTrainingTrainee trainee : newPending) {
            String traineeName = trainee.getName() != null ? trainee.getName() : "";
            String jobNumber = trainee.getJobNumber() != null ? trainee.getJobNumber() : "";
            String projectGroup = trainee.getProjectGroup() != null ? trainee.getProjectGroup() : "";
            String examSignId = trainee.getExamSignId() != null ? String.valueOf(trainee.getExamSignId()) : "";

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("sessionTitle", sessionTitle);
            vars.put("traineeName", traineeName);
            vars.put("jobNumber", jobNumber);
            vars.put("projectGroup", projectGroup);

            try {
                pushService.send("ARO_TRAINING_PENDING", vars, subscriberSet);
                log.info("[AroSync] 推送成功 session={} trainee={} subscribers={}", sessionId, traineeName, subscriberSet.size());
            } catch (Exception e) {
                log.error("[AroSync] 推送失败 session={} trainee={}: {}", sessionId, traineeName, e.getMessage());
            }
        }

        // 5. SSE 实时事件
        try {
            notificationPushService.pushEventToUsers("aro_training_pending", subscriberSet,
                    Map.of("type", "aro_training_pending",
                            "sessionId", String.valueOf(sessionId),
                            "sessionTitle", sessionTitle,
                            "pendingCount", newPending.size()));
        } catch (Exception e) {
            log.warn("[AroSync] SSE 推送失败 session={}: {}", sessionId, e.getMessage());
        }
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
