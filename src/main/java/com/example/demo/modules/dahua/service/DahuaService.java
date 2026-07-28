package com.example.demo.modules.dahua.service;

import com.alibaba.fastjson2.JSON;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.dahua.service.DahuaSwingRuleEngineService;
import com.example.demo.modules.twin.dahua.support.DahuaSwingDepartmentSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class DahuaService {

    private static final Logger log = LoggerFactory.getLogger(DahuaService.class);

    @Autowired
    private SocketIOServer socketServer;

    @Autowired
    private DahuaAuthService authService; // 💥 引入新基建

    /** ICC 事件去重：alarmCode → 处理时间 */
    private final java.util.concurrent.ConcurrentHashMap<String, Long> processedIccEvents = new java.util.concurrent.ConcurrentHashMap<>();
    private volatile long lastIccCleanup = System.currentTimeMillis();

    @Autowired(required = false)
    private com.example.demo.modules.swipealert.service.SwipeAlertEngine swipeAlertEngine;

    // ---- Webhook → DB 入库依赖 ----
    @Autowired
    private DahuaSwingMapper dahuaSwingMapper;
    @Autowired
    private TwinCardMappingService twinCardMappingService;
    @Autowired(required = false)
    private DahuaSwingRuleEngineService dahuaSwingRuleEngineService;
    @Autowired(required = false)
    private com.example.demo.modules.accessfusion.service.AccessRawEventIngestService accessRawEventIngestService;
    @Autowired
    private DahuaSwingDepartmentSupport departmentSupport;
    @Autowired
    private com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper deviceChannelCacheMapper;

    @Value("${app.dahua.callback-url:http://172.22.161.252:18082/api/event}")
    private String myCallbackUrl;

    @Value("${app.dahua.buffer-url:}")
    private String bufferUrl;

    private static final Set<String> ALLOWED_OPEN_TYPES = new HashSet<>(Arrays.asList("48", "49", "51", "52"));
    private static final Map<String, String> TYPE_NAMES = Map.of(
            "48", "远程开门", "49", "按钮/密码", "51", "合法刷卡", "52", "非法刷卡"
    );

    /** 工作人员（非部门26）允许入库的4个门禁通道编码 */
    private static final Set<String> STAFF_ALLOWED_CHANNELS = Set.of(
            "1000145$7$0$3",  // 换鞋室（E11B-B102）-外侧-东门-B1F-RD6-MK01
            "1000057$7$0$0",  // 换鞋室(221)-(出)-北门-2F-RD1-MK07
            "1000141$7$0$3",  // 更衣室（E11C-B101）-外侧-B1F-RD1-MK03
            "1000163$7$0$0"   // 退缓（E11A-B104）-外侧-B1F-SY-RD1-MK11
    );

    // =========================================================================
    // 1. 🚀 核心流水线：原样保留！完全没动你的孪生逻辑
    // =========================================================================
    @SuppressWarnings("unchecked")
    public void processAndBroadcast(String rawPayload) {
        try {
            Map<String, Object> payload = JSON.parseObject(rawPayload, Map.class);
            if (payload == null) return;

            // 过滤监控设备事件（orgName=监控设备 的不处理）
            Map<String, Object> info = (Map<String, Object>) payload.get("info");
            if (info != null && "监控设备".equals(info.get("orgName"))) {
                return;
            }

            // ──────────────────────────────────────────────
            // 🆕 ICC 事件订阅格式：{ category, method, info: { extend: {...} } }
            // 门禁记录通过 info.extend 中的 openType/swingTime 识别，直接落库
            // ──────────────────────────────────────────────
            if (info != null) {
                Map<String, Object> extend = (Map<String, Object>) info.get("extend");
                if (extend != null && extend.get("openType") != null) {
                    // 有 extend.openType → 刷卡事件（51/52等）
                    ingestSwingRecordFromWebhook(payload, info, extend);
                } else {
                    // 无 extend.openType → 远程开门(48)等：openType 在 info.alarmType
                    ingestFromInfoOnly(payload, info);
                }
                postToBuffer(rawPayload);
                return;
            }

            // 大华 Webhook 可能包裹在 data / events 下，也可能直接就是单条事件
            List<Map<String, Object>> events = new ArrayList<>();
            Object dataObj = payload.get("data");
            if (dataObj instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) events.add((Map<String, Object>) m);
                }
            } else if (dataObj instanceof Map<?, ?> m) {
                events.add((Map<String, Object>) m);
            }
            Object eventsObj = payload.get("events");
            if (eventsObj instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) events.add((Map<String, Object>) m);
                }
            }
            // 兜底：payload 本身就是一条事件
            if (events.isEmpty() && (payload.containsKey("openType") || payload.containsKey("swingTime"))) {
                events.add(payload);
            }

            for (Map<String, Object> evt : events) {
                try {
                    String recordId = str(evt.get("id"));
                    String personName = str(evt.get("personName"));
                    String channelName = str(evt.get("channelName"));
                    String channelCode = str(evt.get("channelCode"));
                    Integer openType = intvObj(evt.get("openType"));
                    Integer enterOrExit = intvObj(evt.get("enterOrExit"));
                    Integer openResult = intvObj(evt.get("openResult"));
                    String swingTime = adjustSwingTime9Min(evt.get("swingTime"));

                    // ---- 实时馈入告警引擎（Webhook 路径，零延迟） ----
                    feedSwipeAlertEngine(recordId, personName, channelName, channelCode,
                            openType, enterOrExit, openResult, swingTime);
                } catch (Exception e) {
                    log.debug("[dahua-webhook] 单条事件处理失败: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("[dahua-webhook] 解析 Webhook 失败: {}", e.getMessage());
        }
    }

    // =========================================================================
    // 🆕 ICC 事件订阅门禁记录 → twin_dahua_swing_record 入库（仅 51/52 + 部门26）
    // =========================================================================
    @SuppressWarnings("unchecked")
    private void ingestSwingRecordFromWebhook(Map<String, Object> payload, Map<String, Object> info, Map<String, Object> extend) {
        try {
            // ── 步骤0：ICC 事件去重（同一 alarmCode 只处理一次）──
            String alarmCode = str(info.get("alarmCode"));
            if (!alarmCode.isBlank() && processedIccEvents.putIfAbsent(alarmCode, System.currentTimeMillis()) != null) {
                return;
            }
            // 定期清理（10分钟以上的记录）
            long now = System.currentTimeMillis();
            if (now - lastIccCleanup > 600_000) {
                processedIccEvents.values().removeIf(t -> now - t > 600_000);
                lastIccCleanup = now;
            }

            // ── 步骤1：过滤条件 ──
            Integer openType = intvObj(extend.get("openType"));
            if (openType == null || (openType != 48 && openType != 51 && openType != 52)) {
                return;
            }
            DahuaSwingRecord r = new DahuaSwingRecord();
            r.setTaskId(0L);                       // webhook 无对应拉取任务
            r.setPullTaskType("REALTIME");
            r.setRecordId(str(info.get("alarmCode")));
            r.setCardNumber(str(extend.get("cardNumber")));
            r.setChannelCode(str(extend.get("acsChannelCode")));
            // 通道名称：优先从 device-channels 缓存映射，回退到 extend.deviceName
            r.setChannelName(resolveChannelName(str(extend.get("acsChannelCode")), str(extend.get("deviceName"))));
            r.setOpenType(openType);
            r.setPersonCode(str(extend.get("personCode")));
            r.setPersonName(str(extend.get("personName")));
            r.setSwingTime(adjustSwingTime9Min(extend.get("swingTime")));
            // openFailedCode=0 表示开门成功，映射为 open_result=1
            r.setOpenResult("0".equals(str(extend.get("openFailedCode"))) ? 1 : 0);
            r.setEnterOrExit(intvObj(extend.get("enterOrExit")));
            r.setRawJson(JSON.toJSONString(payload));

            // ---- 卡号 ↔ 用户映射 ----
            enrichMapping(r);

            // ---- 部门信息补全（deptId 在 extend 里！） ----
            try {
                departmentSupport.applyToRecord(r, extend);
            } catch (Exception e) {
                log.debug("[dahua-webhook] 部门信息补全失败: {}", e.getMessage());
            }

            // ---- enterOrExit 归一化（与轮询路径一致，非1/2的值回退到raw_json查找） ----
            com.example.demo.modules.twin.dahua.support.DahuaSwingEnterExitSupport.applyResolved(r);

            // ── 步骤1：两路分流 ──
            // 路A：部门26（学生）→ 直通入库
            // 路B：非部门26（工作人员）→ 只放行指定5个通道
            boolean isDept26 = "26".equals(r.getDepartmentId());
            boolean isAllowedChannel = isDept26 || STAFF_ALLOWED_CHANNELS.contains(r.getChannelCode());
            boolean isRemoteOpen = Integer.valueOf(48).equals(openType);

            if (!isAllowedChannel && !isRemoteOpen) {
                log.debug("[dahua-webhook] 跳过: deptId={} channelCode={}", r.getDepartmentId(), r.getChannelCode());
                return;
            }
            if (!isDept26) {
                log.debug("[dahua-webhook] 非26部门走通道放行: deptId={} deptName={} channelCode={} channelName={}",
                        r.getDepartmentId(), r.getDepartmentName(), r.getChannelCode(), r.getChannelName());
            }

            // ---- upsert 入库（uk_dahua_record_id 保证不重复） ----
            dahuaSwingMapper.upsertRecord(r);

            // ---- 馈入 access_raw_event 清洗管道 ----
            if (accessRawEventIngestService != null) {
                try {
                    accessRawEventIngestService.ingestFromSwing(r, "DAHUA_WEBHOOK");
                } catch (Exception e) {
                    log.debug("[dahua-webhook] access_raw_event馈入失败: {}", e.getMessage());
                }
            }

            // ---- 馈入告警引擎 ----
            feedSwipeAlertEngine(r.getRecordId(), r.getPersonName(), r.getChannelName(),
                    r.getChannelCode(), r.getOpenType(), r.getEnterOrExit(), r.getOpenResult(), r.getSwingTime());

            // ---- 门禁联动（激活/签退） ----
            if (Integer.valueOf(1).equals(r.getMappingHit())
                    && Integer.valueOf(1).equals(r.getOpenResult())
                    && dahuaSwingRuleEngineService != null) {
                try {
                    dahuaSwingRuleEngineService.onRecordIngested(r);
                } catch (Exception e) {
                    log.debug("[dahua-webhook] 联动规则处理失败: {}", e.getMessage());
                }
            }

            log.debug("[dahua-webhook] ✅入库: recordId={} person={} channel={} openType={} result={} deptId={}",
                    r.getRecordId(), r.getPersonName(), r.getChannelName(), r.getOpenType(), r.getOpenResult(), r.getDepartmentId());
        } catch (Exception e) {
            log.debug("[dahua-webhook] ❌入库失败: {}", e.getMessage());
        }
    }

    /** 无 extend.openType 的事件（远程开门48等），从 info 提取字段入库 */
    @SuppressWarnings("unchecked")
    private void ingestFromInfoOnly(Map<String, Object> payload, Map<String, Object> info) {
        try {
            Object alarmTypeObj = info.get("alarmType");
            Integer openType = intvObj(alarmTypeObj);
            if (openType == null || (openType != 48 && openType != 51 && openType != 52)) return;

            DahuaSwingRecord r = new DahuaSwingRecord();
            r.setTaskId(0L);
            r.setPullTaskType("REALTIME");
            r.setRecordId(str(info.get("alarmCode")));
            r.setChannelCode(str(info.get("nodeCode")));
            r.setChannelName(resolveChannelName(str(info.get("nodeCode")), str(info.get("deviceName"))));
            r.setOpenType(openType);
            r.setDepartmentName(str(info.get("orgName")));
            r.setDepartmentId(str(info.get("orgCode")));
            // alarmDate 是 epoch 秒
            Object alarmDate = info.get("alarmDate");
            if (alarmDate != null) {
                try {
                    long epoch = Long.parseLong(String.valueOf(alarmDate)) - 540; // -9min
                    r.setSwingTime(java.time.LocalDateTime.ofEpochSecond(epoch, 0, java.time.ZoneOffset.ofHours(8))
                            .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
                } catch (Exception ignored) {}
            }
            r.setOpenResult(1); // 远程开门默认成功
            r.setRawJson(JSON.toJSONString(payload));

            try { departmentSupport.applyToRecord(r, info); } catch (Exception ignored) {}

            // 部门过滤：26直通，非26走通道白名单
            boolean isDept26 = "26".equals(r.getDepartmentId());
            if (!isDept26 && !STAFF_ALLOWED_CHANNELS.contains(r.getChannelCode())) return;

            dahuaSwingMapper.upsertRecord(r);
            feedSwipeAlertEngine(r.getRecordId(), r.getPersonName(), r.getChannelName(),
                    r.getChannelCode(), r.getOpenType(), r.getEnterOrExit(), r.getOpenResult(), r.getSwingTime());
            log.debug("[dahua-webhook] ✅入库(infoOnly): recordId={} channel={} openType={} deptId={}",
                    r.getRecordId(), r.getChannelName(), r.getOpenType(), r.getDepartmentId());
        } catch (Exception e) {
            log.debug("[dahua-webhook] ❌入库失败(infoOnly): {}", e.getMessage());
        }
    }

    /** 从设备通道缓存表查找通道名称（优先缓存映射，回退到设备名） */
    private String resolveChannelName(String channelCode, String deviceName) {
        if (channelCode.isBlank()) return deviceName;
        try {
            List<Map<String, Object>> rows = deviceChannelCacheMapper.selectChannelNamesByCodes(List.of(channelCode));
            if (rows != null && !rows.isEmpty()) {
                Object name = rows.get(0).get("channelName");
                if (name != null && !String.valueOf(name).isBlank()) {
                    return String.valueOf(name);
                }
            }
        } catch (Exception e) {
            log.debug("[dahua-webhook] 通道名查找失败 code={}: {}", channelCode, e.getMessage());
        }
        return deviceName; // 回退
    }

    private void postToBuffer(String rawPayload) {
        if (bufferUrl == null || bufferUrl.isBlank()) return;
        try {
            new RestTemplate().postForObject(bufferUrl, rawPayload, String.class);
        } catch (Exception ignored) {
            // 缓冲器不可用时静默丢弃，不阻塞主流程
        }
    }

    /** 卡号 ↔ 用户映射（与 DahuaSwingPullService.enrichMapping 逻辑一致） */
    private void enrichMapping(DahuaSwingRecord r) {
        TwinCardMapping mapping = null;
        if (!str(r.getPersonCode()).isBlank())
            mapping = twinCardMappingService.getByDahuaPersonCode(r.getPersonCode());
        if (mapping == null && !str(r.getCardNumber()).isBlank())
            mapping = twinCardMappingService.getByCardNo(r.getCardNumber());
        if (mapping == null) {
            r.setMappingHit(0);
            return;
        }
        r.setMappingHit(1);
        r.setMappingUserId(mapping.getAroUserId());
        r.setMappingCardNo(mapping.getCardNo());
        r.setFreezeExemptFlag(mapping.getFreezeExemptFlag());
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    /** 大华时间快9分钟，所有入库 swingTime 统一减9分钟 */
    private static String adjustSwingTime9Min(Object raw) {
        if (raw == null) return "";
        String s = String.valueOf(raw).trim();
        if (s.isEmpty()) return s;
        try {
            // epoch seconds (10-digit numeric)
            if (s.matches("^\\d{10}$")) {
                long epoch = Long.parseLong(s) - 540;
                return java.time.LocalDateTime.ofEpochSecond(epoch, 0, java.time.ZoneOffset.ofHours(8))
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
            // datetime string
            java.time.LocalDateTime dt = java.time.LocalDateTime.parse(s,
                    java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            return dt.minusMinutes(9).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (Exception e) {
            return s; // fallback: return original
        }
    }

    private static Integer intvObj(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o instanceof String s && !s.isBlank()) {
            try { return Integer.parseInt(s.trim()); } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    /** 将 Webhook 路径的刷卡记录喂给告警引擎（与定时拉取路径共享同一引擎） */
    private void feedSwipeAlertEngine(String recordId, String personName, String channelName,
                                       String channelCode, Integer openType, Integer enterOrExit,
                                       Integer openResult, String swingTime) {
        if (swipeAlertEngine == null) return;
        try {
            com.example.demo.modules.dahua.dto.DahuaRecordDTO dto =
                    new com.example.demo.modules.dahua.dto.DahuaRecordDTO();
            dto.setId(recordId);
            dto.setPersonName(personName);
            dto.setChannelName(channelName);
            dto.setChannelCode(channelCode);
            dto.setOpenType(openType);
            dto.setEnterOrExit(enterOrExit);
            dto.setOpenResult(openResult);
            dto.setSwingTime(swingTime);
            swipeAlertEngine.onSwingRecord(dto);
        } catch (Exception e) {
            log.debug("[swipe-alert] webhook feed failed: {}", e.getMessage());
        }
    }

    // =========================================================================
    // 2. 🔐 订阅逻辑 (现在直接找 AuthService 要 Token 和 BaseUrl)
    // =========================================================================
    public void cleanupLegacySubscriptions() {
        log.info("[System] 清理旧订阅...");
        List<String> zombieNames = Arrays.asList("172.22.161.252_8080", "172.22.161.252_3000", "172.22.161.254_3000", "172.22.161.254_8080", "192.168.1.3_8080", "My_Fixed_Java_Client_V1");
        for (String name : zombieNames) unsubscribe(name);
    }

    public boolean subscribe() {
        String token = authService.getValidToken(); // 💥 找基建要 Token
        String magic;
        try {
            java.net.URI uri = new java.net.URI(myCallbackUrl);
            magic = uri.getHost() + "_" + uri.getPort();
        } catch (Exception e) {
            magic = "127.0.0.1_8080";
        }

        String subName = "My_Fixed_Java_Client_V2026";
        unsubscribe(subName);

        String subUrl = authService.getBaseUrl() + "/evo-apigw/evo-event/1.0.0/subscribe/mqinfo";
        Map<String, Object> payload = new HashMap<>();
        Map<String, Object> param = new HashMap<>();
        Map<String, Object> monitor = new HashMap<>();

        monitor.put("monitor", myCallbackUrl);
        monitor.put("monitorType", "url");

        List<Map<String, Object>> events = new ArrayList<>();
        Map<String, Object> alarmEvent = new HashMap<>();
        alarmEvent.put("category", "alarm");
        alarmEvent.put("subscribeAll", 1);
        alarmEvent.put("domainSubscribe", 2);
        alarmEvent.put("authorities", Collections.singletonList(new HashMap<>()));
        events.add(alarmEvent);

        Map<String, Object> businessEvent = new HashMap<>();
        businessEvent.put("category", "business");
        businessEvent.put("subscribeAll", 1);
        businessEvent.put("domainSubscribe", 2);
        businessEvent.put("authorities", Collections.singletonList(new HashMap<>()));
        events.add(businessEvent);

        monitor.put("events", events);
        param.put("monitors", Collections.singletonList(monitor));

        Map<String, Object> subsystem = new HashMap<>();
        subsystem.put("subsystemType", 0);
        subsystem.put("name", subName);
        subsystem.put("magic", magic);
        param.put("subsystem", subsystem);

        payload.put("param", param);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + token);
            headers.setContentType(MediaType.APPLICATION_JSON);

            // ====== DEBUG: 打印请求信息 ======
            log.info("══════════════════════════════════════════════");
            log.info("[大华订阅] ▶ 请求URL: {}", subUrl);
            log.info("[大华订阅] ▶ 订阅者名称: {}", subName);
            log.info("[大华订阅] ▶ 回调地址: {}", myCallbackUrl);
            log.info("[大华订阅] ▶ 请求体: {}", JSON.toJSONString(payload));
            log.info("══════════════════════════════════════════════");

            Map<String, Object> res = authService.getRestTemplate().postForObject(subUrl, new HttpEntity<>(payload, headers), Map.class);

            // ====== DEBUG: 打印响应信息 ======
            String responseJson = JSON.toJSONString(res);
            log.info("══════════════════════════════════════════════");
            log.info("[大华订阅] ◀ 响应结果: {}", responseJson);
            if (res != null) {
                log.info("[大华订阅] ◀ success={}, code={}, errMsg={}",
                        res.get("success"), res.get("code"), res.get("errMsg"));
            }
            log.info("══════════════════════════════════════════════");

            boolean ok = res != null && (Boolean.TRUE.equals(res.get("success")) || "0".equals(String.valueOf(res.get("code"))));
            log.info("[大华订阅] 最终判断: {}", ok ? "✅ 订阅成功" : "❌ 订阅失败");
            return ok;
        } catch (Exception e) {
            log.error("══════════════════════════════════════════════");
            log.error("[大华订阅] ❌ 订阅异常: {}", e.getMessage(), e);
            log.error("══════════════════════════════════════════════");
            return false;
        }
    }

    public boolean unsubscribe(String nameToCancel) {
        String token = authService.getValidToken();
        String url = authService.getBaseUrl() + "/evo-apigw/evo-event/1.0.0/subscribe/mqinfo?name=" + nameToCancel;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + token);
            log.info("[大华取消订阅] ▶ DELETE {}", url);
            ResponseEntity<Map> resp = authService.getRestTemplate().exchange(url, HttpMethod.DELETE, new HttpEntity<>(headers), Map.class);
            log.info("[大华取消订阅] ◀ 响应: {}", JSON.toJSONString(resp.getBody()));
            return true;
        } catch (Exception e) {
            log.warn("[大华取消订阅] ⚠ 取消失败 (可能不存在): {}", e.getMessage());
            return false;
        }
    }

    /**
     * 🔧 诊断用：手动执行订阅并返回完整请求/响应信息
     */
    public Map<String, Object> subscribeDiagnostic() {
        Map<String, Object> diagnostic = new LinkedHashMap<>();
        diagnostic.put("timestamp", LocalDateTime.now().toString());

        String token = authService.getValidToken();
        String magic;
        try {
            java.net.URI uri = new java.net.URI(myCallbackUrl);
            magic = uri.getHost() + "_" + uri.getPort();
        } catch (Exception e) {
            magic = "127.0.0.1_8080";
        }

        String subName = "My_Fixed_Java_Client_V2026";
        String subUrl = authService.getBaseUrl() + "/evo-apigw/evo-event/1.0.0/subscribe/mqinfo";

        // 构建请求体（与 subscribe() 完全一致）
        Map<String, Object> payload = new HashMap<>();
        Map<String, Object> param = new HashMap<>();
        Map<String, Object> monitor = new HashMap<>();
        monitor.put("monitor", myCallbackUrl);
        monitor.put("monitorType", "url");
        List<Map<String, Object>> events = new ArrayList<>();
        Map<String, Object> alarmEvent = new HashMap<>();
        alarmEvent.put("category", "alarm");
        alarmEvent.put("subscribeAll", 1);
        alarmEvent.put("domainSubscribe", 2);
        alarmEvent.put("authorities", Collections.singletonList(new HashMap<>()));
        events.add(alarmEvent);
        Map<String, Object> businessEvent = new HashMap<>();
        businessEvent.put("category", "business");
        businessEvent.put("subscribeAll", 1);
        businessEvent.put("domainSubscribe", 2);
        businessEvent.put("authorities", Collections.singletonList(new HashMap<>()));
        events.add(businessEvent);
        monitor.put("events", events);
        param.put("monitors", Collections.singletonList(monitor));
        Map<String, Object> subsystem = new HashMap<>();
        subsystem.put("subsystemType", 0);
        subsystem.put("name", subName);
        subsystem.put("magic", magic);
        param.put("subsystem", subsystem);
        payload.put("param", param);

        diagnostic.put("requestUrl", subUrl);
        diagnostic.put("subscriberName", subName);
        diagnostic.put("callbackUrl", myCallbackUrl);
        diagnostic.put("requestBody", payload);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + token);
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> res = authService.getRestTemplate().postForObject(subUrl, new HttpEntity<>(payload, headers), Map.class);
            diagnostic.put("responseBody", res);
            boolean ok = res != null && (Boolean.TRUE.equals(res.get("success")) || "0".equals(String.valueOf(res.get("code"))));
            diagnostic.put("subscribed", ok);
            diagnostic.put("error", null);
        } catch (Exception e) {
            diagnostic.put("responseBody", null);
            diagnostic.put("subscribed", false);
            diagnostic.put("error", e.getMessage());
        }
        return diagnostic;
    }

    @Async("coreTaskExecutor")
    public void subscribeOnStartupAsync() {
        try {
            Thread.sleep(3000);
            cleanupLegacySubscriptions();
            subscribe();
            log.info("[大华网关] 订阅就绪，雷达已开启！");
        } catch (Exception e) {
            log.error("[大华网关] 订阅启动失败: {}", e.getMessage());
        }
    }
}