package com.example.demo.modules.twin.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.twin.entity.DahuaSwingPullTask;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.mapper.DahuaSwingMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaSwingPullService {
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DahuaSwingMapper dahuaSwingMapper;
    private final DahuaOpenApiService dahuaOpenApiService;
    private final TwinCardMappingService twinCardMappingService;
    private final DahuaSwingRuleEngineService dahuaSwingRuleEngineService;

    public DahuaSwingPullService(
            DahuaSwingMapper dahuaSwingMapper,
            DahuaOpenApiService dahuaOpenApiService,
            TwinCardMappingService twinCardMappingService,
            DahuaSwingRuleEngineService dahuaSwingRuleEngineService
    ) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.twinCardMappingService = twinCardMappingService;
        this.dahuaSwingRuleEngineService = dahuaSwingRuleEngineService;
    }

    public List<DahuaSwingPullTask> listTasks() {
        return dahuaSwingMapper.listTasks();
    }

    public DahuaSwingPullTask getTask(Long id) {
        return dahuaSwingMapper.findTaskById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public DahuaSwingPullTask createTask(DahuaSwingPullTask task) {
        if (task.getEnabled() == null) task.setEnabled(1);
        if (task.getPollIntervalSeconds() == null || task.getPollIntervalSeconds() < 10) task.setPollIntervalSeconds(60);
        validateTaskQuery(task.getQueryJson());
        dahuaSwingMapper.insertTask(task);
        return task;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateTask(DahuaSwingPullTask task) {
        if (task.getPollIntervalSeconds() == null || task.getPollIntervalSeconds() < 10) task.setPollIntervalSeconds(60);
        validateTaskQuery(task.getQueryJson());
        return dahuaSwingMapper.updateTask(task) > 0;
    }

    @Scheduled(fixedDelay = 15000)
    public void pollEnabledTasks() {
        for (DahuaSwingPullTask task : dahuaSwingMapper.listEnabledTasks()) {
            try {
                Map<String, Object> query = JSON.parseObject(task.getQueryJson(), Map.class);
                if (query == null) query = new HashMap<>();
                if (!withinExecutionPlan(query, LocalDateTime.now())) {
                    continue;
                }
                int intervalSec = task.getPollIntervalSeconds() == null ? 60 : Math.max(10, task.getPollIntervalSeconds());
                LocalDateTime lastRun = parse(task.getLastRunAt());
                if (lastRun != null && lastRun.plusSeconds(intervalSec).isAfter(LocalDateTime.now())) {
                    continue;
                }
                pullOnce(task);
            } catch (Exception ignore) {
                // 单个任务失败不影响其他任务轮询
            }
        }
        // 到期签退由 DahuaSwingRuleEngineService 独立定时节拍处理，避免与 @Scheduled 并发双跑
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteTask(Long id) {
        return dahuaSwingMapper.deleteTask(id) > 0;
    }

    public Map<String, Object> executeTaskNow(Long taskId) {
        DahuaSwingPullTask task = dahuaSwingMapper.findTaskById(taskId);
        if (task == null) throw new IllegalArgumentException("任务不存在");
        return pullOnce(task);
    }

    public Map<String, Object> executeAllEnabledTasks() {
        Map<String, Object> out = new HashMap<>();
        int ok = 0;
        int fail = 0;
        List<Map<String, Object>> failDetails = new ArrayList<>();
        for (DahuaSwingPullTask task : dahuaSwingMapper.listEnabledTasks()) {
            try {
                pullOnce(task);
                ok++;
            } catch (Exception e) {
                fail++;
                Map<String, Object> detail = new HashMap<>();
                detail.put("taskId", task.getId());
                detail.put("taskName", task.getName());
                detail.put("reason", simplifyErrorMessage(e));
                failDetails.add(detail);
            }
        }
        dahuaSwingRuleEngineService.processDueStates();
        out.put("ok", ok);
        out.put("fail", fail);
        out.put("failDetails", failDetails);
        return out;
    }

    public Map<String, Object> listRecords(
            Long taskId,
            String channelCode,
            String personCode,
            String personName,
            Integer openType,
            String startTime,
            String endTime,
            int page,
            int size
    ) {
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, 500));
        int offset = (safePage - 1) * safeSize;
        List<DahuaSwingRecord> list = dahuaSwingMapper.listRecords(
                taskId, channelCode, personCode, personName, openType, startTime, endTime, safeSize, offset
        );
        int total = dahuaSwingMapper.countRecords(
                taskId, channelCode, personCode, personName, openType, startTime, endTime
        );
        Map<String, Object> out = new HashMap<>();
        out.put("data", list);
        out.put("total", total);
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> pullOnce(DahuaSwingPullTask task) {
        LocalDateTime runAt = LocalDateTime.now();
        String runAtText = fmt(runAt);
        try {
            Map<String, Object> query = JSON.parseObject(task.getQueryJson(), Map.class);
            if (query == null) query = new HashMap<>();
            int pageSize = intv(query.get("pageSize"), 200);
            int queryWindowMinutes = intv(query.get("queryWindowMinutes"), 30);
            queryWindowMinutes = Math.max(1, queryWindowMinutes);
            int futureOffsetMinutes = intv(query.get("futureOffsetMinutes"), 10);
            futureOffsetMinutes = Math.max(0, futureOffsetMinutes);
            LocalDateTime start = runAt.minusMinutes(queryWindowMinutes);
            LocalDateTime end = runAt.plusMinutes(futureOffsetMinutes);
            query.put("pageSize", pageSize);
            query.put("pageNum", 1);
            query.put("startSwingTime", fmt(start));
            query.put("endSwingTime", fmt(end));
            query.put("startCreateTime", fmt(start.minusMinutes(10)));
            query.put("endCreateTime", fmt(end));
            validateRequiredQueryFields(query);

            int page = 1;
            int totalSaved = 0;
            while (true) {
                query.put("pageNum", page);
                Map<String, Object> resp = dahuaOpenApiService.fetchSwingCardRecordByConditionCombined(query);
                Map<String, Object> data = castMap(resp.get("data"));
                List<Map<String, Object>> rows = castList(data.get("pageData"));
                if (rows.isEmpty()) break;
                for (Map<String, Object> row : rows) {
                    DahuaSwingRecord record = toRecord(task.getId(), row);
                    enrichMapping(record);
                    // 同一 record_id 在时间窗内被每轮 poll 反复 upsert：若库中已是 mapping_hit=1，则不再跑联动，避免激活/延时签退被重复排程
                    DahuaSwingRecord existing = dahuaSwingMapper.findRecordByTaskIdAndRecordId(task.getId(), record.getRecordId());
                    boolean alreadyLinkageEligible =
                            existing != null && Integer.valueOf(1).equals(existing.getMappingHit());
                    dahuaSwingMapper.upsertRecord(record);
                    totalSaved++;
                    if (alreadyLinkageEligible) {
                        continue;
                    }
                    if (Integer.valueOf(1).equals(record.getMappingHit())
                            && Integer.valueOf(1).equals(record.getOpenResult())) {
                        dahuaSwingRuleEngineService.onRecordIngested(record);
                    }
                }
                if (rows.size() < pageSize) break;
                page++;
            }
            dahuaSwingMapper.updateTaskRunState(task.getId(), fmt(end), "SUCCESS", null, runAtText);
            Map<String, Object> out = new HashMap<>();
            out.put("saved", totalSaved);
            out.put("lastCursorTime", fmt(end));
            out.put("lastRunAt", runAtText);
            out.put("pulledStartTime", fmt(start));
            out.put("pulledEndTime", fmt(end));
            out.put("queryWindowMinutes", queryWindowMinutes);
            out.put("futureOffsetMinutes", futureOffsetMinutes);
            return out;
        } catch (Exception e) {
            dahuaSwingMapper.updateTaskRunState(task.getId(), null, "FAILED", simplifyErrorMessage(e), runAtText);
            throw e;
        }
    }

    private String simplifyErrorMessage(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = throwable.getMessage();
        }
        if (msg == null || msg.isBlank()) {
            return "未知错误（无可读错误信息）";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }

    private void validateTaskQuery(String queryJson) {
        if (queryJson == null || queryJson.isBlank()) {
            throw new IllegalArgumentException("queryJson 不能为空");
        }
        Map<String, Object> query = JSON.parseObject(queryJson, Map.class);
        if (query == null) throw new IllegalArgumentException("queryJson 无效");
        boolean any =
                !str(query.get("personName")).isBlank()
                        || !str(query.get("personCode")).isBlank()
                        || !str(query.get("deptIds")).isBlank()
                        || !str(query.get("cardNumber")).isBlank()
                        || query.get("openType") != null
                        || query.get("enterOrExit") != null
                        || query.get("openResult") != null
                        || (query.get("channelCodes") instanceof List<?> l && !l.isEmpty());
        if (!any) {
            throw new IllegalArgumentException("至少配置一个筛选条件");
        }
    }

    private void validateRequiredQueryFields(Map<String, Object> query) {
        if (intv(query.get("pageNum"), 0) <= 0) throw new IllegalArgumentException("pageNum 必须为正整数");
        if (intv(query.get("pageSize"), 0) <= 0) throw new IllegalArgumentException("pageSize 必须为正整数");
        if (str(query.get("startSwingTime")).isBlank()) throw new IllegalArgumentException("startSwingTime 不能为空");
        if (str(query.get("endSwingTime")).isBlank()) throw new IllegalArgumentException("endSwingTime 不能为空");
    }

    private DahuaSwingRecord toRecord(Long taskId, Map<String, Object> row) {
        DahuaSwingRecord r = new DahuaSwingRecord();
        r.setTaskId(taskId);
        r.setRecordId(str(row.get("id")));
        r.setCardNumber(str(row.get("cardNumber")));
        r.setCardStatus(intvObj(row.get("cardStatus")));
        r.setChannelCode(str(row.get("channelCode")));
        r.setChannelName(str(row.get("channelName")));
        r.setOpenType(intvObj(row.get("openType")));
        r.setPersonCode(str(row.get("personCode")));
        r.setPersonId(longvObj(row.get("personId")));
        r.setPersonName(str(row.get("personName")));
        r.setSwingTime(str(row.get("swingTime")));
        r.setCreateTime(str(row.get("createTime")));
        r.setOpenResult(intvObj(row.get("openResult")));
        r.setEnterOrExit(intvObj(row.get("enterOrExit")));
        r.setRawJson(JSON.toJSONString(row));
        return r;
    }

    private void enrichMapping(DahuaSwingRecord r) {
        TwinCardMapping mapping = null;
        if (!str(r.getPersonCode()).isBlank()) mapping = twinCardMappingService.getByDahuaPersonCode(r.getPersonCode());
        if (mapping == null && !str(r.getCardNumber()).isBlank()) mapping = twinCardMappingService.getByCardNo(r.getCardNumber());
        if (mapping == null) {
            r.setMappingHit(0);
            return;
        }
        r.setMappingHit(1);
        r.setMappingUserId(mapping.getAroUserId());
        r.setMappingCardNo(mapping.getCardNo());
        r.setFreezeExemptFlag(mapping.getFreezeExemptFlag());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return new HashMap<>();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castList(Object o) {
        if (!(o instanceof List<?> l)) return new ArrayList<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : l) {
            if (item instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        }
        return out;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static Integer intvObj(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Long longvObj(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception ignore) {
            return null;
        }
    }

    private static int intv(Object v, int def) {
        Integer n = intvObj(v);
        return n == null || n <= 0 ? def : n;
    }

    private static LocalDateTime parse(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return LocalDateTime.parse(v, DT);
        } catch (Exception e) {
            return null;
        }
    }

    private static String fmt(LocalDateTime t) {
        return t == null ? null : t.format(DT);
    }

    private static LocalTime parseTimeOrDefault(String text, LocalTime def) {
        if (text == null || text.isBlank()) return def;
        String s = text.trim();
        try {
            if (s.length() == 5) return LocalTime.parse(s + ":00");
            return LocalTime.parse(s);
        } catch (Exception ignore) {
            return def;
        }
    }

    private static boolean withinExecutionPlan(Map<String, Object> query, LocalDateTime now) {
        List<Integer> days = intList(query.get("execWeekDays"));
        if (!days.isEmpty() && !days.contains(now.getDayOfWeek().getValue())) {
            return false;
        }
        LocalTime start = parseTimeOrDefault(str(query.get("execStartTime")), LocalTime.of(7, 0, 0));
        LocalTime end = parseTimeOrDefault(str(query.get("execEndTime")), LocalTime.of(22, 0, 0));
        LocalTime t = now.toLocalTime();
        if (start.equals(end)) return true;
        if (end.isAfter(start)) return !t.isBefore(start) && !t.isAfter(end);
        return !t.isBefore(start) || !t.isAfter(end);
    }

    @SuppressWarnings("unchecked")
    private static List<Integer> intList(Object o) {
        List<Integer> out = new ArrayList<>();
        if (!(o instanceof List<?> list)) return out;
        for (Object item : list) {
            Integer n = intvObj(item);
            if (n != null && n >= 1 && n <= 7) out.add(n);
        }
        return out;
    }
}
