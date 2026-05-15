package com.example.demo.modules.aro.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aro.dto.AroNewsDetailDto;
import com.example.demo.modules.aro.dto.AroNewsListPayloadDto;
import com.example.demo.modules.aro.service.AroNewsProxyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 小程序首页「新闻通知」与新闻中心：经自建后端代理 ARO JTU，不直连 https://aro.shsmu.edu.cn/jtu/api。
 * 路径落在 /api/public/**，云函数默认 ALLOWED_API_PREFIXES 已含 /api/public。
 */
@RestController
@RequestMapping("/api/public/aro/news")
@CrossOrigin(origins = "*")
@Tag(name = "公开·ARO新闻", description = "JTU 新闻列表与详情代理（服务端二次封装）")
public class PublicAroNewsController {

    private final AroNewsProxyService aroNewsProxyService;

    public PublicAroNewsController(AroNewsProxyService aroNewsProxyService) {
        this.aroNewsProxyService = aroNewsProxyService;
    }

    @GetMapping
    @Operation(summary = "新闻列表", description = "对应原 JTU GET /news，返回 data.list 结构")
    public Result<AroNewsListPayloadDto> list() {
        try {
            return Result.success(aroNewsProxyService.fetchNewsList());
        } catch (Exception e) {
            return Result.error(e.getMessage() == null ? "新闻列表加载失败" : e.getMessage());
        }
    }

    @GetMapping("/{id}")
    @Operation(summary = "新闻详情", description = "对应原 JTU GET /news/{id}")
    public Result<AroNewsDetailDto> detail(@PathVariable("id") String id) {
        try {
            return Result.success(aroNewsProxyService.fetchNewsDetail(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error(e.getMessage() == null ? "新闻详情加载失败" : e.getMessage());
        }
    }
}
