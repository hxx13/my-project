package com.example.demo.modules.mp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.mp.dto.MpHomeBulletinDetailDto;
import com.example.demo.modules.mp.dto.MpHomeBulletinListItemDto;
import com.example.demo.modules.mp.service.MpHomeBulletinPublicService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 小程序首页「公告」合并时间线：运营公告 + 版本记录；公开只读，云函数 /api/public 白名单。
 */
@RestController
@RequestMapping("/api/public/mp-home/bulletins")
@CrossOrigin(origins = "*")
@Tag(name = "公开·小程序首页公告", description = "公告与版本合并列表/详情（只读）")
public class PublicMpHomeBulletinController {

    private final MpHomeBulletinPublicService bulletinPublicService;

    public PublicMpHomeBulletinController(MpHomeBulletinPublicService bulletinPublicService) {
        this.bulletinPublicService = bulletinPublicService;
    }

    @GetMapping
    @Operation(summary = "合并列表（按发布时间降序）")
    public Result<List<MpHomeBulletinListItemDto>> list() {
        return Result.success(bulletinPublicService.listMerged());
    }

    @GetMapping("/{id}")
    @Operation(summary = "详情", description = "kind=announcement | release")
    public Result<MpHomeBulletinDetailDto> detail(@PathVariable String id,
                                                  @RequestParam String kind) {
        if (!StringUtils.hasText(kind)) {
            return Result.error("缺少 kind 参数");
        }
        MpHomeBulletinDetailDto d = bulletinPublicService.detail(id, kind);
        if (d == null) {
            return Result.error("记录不存在或未发布");
        }
        return Result.success(d);
    }
}
