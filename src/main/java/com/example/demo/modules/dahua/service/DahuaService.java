package com.example.demo.modules.dahua.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.alibaba.fastjson2.JSON;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.dto.UniversalEvent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
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

    @Autowired(required = false)
    private com.example.demo.modules.swipealert.service.SwipeAlertEngine swipeAlertEngine;

    private final String myCallbackUrl = "http://172.22.161.252:8080/api/event";

    private static final Set<String> ALLOWED_OPEN_TYPES = new HashSet<>(Arrays.asList("48", "49", "51", "52"));
    private static final Map<String, String> TYPE_NAMES = Map.of(
            "48", "远程开门", "49", "按钮/密码", "51", "合法刷卡", "52", "非法刷卡"
    );

    // =========================================================================
    // 1. 🚀 核心流水线：原样保留！完全没动你的孪生逻辑
    // =========================================================================
    @SuppressWarnings("unchecked")
    public void processAndBroadcast(String rawPayload) {
        try {
            Map<String, Object> payload = JSON.parseObject(rawPayload, Map.class);
            if (payload == null) return;

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
                    String swingTime = str(evt.get("swingTime"));

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

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
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
            Map<String, Object> res = authService.getRestTemplate().postForObject(subUrl, new HttpEntity<>(payload, headers), Map.class);
            return res != null && (Boolean.TRUE.equals(res.get("success")) || "0".equals(String.valueOf(res.get("code"))));
        } catch (Exception e) {
            log.error("订阅失败：{}", e.getMessage());
            return false;
        }
    }

    public boolean unsubscribe(String nameToCancel) {
        String token = authService.getValidToken();
        String url = authService.getBaseUrl() + "/evo-apigw/evo-event/1.0.0/subscribe/mqinfo?name=" + nameToCancel;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + token);
            authService.getRestTemplate().exchange(url, HttpMethod.DELETE, new HttpEntity<>(headers), Map.class);
            return true;
        } catch (Exception e) { return false; }
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