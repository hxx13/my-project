package com.example.demo.modules.admin.controller;

import com.alibaba.fastjson2.JSON;
import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.entity.AroTrainingSession;
import com.example.demo.modules.aro.entity.AroTrainingTrainee;
import com.example.demo.modules.aro.mapper.AroTrainingSessionMapper;
import com.example.demo.modules.aro.mapper.AroTrainingTraineeMapper;
import com.example.demo.modules.aro.service.AroTrainingSyncService;
import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** 从本地缓存表读取 ARO 培训数据，避免实时调用超时 */
@RestController
@RequestMapping("/api/admin/aro-training")
public class AroTrainingController {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingController.class);
    private final AroTrainingSessionMapper sessionMapper;
    private final AroTrainingTraineeMapper traineeMapper;
    private final AroTrainingSyncService syncService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public AroTrainingController(AroTrainingSessionMapper sessionMapper,
                                  AroTrainingTraineeMapper traineeMapper,
                                  AroTrainingSyncService syncService,
                                  AuthContextService authContextService,
                                  HttpServletRequest request) {
        this.sessionMapper = sessionMapper;
        this.traineeMapper = traineeMapper;
        this.syncService = syncService;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping("/areas")
    public Result<?> listAreas() {
        return Result.success(List.of(
            Map.of("id", 1, "name", "浦西"),
            Map.of("id", 2, "name", "浦东")
        ));
    }

    @GetMapping("/sessions")
    public Result<?> listSessions(@RequestParam(defaultValue = "1") int pageNum,
                                   @RequestParam(defaultValue = "20") int pageSize) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        List<AroTrainingSession> all = sessionMapper.selectAll();
        int total = all.size(), from = (pageNum - 1) * pageSize, to = Math.min(from + pageSize, total);
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = from; i < to; i++) {
            AroTrainingSession s = all.get(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", String.valueOf(s.getId()));
            m.put("title", s.getTitle());
            m.put("testContent", s.getTestContent());
            m.put("address", s.getAddress());
            m.put("startTime", s.getStartTime());
            m.put("endTime", s.getEndTime());
            m.put("signNumber", s.getSignNumber());
            m.put("examinerName", s.getExaminerName());
            m.put("examinerNumber", s.getExaminerNumber());
            m.put("examCertType", s.getExamCertType());
            m.put("examState", s.getExamState());
            m.put("state", s.getState());
            list.add(m);
        }
        return Result.success(Map.of("list", list, "total", total, "page", (int)Math.ceil((double)total / pageSize)));
    }

    @GetMapping("/sessions/{examId}/trainees")
    public Result<?> listTrainees(@PathVariable Long examId,
                                   @RequestParam(defaultValue = "1") int pageNum,
                                   @RequestParam(defaultValue = "20") int pageSize,
                                   @RequestParam(required = false) String projectGroupName,
                                   @RequestParam(required = false) String username) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        List<AroTrainingTrainee> all = traineeMapper.selectBySessionId(examId);
        if (projectGroupName != null && !projectGroupName.isBlank())
            all = all.stream().filter(t -> projectGroupName.equals(t.getProjectGroup())).toList();
        if (username != null && !username.isBlank())
            all = all.stream().filter(t -> t.getName() != null && t.getName().contains(username)).toList();
        int total = all.size(), from = (pageNum - 1) * pageSize, to = Math.min(from + pageSize, total);
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = from; i < to; i++) {
            AroTrainingTrainee t = all.get(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("examSignId", t.getExamSignId() != null ? String.valueOf(t.getExamSignId()) : null);
            m.put("name", t.getName());
            m.put("jobNumber", t.getJobNumber());
            m.put("mobilePhone", t.getMobilePhone());
            m.put("projectGroupName", t.getProjectGroup());
            m.put("testYn", t.getTestYn());
            m.put("testFraction", t.getTestFraction());
            m.put("userId", t.getUserId() != null ? String.valueOf(t.getUserId()) : null);
            m.put("roomIds", t.getRoomIdsJson() != null ? JSON.parse(t.getRoomIdsJson()) : Collections.emptyList());
            m.put("userJoinRooms", t.getRoomsJson() != null ? JSON.parse(t.getRoomsJson()) : Collections.emptyList());
            list.add(m);
        }
        return Result.success(Map.of("list", list, "total", total));
    }

    @GetMapping("/sessions/{examId}/count")
    public Result<?> countTrainees(@PathVariable Long examId) {
        int total = traineeMapper.countBySessionId(examId);
        int qualified = traineeMapper.countQualified(examId);
        return Result.success(Map.of("total", total, "qualified", qualified));
    }

    /** 手动刷新单场次 */
    @PostMapping("/sessions/{examId}/refresh")
    public Result<?> refreshSession(@PathVariable Long examId) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        try {
            syncService.syncSession(examId);
            return Result.success(java.time.LocalDateTime.now().toString());
        } catch (Exception e) {
            log.error("[AroTraining] refresh failed: {}", e.getMessage());
            return Result.fail(500, "刷新失败: " + e.getMessage());
        }
    }

    /** 最近同步时间 */
    @GetMapping("/last-sync")
    public Result<?> lastSync() {
        try {
            var row = syncService.getLastSyncInfo();
            return Result.success(row);
        } catch (Exception e) {
            return Result.success(java.util.Map.of("lastRun", "", "lastSuccess", ""));
        }
    }

    @GetMapping("/rooms")
    public Result<?> listRooms() {
        // 从缓存的 trainee rooms_json 中提取去重房间
        Set<String> seen = new HashSet<>();
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            List<String> jsons = traineeMapper.selectDistinctRoomsJson();
            for (String json : jsons) {
                try {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> rooms = (List) JSON.parseArray(json, Map.class);
                    if (rooms != null) {
                        for (Map<String, Object> r : rooms) {
                            Object id = r.get("id");
                            if (id != null && seen.add(String.valueOf(id))) {
                                result.add(r);
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.warn("[AroTraining] 提取房间列表失败: {}", e.getMessage());
        }
        return Result.success(result);
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
