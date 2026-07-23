package com.example.demo.modules.accessfusion.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import com.example.demo.modules.accessfusion.service.AccessDoorRuleService;
import com.example.demo.modules.accessfusion.service.AccessEventCleanService;
import com.example.demo.modules.accessfusion.service.AccessFusionCompareService;
import com.example.demo.modules.accessfusion.service.AccessFusionReviewService;
import com.example.demo.modules.accessfusion.service.AccessRawEventIngestService;
import com.example.demo.modules.accessfusion.mapper.AccessCleanBatchMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanedEventMapper;
import com.example.demo.modules.analytics.service.AnalyticsFilterParams;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/access-fusion")
@Tag(name = "门禁清洗", description = "大华摆闸归一、方向推断与统计投喂")
public class AccessFusionController {

    private final AccessDoorRuleService doorRuleService;
    private final AccessEventCleanService cleanService;
    private final AccessRawEventIngestService rawIngestService;
    private final AccessFusionCompareService compareService;
    private final AccessFusionReviewService reviewService;
    private final AccessCleanBatchMapper batchMapper;
    private final AccessCleanedEventMapper cleanedEventMapper;
    private final AuthContextService authContextService;

    public AccessFusionController(
            AccessDoorRuleService doorRuleService,
            AccessEventCleanService cleanService,
            AccessRawEventIngestService rawIngestService,
            AccessFusionCompareService compareService,
            AccessFusionReviewService reviewService,
            AccessCleanBatchMapper batchMapper,
            AccessCleanedEventMapper cleanedEventMapper,
            AuthContextService authContextService) {
        this.doorRuleService = doorRuleService;
        this.cleanService = cleanService;
        this.rawIngestService = rawIngestService;
        this.compareService = compareService;
        this.reviewService = reviewService;
        this.batchMapper = batchMapper;
        this.cleanedEventMapper = cleanedEventMapper;
        this.authContextService = authContextService;
    }

    @GetMapping("/door-rules")
    @Operation(summary = "分页查询门禁统计规则")
    public Result<?> listRules(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long statsTaskId) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(doorRuleService.list(keyword, statsTaskId, page, pageSize));
    }

    @PostMapping("/door-rules")
    public Result<?> createRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody AccessDoorRule body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            long id = doorRuleService.create(body);
            return Result.success(Map.of("id", id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/door-rules/{id}")
    public Result<?> updateRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody AccessDoorRule body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            doorRuleService.update(id, body);
            return Result.success(Map.of("id", id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/door-rules/{id}")
    public Result<?> deleteRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        doorRuleService.delete(id);
        return Result.success(null);
    }

    @PostMapping("/raw/backfill")
    @Operation(summary = "从摆闸库回填 access_raw_event")
    public Result<?> backfill(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        int n = rawIngestService.backfillFromSwingTable(startTime, endTime, 500);
        return Result.success(Map.of("ingested", n));
    }

    @PostMapping("/clean/run")
    @Operation(summary = "手动执行清洗窗口")
    public Result<?> runClean(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime windowStart,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime windowEnd) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(cleanService.runClean(windowStart, windowEnd, "MANUAL"));
    }

    @GetMapping("/clean/batches")
    public Result<?> listBatches(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(batchMapper.selectRecent(30));
    }

    @GetMapping("/clean/batches/{batchId}/events")
    @Operation(summary = "清洗批次事件明细")
    public Result<?> batchEvents(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long batchId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        int safeSize = Math.min(Math.max(pageSize, 1), 500);
        int offset = (Math.max(page, 1) - 1) * safeSize;
        return Result.success(cleanedEventMapper.selectByBatchId(batchId, offset, safeSize));
    }

    @GetMapping("/review-queue")
    public Result<?> reviewQueue(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(reviewService.listReview(page, pageSize));
    }

    @PostMapping("/review/{id}/confirm")
    public Result<?> confirmReview(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestParam String direction) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        reviewService.confirmManual(id, direction);
        return Result.success(null);
    }

    @PostMapping("/review/{id}/ai-suggest")
    public Result<?> aiSuggest(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(reviewService.suggestWithAi(id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/compare/isolation-7d")
    @Operation(summary = "隔离服统计：ARO vs 清洗 近7天对照")
    public Result<?> compareIsolation(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) List<String> campuses,
            @RequestParam(required = false) List<String> floors,
            @RequestParam(required = false) String roomName,
            @RequestParam(defaultValue = "true") boolean excludeBlacklist) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        AnalyticsFilterParams params =
                new AnalyticsFilterParams(campuses, floors, roomName, null, excludeBlacklist, List.of("day"), List.of(), true);
        return Result.success(compareService.compareSevenDays(params));
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
