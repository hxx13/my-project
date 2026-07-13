package com.example.demo.modules.twin.common.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.twin.common.service.ClientVersionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Tag(name = "客户端版本", description = "版本检查与自动刷新")
public class ClientVersionController {

    private final ClientVersionService clientVersionService;

    public ClientVersionController(ClientVersionService clientVersionService) {
        this.clientVersionService = clientVersionService;
    }

    @GetMapping("/client-version")
    @Operation(summary = "客户端版本检查（公开，无需认证）")
    public Result<?> getClientVersion(
            @RequestParam(defaultValue = "") String clientId,
            @RequestParam(defaultValue = "") String clientBuildId,
            @RequestParam(defaultValue = "web") String channel) {
        return Result.success(clientVersionService.getClientVersion(clientId, clientBuildId, channel));
    }
}
