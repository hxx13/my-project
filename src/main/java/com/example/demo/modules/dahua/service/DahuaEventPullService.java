package com.example.demo.modules.dahua.service;

import com.alibaba.fastjson2.JSON;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * 从 Windows 缓冲器拉取 ICC 事件到生产服务器（WinCC 模式）
 * 仅当 app.dahua.pull-from-url 配置时激活
 */
@Service
public class DahuaEventPullService {

    @Value("${app.dahua.pull-from-url:}")
    private String pullFromUrl;

    @Autowired
    private DahuaService dahuaService;

    private final RestTemplate restTemplate = new RestTemplate();

    @Scheduled(fixedDelay = 3000)
    public void pullFromBuffer() {
        if (pullFromUrl == null || pullFromUrl.isBlank()) return;
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(pullFromUrl, String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> batch = (List) JSON.parseArray(resp.getBody(), Map.class);
                if (batch != null && !batch.isEmpty()) {
                    System.out.printf("[dahua-pull] 拉取到 %d 条事件%n", batch.size());
                    for (Map<String, Object> item : batch) {
                        try {
                            String body = (String) item.get("body");
                            if (body != null) {
                                dahuaService.processAndBroadcast(body);
                            }
                        } catch (Exception e) {
                            System.out.printf("[dahua-pull] 单条处理失败: %s%n", e.getMessage());
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.out.printf("[dahua-pull] 拉取失败: %s%n", e.getMessage());
        }
    }
}
