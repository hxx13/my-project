package com.example.demo.modules.twin.obligation.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.obligation.delivery.ChannelCapability;
import com.example.demo.modules.twin.obligation.delivery.ChannelDeliveryPolicy;
import com.example.demo.modules.twin.obligation.delivery.NotifyChannelGuide;
import com.example.demo.modules.twin.obligation.disposition.DispositionStrategyRegistry;
import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/student/obligations")
@Tag(name = "Student-Obligation", description = "学生端待办查询与处置")
public class StudentObligationController {

    private final ObligationService obligationService;
    private final DispositionStrategyRegistry dispositionRegistry;
    private final AuthContextService authContextService;

    public StudentObligationController(
            ObligationService obligationService,
            DispositionStrategyRegistry dispositionRegistry,
            AuthContextService authContextService
    ) {
        this.obligationService = obligationService;
        this.dispositionRegistry = dispositionRegistry;
        this.authContextService = authContextService;
    }

    @GetMapping("/mine")
    @Operation(summary = "我的待办列表")
    public Result<?> mine(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false, defaultValue = "SCAN") String channel
    ) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录或令牌无效");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (TwinObligation ob : obligationService.listBySubject(user.getId(), status, limit)) {
            out.add(toStudentRow(ob, channel));
        }
        return Result.success(out);
    }

    @GetMapping("/{id}/quiz-draw")
    @Operation(summary = "答题策略抽题（不含正确答案）")
    public Result<?> quizDraw(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id
    ) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录或令牌无效");
        }
        // 归属校验依赖登录身份，留在 controller；抽题逻辑下沉 service
        TwinObligation ob = obligationService.findById(id);
        if (ob == null || !user.getId().equals(ob.getSubjectUserId())) {
            return Result.error("待办不存在");
        }
        try {
            return Result.success(obligationService.drawQuiz(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/{id}/delivered")
    @Operation(summary = "标记已送达（投递≠送达≠处置）")
    public Result<?> delivered(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id
    ) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录或令牌无效");
        }
        boolean ok = obligationService.markDelivered(id, user.getId());
        return ok ? Result.success(Map.of("ok", true)) : Result.error("标记失败");
    }

    @PostMapping("/{id}/complete")
    @Operation(summary = "完成处置（经策略注册表校验）")
    public Result<?> complete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody(required = false) CompleteBody body
    ) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录或令牌无效");
        }
        String answer = body != null ? body.getAnswer() : null;
        String channel = body != null && StringUtils.hasText(body.getChannel())
                ? body.getChannel() : ObligationSupport.CHANNEL_H5;
        // notify-only 渠道禁止完成交互策略
        TwinObligation ob = obligationService.findById(id);
        if (ob != null) {
            boolean needs = dispositionRegistry.find(ob.getDispositionType())
                    .map(s -> s.requiresInteraction())
                    .orElse(false);
            if (ChannelDeliveryPolicy.resolve(needs, channel) == ChannelDeliveryPolicy.Mode.GUIDE_ONLY) {
                return Result.error("当前渠道仅支持引导，请前往互动渠道完成确认");
            }
        }
        boolean ok = obligationService.completeWithStrategy(id, user.getId(), channel, answer);
        if (!ok) {
            return Result.error("处置校验未通过或待办不存在");
        }
        return Result.success(Map.of("ok", true));
    }

    private Map<String, Object> toStudentRow(TwinObligation ob, String channel) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", ob.getId());
        m.put("sourceType", ob.getSourceType());
        m.put("title", ob.getTitle());
        m.put("contentHtml", ob.getContentHtml());
        m.put("contentJson", ob.getContentJson());
        m.put("dispositionType", ob.getDispositionType());
        m.put("status", ob.getStatus());
        m.put("dueAt", ob.getDueAt());
        boolean needs = dispositionRegistry.find(ob.getDispositionType())
                .map(s -> s.requiresInteraction())
                .orElse(false);
        ChannelDeliveryPolicy.Mode mode = ChannelDeliveryPolicy.resolve(needs, channel);
        m.put("deliveryMode", mode.name());
        m.put("channelCapability", ChannelCapability.forChannel(channel).name());
        if (mode == ChannelDeliveryPolicy.Mode.FULL_DISPOSITION) {
            m.put("dispositionConfigJson", ob.getDispositionConfigJson());
        } else {
            m.put("dispositionConfigJson", null);
            m.put("guideMessage", NotifyChannelGuide.message());
            m.put("redirectPath", NotifyChannelGuide.redirectPathForChannel("H5", ob.getId() == null ? 0 : ob.getId()));
        }
        return m;
    }

    @Data
    public static class CompleteBody {
        private String answer;
        private String channel;
    }
}
