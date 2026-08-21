package com.example.demo.modules.twin.obligation.rule;

import com.example.demo.modules.twin.dashboard.service.CageStatusViolationCheckService;
import com.example.demo.modules.twin.dashboard.service.StrandedViolationService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/** 手动开单：参数需含 targetUserId + violationText。 */
@Component
class ManualProductionRule implements ProductionRule {

    private final TwinStudentViolationService violationService;

    ManualProductionRule(@Autowired(required = false) TwinStudentViolationService violationService) {
        this.violationService = violationService;
    }

    @Override
    public String code() {
        return "MANUAL";
    }

    @Override
    public String label() {
        return "手动开单";
    }

    @Override
    public String sourceType() {
        return ObligationSupport.SOURCE_STUDENT_VIOLATION;
    }

    @Override
    public ProductionResult execute(ProductionContext context) {
        if (violationService == null) {
            return ProductionResult.failed("TwinStudentViolationService 未就绪");
        }
        String userId = context.param("targetUserId");
        String text = context.param("violationText");
        if (!StringUtils.hasText(userId)) {
            return ProductionResult.failed("缺少 targetUserId");
        }
        try {
            var row = violationService.create(
                    userId.trim(),
                    text != null ? text : "",
                    List.of(),
                    true,
                    null,
                    true,
                    null,
                    context.triggeredBy(),
                    "MANUAL",
                    null,
                    true,
                    null,
                    null
            );
            return ProductionResult.success("手动开单完成", Map.of("violationId", row.getId()));
        } catch (Exception e) {
            return ProductionResult.failed(e.getMessage() != null ? e.getMessage() : "开单失败");
        }
    }
}

/** 滞留检测（一道）：创建违规。 */
@Component
class StrandedProductionRule implements ProductionRule {

    private final StrandedViolationService strandedViolationService;

    StrandedProductionRule(@Autowired(required = false) StrandedViolationService strandedViolationService) {
        this.strandedViolationService = strandedViolationService;
    }

    @Override
    public String code() {
        return "STRANDED";
    }

    @Override
    public String label() {
        return "滞留检测";
    }

    @Override
    public String sourceType() {
        return ObligationSupport.SOURCE_STUDENT_VIOLATION;
    }

    @Override
    public ProductionResult execute(ProductionContext context) {
        if (strandedViolationService == null) {
            return ProductionResult.failed("StrandedViolationService 未就绪");
        }
        String singleUser = context.param("userId");
        try {
            if (StringUtils.hasText(singleUser)) {
                boolean autoSignout = "true".equalsIgnoreCase(String.valueOf(
                        context.params() != null ? context.params().getOrDefault("autoSignout", false) : false));
                String msg = strandedViolationService.testSingleUser(singleUser.trim(), autoSignout);
                return ProductionResult.success(msg != null ? msg : "滞留单人检测完成");
            }
            strandedViolationService.executeScheduledCheck();
            return ProductionResult.success("滞留违规检测完成");
        } catch (Exception e) {
            return ProductionResult.failed(e.getMessage() != null ? e.getMessage() : "滞留检测失败");
        }
    }
}

/** 笼位状态产生规则。 */
@Component
class CageStatusProductionRule implements ProductionRule {

    private final CageStatusViolationCheckService cageStatusViolationCheckService;

    CageStatusProductionRule(
            @Autowired(required = false) CageStatusViolationCheckService cageStatusViolationCheckService
    ) {
        this.cageStatusViolationCheckService = cageStatusViolationCheckService;
    }

    @Override
    public String code() {
        return "CAGE_STATUS";
    }

    @Override
    public String label() {
        return "笼位状态";
    }

    @Override
    public String sourceType() {
        return ObligationSupport.SOURCE_STUDENT_VIOLATION;
    }

    @Override
    public ProductionResult execute(ProductionContext context) {
        if (cageStatusViolationCheckService == null) {
            return ProductionResult.failed("CageStatusViolationCheckService 未就绪");
        }
        try {
            String triggeredBy = StringUtils.hasText(context.triggeredBy())
                    ? context.triggeredBy() : "production-rule";
            Map<String, Object> result = cageStatusViolationCheckService.executePureDaysCheck(triggeredBy);
            return ProductionResult.success("笼架违规检测完成", result);
        } catch (Exception e) {
            return ProductionResult.failed(e.getMessage() != null ? e.getMessage() : "笼位检测失败");
        }
    }
}

/**
 * 公告 / 未绑卡：产生侧为懒同步（扫码时挂待办），注册表条目可执行时返回说明，
 * 真正写入仍走 ObligationService.syncAnnouncementForSubject / syncUnboundForSubject。
 */
@Component
class AnnouncementProductionRule implements ProductionRule {
    @Override
    public String code() {
        return "ANNOUNCEMENT";
    }

    @Override
    public String label() {
        return "公告发布";
    }

    @Override
    public String sourceType() {
        return ObligationSupport.SOURCE_ANNOUNCEMENT;
    }

    @Override
    public ProductionResult execute(ProductionContext context) {
        return ProductionResult.success("公告待办由扫码懒同步产生，本规则仅注册描述与入口占位");
    }
}

@Component
class UnboundProductionRule implements ProductionRule {
    @Override
    public String code() {
        return "UNBOUND";
    }

    @Override
    public String label() {
        return "未绑卡";
    }

    @Override
    public String sourceType() {
        return ObligationSupport.SOURCE_UNBOUND;
    }

    @Override
    public ProductionResult execute(ProductionContext context) {
        return ProductionResult.success("未绑卡待办由扫码懒同步产生，本规则仅注册描述与入口占位");
    }
}
