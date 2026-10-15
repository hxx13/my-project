package com.example.demo.modules.avidity.service;

import com.example.demo.modules.avidity.client.AvidityClient;
import com.example.demo.modules.avidity.config.AvidityProperties;
import com.example.demo.modules.avidity.entity.AvidityChannel;
import com.example.demo.modules.avidity.mapper.AvidityChannelMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * 点位「实时状态」——平面图上的灯亮不亮，看这里。
 *
 * <p><b>为什么不能靠报警表</b>：厂平台平面图上的每个点位是一盏指示灯，颜色由它绑定的变量
 * **当前值**决定（图元里写死的规则：值 0 绿、值 1 红）。这跟「历史报警 / 当前报警」两张表
 * 不是一套数据 —— 报警表里躺着的未恢复记录可能是几个月前的，而灯早就是绿的了。实测过：
 * 二楼 150 盏灯在平台画面上全绿，报警表里却有两条陈年未恢复。
 *
 * <p><b>怎么拿</b>：平台自己也不走 HTTP 拉值，而是挂一条 SignalR 长连接（WebSocket），
 * 订阅后由服务端推。本类照抄那套：登录拿 {@code encryptedAccessToken} 当门票连上去，
 * 握手 → {@code SubscribeConfigureUpdates} → {@code SubVarSta}，然后收
 * {@code vsc}（全量快照）和 {@code dvc}（单点变化），把 {@code s} 记在内存里。
 *
 * <p><b>订阅哪些变量</b>：就是各通道平面图上画出来的那些点位（布局文件里的点位标识），
 * 不多订 —— 平台一台设备几百个变量，只订画面用得到的。
 */
@Service
public class AvidityLiveStateService {

    private static final Logger log = LoggerFactory.getLogger(AvidityLiveStateService.class);

    /** SignalR JSON 协议用 0x1e 分隔多条记录。 */
    private static final String RECORD_SEPARATOR = String.valueOf((char) 0x1e);
    /** 平台客户端版本号，会校验；跟原网站一致。 */
    private static final String CLIENT_VERSION = "3.9.1";
    private static final int BATCH = 50;
    /** 读循环的唤醒哨兵：套接字被关/出错时塞一条，让阻塞中的 poll 立刻醒来去重连。 */
    private static final String CLOSED = "__AVI_CLOSED__";

    private final AvidityProperties properties;
    private final AvidityClient client;
    private final AvidityChannelMapper channelMapper;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher publisher;

    /** 一次采样：值（0 正常 / 1 报警）+ 平台给的「最后变化时刻」。按「设备+变量名」存，两台设备同名不串。 */
    private record Sample(int value, String at) {
    }

    private final Map<String, Sample> samples = new ConcurrentHashMap<>();
    private final Set<String> subscribed = ConcurrentHashMap.newKeySet();

    private volatile Thread worker;
    private volatile boolean stopping;
    private volatile boolean connected;
    private volatile String lastError = "";

    public AvidityLiveStateService(AvidityProperties properties,
                                   AvidityClient client,
                                   AvidityChannelMapper channelMapper,
                                   ObjectMapper objectMapper,
                                   ApplicationEventPublisher publisher) {
        this.properties = properties;
        this.client = client;
        this.channelMapper = channelMapper;
        this.objectMapper = objectMapper;
        this.publisher = publisher;
    }

    /**
     * 一个点位的值**变了**（无论翻红还是翻绿）。
     *
     * <p>报警推送照着 {@code alarming=true} 来 —— 判定源就是画面上的灯，不是报警表
     * （那张表里会躺着几个月前的未恢复记录，也有此刻正红却不在表里的）。
     * 报警历史（自己记的起止时间）两边都要，所以无论红绿都发。
     *
     * @param at 平台给的该变量「最后变化时刻」。它天然是这一轮报警的编号：同一次报警只推一次、
     *           只记一行；恢复后再犯会换一个新值，于是重新推、重新记。
     */
    public record LiveChange(long deviceId, String variable, String at, boolean alarming) {
    }

