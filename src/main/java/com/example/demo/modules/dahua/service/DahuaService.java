package com.example.demo.modules.dahua.service;

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

    @Autowired
    private SocketIOServer socketServer;

    @Autowired
    private DahuaAuthService authService; // 💥 引入新基建

    private final String myCallbackUrl = "http://172.22.161.252:8080/api/event";

    private static final Set<String> ALLOWED_OPEN_TYPES = new HashSet<>(Arrays.asList("48", "49", "51", "52"));
    private static final Map<String, String> TYPE_NAMES = Map.of(
            "48", "远程开门", "49", "按钮/密码", "51", "合法刷卡", "52", "非法刷卡"
    );

    // =========================================================================
    // 1. 🚀 核心流水线：原样保留！完全没动你的孪生逻辑
    // =========================================================================
    public void processAndBroadcast(String rawPayload) {
        // ... (此处为您原先 processAndBroadcast 的所有代码，一行未改，为了节约篇幅我折叠了，请您原样粘贴您的逻辑) ...
        // (注：由于我是在回答，请您直接保留您原始的该方法实现即可)
    }

    // =========================================================================
    // 2. 🔐 订阅逻辑 (现在直接找 AuthService 要 Token 和 BaseUrl)
    // =========================================================================
    public void cleanupLegacySubscriptions() {
        System.out.println("🧹 [System] 清理旧订阅...");
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
            System.err.println("❌ 订阅失败：" + e.getMessage());
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
            System.out.println("✅ [大华网关] 订阅就绪，雷达已开启！");
        } catch (Exception e) {
            System.err.println("❌ [大华网关] 订阅启动失败: " + e.getMessage());
        }
    }
}