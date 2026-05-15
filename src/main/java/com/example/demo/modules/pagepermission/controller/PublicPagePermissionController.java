package com.example.demo.modules.pagepermission.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.pagepermission.service.PagePermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/page-permissions")
@Tag(name = "公开页面权限", description = "Web/小程序入口与页面权限下发")
public class PublicPagePermissionController {
    private final PagePermissionService service;

    public PublicPagePermissionController(PagePermissionService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "按平台获取页面权限列表")
    public Result<?> list(@RequestParam String platform) {
        return Result.success(service.listPublicForPlatform(platform));
    }
}

