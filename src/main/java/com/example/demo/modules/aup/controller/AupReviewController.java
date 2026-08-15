package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aup.dto.FormatReviewRequest;
import com.example.demo.modules.aup.dto.PiReviewRequest;
import com.example.demo.modules.aup.dto.ReviewVoteRequest;
import com.example.demo.modules.aup.dto.ReviewerConfigRequest;
import com.example.demo.modules.aup.service.AupReviewService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

/**
 * AUP 审查 / 专家投票 / 分配 / 终止。鉴权在 Controller 首行 resolveUserFromBearer + 角色断言；
 * 业务异常抛 {@code TwinBusinessException}，由 GlobalExceptionHandler 统一转 Result。
 */
@RestController
@RequestMapping("/api/aup")
@Tag(name = "AUP 审查", description = "格式审查（分配专家）/ 专家投票 / 终止")
public class AupReviewController {

    private final AupReviewService reviewService;
    private final AuthContextService authContextService;

    public AupReviewController(AupReviewService reviewService, AuthContextService authContextService) {
        this.reviewService = reviewService;
        this.authContextService = authContextService;
    }

    @GetMapping("/review/todo")
    @Operation(summary = "按角色返回待审（组长 piReview / 秘书 formatReview / 专家 被分配 expertReview）")
    public Result<?> todo(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestParam(defaultValue = "secretary") String role,
                          @RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "50") int size) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        String r = role == null ? "" : role.trim().toLowerCase();
        switch (r) {
            case "secretary" -> {
                if (!reviewService.isAdmin(user) && !reviewService.isSecretary(user.getId())) {
                    return Result.fail(403, "无权限查看秘书待办");
                }
            }
            case "expert" -> {
                // 允许任意登录用户查询：结果仅含其本人被分配的待审项，无越权泄露
            }
            case "pi" -> {
                if (!reviewService.isAdmin(user) && !reviewService.isPi(user)) {
                    return Result.fail(403, "无权限查看组长待办");
                }
            }
            default -> {
                return Result.fail(400, "未知的角色分片: " + role);
            }
        }
        return Result.success(reviewService.todo(user, r, page, size));
    }

    @PostMapping("/{id}/pi-review")
    @Operation(summary = "组长审核（approve 通过进格式审查 / return 退回申请人）")
    public Result<?> piReview(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable long id,
                              @RequestBody PiReviewRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        if (!reviewService.isAdmin(user) && !reviewService.isPi(user)) {
            return Result.fail(403, "无权限执行组长审核");
        }
        return Result.success(reviewService.piReview(user, id, body));
    }

    @PostMapping("/{id}/format-review")
    @Operation(summary = "格式审查（approve 选专家分配 / return 退回）")
    public Result<?> formatReview(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @PathVariable long id,
                                  @RequestBody FormatReviewRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        if (!reviewService.isAdmin(user) && !reviewService.isSecretary(user.getId())) {
            return Result.fail(403, "无权限执行格式审查");
        }
        return Result.success(reviewService.formatReview(user, id, body));
    }

    @PostMapping("/{id}/review")
    @Operation(summary = "专家投票（含逐字段意见 items[]，幂等，结算后可能流转 approved/draft）")
    public Result<?> vote(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @PathVariable long id,
                          @RequestBody ReviewVoteRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        return Result.success(reviewService.submitVote(user, id, body));
    }

    @GetMapping("/{id}/review/progress")
    @Operation(summary = "投票进度（应投/已投/回避/未投名单 + 分 verdict 计数）")
    public Result<?> progress(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable long id,
                              @RequestParam(required = false) Integer roundNo) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        return Result.success(reviewService.progress(user, id, roundNo));
    }

    @GetMapping("/{id}/review/items")
    @Operation(summary = "逐字段评审意见（总览不带 fieldKey；快捷入口带 fieldKey）")
    public Result<?> items(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @PathVariable long id,
                           @RequestParam(required = false) Integer roundNo,
                           @RequestParam(required = false) String fieldKey) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        return Result.success(reviewService.reviewItems(user, id, roundNo, fieldKey));
    }

    @GetMapping("/experts")
    @Operation(summary = "专家候选（aup_reviewer 关联 aro_personnel）")
    public Result<?> experts(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        if (!reviewService.isAdmin(user) && !reviewService.isSecretary(user.getId())) {
            return Result.fail(403, "无权限查看专家候选");
        }
        return Result.success(reviewService.listExperts());
    }

    @GetMapping("/reviewer-config")
    @Operation(summary = "名册配置读取（格式审查人 / 专家候选）")
    public Result<?> reviewerConfig(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        if (!reviewService.isAdmin(user) && !reviewService.isSecretary(user.getId())) {
            return Result.fail(403, "无权限查看名册配置");
        }
        return Result.success(reviewService.reviewerConfig());
    }

    @PutMapping("/reviewer-config")
    @Operation(summary = "名册配置保存（全量替换写入 aup_reviewer）")
    public Result<?> updateReviewerConfig(@RequestHeader(value = "Authorization", required = false) String authorization,
                                          @RequestBody ReviewerConfigRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.fail(401, "未登录或令牌无效");
        }
        if (!reviewService.isAdmin(user)) {
            return Result.fail(403, "仅管理员可修改名册配置");
        }
        reviewService.updateReviewerConfig(body);
        return Result.success();
    }
}
