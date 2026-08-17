package com.example.demo.modules.inventory.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.dto.ScanCommitResult;
import com.example.demo.modules.inventory.dto.ScanLineReq;
import com.example.demo.modules.inventory.dto.ScanLineView;
import com.example.demo.modules.inventory.dto.ScanStartReq;
import com.example.demo.modules.inventory.dto.ScanSessionView;
import com.example.demo.modules.inventory.service.ScanSessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/inventory/scan-sessions")
@Tag(name = "物品盘点", description = "盘点会话与对账引擎")
public class ScanSessionController {

    private final AuthContextService authContextService;
    private final ScanSessionService scanSessionService;

    public ScanSessionController(AuthContextService authContextService, ScanSessionService scanSessionService) {
        this.authContextService = authContextService;
        this.scanSessionService = scanSessionService;
    }

    @PostMapping
    @Operation(summary = "开始盘点会话")
    public Result<ScanSessionView> startSession(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @RequestBody ScanStartReq body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return scanSessionService.startSession(body.getSpaceId(), user.getId());
    }

    @PostMapping("/{id}/lines")
    @Operation(summary = "灌入一个扫描码")
    public Result<ScanLineView> addLine(@PathVariable Long id, @RequestBody ScanLineReq body) {
        return scanSessionService.addLine(id, body.getRfidCode());
    }

    @GetMapping("/{id}")
    @Operation(summary = "盘点会话详情")
    public Result<Map<String, Object>> getSession(@PathVariable Long id) {
        return scanSessionService.getSession(id);
    }

    @PostMapping("/{id}/commit")
    @Operation(summary = "提交对账")
    public Result<ScanCommitResult> commit(@RequestHeader(value = "Authorization", required = false) String auth,
                                           @PathVariable Long id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return scanSessionService.commit(id, user.getId());
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "取消盘点会话")
    public Result<?> cancel(@PathVariable Long id) {
        return scanSessionService.cancel(id);
    }

    private User resolveUser(String auth) {
        return authContextService.resolveUserFromBearer(auth);
    }
}
