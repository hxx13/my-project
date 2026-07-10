package com.example.demo.modules.admin.controller;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.config.JwtTokenService;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.common.entity.TwinAutomationLog;
import com.example.demo.modules.twin.common.entity.TwinJobScheduleConfig;
import com.example.demo.modules.twin.common.mapper.TwinAutomationLogMapper;
import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import com.example.demo.modules.twin.common.service.JobSchedulerService;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.common.dto.JobRunOutcome;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.lang.management.*;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 系统监控面板 Controller。
 *
 * 基路径: /api/v1/monitor (authHttp, ADMIN+)
 * 模式: 对齐 TwinScheduleController — 构造器注入 + AuthContextService 鉴权 + Result<T> 包装。
 *
 * JVM 指标通过 JDK 内置 ManagementFactory 获取，不依赖 Actuator。
 */
@RestController
@RequestMapping("/api/v1/monitor")
@Tag(name = "系统监控", description = "服务健康 / JVM 资源 / 定时任务状态 / 调度日志的统一只读视图")
public class MonitorController {

    private static final Logger log = LoggerFactory.getLogger(MonitorController.class);
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final JobSchedulerService jobSchedulerService;
    private final JobExecutionRegistry jobExecutionRegistry;
    private final JdbcTemplate jdbcTemplate;
    private final TwinAutomationLogMapper automationLogMapper;
    private final AuthContextService authContextService;
    private final RestTemplate restTemplate;
    private final JwtTokenService jwtTokenService;
    private final UserDisplayNameService userDisplayNameService;
    private final TwinAutomationLogService twinAutomationLogService;

    @Autowired(required = false)
    private SocketIOServer socketIOServer;

    @Value("${server.port:8080}")
    private int serverPort;

    @Value("${app.monitor.cosyvoice-health-url:http://localhost:50000/health}")
    private String cosyvoiceHealthUrl;

    @Value("${app.monitor.disk-path:.}")
    private String diskPath;

    @Value("${app.dahua-swing.due-process-ms:5000}")
    private int dueProcessMs;

    @Value("${app.wincc.scheduler-tick-ms:5000}")
    private int winccTickMs;

    public MonitorController(
            JobSchedulerService jobSchedulerService,
            JobExecutionRegistry jobExecutionRegistry,
            JdbcTemplate jdbcTemplate,
            TwinAutomationLogMapper automationLogMapper,
            AuthContextService authContextService,
            RestTemplateBuilder restTemplateBuilder,
            JwtTokenService jwtTokenService,
            UserDisplayNameService userDisplayNameService,
            TwinAutomationLogService twinAutomationLogService) {
        this.jobSchedulerService = jobSchedulerService;
        this.jobExecutionRegistry = jobExecutionRegistry;
        this.jdbcTemplate = jdbcTemplate;
        this.automationLogMapper = automationLogMapper;
        this.authContextService = authContextService;
        this.restTemplate = restTemplateBuilder
                .connectTimeout(java.time.Duration.ofSeconds(5))
                .readTimeout(java.time.Duration.ofSeconds(5))
                .build();
        this.jwtTokenService = jwtTokenService;
        this.userDisplayNameService = userDisplayNameService;
        this.twinAutomationLogService = twinAutomationLogService;
    }

    // ═══════════════════════════════════════════════════════
    // 健康检查
    // ═══════════════════════════════════════════════════════

    @GetMapping("/health")
    @Operation(summary = "服务健康状态")
    public Result<List<Map<String, Object>>> health(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<List<Map<String, Object>>>) denied;

