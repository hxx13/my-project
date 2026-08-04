package com.example.demo.modules.dahua.controller;

import com.example.demo.modules.dahua.service.DahuaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/event") // 保持大华设备配好的 Webhook 路由不变
@Tag(name = "大华事件", description = "门禁设备Webhook接收")
public class DahuaEventController {

    private static final Logger log = LoggerFactory.getLogger(DahuaEventController.class);

    /** 记录最近 20 条收到的请求，用于排查 ICC 是否在回调 */
    private final List<Map<String, Object>> requestLog = new ArrayList<>();
    private static final int MAX_LOG = 20;

    @Autowired
    private DahuaService dahuaService;

    /**
     * 🚀 纯粹的流处理入口：接收 Webhook，瞬间返回，绝不阻塞！
     */
    @PostMapping
    @Operation(summary = "接收大华设备事件推送")
    public Map<String, Object> handleDahuaEvent(@RequestBody String rawPayload, HttpServletRequest request) {
        logIncoming("POST", rawPayload, request);
        // 丢给 Service 里的子线程去解析和推流
        dahuaService.processAndBroadcast(rawPayload);
        return Map.of("success", true);
    }

    /** 兜底：捕获 OPTIONS/GET 等其它方法，ICC 可能用它们做连通性探测 */
    @RequestMapping
    public Map<String, Object> catchAll(HttpServletRequest request) {
        logIncoming(request.getMethod(), "[NO_BODY]", request);
        return Map.of("success", true, "method", request.getMethod());
    }

    private void logIncoming(String method, String body, HttpServletRequest request) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("time", LocalDateTime.now().toString());
        entry.put("method", method);
        entry.put("remoteAddr", request.getRemoteAddr());
        entry.put("contentType", request.getContentType());
        entry.put("bodyPreview", body != null && body.length() > 500 ? body.substring(0, 500) + "..." : body);

        synchronized (requestLog) {
            requestLog.add(0, entry);
            if (requestLog.size() > MAX_LOG) requestLog.remove(requestLog.size() - 1);
        }
        log.debug("[事件回调] {} from {}", method, request.getRemoteAddr());
    }

    /**
     * 🔄 开机自动注册与订阅
     */
    @PostConstruct
    public void autoSubscribeOnStart() {
        dahuaService.subscribeOnStartupAsync();
    }

    /**
     * 🔧 诊断端点：手动触发订阅，返回 ICC 原始响应 + 请求日志
     * GET /api/event/subscribe-diagnostic
     */
    @GetMapping("/subscribe-diagnostic")
    @Operation(summary = "手动触发大华事件订阅并返回完整诊断信息")
    public Map<String, Object> subscribeDiagnostic() {
        Map<String, Object> result = new LinkedHashMap<>(dahuaService.subscribeDiagnostic());
        synchronized (requestLog) {
            result.put("recentRequests", new ArrayList<>(requestLog));
        }
        return result;
    }

    /**
     * 🔍 诊断端点：查询 ICC 上当前所有 url 类型订阅列表
     * GET /api/event/subscribe-list
     */
    @GetMapping("/subscribe-list")
    @Operation(summary = "查询 ICC 事件订阅列表（alarm/business/state/perception）")
    public Map<String, Object> subscribeList() {
        return dahuaService.querySubscriptionList();
    }
}