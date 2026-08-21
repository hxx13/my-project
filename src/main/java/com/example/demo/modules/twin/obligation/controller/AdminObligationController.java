package com.example.demo.modules.twin.obligation.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.obligation.delivery.ChannelCapability;
import com.example.demo.modules.twin.obligation.delivery.ChannelDeliveryPolicy;
import com.example.demo.modules.twin.obligation.disposition.DispositionStrategy;
import com.example.demo.modules.twin.obligation.disposition.DispositionStrategyRegistry;
import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import com.example.demo.modules.twin.obligation.entity.TwinObligationReceipt;
import com.example.demo.modules.twin.obligation.rule.ProductionRuleRegistry;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/twin/obligations")
@Tag(name = "Twin-Obligation", description = "待办事项 Obligation（管理端）")
public class AdminObligationController {

    private final ObligationService obligationService;
    private final DispositionStrategyRegistry dispositionRegistry;
    private final ProductionRuleRegistry productionRuleRegistry;
    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;

    public AdminObligationController(
            ObligationService obligationService,
            DispositionStrategyRegistry dispositionRegistry,
            ProductionRuleRegistry productionRuleRegistry,
            AuthContextService authContextService,
            UserDisplayNameService userDisplayNameService
    ) {
        this.obligationService = obligationService;
        this.dispositionRegistry = dispositionRegistry;
        this.productionRuleRegistry = productionRuleRegistry;
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
    }

    @GetMapping
    @Operation(summary = "按条件查询待办")
    public Result<?> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) String subjectUserId,
            @RequestParam(required = false) String sourceType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer limit
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        List<TwinObligation> obligations = obligationService.listAdmin(subjectUserId, sourceType, status, limit);
        List<String> subjectIds = new ArrayList<>();
        for (TwinObligation ob : obligations) {
            if (ob.getSubjectUserId() != null && !ob.getSubjectUserId().isBlank()) {
                subjectIds.add(ob.getSubjectUserId().trim());
            }
        }
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(subjectIds);
        List<Map<String, Object>> out = new ArrayList<>();
        for (TwinObligation ob : obligations) {
            out.add(toRow(ob, nameMap));
        }
        return Result.success(out);
    }

    @GetMapping("/{id}")
    @Operation(summary = "待办详情（含回执）")
    public Result<?> get(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        TwinObligation ob = obligationService.findById(id);
        if (ob == null) {
            return Result.error("待办不存在");
        }
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(
                ob.getSubjectUserId() == null ? List.of() : List.of(ob.getSubjectUserId()));
        Map<String, Object> m = toRow(ob, nameMap);
        TwinObligationReceipt receipt = obligationService.findReceipt(id, ob.getSubjectUserId());
        m.put("receipt", receipt == null ? null : toReceipt(receipt));
        return Result.success(m);
    }

    @PostMapping("/backfill-violations")
    @Operation(summary = "存量 ACTIVE 违规回填为 Obligation（可重复调用）")
    public Result<?> backfill(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Integer limit
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        int n = obligationService.backfillFromActiveViolations(limit);
        return Result.success(Map.of("inserted", n));
    }

    @GetMapping("/meta/disposition-strategies")
    @Operation(summary = "处置策略注册表（期 3）")
    public Result<?> dispositionStrategies(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (DispositionStrategy s : dispositionRegistry.all()) {
            Map<String, Object> m = new HashMap<>();
            m.put("type", s.type());
            m.put("requiresInteraction", s.requiresInteraction());
            m.put("configSchema", s.configSchema());
            out.add(m);
        }
        return Result.success(out);
    }

    @GetMapping("/meta/production-rules")
    @Operation(summary = "产生规则注册表（期 5）")
    public Result<?> productionRules(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(productionRuleRegistry.all());
    }

    @GetMapping("/meta/channel-delivery")
    @Operation(summary = "渠道能力矩阵预览（期 4）")
    public Result<?> channelDelivery(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String dispositionType,
            @RequestParam String channel
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        boolean needs = dispositionRegistry.find(dispositionType)
                .map(DispositionStrategy::requiresInteraction)
                .orElse(false);
        ChannelCapability cap = ChannelCapability.forChannel(channel);
        ChannelDeliveryPolicy.Mode mode = ChannelDeliveryPolicy.resolve(needs, cap);
        return Result.success(Map.of(
                "dispositionType", dispositionType,
                "channel", channel,
                "channelCapability", cap.name(),
                "requiresInteraction", needs,
                "deliveryMode", mode.name()
        ));
    }

    @PostMapping("/meta/production-rules/{code}/execute")
    @Operation(summary = "执行产生规则（期 5）")
    public Result<?> executeProductionRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String code,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        Map<String, Object> params = body != null ? body : Map.of();
        var result = productionRuleRegistry.execute(
                code,
                new com.example.demo.modules.twin.obligation.rule.ProductionRule.ProductionContext(
                        "admin-meta", params));
        if (!result.ok()) {
            return Result.error(result.message());
        }
        Map<String, Object> out = new HashMap<>();
        out.put("ok", true);
        out.put("message", result.message());
        out.put("details", result.details());
        return Result.success(out);
    }

    private Map<String, Object> toRow(TwinObligation ob, Map<String, String> nameMap) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", ob.getId());
        m.put("subjectUserId", ob.getSubjectUserId());
        String sid = ob.getSubjectUserId() == null ? "" : ob.getSubjectUserId().trim();
        String display = nameMap != null ? nameMap.get(sid) : null;
        if (display == null || display.isBlank()) {
            display = userDisplayNameService.resolveDisplayName(sid);
        }
        m.put("subjectDisplayName", display != null && !display.isBlank() ? display : sid);
        m.put("sourceType", ob.getSourceType());
        m.put("sourceId", ob.getSourceId());
        m.put("title", ob.getTitle());
        m.put("contentHtml", ob.getContentHtml());
        m.put("contentJson", ob.getContentJson());
        m.put("dispositionType", ob.getDispositionType());
        m.put("dispositionConfigJson", ob.getDispositionConfigJson());
        m.put("status", ob.getStatus());
        m.put("dueAt", ob.getDueAt());
        m.put("createdAt", ob.getCreatedAt());
        m.put("updatedAt", ob.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toReceipt(TwinObligationReceipt r) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", r.getId());
        m.put("obligationId", r.getObligationId());
        m.put("subjectUserId", r.getSubjectUserId());
        m.put("channel", r.getChannel());
        m.put("attemptNo", r.getAttemptNo());
        m.put("answerPayload", r.getAnswerPayload());
        m.put("completedAt", r.getCompletedAt());
        return m;
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问（需管理员及以上）");
        }
        return null;
    }

    @Data
    public static class CompleteBody {
        private String answer;
        private String channel;
    }
}