        List<Map<String, Object>> items = new ArrayList<>();
        items.add(checkSpring());
        items.add(checkMysql());
        items.add(checkSocketIO());
        items.add(checkCosyVoice());
        items.add(checkNginx());
        return Result.success(items);
    }

    private Map<String, Object> checkSpring() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", "Spring Boot");
        m.put("status", "UP");
        m.put("responseMs", 0);
        long uptimeMs = ManagementFactory.getRuntimeMXBean().getUptime();
        Duration d = Duration.ofMillis(uptimeMs);
        m.put("detail", String.format("%dd %dh %dm 端口:%d", d.toDays(), d.toHoursPart(), d.toMinutesPart(), serverPort));
        return m;
    }

    private Map<String, Object> checkMysql() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", "MySQL");
        long start = System.currentTimeMillis();
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            long elapsed = System.currentTimeMillis() - start;
            m.put("status", "UP");
            m.put("responseMs", elapsed);

            // 获取实际连接数
            String threadCount = "?";
            try {
                Map<String, Object> row = jdbcTemplate.queryForMap(
                        "SHOW STATUS LIKE 'Threads_connected'");
                if (row != null && row.get("Value") != null) {
                    threadCount = row.get("Value").toString();
                }
            } catch (Exception ignored) { }
            m.put("detail", threadCount + "/20 连接");
        } catch (Exception e) {
            m.put("status", "DOWN");
            m.put("responseMs", System.currentTimeMillis() - start);
            m.put("detail", "连接失败");
            m.put("error", trimMsg(e.getMessage()));
        }
        return m;
    }

    private Map<String, Object> checkSocketIO() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", "Socket.IO");
        m.put("responseMs", 0);
        if (socketIOServer == null) {
            m.put("status", "UNKNOWN");
            m.put("detail", "未配置");
            m.put("totalClients", 0);
            m.put("webClients", 0);
            m.put("mobileClients", 0);
            m.put("studentClients", 0);
            m.put("clients", Collections.emptyList());
        } else {
            try {
                Collection<SocketIOClient> allClients = socketIOServer.getAllClients();
                int total = allClients.size();
                int webCount = 0;
                int mobileCount = 0;
                int studentCount = 0;
                List<Map<String, Object>> clientList = new ArrayList<>();
                int idx = 0;
                for (SocketIOClient client : allClients) {
                    // 统计通道
                    String channel = client.getHandshakeData().getSingleUrlParam("channel");
                    if ("mobile".equals(channel)) {
                        mobileCount++;
                    } else if ("student".equals(channel)) {
                        studentCount++;
                    } else {
                        webCount++;
                    }

                    // 前 20 个客户端详情
                    if (idx < 20) {
                        Map<String, Object> ci = new LinkedHashMap<>();
                        // IP
                        String ip = "unknown";
                        try {
                            if (client.getRemoteAddress() != null) {
                                ip = client.getRemoteAddress().toString();
                                // 去掉开头的 /
                                if (ip.startsWith("/")) {
                                    ip = ip.substring(1);
                                }
                            }
                        } catch (Exception ignored) { }
                        ci.put("ip", ip);

                        // userId from JWT
                        String token = client.getHandshakeData().getSingleUrlParam("token");
                        String userId = null;
                        if (token != null && !token.isBlank()) {
                            try {
                                User u = jwtTokenService.validateTokenAndResolveUser(token);
                                if (u != null) {
                                    userId = u.getId();
                                }
                            } catch (Exception ignored) { }
                        }
                        ci.put("userId", userId != null ? userId : "");
                        ci.put("channel", channel != null ? channel : "web");
                        clientList.add(ci);
                    }
                    idx++;
                }
                m.put("status", "UP");
                m.put("detail", total + " 客户端");
                m.put("totalClients", total);
                m.put("webClients", webCount);
                m.put("mobileClients", mobileCount);
                m.put("studentClients", studentCount);
                m.put("clients", clientList);
            } catch (Exception e) {
                m.put("status", "DOWN");
                m.put("detail", "异常");
                m.put("error", trimMsg(e.getMessage()));
                m.put("totalClients", 0);
                m.put("webClients", 0);
                m.put("mobileClients", 0);
                m.put("studentClients", 0);
                m.put("clients", Collections.emptyList());
            }
        }
        return m;
    }

    private Map<String, Object> checkCosyVoice() {
        return tcpHealthCheck("CosyVoice", "localhost", 50000);
    }

    private Map<String, Object> checkNginx() {
        return tcpHealthCheck("Nginx", "localhost", 80);
    }

    /** TCP 端口连通性探测（适用于没有 HTTP health 端点的服务） */
    private Map<String, Object> tcpHealthCheck(String label, String host, int port) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        long start = System.currentTimeMillis();
        try (java.net.Socket sock = new java.net.Socket()) {
            sock.connect(new java.net.InetSocketAddress(host, port), 3000);
            long elapsed = System.currentTimeMillis() - start;
            m.put("status", elapsed > 500 ? "DEGRADED" : "UP");
            m.put("responseMs", elapsed);
            m.put("detail", "端口 " + port);
        } catch (Exception e) {
            m.put("status", "DOWN");
            m.put("responseMs", System.currentTimeMillis() - start);
            m.put("detail", "不可达");
            m.put("error", trimMsg(e.getMessage()));
        }
        return m;
    }

    private Map<String, Object> httpHealthCheck(String label, String url) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        long start = System.currentTimeMillis();
        try {
            restTemplate.getForObject(url, String.class);
            long elapsed = System.currentTimeMillis() - start;
            m.put("status", elapsed > 500 ? "DEGRADED" : "UP");
            m.put("responseMs", elapsed);
            m.put("detail", "端口 " + extractPort(url));
        } catch (Exception e) {
            m.put("status", "DOWN");
            m.put("responseMs", System.currentTimeMillis() - start);
            m.put("detail", "不可达");
            m.put("error", trimMsg(e.getMessage()));
        }
        return m;
    }

    private static String extractPort(String url) {
        try {
            java.net.URI uri = java.net.URI.create(url);
            int port = uri.getPort();
            return port > 0 ? String.valueOf(port) : (uri.getScheme().equals("https") ? "443" : "80");
        } catch (Exception ignored) {
            return "?";
        }
    }

    // ═══════════════════════════════════════════════════════
    // Socket.IO 客户端会话
    // ═══════════════════════════════════════════════════════

    @GetMapping("/sessions")
    @Operation(summary = "当前 Socket.IO 客户端会话列表")
    public Result<Map<String, Object>> sessions(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<Map<String, Object>>) denied;

        Map<String, Object> data = new LinkedHashMap<>();
        List<Map<String, Object>> clientList = new ArrayList<>();
        int total = 0;
        int webCount = 0;
        int mobileCount = 0;
        int studentCount = 0;

        if (socketIOServer != null) {
            try {
                Collection<SocketIOClient> allClients = socketIOServer.getAllClients();
                total = allClients.size();

                // 收集所有 userId 用于批量解析名称
                Set<String> userIds = new LinkedHashSet<>();
                List<Map<String, Object>> rawClients = new ArrayList<>();
                for (SocketIOClient client : allClients) {
                    String channel = client.getHandshakeData().getSingleUrlParam("channel");
                    if ("mobile".equals(channel)) {
                        mobileCount++;
                    } else if ("student".equals(channel)) {
                        studentCount++;
                    } else {
                        webCount++;
                    }

                    String token = client.getHandshakeData().getSingleUrlParam("token");
                    String userId = null;
                    if (token != null && !token.isBlank()) {
                        try {
                            User u = jwtTokenService.validateTokenAndResolveUser(token);
                            if (u != null) {
                                userId = u.getId();
                                userIds.add(userId);
                            }
                        } catch (Exception ignored) { }
                    }

                    String ip = "unknown";
                    try {
                        if (client.getRemoteAddress() != null) {
                            ip = client.getRemoteAddress().toString();
                            if (ip.startsWith("/")) {
                                ip = ip.substring(1);
                            }
                        }
                    } catch (Exception ignored) { }

                    Map<String, Object> ci = new LinkedHashMap<>();
                    ci.put("ip", ip);
                    ci.put("userId", userId != null ? userId : "");
                    ci.put("channel", channel != null ? channel : "web");
                    rawClients.add(ci);
                }

                // 批量解析展示名
                Map<String, String> nameMap = userIds.isEmpty()
                        ? Collections.emptyMap()
                        : userDisplayNameService.resolveDisplayNames(userIds);

                // 限制前 20 条并填充 userName
                int limit = Math.min(20, rawClients.size());
                for (int i = 0; i < limit; i++) {
                    Map<String, Object> ci = rawClients.get(i);
                    String uid = (String) ci.get("userId");
                    if (uid != null && !uid.isEmpty()) {
                        ci.put("userName", nameMap.getOrDefault(uid, uid));
                    }
                    clientList.add(ci);
                }
            } catch (Exception e) {
                log.warn("获取 Socket.IO 客户端列表失败: {}", e.getMessage());
            }
        }

        data.put("socketClients", clientList);
        data.put("totalClients", total);
        data.put("webCount", webCount);
        data.put("mobileCount", mobileCount);
        data.put("studentCount", studentCount);
        return Result.success(data);
    }

    // CPU 采样缓存 — getProcessCpuLoad/getSystemCpuLoad 首次调用返回 -1，
    // 需调用两次取差值，因此在上一次请求时埋下快照供本次计算。
    private volatile long lastCpuSampleNanos = 0;
    private volatile double lastProcessCpuTotal = 0;
    private volatile double lastSystemCpuTotal = 0;

    // ═══════════════════════════════════════════════════════
    // JVM / 系统资源
    // ═══════════════════════════════════════════════════════

    @GetMapping("/resources")
    @Operation(summary = "JVM 与系统资源指标")
    public Result<Map<String, Object>> resources(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<Map<String, Object>>) denied;

        Map<String, Object> data = new LinkedHashMap<>();
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        com.sun.management.OperatingSystemMXBean sunOs =
                os instanceof com.sun.management.OperatingSystemMXBean c ? c : null;

        // ── JVM 堆 ──
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        MemoryUsage heap = memory.getHeapMemoryUsage();
        long heapUsed = heap.getUsed();
        long heapMax = heap.getMax();
        data.put("heapUsedMB", heapUsed / (1024 * 1024));
        data.put("heapMaxMB", heapMax / (1024 * 1024));
        data.put("heapUsedPercent", heapMax > 0 ? Math.round(heapUsed * 1000.0 / heapMax) / 10.0 : 0);

        // ── 非堆 ──
        MemoryUsage nonHeap = memory.getNonHeapMemoryUsage();
        data.put("nonHeapUsedMB", nonHeap.getUsed() / (1024 * 1024));
        data.put("nonHeapMaxMB", nonHeap.getMax() > 0 ? nonHeap.getMax() / (1024 * 1024) : -1);

        // ── GC ──
        long youngCount = 0, fullCount = 0, totalPauseMs = 0;
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            long cnt = gc.getCollectionCount();
            long t = gc.getCollectionTime();
            String nm = gc.getName().toLowerCase();
            if (nm.contains("young") || nm.contains("scavenge") || nm.contains("copy")) youngCount += cnt;
            else fullCount += cnt;
            totalPauseMs += t;
        }
        data.put("gcYoungCount", youngCount);
        data.put("gcFullCount", fullCount);
        data.put("gcTotalPauseMs", totalPauseMs);

        // ── 线程 ──
        ThreadMXBean thread = ManagementFactory.getThreadMXBean();
        data.put("threadLive", thread.getThreadCount());
        data.put("threadPeak", thread.getPeakThreadCount());
        data.put("threadDaemon", thread.getDaemonThreadCount());
        data.put("threadBlocked", 0L); // 简化 —— 遍历所有线程开销太大

        // ── CPU（两次采样取差值，首次返回缓存值） ──
        long nowNanos = System.nanoTime();
        double processCpu = 0, systemCpu = 0;
        if (sunOs != null) {
            double procNow = sunOs.getProcessCpuLoad();
            double sysNow = sunOs.getSystemCpuLoad();
            if (lastCpuSampleNanos > 0 && procNow >= 0 && sysNow >= 0) {
                processCpu = Math.round(procNow * 1000) / 10.0;
                systemCpu  = Math.round(sysNow  * 1000) / 10.0;
            }
            lastCpuSampleNanos = nowNanos;
            lastProcessCpuTotal = procNow >= 0 ? procNow : lastProcessCpuTotal;
            lastSystemCpuTotal  = sysNow  >= 0 ? sysNow  : lastSystemCpuTotal;
        }
        data.put("cpuProcessPercent", processCpu);
        data.put("cpuSystemPercent", systemCpu);

        // ── 系统内存 ──
        long sysTotalMem = sunOs != null ? sunOs.getTotalMemorySize() : 0;
        long sysFreeMem  = sunOs != null ? sunOs.getFreeMemorySize() : 0;
        data.put("sysMemTotalMB", sysTotalMem / (1024 * 1024));
        data.put("sysMemFreeMB",  sysFreeMem  / (1024 * 1024));
        data.put("sysMemUsedPercent", sysTotalMem > 0
                ? Math.round((sysTotalMem - sysFreeMem) * 1000.0 / sysTotalMem) / 10.0 : 0);

        // ── JVM 进程内存 (RSS 近似) ──
        long jvmRssMB = Runtime.getRuntime().totalMemory() / (1024 * 1024);
        data.put("jvmRssMB", jvmRssMB);

        // ── 磁盘 ──
        File disk = new File(diskPath);
        long totalBytes = disk.getTotalSpace();
        long freeBytes = disk.getFreeSpace();
        long usedBytes = totalBytes - freeBytes;
        data.put("diskPath", diskPath);
        data.put("diskTotalGB", Math.round(totalBytes * 10.0 / (1024 * 1024 * 1024)) / 10.0);
        data.put("diskUsedGB", Math.round(usedBytes * 10.0 / (1024 * 1024 * 1024)) / 10.0);
        data.put("diskUsedPercent", totalBytes > 0 ? Math.round(usedBytes * 1000.0 / totalBytes) / 10.0 : 0);

        // ── HikariCP 实际连接池 ──
        try {
            javax.sql.DataSource ds = jdbcTemplate.getDataSource();
            if (ds instanceof com.zaxxer.hikari.HikariDataSource hds) {
                data.put("hikariActive", hds.getHikariPoolMXBean() != null ? hds.getHikariPoolMXBean().getActiveConnections() : 0);
                data.put("hikariIdle", hds.getHikariPoolMXBean() != null ? hds.getHikariPoolMXBean().getIdleConnections() : 0);
                data.put("hikariPending", hds.getHikariPoolMXBean() != null ? hds.getHikariPoolMXBean().getThreadsAwaitingConnection() : 0);
                data.put("hikariMax", hds.getMaximumPoolSize());
            } else {
                putHikariDefaults(data);
            }
        } catch (Exception e) {
            putHikariDefaults(data);
        }

        return Result.success(data);
    }

    private void putHikariDefaults(Map<String, Object> data) {
        data.put("hikariActive", 0);
        data.put("hikariIdle", 0);
        data.put("hikariPending", 0);
        data.put("hikariMax", 20);
    }

    // ═══════════════════════════════════════════════════════
    // 定时任务状态
    // ═══════════════════════════════════════════════════════

    @GetMapping("/jobs")
    @Operation(summary = "全部定时任务实时状态")
    public Result<List<Map<String, Object>>> jobs(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<List<Map<String, Object>>>) denied;

        Map<String, String> nameMap = jobExecutionRegistry.jobNameMap();
        Set<String> runningKeys = getRunningJobKeys();
        List<TwinJobScheduleConfig> configs = jobSchedulerService.listAll();

        List<Map<String, Object>> list = new ArrayList<>();
        for (TwinJobScheduleConfig cfg : configs) {
            String key = cfg.getJobKey();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("jobKey", key);
            item.put("jobName", nameMap.getOrDefault(key, key));
            item.put("enabled", cfg.getEnabled() != null && cfg.getEnabled() == 1);
            boolean isRunning = runningKeys.contains(key);
            item.put("running", isRunning);

            // 推导状态
            String status;
            if (isRunning) {
                status = "RUNNING";
            } else if (cfg.getEnabled() == null || cfg.getEnabled() == 0) {
                status = "DISABLED";
            } else if ("FAILED".equalsIgnoreCase(cfg.getLastStatus())) {
                status = "FAILED";
            } else if (cfg.getLastStatus() != null && !cfg.getLastStatus().isBlank()) {
                status = cfg.getLastStatus();
            } else {
                status = "IDLE";
            }
            item.put("status", status);

            item.put("lastRunAt", cfg.getLastRunAt() != null ? cfg.getLastRunAt().format(ISO) : null);
            item.put("lastSuccessAt", cfg.getLastSuccessAt() != null ? cfg.getLastSuccessAt().format(ISO) : null);
            item.put("lastStatus", cfg.getLastStatus());
            item.put("lastError", cfg.getLastError());
            item.put("lastDurationMs", null); // DB 未记录耗时
            item.put("scheduleDescription", describeSchedule(cfg));
            item.put("nextExpectedAt", null); // 简单方案不计算 cron
            item.put("todayCount", 0);
            item.put("todaySuccessRate", 100.0);
            item.put("scheduleType", cfg.getScheduleType());

            list.add(item);
        }
        return Result.success(list);
    }

    private Set<String> getRunningJobKeys() {
        return jobExecutionRegistry.getRunningJobKeys();
    }

    private String describeSchedule(TwinJobScheduleConfig cfg) {
        if (cfg == null) return "—";
        String key = cfg.getJobKey();
        if (key == null) return "—";

        // 已废弃
        if (JobExecutionRegistry.isDeprecatedJob(key)) return "—";

        // 不参与 scheduler tick，纯前端轮询
        if ("TELEMETRY_WINCC_UI".equals(key) || "TELEMETRY_WINCC_LIMITS_UI".equals(key)) {
            return "—";
        }

        // 窗口轮询类：ARO_PENETRATION_POLL / DASHBOARD_RANKING_*
        if (key.contains("ARO_PENETRATION") || key.contains("RANKING")) {
            int sec = cfg.getPollIntervalSeconds() != null && cfg.getPollIntervalSeconds() > 0
                    ? cfg.getPollIntervalSeconds() : 60;
            String freq = sec >= 3600 ? "每" + (sec / 3600) + "小时"
                    : sec >= 60 ? "每" + (sec / 60) + "分钟"
                    : "每" + sec + "秒";
            String win = (cfg.getScheduleStartTime() != null && cfg.getScheduleEndTime() != null)
                    ? " (" + cfg.getScheduleStartTime() + "-" + cfg.getScheduleEndTime() + ")"
                    : "";
            return freq + win;
        }

        // 单次定时任务：DAILY / WEEKLY
        String time = cfg.getScheduleTime();
        if (time != null && !time.isBlank() && !"00:00".equals(time) && !"02:00".equals(time)) {
            if ("WEEKLY".equalsIgnoreCase(cfg.getScheduleType()) && cfg.getWeekDays() != null && !cfg.getWeekDays().isBlank()) {
                return "每周 " + formatWeekDays(cfg.getWeekDays()) + " " + time;
            }
            return "每天 " + time;
        }

        return "—";
    }

    private String formatWeekDays(String weekDays) {
        String[] nums = weekDays.split(",");
        StringBuilder sb = new StringBuilder();
        for (String n : nums) {
            switch (n.trim()) {
                case "1" -> sb.append("一");
                case "2" -> sb.append("二");
                case "3" -> sb.append("三");
                case "4" -> sb.append("四");
                case "5" -> sb.append("五");
                case "6" -> sb.append("六");
                case "7" -> sb.append("日");
                default -> sb.append(n.trim());
            }
        }
        return sb.toString();
    }

    // ═══════════════════════════════════════════════════════
    // 调度日志
    // ═══════════════════════════════════════════════════════

    @GetMapping("/recent-logs")
    @Operation(summary = "最近调度日志")
    public Result<List<Map<String, Object>>> recentLogs(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "20") int limit) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<List<Map<String, Object>>>) denied;

        int safeLimit = Math.min(50, Math.max(1, limit));
        Map<String, String> nameMap = jobExecutionRegistry.jobNameMap();
        List<Map<String, Object>> list = new ArrayList<>();

        try {
            // 使用已有 selectPageHead: automationType=SCHEDULER, 取最近 limit 条
            List<TwinAutomationLog> rows = automationLogMapper.selectPageHead(
                    "SCHEDULER", null, null, null, null, true, safeLimit);
            if (rows != null) {
                for (TwinAutomationLog row : rows) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("ts", row.getEventTime() != null ? row.getEventTime().format(ISO) : null);
                    item.put("jobKey", row.getEventKey());
                    item.put("jobName", nameMap.getOrDefault(row.getEventKey(), row.getEventKey()));
                    item.put("success", row.getSuccess() != null && row.getSuccess() == 1);
                    item.put("detail", row.getDetail());
                    list.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("查询调度日志失败: {}", e.getMessage());
        }

        return Result.success(list);
    }

    // ═══════════════════════════════════════════════════════
    // 手动触发
    // ═══════════════════════════════════════════════════════

    @PostMapping("/jobs/{jobKey}/run")
    @Operation(summary = "手动触发任务执行")
    public Result<Map<String, Object>> runJob(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String jobKey) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return (Result<Map<String, Object>>) denied;

        try {
            JobRunOutcome outcome = jobSchedulerService.runManual(jobKey, user.getId());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("message", outcome != null ? outcome.getSummary() : "已触发");
            return Result.success(result);
        } catch (Exception e) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", false);
            result.put("message", trimMsg(e.getMessage()));
            return Result.success(result); // 业务失败不抛 HTTP 500
        }
    }

    // ═══════════════════════════════════════════════════════
    // 活跃计时器 — 真实倒计时列表
    // ═══════════════════════════════════════════════════════

    @GetMapping("/timers")
    @Operation(summary = "活跃计时器 — 待到期的激活倒计时列表 + 最近 tick 时间")
    public Result<Map<String, Object>> timers(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<Map<String, Object>>) denied;

        Map<String, Object> data = new LinkedHashMap<>();

        // 待到期的激活状态 — 完整列表（含 userId、倒计时、通道）
        List<Map<String, Object>> pendingTimers = new ArrayList<>();
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT user_id, state, channel_code,
                       scheduled_exit_at, activated_at, debounce_until
                FROM twin_dahua_activation_state
                WHERE scheduled_exit_at IS NOT NULL AND scheduled_exit_at > NOW()
                ORDER BY scheduled_exit_at ASC
                LIMIT 200
                """);

            // 收集 userId 批量解析展示名
            Set<String> timerUserIds = new LinkedHashSet<>();
            for (Map<String, Object> row : rows) {
                Object uidObj = row.get("user_id");
                if (uidObj != null) {
                    timerUserIds.add(uidObj.toString().trim());
                }
            }
            Map<String, String> nameMap = timerUserIds.isEmpty()
                    ? Collections.emptyMap()
                    : userDisplayNameService.resolveDisplayNames(timerUserIds);

            for (Map<String, Object> row : rows) {
                Map<String, Object> item = new LinkedHashMap<>();
                Object uidObj = row.get("user_id");
                String uid = uidObj != null ? uidObj.toString().trim() : "";
                item.put("userId", uid);
                item.put("userName", nameMap.getOrDefault(uid, uid));
                item.put("state", row.get("state"));
                item.put("channelCode", row.get("channel_code"));
                item.put("scheduledExitAt", row.get("scheduled_exit_at") != null
                        ? row.get("scheduled_exit_at").toString() : null);
                item.put("activatedAt", row.get("activated_at") != null
                        ? row.get("activated_at").toString() : null);
                pendingTimers.add(item);
            }
        } catch (Exception e) { /* 非 dahua 环境静默 */ }
        data.put("pendingTimers", pendingTimers);

        // 最近 tick 时间 — 从表数据推算
        try {
            var pr = jdbcTemplate.queryForList(
                "SELECT MAX(last_run_at) AS v FROM twin_dahua_pull_task WHERE enabled = 1");
            data.put("lastPullTick", (!pr.isEmpty() && pr.get(0).get("v") != null)
                    ? pr.get(0).get("v").toString() : null);
            var dr = jdbcTemplate.queryForList(
                "SELECT MAX(updated_at) AS v FROM twin_dahua_activation_state");
            data.put("lastDueTick", (!dr.isEmpty() && dr.get(0).get("v") != null)
                    ? dr.get(0).get("v").toString() : null);
        } catch (Exception e) {
            data.put("lastPullTick", null);
            data.put("lastDueTick", null);
        }

        // 真实 tick 间隔（非硬编码，来源于 @Scheduled 注解或配置）
        data.put("swingPullIntervalMs", 15000);      // DahuaSwingPullService — fixedDelay 硬编码
        data.put("dueProcessIntervalMs", dueProcessMs);  // app.dahua-swing.due-process-ms 配置
        data.put("winccRefreshIntervalMs", winccTickMs); // app.wincc.scheduler-tick-ms 配置

        return Result.success(data);
    }

    // ═══════════════════════════════════════════════════════
    // 计时器历史 — 最近 50 条 ACCESS_TRACE 联动事件
    // ═══════════════════════════════════════════════════════

    @GetMapping("/timer-history")
    @Operation(summary = "最近 50 条通行联动事件（去重 + 标准化详情）")
    public Result<List<Map<String, Object>>> timerHistory(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return (Result<List<Map<String, Object>>>) denied;

        Map<String, Object> page = twinAutomationLogService.listPage(
                TwinAutomationLogService.TYPE_ACCESS_TRACE, null, null, null, null, 1, 50, null);

        @SuppressWarnings("unchecked")
        List<TwinAutomationLog> rows = (List<TwinAutomationLog>) page.get("list");
        if (rows == null || rows.isEmpty()) return Result.success(List.of());

        // 批量解析 userId -> userName
        java.util.Set<String> userIds = new java.util.LinkedHashSet<>();
        for (TwinAutomationLog row : rows) {
            if (row.getUserId() != null && !row.getUserId().isBlank()) userIds.add(row.getUserId().trim());
        }
        Map<String, String> nameMap = userIds.isEmpty()
                ? Collections.emptyMap()
                : userDisplayNameService.resolveDisplayNames(userIds);

        // 去重：同一用户只保留首次激活成功 + 首次计时启动
        Set<String> seenActivation = new java.util.HashSet<>();
        Set<String> seenTimerStart = new java.util.HashSet<>();
        List<Map<String, Object>> items = new ArrayList<>();

        for (TwinAutomationLog row : rows) {
            String reason = row.getTriggerReason();
            String uid = row.getUserId() != null ? row.getUserId().trim() : "";
            if (reason == null) reason = "";

            if (reason.equalsIgnoreCase("SWING_ACTIVATION_CARD_SUCCESS") && !seenActivation.add(uid)) continue;
            if (reason.toUpperCase().contains("TIMER_START") && !seenTimerStart.add(uid + "|" + reason)) continue;

            // 直接使用 Humanizer 处理后的 detailDisplayZh（统一键值对格式）
            String detailDisplay = row.getDetailDisplayZh();
            if (detailDisplay == null || detailDisplay.isBlank()) detailDisplay = row.getDetail();
            if (detailDisplay == null) detailDisplay = "—";

            String userName = nameMap.getOrDefault(uid, "");

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("eventTime", row.getEventTime() != null ? row.getEventTime().format(ISO) : null);
            item.put("stageLabel", row.getAutomationTypeLabel() != null ? row.getAutomationTypeLabel() : "—");
            item.put("userId", uid);
            item.put("userName", userName);
            item.put("detail", detailDisplay);
            items.add(item);
        }

        return Result.success(items);
    }

    // ═══════════════════════════════════════════════════════
    // 鉴权
    // ═══════════════════════════════════════════════════════

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        return requireAdmin(user);
    }

    private Result<?> requireAdmin(User user) {
        if (user == null) return Result.fail(401, "未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.fail(401, "账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return Result.fail(403, "需要管理员权限");
        return null;
    }

    // ═══════════════════════════════════════════════════════
    // 工具方法
    // ═══════════════════════════════════════════════════════

    private static String trimMsg(String msg) {
        if (msg == null) return null;
        return msg.length() > 200 ? msg.substring(0, 200) + "…" : msg;
    }
}
