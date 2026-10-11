package com.example.demo.modules.ai.feedback.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.ai.feedback.entity.AiDrawerFeedback;
import com.example.demo.modules.ai.feedback.service.AiDrawerFeedbackService;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 抽屉反馈接口：提交（登录即可）、按范围列表、回复改状态（仅 ≥超管）。
 *
 * <p>身份一律来自 JWT（{@code Authorization} 头），**不从请求体读**。
 * 路径落在 {@code /api/v1/**}，已被 {@code apiAuthInterceptor} 覆盖，**不需要改 WebMvcConfig**。
 * 权限与校验全在 {@link AiDrawerFeedbackService}，越权/校验失败一律转成明确错误，不静默。
 */
@RestController
@RequestMapping("/api/v1/ai/drawer/feedback")
@Tag(name = "AI 抽屉反馈", description = "用户对抽屉提的意见与截图，超管回复")
public class AiDrawerFeedbackController {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AuthContextService authContextService;
    private final AiDrawerFeedbackService feedbackService;
    private final ObjectMapper objectMapper;

    public AiDrawerFeedbackController(AuthContextService authContextService,
                                      AiDrawerFeedbackService feedbackService,
                                      ObjectMapper objectMapper) {
        this.authContextService = authContextService;
        this.feedbackService = feedbackService;
        this.objectMapper = objectMapper;
    }

    /**
     * 提交反馈。请求体：{@code {"content":"...","imageUrls":["/api/upload/files/..."]}}。
     * {@code content} 必填（去空白后为空即拒）；{@code imageUrls} 可选，最多 6 张，每张须是本站上传地址。
     */
    @PostMapping
    @Operation(summary = "提交反馈（登录即可）：content 必填，imageUrls 可选且最多 6 张本站上传图")
    public Result<?> submit(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) Map<String, Object> body) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            String content = body == null ? null : str(body.get("content"));
            Object imageUrls = body == null ? null : body.get("imageUrls");
            AiDrawerFeedback saved = feedbackService.submit(user, content, imageUrls);
            return Result.success(view(saved, feedbackService.resolvePageNames(List.of(saved))), "已提交反馈");
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 反馈列表。默认只看自己的；{@code all=true} 看全部（**仅 ≥超管**，普通账号传 true 直接拒，不静默回落）。
     * 分页形状同同模块既有分页口：{@code {list,total,page,size,scope}}。
     */
    @GetMapping
    @Operation(summary = "反馈列表：默认只看自己的，all=true 看全部（仅超管及以上）")
    public Result<Map<String, Object>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "false") boolean all,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        AiDrawerFeedbackService.Page result;
        try {
            result = feedbackService.list(user, all, page, size);
        } catch (IllegalStateException e) {
            // 越权看全部是明确拒绝，不是静默回落成「只看自己的」
            return Result.error(e.getMessage());
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        // 整页回复作者 id 去重后**一次**批量解析展示名（含 userName 为空那几行的提交人），不逐条查
        Map<String, String> names = feedbackService.resolvePageNames(result.rows());
        for (AiDrawerFeedback f : result.rows()) {
            rows.add(view(f, names));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("list", rows);
        data.put("total", result.total());
        data.put("page", result.page());
        data.put("size", result.size());
        data.put("scope", result.allScope() ? "all" : "mine");
        return Result.success(data);
    }

    /**
     * 回复并改状态（**仅 ≥超管**）。请求体：{@code {"id":1,"replyContent":"...","replyImageUrls":["/api/upload/files/..."],"status":"REPLIED"}}。
     * {@code status} 只允许 {@code PENDING} 或 {@code REPLIED}；{@code replyImageUrls} 可选，规则与提交侧一致（≤6 张本站图）。
     */
    @PostMapping("/reply")
    @Operation(summary = "回复反馈并改状态（仅超管及以上）：status 只能是 PENDING / REPLIED，replyImageUrls 可选")
    public Result<?> reply(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) Map<String, Object> body) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            Long id = body == null ? null : toLong(body.get("id"));
            String replyContent = body == null ? null : str(body.get("replyContent"));
            String status = body == null ? null : str(body.get("status"));
            Object replyImageUrls = body == null ? null : body.get("replyImageUrls");
            AiDrawerFeedback saved = feedbackService.reply(user, id, replyContent, status, replyImageUrls);
            return Result.success(view(saved, feedbackService.resolvePageNames(List.of(saved))));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    // ── 公共 ──

    /**
     * 一行的对外形状。{@code imageUrls} 从存的 JSON 串还原成数组再发（前端不必自己解 JSON）。
     *
     * <p>{@code names} 是本页一次性批量解析出的 id → 展示名：回复串里每条补
     * {@code repliedByName}（解析名 → 落库快照 → id）；提交人 {@code userName} 为空时用同一份解析结果补上
     * （**只补空，不覆盖已有快照**）。
     */
    private Map<String, Object> view(AiDrawerFeedback f, Map<String, String> names) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getId());
        m.put("userId", f.getUserId());
        String userName = f.getUserName();
        if (userName == null || userName.isBlank()) {
            String resolved = f.getUserId() == null ? null : names.get(f.getUserId());
            if (resolved != null && !resolved.isBlank()) {
                userName = resolved;
            }
        }
        m.put("userName", userName);
        m.put("content", f.getContent());
        m.put("imageUrls", parseImages(f.getImageUrls()));
        m.put("status", f.getStatus());
        // 回复串（升序，元素含 content/imageUrls/repliedBy/repliedByName/repliedAt）
        List<AiDrawerFeedbackService.Reply> replies = new ArrayList<>();
        for (AiDrawerFeedbackService.Reply r : feedbackService.parseReplies(f.getRepliesJson())) {
            replies.add(feedbackService.viewReply(r, names));
        }
        m.put("replies", replies);
        // 旧单回复列保留作兼容读：= 最后一条回复；没有则空
        m.put("replyContent", f.getReplyContent());
        m.put("replyImageUrls", parseImages(f.getReplyImageUrls()));
        m.put("repliedBy", f.getRepliedBy());
        m.put("repliedAt", f.getRepliedAt() == null ? null : f.getRepliedAt().format(TS));
        m.put("createdAt", f.getCreatedAt() == null ? null : f.getCreatedAt().format(TS));
        m.put("updatedAt", f.getUpdatedAt() == null ? null : f.getUpdatedAt().format(TS));
        return m;
    }

    private List<String> parseImages(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, objectMapper.getTypeFactory()
                    .constructCollectionType(List.class, String.class));
        } catch (Exception e) {
            return List.of();
        }
    }

    private User currentUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.valueOf(String.valueOf(v).strip());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("反馈 id 不是合法数字：" + v);
        }
    }
}