    /** 「此刻正在报警的一个点」—— 定时兜底扫一遍时用。 */
    public record LiveAlarm(long deviceId, String variable, String at) {
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        ensureWorker();
    }

    @PreDestroy
    public void shutdown() {
        stopping = true;
        Thread t = worker;
        if (t != null) t.interrupt();
    }

    /**
     * 看门狗：工作线程不在就补一条。
     *
     * <p><b>为什么必须有</b>：这条线程原先是「启动事件里拉起一次」的写法，它一旦退出
     * （线程里抛 Error、被中断……），整个实时功能就**静默失效** —— 页面只剩「今日报过」，
     * 看不出任何异常。定时兜一把，最多十几秒自己回来。
     */
    @Scheduled(fixedDelay = 15000L, initialDelay = 5000L)
    public synchronized void ensureWorker() {
        if (stopping || !properties.isEnabled() || !properties.isLiveEnabled()) return;
        Thread t = worker;
        if (t != null && t.isAlive()) return;
        worker = new Thread(this::loop, "avidity-live");
        worker.setDaemon(true);
        worker.start();
        log.info("[安维迪实时] 启动长连接工作线程");
    }

    public boolean isConnected() {
        return connected;
    }

    public String lastError() {
        return lastError;
    }

    /** 指定这几台设备上各点位的实时状态；没收到过的变量不出现（调用方按「没有就是正常」处理）。 */
    public Map<String, Integer> snapshot(Collection<Long> deviceIds) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (Map.Entry<String, Sample> e : samples.entrySet()) {
            long deviceId = deviceOf(e.getKey());
            if (deviceIds == null || deviceIds.isEmpty() || deviceIds.contains(deviceId)) {
                out.put(nameOf(e.getKey()), e.getValue().value());
            }
        }
        return out;
    }

    /**
     * 此刻所有处于报警态的点位。
     * 定时扫一遍用它可以兜住「断线期间发生的报警」—— 重连后平台会把每个变量的当前值重推一遍，
     * 扫到就补推，靠台账去重不会重复。
     */
    public List<LiveAlarm> activeAlarms() {
        List<LiveAlarm> out = new ArrayList<>();
        for (Map.Entry<String, Sample> e : samples.entrySet()) {
            if (e.getValue().value() == 0) continue;
            out.add(new LiveAlarm(deviceOf(e.getKey()), nameOf(e.getKey()), e.getValue().at()));
        }
        return out;
    }

    /**
     * 每台设备上「正在报警」的点位数（顶栏角标用）。
     * 键是设备 ID 的字符串形式，没收到任何状态的设备不出现（＝0）。
     */
    public Map<String, Integer> alarmCountByDevice() {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (Map.Entry<String, Sample> e : samples.entrySet()) {
            if (e.getValue().value() == 0) continue;
            out.merge(String.valueOf(deviceOf(e.getKey())), 1, Integer::sum);
        }
        return out;
    }

    private static long deviceOf(String key) {
        int cut = key.indexOf('|');
        if (cut <= 0) return -1L;
        try {
            return Long.parseLong(key.substring(0, cut));
        } catch (NumberFormatException e) {
            return -1L;
        }
    }

    private static String nameOf(String key) {
        int cut = key.indexOf('|');
        return cut <= 0 ? key : key.substring(cut + 1);
    }

    private void loop() {
        while (!stopping) {
            try {
                connectOnce();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Throwable e) {
                // 连 Error 一起兜：线程一旦静默死掉就再没人拉起它（看门狗要 15 秒才发现）
                connected = false;
                lastError = String.valueOf(e);
                log.warn("[安维迪实时] 长连接中断，{}ms 后重连：{}", properties.getLiveReconnectMs(), e);
            }
            connected = false;
            try {
                Thread.sleep(Math.max(2000L, properties.getLiveReconnectMs()));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void connectOnce() throws Exception {
        String token = client.encryptedToken();
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("登录未返回 encryptedAccessToken，无法建立实时长连接");
        }
        Map<Long, List<String>> targets = subscribeTargets();
        if (targets.isEmpty()) {
            // 还没同步到通道/布局，等本轮重连间隔再试
            throw new IllegalStateException("暂无可订阅的点位（通道或布局还没就绪）");
        }

        String url = properties.getLiveHubUrl()
                + "?enc_auth_token=" + java.net.URLEncoder.encode(token, java.nio.charset.StandardCharsets.UTF_8)
                + "&v=" + CLIENT_VERSION + "&isWeb=true";

        LinkedBlockingQueue<String> inbox = new LinkedBlockingQueue<>();
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofMillis(properties.getConnectTimeoutMs()))
                .build();
        WebSocket ws = http.newWebSocketBuilder()
                .buildAsync(URI.create(url), new Listener(inbox))
                .get(properties.getConnectTimeoutMs(), TimeUnit.MILLISECONDS);

        ws.sendText("{\"protocol\":\"json\",\"version\":1}" + RECORD_SEPARATOR, true).join();
        // 握手回一个 {}，先等它，免得订阅帧赶在握手前发出去被丢弃
        inbox.poll(5, TimeUnit.SECONDS);

        long seq = 0;
        for (Map.Entry<Long, List<String>> e : targets.entrySet()) {
            ws.sendText(invoke(++seq, "SubscribeConfigureUpdates",
                    objectMapper.createObjectNode().put("virtualDeviceId", e.getKey())), true).join();
            List<String> names = e.getValue();
            for (int i = 0; i < names.size(); i += BATCH) {
                List<String> slice = names.subList(i, Math.min(names.size(), i + BATCH));
                var arg = objectMapper.createObjectNode().put("d", e.getKey());
                var arr = arg.putArray("v");
                slice.forEach(arr::add);
                // 状态和数值两路都订：灯看的是状态，数值留着以后画曲线
                ws.sendText(invoke(++seq, "SubVarSta", arg), true).join();
                ws.sendText(invoke(++seq, "SubVarVal", arg), true).join();
            }
        }

        connected = true;
        lastError = "";
        log.info("[安维迪实时] 长连接已建立，订阅设备 {} 台", targets.size());

        while (!stopping) {
            String record = inbox.poll(90, TimeUnit.SECONDS);
            if (record == null) {
                // 长时间没动静也别傻等：发个 ping，套接字已经死了这里会抛，外层就去重连
                ws.sendPing(java.nio.ByteBuffer.allocate(0)).join();
                continue;
            }
            if (CLOSED.equals(record)) {
                throw new IllegalStateException("长连接已被服务端关闭");
            }
            apply(record);
        }
    }

    private String invoke(long id, String target, JsonNode arg) throws Exception {
        var node = objectMapper.createObjectNode();
        node.putArray("arguments").add(arg);
        node.put("invocationId", String.valueOf(id));
        node.put("target", target);
        node.put("type", 1);
        return objectMapper.writeValueAsString(node) + RECORD_SEPARATOR;
    }

    /** 服务端推的点位变化：`dvc`。 */
    private void apply(String record) {
        if (record == null || record.isBlank()) return;
        JsonNode msg;
        try {
            msg = objectMapper.readTree(record);
        } catch (Exception e) {
            return;
        }
        if (msg.path("type").asInt() != 1) return;
        if (!"dvc".equals(msg.path("target").asText(""))) return;
        JsonNode args = msg.path("arguments");
        if (!args.isArray() || args.size() < 2) return;
        JsonNode p = args.path(1);
        put(args.path(0).asLong(), p.path("n").asText(""), p.path("v"), p.path("t"));
    }

    /**
     * 记一个点位的值，并在「刚翻到报警」时发一条事件让推送那边立刻发。
     *
     * <p><b>看的是 `v`（变量的当前值），不是 `s`</b>：图元上的规则就是「值 == 1 亮红」，
     * 而 `s` 是另一个字段，实测那几个正在报警的点的 `s` 一直是 0 —— 用它整张图永远不亮。
     * 订阅成功后服务端会把订阅到的每个变量的当前值逐个推一遍，所以不用等它变化。
     */
    private void put(long deviceId, String name, JsonNode value, JsonNode at) {
        if (name == null || name.isEmpty() || value == null || value.isMissingNode()) return;
        String key = deviceId + "|" + name;
        int next = value.asDouble(0d) != 0d ? 1 : 0;
        String stamp = at == null || at.isMissingNode() ? "" : at.asText("");
        Sample prev = samples.put(key, new Sample(next, stamp));
        // 值和「最后变化时刻」都没动，就是同一次状态 —— 重连后平台会把当前值重推一遍，别当真变化
        if (prev != null && prev.value() == next && stamp.equals(prev.at())) return;
        publisher.publishEvent(new LiveChange(deviceId, name, stamp, next != 0));
    }

    /** 各设备要订阅的变量 = 这条通道平面图上画出来的点位标识。 */
    private Map<Long, List<String>> subscribeTargets() {
        Map<Long, List<String>> out = new LinkedHashMap<>();
        for (AvidityChannel channel : channelMapper.selectAll()) {
            Long deviceId = channel.getVirtualDeviceId();
            Long viewId = channel.getConfigureViewId();
            if (deviceId == null || viewId == null) continue;
            List<String> names = out.computeIfAbsent(deviceId, k -> new ArrayList<>());
            for (String name : layoutVars(viewId)) {
                if (!names.contains(name)) names.add(name);
            }
        }
        // 订阅集合变了（换了通道/布局）就重新连一次，别拿旧的名单一直挂着
        Set<String> now = new LinkedHashSet<>();
        out.forEach((dev, names) -> names.forEach(n -> now.add(dev + "|" + n)));
        if (!now.equals(subscribed)) {
            subscribed.clear();
            subscribed.addAll(now);
            samples.keySet().retainAll(now);
        }
        return out;
    }

    private List<String> layoutVars(Long viewId) {
        List<String> vars = new ArrayList<>();
        ClassPathResource resource = new ClassPathResource("avidity/" + viewId + ".json");
        if (!resource.exists()) return vars;
        try (InputStream in = resource.getInputStream()) {
            JsonNode plan = objectMapper.readTree(in);
            for (JsonNode room : plan.path("rooms")) {
                for (JsonNode rack : room.path("racks")) {
                    for (JsonNode point : rack.path("points")) {
                        String v = point.path("var").asText("");
                        if (!v.isEmpty()) vars.add(v);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[安维迪实时] 布局 {} 读取失败：{}", viewId, e.getMessage());
        }
        return vars;
    }

    /** 把同一帧里的多条记录拆开喂给上层；长消息会被分片递过来，按 last 拼。 */
    private final class Listener implements WebSocket.Listener {
        private final LinkedBlockingQueue<String> inbox;
        private final StringBuilder buf = new StringBuilder();

        private Listener(LinkedBlockingQueue<String> inbox) {
            this.inbox = inbox;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(Long.MAX_VALUE);
        }

        @Override
        public CompletableFuture<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            buf.append(data);
            if (!last) return null;
            String all = buf.toString();
            buf.setLength(0);
            for (String record : all.split(RECORD_SEPARATOR)) {
                if (!record.isBlank()) inbox.offer(record);
            }
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            lastError = String.valueOf(error.getMessage());
            inbox.offer(CLOSED);
        }

        @Override
        public CompletableFuture<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            lastError = "closed " + statusCode + " " + reason;
            inbox.offer(CLOSED);
            return null;
        }
    }
}
