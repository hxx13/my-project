package com.example.demo.modules.dahua.controller;

import com.example.demo.modules.dahua.service.DahuaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.annotation.PostConstruct;

@RestController
@RequestMapping("/api/event") // 保持大华设备配好的 Webhook 路由不变
@CrossOrigin("*")
@Tag(name = "大华事件", description = "门禁设备Webhook接收")
public class DahuaEventController {

    @Autowired
    private DahuaService dahuaService;

    /**
     * 🚀 纯粹的流处理入口：接收 Webhook，瞬间返回，绝不阻塞！
     */
    @PostMapping
    @Operation(summary = "接收大华设备事件推送")
    public String handleDahuaEvent(@RequestBody String rawPayload) {
        // 丢给 Service 里的子线程去解析和推流
        dahuaService.processAndBroadcast(rawPayload);
        return "success";
    }

    /**
     * 🔄 开机自动注册与订阅
     */
    @PostConstruct
    public void autoSubscribeOnStart() {
        dahuaService.subscribeOnStartupAsync();
    }
}