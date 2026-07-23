package com.example.demo.modules.twin.rpg.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.twin.rpg.service.TwinExpStatsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 经验值审核接口 —— 供管理端人工复核异常经验记录。
 */
@RestController
@RequestMapping("/api/v1/twin/rpg/review")
@Tag(name = "经验值审核", description = "异常经验记录人工复核")
public class TwinExpReviewController {

    @Autowired
    private TwinExpStatsService twinExpStatsService;

    @Autowired
    private AuthContextService authContextService;

    @GetMapping("/anomalies")
    @Operation(summary = "分页查询异常/审核记录")
    public Result<Map<String, Object>> getAnomalies(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) Integer anomalyFlag,
            @RequestParam(required = false) Integer reviewStatus,
            @RequestParam(required = false) String feedSource,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(twinExpStatsService.getRecordsPageWithFilters(
                pageNum, pageSize, null, null,
                startDate, endDate,
                anomalyFlag, reviewStatus, feedSource));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "批准单条经验记录")
    public Result<String> approve(@PathVariable Long id,
                                   @RequestHeader(value = "Authorization", required = false) String auth,
                                   @RequestBody(required = false) Map<String, String> body) {
        String operator = resolveOperator(auth);
        String note = body != null ? body.get("note") : null;
        twinExpStatsService.approveRecord(id, operator, note);
        return Result.success("已批准");
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "驳回单条经验记录")
    public Result<String> reject(@PathVariable Long id,
                                  @RequestHeader(value = "Authorization", required = false) String auth,
                                  @RequestBody(required = false) Map<String, String> body) {
        String operator = resolveOperator(auth);
        String note = body != null ? body.get("note") : null;
        twinExpStatsService.rejectRecord(id, operator, note);
        return Result.success("已驳回");
    }

    @PostMapping("/batch-approve")
    @Operation(summary = "批量批准")
    public Result<String> batchApprove(@RequestBody Map<String, Object> body,
                                        @RequestHeader(value = "Authorization", required = false) String auth) {
        @SuppressWarnings("unchecked")
        List<Number> rawIds = (List<Number>) body.get("ids");
        List<Long> ids = rawIds.stream().map(Number::longValue).toList();
        String operator = resolveOperator(auth);
        twinExpStatsService.batchUpdateReview(ids, 1, operator);
        return Result.success("已批量批准 " + ids.size() + " 条");
    }

    @PostMapping("/batch-reject")
    @Operation(summary = "批量驳回")
    public Result<String> batchReject(@RequestBody Map<String, Object> body,
                                       @RequestHeader(value = "Authorization", required = false) String auth) {
        @SuppressWarnings("unchecked")
        List<Number> rawIds = (List<Number>) body.get("ids");
        List<Long> ids = rawIds.stream().map(Number::longValue).toList();
        String operator = resolveOperator(auth);
        twinExpStatsService.batchUpdateReview(ids, 2, operator);
        return Result.success("已批量驳回 " + ids.size() + " 条");
    }

    private String resolveOperator(String authHeader) {
        try {
            var user = authContextService.resolveUserFromBearer(authHeader);
            return user != null && user.getId() != null ? user.getId().toString() : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }
}
