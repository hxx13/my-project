package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 对比 MySQL 本地查询与 ARO 官方 HTTP 延迟，用于排查「库内正常、调 ARO 超时」。
 */
@Service
public class SystemDiagnosticsService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AroService aroService;

    public Map<String, Object> runLatencyProbe(String sampleUserId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mysql", probeMysql());
        out.put("aro", probeAro(sampleUserId));
        out.put("hint", buildHint(out));
        return out;
    }

    private Map<String, Object> probeMysql() {
        Map<String, Object> m = new LinkedHashMap<>();
        long pingMs = timed(() -> jdbcTemplate.queryForObject("SELECT 1", Integer.class));
        TwinTimingDiagnostics.logMysql("ping", pingMs, true, "SELECT 1");
        m.put("pingMs", pingMs);

        long schemaMs = timed(() -> jdbcTemplate.queryForObject("SELECT DATABASE()", String.class));
        TwinTimingDiagnostics.logMysql("database", schemaMs, true, null);
        m.put("currentSchema", jdbcTemplate.queryForObject("SELECT DATABASE()", String.class));

        try {
            long sizeMs = System.currentTimeMillis();
            List<Map<String, Object>> tables = jdbcTemplate.queryForList(
                    "SELECT table_name AS tableName, table_rows AS tableRows, "
                            + "ROUND((data_length + index_length) / 1024 / 1024, 2) AS sizeMb "
                            + "FROM information_schema.tables "
                            + "WHERE table_schema = DATABASE() "
                            + "AND table_name IN ('aro_access_log','aro_personnel','dahua_swing_record','twin_job_schedule_config') "
                            + "ORDER BY (data_length + index_length) DESC");
            sizeMs = System.currentTimeMillis() - sizeMs;
            TwinTimingDiagnostics.logMysql("table-stats", sizeMs, true, "rows=" + tables.size());
            m.put("keyTableStatsMs", sizeMs);
            m.put("keyTables", tables);
        } catch (Exception e) {
            TwinTimingDiagnostics.logMysql("table-stats", 0, false, e.getMessage());
            m.put("keyTableStatsError", e.getMessage());
        }

        try {
            Long logRows = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM aro_access_log WHERE DATE(access_time) = CURDATE()", Long.class);
            m.put("aroAccessLogTodayRows", logRows);
        } catch (Exception e) {
            m.put("aroAccessLogTodayError", e.getMessage());
        }

        m.put("diskFullLikely",
                "若 ping/table-stats 很慢或报 The table is full / Disk full，才与 MySQL 满盘相关；"
                        + "仅 ARO HTTP 慢而 MySQL ping<100ms 则优先查 ARO 网络/限流/Token。");
        return m;
    }

    private Map<String, Object> probeAro(String sampleUserId) {
        Map<String, Object> a = new LinkedHashMap<>();
        long loginStart = System.currentTimeMillis();
        boolean loginOk = aroService.login();
        long loginMs = System.currentTimeMillis() - loginStart;
        TwinTimingDiagnostics.logAro("login(probe)", "-", loginMs, loginOk, aroService.getLastAroErrorMessage());
        a.put("loginMs", loginMs);
        a.put("loginOk", loginOk);
        a.put("lastAroError", aroService.getLastAroErrorMessage());

        String uid = sampleUserId == null ? "" : sampleUserId.trim();
        if (!uid.isEmpty()) {
            List<Map<String, Object>> probes = new ArrayList<>();
            probes.add(timedAroCall("noLeaveRoom", uid, () -> aroService.getNoLeaveRoom(uid)));
            probes.add(timedAroCall("examOfflineRoom", uid, () -> aroService.getExamOfflineRoom(uid)));
            probes.add(timedAroCall("userDetail", uid, () -> aroService.getUserDetailAndDisciplinary(uid)));
            a.put("userProbes", probes);
        } else {
            a.put("userProbesSkipped", "传 sampleUserId=工号 可探测 noLeaveRoom/examOfflineRoom/userDetail");
        }
        return a;
    }

    private Map<String, Object> timedAroCall(String op, String userId, Supplier<?> call) {
        long start = System.currentTimeMillis();
        Object result = null;
        String err = null;
        try {
            result = call.get();
        } catch (Exception e) {
            err = e.getMessage();
        }
        long ms = System.currentTimeMillis() - start;
        boolean ok = err == null;
        if ("noLeaveRoom".equals(op) && err == null) {
            String last = aroService.getLastAroErrorMessage();
            ok = last == null || last.isBlank() || aroService.isNoLeaveRoomError();
        }
        TwinTimingDiagnostics.logAro(op + "(probe)", userId, ms, ok,
                err != null ? err : aroService.getLastAroErrorMessage());
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("op", op);
        row.put("ms", ms);
        row.put("ok", ok);
        if (result instanceof List<?> list) {
            row.put("resultSize", list.size());
        } else if (result instanceof Map<?, ?> map) {
            row.put("resultKeys", map.keySet());
        } else if (result == null) {
            row.put("result", "null");
        }
        if (err != null) {
            row.put("error", err);
        }
        return row;
    }

    private long timed(Runnable r) {
        long start = System.currentTimeMillis();
        r.run();
        return System.currentTimeMillis() - start;
    }

    @SuppressWarnings("unchecked")
    private String buildHint(Map<String, Object> out) {
        Map<String, Object> mysql = (Map<String, Object>) out.get("mysql");
        Map<String, Object> aro = (Map<String, Object>) out.get("aro");
        long pingMs = mysql.get("pingMs") instanceof Number n ? n.longValue() : 0;
        long loginMs = aro.get("loginMs") instanceof Number n ? n.longValue() : 0;
        boolean loginOk = Boolean.TRUE.equals(aro.get("loginOk"));
        if (pingMs > 3000) {
            return "MySQL 响应慢，请检查磁盘空间、慢查询、连接池是否耗尽。";
        }
        if (!loginOk || loginMs > 8000) {
            return "ARO 登录失败或极慢，与 MySQL 满盘无直接关系；请查服务器出网、aro.shsmu.edu.cn、账号 Token。";
        }
        if (loginMs > 3000) {
            return "ARO 登录偏慢；扫码 analyze 还会叠加 noLeaveRoom 等调用，易超过前端 15s。";
        }
        return "MySQL 正常且 ARO 登录正常；若仅场内人员扫码超时，看 userProbes 中 noLeaveRoom 是否 >10s。";
    }
}
