package com.example.demo.modules.broadcast.client;

import com.example.demo.common.event.CredentialsChangedEvent;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * DSPPA 广播平台的**唯一**接入点：常驻一条 WebSocket 连接，负责登录、保活、重连，
 * 并把平台命令封装成方法供上层调用。
 *
 * 设计约束（方案里定的，别破坏）：
 * 1. 平台命令**只在本类里出现**，上层服务只调这里的方法 —— 这样后台与小程序共用同一份实现。
 * 2. 平台要求「先声明选中分区、再带自增序号下发命令」，这套机制全封在 {@link #selectZones} 里，
 *    **不要漏到接口上**。
 * 3. 连接失败**不阻塞应用启动**：建连与重连都在保活轮里做。
 *
 * 协议要点（实测得出，改之前先读 docs/02-设计存档/计划文档/2026-10-14-广播平台接入-调研记录.md）：
 * - 控制通道 ws://host:8081，登录后拿到会话标识，后续每条命令都要带；
 * - 分区查询的 target 必须传**空串**，传 "0" 会静默无响应；
 * - 平台时钟实测比墙钟慢约 3 分钟，所以**调度基准用本机墙钟**（见 {@link #scheduleNow()}），
 *   平台时间只作诊断展示；
 */
@Component
public class DsppaClient {

    private static final Logger log = LoggerFactory.getLogger(DsppaClient.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    /** 分区所属大类：0 = 功放/音箱区（业务关心的就是这一类）。 */
    private static final int DEVICE_TYPE_ZONE = 0;

    private static final DateTimeFormatter[] SERVER_TIME_PATTERNS = {
            DateTimeFormatter.ofPattern("yyyy-MM-dd EEE HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
    };

    @Value("${app.dsppa.ws-url:ws://172.22.161.230:8081}")
    private String defaultWsUrl;
    @Value("${app.dsppa.http-base:http://172.22.161.230:9999}")
    private String defaultHttpBase;
    @Value("${app.dsppa.username:admin}")
    private String defaultUsername;
    @Value("${app.dsppa.password:}")
    private String defaultPassword;
    @Value("${app.dsppa.request-timeout-ms:8000}")
    private long requestTimeoutMs;
    @Value("${app.dsppa.reconnect-base-ms:5000}")
    private long reconnectBaseMs;
    @Value("${app.dsppa.reconnect-max-ms:60000}")
    private long reconnectMaxMs;
    /**
     * 主动探活间隔。**不能用「长时间无入站消息」判死**：平台只在配置变更时主动推送，
     * 平时完全沉默（心跳它也不回）。所以用一次真实往返（查分区）来确认连接还活着。
     */
    @Value("${app.dsppa.probe-interval-ms:120000}")
    private long probeIntervalMs;
    /** 连续几次探活失败就判连接已废。 */
    @Value("${app.dsppa.probe-fail-threshold:2}")
    private int probeFailThreshold;

    private final NotificationSettingsService settingsService;
    private final ThreadPoolTaskScheduler scheduler;
    /** 取服务器时间用的 HTTP 客户端（也仅此用途）。 */
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    /** 运行时配置（优先系统设置，回退到上面的 @Value 默认值）。 */
    private volatile String wsUrl;
    private volatile String httpBase;
    private volatile String username;
    private volatile String password;

    private volatile WebSocket socket;
    private volatile boolean connected;
    private volatile boolean loggedIn;
    private volatile String sessionId;
    private volatile String lastError;
    private volatile LocalDateTime lastSuccessAt;
    private volatile long lastInboundAt;
    /** 平台时间 - 本机时间，毫秒。定时调度一律加这个偏移。 */
    private volatile long clockOffsetMs;
    private volatile int consecutiveFailures;
    private volatile long nextAttemptAt;
    private volatile long lastProbeAt;
    private volatile int consecutiveProbeFailures;

    /** 请求-响应配对：同一个 command 可能并发多条，用队列按到达顺序配对。 */
    private final Map<String, ConcurrentLinkedQueue<CompletableFuture<Map<String, Object>>>> pending =
            new ConcurrentHashMap<>();
    private final AtomicLong pendingSeq = new AtomicLong();
    /** 选中分区序号，平台要求每次选择自增。 */
    private final AtomicInteger selectSeq = new AtomicInteger(1);
    /** 最近一次选区编号：改播放模式时平台要求带上它。 */
    private volatile int lastSelectedId;
    /** 未完成的分片文本（平台消息都很小，一般用不上）。 */
    private final StringBuilder inboundBuffer = new StringBuilder();
    /** 建连互斥：保活轮与「重新连接」按钮可能同时触发，别开出两条连接。 */
    private final java.util.concurrent.atomic.AtomicBoolean connecting =
            new java.util.concurrent.atomic.AtomicBoolean(false);

    public DsppaClient(NotificationSettingsService settingsService,
                       @Qualifier("broadcastTaskScheduler") ThreadPoolTaskScheduler scheduler) {
        this.settingsService = settingsService;
        this.scheduler = scheduler;
    }

    // ---------------------------------------------------------------- 配置

    @PostConstruct
    public void init() {
        reloadConfig();
        log.info("[广播] 已初始化, 控制通道={}, HTTP={}", wsUrl, httpBase);
    }

    private void reloadConfig() {
        try {
            this.wsUrl = settingsService.getEffectiveValue("integration", "dsppa.ws_url", defaultWsUrl);
            this.httpBase = settingsService.getEffectiveValue("integration", "dsppa.http_base", defaultHttpBase);
            this.username = settingsService.getEffectiveValue("credentials", "dsppa.username", defaultUsername);
            this.password = settingsService.getEffectiveValue("credentials", "dsppa.password", defaultPassword);
        } catch (Exception e) {
            // 配置表可能尚未就绪（启动早期），用默认值
            this.wsUrl = defaultWsUrl;
            this.httpBase = defaultHttpBase;
            this.username = defaultUsername;
            this.password = defaultPassword;
        }
    }

    @EventListener
    public void onCredentialsChanged(CredentialsChangedEvent event) {
        String key = event.getConfigKey();
        if (key == null || !key.startsWith("dsppa.")) {
            return;
        }
        log.info("[广播] 配置变动({}), 重载并重连", key);
        reloadConfig();
        reconnectNow();
    }

    public String getHttpBase() {
        return httpBase;
    }

    // ---------------------------------------------------------------- 保活与重连

    /**
     * 保活轮：没连上就（按退避）重连；连上了就发心跳、定期探活；没登录就重试登录。
     * 整个连接生命周期都由这一轮驱动，没有别的定时器。
     */
    @Scheduled(fixedDelayString = "${app.broadcast.keepalive-ms:15000}",
            initialDelayString = "${app.broadcast.keepalive-initial-delay-ms:10000}",
            scheduler = "broadcastTaskScheduler")
    public void keepaliveTick() {
        try {
            if (socket == null || !connected) {
                long now = System.currentTimeMillis();
                if (now >= nextAttemptAt) {
                    openSocket();
                }
                return;
            }
            if (loggedIn) {
                // 心跳：平台可能不回，发了就算，不因此判失败
                try {
                    sendNoWait("get_heartbeat_info", new HashMap<>());
                } catch (Exception e) {
                    log.debug("[广播] 心跳发送失败: {}", e.getMessage());
                }
                activeProbe();
            } else {
                // 连上了但没登录（口令错、或登录时连接尚未就位）——每轮重试一次，
                // 否则会永远卡在「已连接、未登录」。
                doLogin();
            }
        } catch (Exception e) {
            log.warn("[广播] 保活轮异常: {}", e.getMessage());
        }
    }

    /**
     * 主动探活：隔一段时间发一次真实查询，确认这条连接还能拿到响应。
     * 连续失败到阈值才重连 —— 单次超时可能只是平台忙。
     */
    private void activeProbe() {
        long now = System.currentTimeMillis();
        if (probeIntervalMs <= 0 || now - lastProbeAt < probeIntervalMs) {
            return;
        }
        lastProbeAt = now;
        try {
            fetchZones();
            consecutiveProbeFailures = 0;
        } catch (Exception e) {
            consecutiveProbeFailures++;
            log.warn("[广播] 探活失败({}/{}): {}", consecutiveProbeFailures, probeFailThreshold, e.getMessage());
            if (consecutiveProbeFailures >= Math.max(1, probeFailThreshold)) {
                lastError = "连接探测连续失败，已自动重连：" + shortMessage(e);
                closeSocket("probe-failed");
                scheduleReconnect();
            }
        }
    }

    private void openSocket() {
        if (connected && socket != null) {
            return;
        }
        if (!connecting.compareAndSet(false, true)) {
            return; // 已有线程在建连
        }
        String url = wsUrl;
        if (password == null || password.isBlank()) {
            connecting.set(false);
            lastError = "未配置广播平台口令（系统设置 → 凭证）";
            scheduleReconnect();
            return;
        }
        try {
            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .build();
            CompletableFuture<WebSocket> future = http.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .buildAsync(URI.create(url), new Listener());
            WebSocket ws = future.get(12, TimeUnit.SECONDS);
            this.socket = ws;
            this.connected = true;
            this.lastInboundAt = System.currentTimeMillis();
            log.info("[广播] 已连接 {}", url);
            // 连接就位后才登录 —— 登录要发命令，命令依赖 socket/connected 已赋值。
            // 放在这里（调度线程）而不是 onOpen 回调里，避免在回调线程上等响应。
            doLogin();
        } catch (Exception e) {
            this.connected = false;
            this.socket = null;
            lastError = "连接失败: " + shortMessage(e);
            log.warn("[广播] 连接失败 {}: {}", url, shortMessage(e));
            scheduleReconnect();
        } finally {
            connecting.set(false);
        }
    }

    private void scheduleReconnect() {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 10);
        long delay = Math.min(reconnectBaseMs * (1L << Math.min(consecutiveFailures - 1, 8)), reconnectMaxMs);
        nextAttemptAt = System.currentTimeMillis() + delay;
    }

    private void closeSocket(String reason) {
        WebSocket ws = this.socket;
        this.socket = null;
        this.connected = false;
        this.loggedIn = false;
        if (ws != null) {
            try {
                ws.sendClose(WebSocket.NORMAL_CLOSURE, reason).get(3, TimeUnit.SECONDS);
            } catch (Exception ignored) {
                try {
                    ws.abort();
                } catch (Exception ignored2) {
                    // 连接已经烂了，忽略
                }
            }
        }
    }

    /** 页面上的「重新连接」按钮。 */
    public synchronized void reconnectNow() {
        closeSocket("manual-reconnect");
        failAllPending("连接已由管理员手动重置");
        consecutiveFailures = 0;
        nextAttemptAt = 0;
        lastError = null;
        openSocket();
    }

    /** 页面上的「重新登录」按钮：连接还在就只重登，断了就先连。 */
    public synchronized void reloginNow() {
        if (!connected || socket == null) {
            reconnectNow();
            return;
        }
        failAllPending("会话已由管理员手动重置");
        this.loggedIn = false;
        this.sessionId = null;
        doLogin();
    }

    @PreDestroy
    public void shutdown() {
        log.info("[广播] 关闭连接");
        closeSocket("shutdown");
    }

    // ---------------------------------------------------------------- 收发

    private class Listener implements WebSocket.Listener {

        @Override
        public void onOpen(WebSocket webSocket) {
            // 回调里**只做登记**，绝不等响应（会在回调线程上阻塞，可能和消息投递抢同一个线程）。
            // 登录由 openSocket 在连接就位后发起。
            webSocket.request(1);
            DsppaClient.this.socket = webSocket;
            DsppaClient.this.connected = true;
            DsppaClient.this.lastInboundAt = System.currentTimeMillis();
        }

        @Override
        public CompletableFuture<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            synchronized (inboundBuffer) {
                inboundBuffer.append(data);
                if (last) {
                    String text = inboundBuffer.toString();
                    inboundBuffer.setLength(0);
                    try {
                        handleInbound(text);
                    } catch (Exception e) {
                        log.warn("[广播] 处理入站消息失败: {}", e.getMessage());
                    }
                }
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletableFuture<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            markDisconnected("连接被关闭 code=" + statusCode + " " + reason);
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            markDisconnected("连接异常: " + shortMessage(error));
        }
    }

    private void markDisconnected(String reason) {
        this.connected = false;
        this.loggedIn = false;
        this.socket = null;
        this.lastError = reason;
        failAllPending(reason);
        log.warn("[广播] {}", reason);
        scheduleReconnect();
    }

    @SuppressWarnings("unchecked")
    private void handleInbound(String text) {
        lastInboundAt = System.currentTimeMillis();
        if (text == null || text.isBlank()) {
            return;
        }
        Map<String, Object> msg;
        try {
            msg = MAPPER.readValue(text, MAP_TYPE);
        } catch (Exception e) {
            log.debug("[广播] 非 JSON 入站消息(忽略): {}", text.length() > 120 ? text.substring(0, 120) : text);
            return;
        }
        noteServerTime(msg);

        String command = str(msg.get("command"));
        String commandUuid = str(msg.get("command_uuid"));

        CompletableFuture<Map<String, Object>> waiter = poll(command, commandUuid);
        if (waiter == null) {
            // 平台主动推送（配置变更通知等），记一笔即可
            log.debug("[广播] 主动推送: command={}", command);
            return;
        }
        waiter.complete(msg);
    }

    /** 入站消息里若带服务器时间戳，顺手校准时钟偏移。 */
    private void noteServerTime(Map<String, Object> msg) {
        for (String key : new String[]{"system_time", "update_at", "server_time", "time"}) {
            Object v = msg.get(key);
            if (v instanceof String s && !s.isBlank()) {
                LocalDateTime parsed = parseServerTime(s);
                if (parsed != null) {
                    long offset = Duration.between(LocalDateTime.now(), parsed).toMillis();
                    // 只在偏差明显时才更新，避免网络往返抖动把偏移改来改去
                    if (Math.abs(offset - clockOffsetMs) > 1000L || clockOffsetMs == 0L) {
                        clockOffsetMs = offset;
                        log.info("[广播] 平台时间 {} , 时钟偏移 {} ms", s, offset);
                    }
                    return;
                }
            }
        }
    }

    private static LocalDateTime parseServerTime(String raw) {
        String s = raw.trim();
        for (DateTimeFormatter f : SERVER_TIME_PATTERNS) {
            try {
                return LocalDateTime.parse(s, f);
            } catch (Exception ignored) {
                // 换下一个格式
            }
        }
        return null;
    }

    /**
     * 调度基准时间 = **本机墙钟**（应用已锁 Asia/Shanghai）。
     *
     * <p>为什么不用平台时间：用户设「9 点」想的是墙上的钟，而实测**平台自己的钟比墙钟慢约 3 分钟**
     * （HTTP 响应头与电话通道两处对得上，说明是平台在漂）。拿平台的钟当基准只会让定时稳定晚几分钟。
     * 平台时间仍在 {@link #status()} 里以偏移量形式给出，仅作诊断——发现它漂得多了要提醒运维校时。
     */
    public LocalDateTime scheduleNow() {
        return LocalDateTime.now();
    }

    // ---------------------------------------------------------------- 命令发送

    private void doLogin() {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("command", "user_login");
            body.put("account", username);
            body.put("password", password);
            // 登录**不能**带会话标识 —— 标识正是这次登录换来的
            Map<String, Object> resp = exchange("user_login", null, body, false, requestTimeoutMs);
            assertSuccess(resp, "user_login");
            this.sessionId = str(resp.get("uuid"));
            this.loggedIn = true;
            this.consecutiveFailures = 0;
            this.consecutiveProbeFailures = 0;
            this.lastProbeAt = System.currentTimeMillis();
            this.lastSuccessAt = LocalDateTime.now();
            this.lastError = null;
            log.info("[广播] 登录成功, 会话={}", sessionId);
            probeServerTime();
        } catch (Exception e) {
            this.loggedIn = false;
            this.lastError = "登录失败: " + shortMessage(e);
            log.warn("[广播] 登录失败: {}", shortMessage(e));
        }
    }

    /**
     * 建立时钟偏移。
     *
     * <p>取时渠道是**平台 HTTP 响应头里的服务器时间**，不是广播通道：
     * 实测广播通道（8081）对取时命令**不响应**，电话通道（8082）能用但要额外占一条连接，
     * 而 HTTP 口本来就在用来读曲库与上传，顺手就有。
     */
    private void probeServerTime() {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(httpBase + "/"))
                    .timeout(Duration.ofSeconds(8))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> resp = http.send(req, HttpResponse.BodyHandlers.discarding());
            String date = resp.headers().firstValue("date").orElse(null);
            if (date == null || date.isBlank()) {
                log.debug("[广播] 响应头里没有服务器时间");
                return;
            }
            java.time.ZonedDateTime server = java.time.ZonedDateTime.parse(
                    date, DateTimeFormatter.RFC_1123_DATE_TIME);
            LocalDateTime serverLocal = server.withZoneSameInstant(java.time.ZoneId.systemDefault())
                    .toLocalDateTime();
            long offset = Duration.between(LocalDateTime.now(), serverLocal).toMillis();
            clockOffsetMs = offset;
            log.info("[广播] 平台时间 {}（{}），时钟偏移 {} 秒", serverLocal, date, offset / 1000);
        } catch (Exception e) {
            log.debug("[广播] 取平台时间失败(改用本机时间): {}", e.getMessage());
        }
    }

    /** 发命令并等响应。withUuid=true 时自动带上会话标识。 */
    private Map<String, Object> exchange(String command, String commandUuid,
                                         Map<String, Object> body, boolean withUuid, long timeoutMs) {
        if (!connected || socket == null) {
            throw new BroadcastException("广播平台未连接");
        }
        if (withUuid) {
            if (sessionId == null) {
                throw new BroadcastException("尚未登录广播平台");
            }
            body.put("uuid", sessionId);
        }
        if (commandUuid != null) {
            body.put("command_uuid", commandUuid);
        }
        CompletableFuture<Map<String, Object>> waiter = new CompletableFuture<>();
        pending.computeIfAbsent(pairKey(command, commandUuid), k -> new ConcurrentLinkedQueue<>()).add(waiter);
        try {
            sendText(MAPPER.writeValueAsString(body));
        } catch (Exception e) {
            poll(command, commandUuid);
            throw new BroadcastException("发送命令失败: " + shortMessage(e));
        }
        try {
            Map<String, Object> resp = waiter.get(Math.max(1000, timeoutMs), TimeUnit.MILLISECONDS);
            lastSuccessAt = LocalDateTime.now();
            return resp;
        } catch (java.util.concurrent.TimeoutException e) {
            throw new BroadcastException("等待平台响应超时(" + command + ")");
        } catch (Exception e) {
            throw new BroadcastException("等待平台响应失败(" + command + "): " + shortMessage(e));
        }
    }

    /** 只发不等响应（心跳这类）。 */
    private void sendNoWait(String command, Map<String, Object> body) {
        if (!connected || socket == null) {
            return;
        }
        body.put("command", command);
        if (sessionId != null) {
            body.put("uuid", sessionId);
        }
        try {
            sendText(MAPPER.writeValueAsString(body));
        } catch (Exception e) {
            throw new BroadcastException("发送失败: " + shortMessage(e));
        }
    }

    private void sendText(String json) throws Exception {
        WebSocket ws = this.socket;
        if (ws == null) {
            throw new BroadcastException("广播平台未连接");
        }
        ws.sendText(json, true).get(6, TimeUnit.SECONDS);
    }

    private static String pairKey(String command, String commandUuid) {
        return commandUuid == null || commandUuid.isBlank() ? command : command + "|" + commandUuid;
    }

    private CompletableFuture<Map<String, Object>> poll(String command, String commandUuid) {
        ConcurrentLinkedQueue<CompletableFuture<Map<String, Object>>> q = pending.get(pairKey(command, commandUuid));
        return q == null ? null : q.poll();
    }

    private void failAllPending(String reason) {
        pending.forEach((k, q) -> {
            CompletableFuture<Map<String, Object>> f;
            while ((f = q.poll()) != null) {
                f.completeExceptionally(new BroadcastException(reason));
            }
        });
        pending.clear();
    }

    /** 平台用 result 数字表达成败。 */
    private void assertSuccess(Map<String, Object> resp, String command) {
        Object raw = resp.get("result");
        int code = toInt(raw, 0);
        if (code != 0) {
            throw new BroadcastException(code, BroadcastException.describe(code) + "（" + command + "）");
        }
    }

    // ---------------------------------------------------------------- 对上层暴露的业务方法

    /**
     * 声明本次操作的目标分区，返回平台要求的选中序号。
     * 平台是「先选中、后操作」的语义，所以每次下发前都要调一次 —— 上层不需要知道这件事。
     */
    private int selectZones(List<String> macs) {
        if (macs == null || macs.isEmpty()) {
            throw new BroadcastException("未指定目标分区");
        }
        int id = selectSeq.getAndIncrement();
        lastSelectedId = id;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "set_select_zones");
        body.put("selected_id", id);
        body.put("page", 1);
        body.put("page_count", 1);
        body.put("zone_count", macs.size());
        body.put("zones_mac", new ArrayList<>(macs));
        Map<String, Object> resp = exchange("set_select_zones", null, body, true, requestTimeoutMs);
        assertSuccess(resp, "set_select_zones");
        return id;
    }

    /** 读分区：名称、位置、音量、播放状态、当前曲目。 */
    public List<Map<String, Object>> fetchZones() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "get_zone_info");
        body.put("page", 1);
        // 必须传空串 —— 传 "0" 平台会静默不响应（实测踩过）
        body.put("zone_mac", "");
        body.put("device_type", DEVICE_TYPE_ZONE);
        body.put("all_zone", true);
        Map<String, Object> resp = exchange("get_zone_info", null, body, true, requestTimeoutMs);
        assertSuccess(resp, "get_zone_info");
        Object zones = resp.get("zones");
        if (zones instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>(list.size());
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> mm = (Map<String, Object>) m;
                    out.add(mm);
                }
            }
            return out;
        }
        return List.of();
    }

    /** 批量设置音量。 */
    public void setVolume(List<String> macs, int volume) {
        int clamped = Math.max(0, Math.min(100, volume));
        int selectedId = selectZones(macs);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "set_volume");
        body.put("selected_id", selectedId);
        body.put("volume", clamped);
        Map<String, Object> resp = exchange("set_volume", null, body, true, requestTimeoutMs);
        assertSuccess(resp, "set_volume");
    }

    /**
     * 立即播放：选中分区 →（可选）设音量 → 下发放音。
     *
     * @param listId 曲库列表编号（平台要求随曲目一起给）
     */
    public void play(List<String> macs, String listId, String songPath, Integer volume) {
        int selectedId = selectZones(macs);
        if (volume != null) {
            Map<String, Object> volBody = new LinkedHashMap<>();
            volBody.put("command", "set_volume");
            volBody.put("selected_id", selectedId);
            volBody.put("volume", Math.max(0, Math.min(100, volume)));
            assertSuccess(exchange("set_volume", null, volBody, true, requestTimeoutMs), "set_volume");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "play_source");
        body.put("source", 1);              // 1 = 歌曲列表播放
        body.put("selected_id", selectedId);
        body.put("list_id", listId == null ? "" : listId);
        body.put("source_name", songPath);  // 实测：传完整路径可用
        Map<String, Object> resp = exchange("play_source", null, body, true, requestTimeoutMs);
        assertSuccess(resp, "play_source");
    }

    /**
     * 停止指定分区的播放。**只作用于这些分区。**
     *
     * <p>用的是 {@code set_idle_status}（把选中分区置为空闲），**不是** {@code pause_source}。
     * 2026-10-15 实测判定：{@code pause_source} 是**全局**的 —— 只选中一路下发，整个平台一起停；
     * 现场「想只停一路，结果全停」就是它造成的。{@code set_idle_status} 走同一套选中机制，
     * 但作用域就是被选中的那几路（实测只停 A、B 照常播）。音量与空闲两条命令都有作用域，
     * 只有 pause 没有。
     *
     * <p>副作用：置空闲后平台会把这一路的曲名清掉（{@code source_name} 变空，不像「已暂停」那样保留），
     * 所以「恢复这一路」必须由调用方给出要放什么曲目，见
     * {@code BroadcastZoneControlService.resumeZones}。
     */
    public void stop(List<String> macs) {
        int selectedId = selectZones(macs);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "set_idle_status");
        body.put("selected_id", selectedId);
        Map<String, Object> resp = exchange("set_idle_status", null, body, true, requestTimeoutMs);
        assertSuccess(resp, "set_idle_status");
    }

    // ---------------------------------------------------------------- 播放模式
    //
    // 1 单曲播放 / 2 单曲循环 / 3 顺序播放 / 4 循环播放 / 5 随机播放。
    // **这是平台全局设置**（厂家前端也只有一个播放模式按钮），不是按分区或按方案各一份 ——
    // 所以改了会同时影响正在跑的定时方案，界面上要如实说明。

    /** 播放模式 → 人话。 */
    public static String playModeText(int mode) {
        return switch (mode) {
            case 1 -> "单曲播放";
            case 2 -> "单曲循环";
            case 3 -> "顺序播放";
            case 4 -> "列表循环";
            case 5 -> "随机播放";
            default -> "未知(" + mode + ")";
        };
    }

    /** 查当前播放模式。 */
    public int getPlayMode() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "play_mode");
        body.put("set", 0);
        Map<String, Object> resp = exchange("play_mode", null, body, true, requestTimeoutMs);
        assertSuccess(resp, "play_mode");
        return toInt(resp.get("play_mode"), -1);
    }

    /** 设播放模式（平台全局）。 */
    public void setPlayMode(int mode) {
        if (mode < 1 || mode > 5) {
            throw new BroadcastException("播放模式只能是 1-5");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "play_mode");
        body.put("set", 1);
        body.put("selected_id", lastSelectedId > 0 ? lastSelectedId : 1);
        body.put("play_mode", mode);
        assertSuccess(exchange("play_mode", null, body, true, requestTimeoutMs), "play_mode");
    }

    // ---------------------------------------------------------------- 曲库列表管理

    /**
     * 新建曲库列表（文件夹）。**listId 由调用方生成** —— 原厂客户端就是这么做的。
     */
    public void addSongList(String listId, String listName) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "add_song_list");
        body.put("list_id", listId);
        body.put("list_name", listName);
        assertSuccess(exchange("add_song_list", null, body, true, requestTimeoutMs), "add_song_list");
    }

    public void renameSongList(String listId, String listName) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "rename_song_list");
        body.put("list_id", listId);
        body.put("list_name", listName);
        assertSuccess(exchange("rename_song_list", null, body, true, requestTimeoutMs), "rename_song_list");
    }

    public void removeSongList(String listId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "remove_song_list");
        body.put("list_id", listId);
        assertSuccess(exchange("remove_song_list", null, body, true, requestTimeoutMs), "remove_song_list");
    }

    public void addSongToList(String listId, String songName) {
        addSongsToList(listId, List.of(songName));
    }

    /**
     * 批量把曲目加入列表。平台原生支持数组（song_count + song_names），不用逐条发。
     *
     * <p>字段是 song_names（数组）+ song_count；传单数字符串 song_name 平台会静默无响应。
     * 另外这里认的是**文件名**，不是完整路径（play_source 才认完整路径）—— 同一平台两套口径。
     */
    public void addSongsToList(String listId, List<String> songNames) {
        if (songNames == null || songNames.isEmpty()) {
            return;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "add_song_to_list");
        body.put("list_id", listId);
        body.put("song_count", songNames.size());
        body.put("song_names", new ArrayList<>(songNames));
        assertSuccess(exchange("add_song_to_list", null, body, true, requestTimeoutMs), "add_song_to_list");
    }

    /**
     * 从列表移除曲目。
     *
     * <p>⚠️ {@code removeFile=true} 会把**音频文件本身**从平台删掉（原厂开关 `remove_local`）。
     * 业务上的「移出列表」「移动到别的列表」都必须传 false —— 只摘条目，不删文件。
     */
    public void removeSongFromList(String listId, String songName, boolean removeFile) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "remove_song_from_list");
        body.put("list_id", listId);
        body.put("song_name", songName);
        body.put("remove_local", removeFile ? 1 : 0);
        assertSuccess(exchange("remove_song_from_list", null, body, true, requestTimeoutMs), "remove_song_from_list");
    }

    /** 清空列表。同上：{@code removeFile} 为真会连文件一起删。 */
    public void removeAllSongsFromList(String listId, boolean removeFile) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("command", "remove_all_songs_from_list");
        body.put("list_id", listId);
        body.put("remove_local", removeFile ? 1 : 0);
        assertSuccess(exchange("remove_all_songs_from_list", null, body, true, requestTimeoutMs),
                "remove_all_songs_from_list");
    }

    // ---------------------------------------------------------------- 状态

    public boolean isConnected() {
        return connected;
    }

    public boolean isLoggedIn() {
        return loggedIn;
    }

    public String getSessionId() {
        return sessionId;
    }

    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connected", connected);
        out.put("loggedIn", loggedIn);
        out.put("sessionId", sessionId);
        out.put("wsUrl", wsUrl);
        out.put("httpBase", httpBase);
        out.put("username", username);
        out.put("scheduleTime", scheduleNow().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        // 平台钟 - 墙钟。负数=平台慢。仅诊断用，不参与调度
        out.put("platformClockOffsetMs", clockOffsetMs);
        out.put("lastError", lastError);
        out.put("lastSuccessAt", lastSuccessAt == null ? null
                : lastSuccessAt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        out.put("lastInboundAt", lastInboundAt == 0 ? null
                : java.time.Instant.ofEpochMilli(lastInboundAt)
                        .atZone(java.time.ZoneId.systemDefault())
                        .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        out.put("consecutiveFailures", consecutiveFailures);
        // 等响应的请求数（不是按键个数——键会留着，数它没意义）
        out.put("pendingRequests", pending.values().stream().mapToInt(ConcurrentLinkedQueue::size).sum());
        return out;
    }

    /** 写操作前的连接可用性检查，报错信息要能直接给用户看。 */
    public void requireReady() {
        if (!connected) {
            throw new BroadcastException("广播平台未连接" + (lastError == null ? "" : "：" + lastError));
        }
        if (!loggedIn || sessionId == null) {
            throw new BroadcastException("广播平台尚未登录，请点「重新登录」");
        }
    }

    // ---------------------------------------------------------------- 小工具

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static int toInt(Object o, int fallback) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (Exception ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private static String shortMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = e.getClass().getSimpleName();
        }
        return msg.length() > 200 ? msg.substring(0, 200) : msg;
    }
}
