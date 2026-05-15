package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result; // 使用你的全局 Result
import com.example.demo.modules.twin.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.service.TwinDashboardAggregationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/twin/dashboard")
@Tag(name = "数字孪生大屏", description = "大屏与小程序概览接口")
public class TwinDashboardController {

    @Autowired
    private TwinDashboardAggregationService aggregationService;

    // 🎯 专门给微信小程序和弹窗调用的接口
    @GetMapping("/wechat-overview")
    @Operation(summary = "获取微信概览房间数据")
    public Result<List<RoomDashboardRenderDTO>> getWechatOverview(
            @RequestParam(required = false) String campus) {
        return Result.success(aggregationService.getWechatMiniProgramData(campus));
    }
}