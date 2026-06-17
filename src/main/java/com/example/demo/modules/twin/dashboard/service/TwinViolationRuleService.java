package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinViolationRuleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.Month;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

@Service
public class TwinViolationRuleService {
    private static final Logger log = LoggerFactory.getLogger(TwinViolationRuleService.class);

    private final TwinViolationRuleMapper ruleMapper;

    public TwinViolationRuleService(TwinViolationRuleMapper ruleMapper) {
        this.ruleMapper = ruleMapper;
    }

    // ═══ CRUD ═══

    public List<TwinViolationRule> listAll() {
        return ruleMapper.selectAll();
    }

    public TwinViolationRule getById(long id) {
        return ruleMapper.selectById(id);
    }

    public TwinViolationRule getByCode(String ruleCode) {
        if (!StringUtils.hasText(ruleCode)) return null;
        return ruleMapper.selectByCode(ruleCode.trim());
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinViolationRule create(TwinViolationRule row) {
        if (!StringUtils.hasText(row.getRuleCode())) {
            throw new IllegalArgumentException("规则编码不能为空");
        }
        if (!StringUtils.hasText(row.getRuleName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        ruleMapper.insert(row);
        return ruleMapper.selectById(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinViolationRule update(TwinViolationRule row) {
        TwinViolationRule existing = ruleMapper.selectById(row.getId());
        if (existing == null) throw new IllegalArgumentException("规则不存在: " + row.getId());
        ruleMapper.updateById(row);
        return ruleMapper.selectById(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(long id) {
        TwinViolationRule existing = ruleMapper.selectById(id);
        if (existing == null) return false;
        int refCount = ruleMapper.countViolationsByRuleId(id);
        if (refCount > 0) {
            throw new IllegalArgumentException("该规则下已有 " + refCount + " 条违规记录，无法删除");
        }
        return ruleMapper.deleteById(id) > 0;
    }

    // ═══ 时间窗口计算 ═══

    /**
     * 根据规则配置计算时间窗口起点。
     * 滑动窗口：NOW - unblock_window_value 天
     * 固定周期：当前周期第一天 00:00:00
     */
    public LocalDateTime computeWindowStart(TwinViolationRule rule) {
        if (rule == null) return LocalDateTime.now().minusDays(30);
        String type = rule.getUnblockWindowType();
        Integer value = rule.getUnblockWindowValue();
        if (!StringUtils.hasText(type) || "滑动窗口".equals(type)) {
            int days = (value != null && value > 0) ? value : 30;
            return LocalDateTime.now().minusDays(days);
        }
        // 固定周期
        int periodType = (value != null) ? value : 1;
        LocalDateTime now = LocalDateTime.now();
        switch (periodType) {
            case 2: // 自然周：本周一 00:00:00
                return now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                          .withHour(0).withMinute(0).withSecond(0).withNano(0);
            case 3: // 学期（简化：1-6月→1月1日，7-12月→7月1日）
                Month m = now.getMonth();
                if (m.getValue() >= 7) {
                    return now.withMonth(7).withDayOfMonth(1)
                              .withHour(0).withMinute(0).withSecond(0).withNano(0);
                } else {
                    return now.withMonth(1).withDayOfMonth(1)
                              .withHour(0).withMinute(0).withSecond(0).withNano(0);
                }
            default: // 1 = 自然月：本月1日 00:00:00
                return now.withDayOfMonth(1)
                          .withHour(0).withMinute(0).withSecond(0).withNano(0);
        }
    }

    // ═══ 解禁计数 ═══

    /** 查询某人在某规则窗口内的违规记录数（所有状态，含已解除/已过期等） */
    public int countViolationsInWindow(String targetUserId, long ruleId) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) return 0;
        LocalDateTime windowStart = computeWindowStart(rule);
        return ruleMapper.countViolationsInWindow(targetUserId, ruleId, windowStart);
    }

    // ═══ 解禁判定 ═══

    /**
     * 违规创建/扫码分析时的解禁判定。
     *
     * @param targetUserId 人员ID
     * @param ruleId       规则ID
     * @return UnblockDecision 包含 forbidEnter / isCritical / remaining 等
     */
    public UnblockDecision evaluate(String targetUserId, long ruleId) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) {
            return UnblockDecision.noLimit();
        }
        // 窗口内已有记录数（此次创建前）
        int existingCount = countViolationsInWindow(targetUserId, ruleId);
        // K = 含本次（即将创建的这条）
        int k = existingCount + 1;
        Integer max = rule.getUnblockMaxCount();

        // 未设上限：原样返回规则配置的 forbid_enter
        if (max == null) {
            boolean forbid = rule.getForbidEnter() != null && rule.getForbidEnter() == 1;
            return new UnblockDecision(forbid, false, null, Integer.MAX_VALUE);
        }

        // 达到或超过上限 → 强制 forbid_enter = 1，标记为关键记录
        boolean isCritical = k >= max;
        boolean effectiveForbidEnter = isCritical
                || (rule.getForbidEnter() != null && rule.getForbidEnter() == 1);
        int remaining = max - k;

        return new UnblockDecision(effectiveForbidEnter, isCritical, max, remaining);
    }

    /**
     * 判断当前违规记录是否允许自助解禁。
     * 条件：(1) 规则配置为「自助解禁」 (2) 未达到上限
     */
    public boolean canSelfUnblock(long violationId, String userId, long ruleId) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) return false;
        if (!"自助解禁".equals(rule.getUnblockMethod())) return false;
        int k = countViolationsInWindow(userId, ruleId);
        Integer max = rule.getUnblockMaxCount();
        if (max != null && k >= max) return false;
        return true;
    }

    // ═══ 内部类 ═══

    public static class UnblockDecision {
        /** 最终是否禁止进入 */
        private final boolean forbidEnter;
        /** 是否达到上限（关键记录） */
        private final boolean critical;
        /** 配置的上限值；null=无限制 */
        private final Integer maxCount;
        /** 剩余容忍次数；≤0 则无剩余 */
        private final int remaining;

        public UnblockDecision(boolean forbidEnter, boolean critical, Integer maxCount, int remaining) {
            this.forbidEnter = forbidEnter;
            this.critical = critical;
            this.maxCount = maxCount;
            this.remaining = remaining;
        }

        public static UnblockDecision noLimit() {
            return new UnblockDecision(false, false, null, Integer.MAX_VALUE);
        }

        public boolean isForbidEnter() { return forbidEnter; }
        public boolean isCritical() { return critical; }
        public Integer getMaxCount() { return maxCount; }
        public int getRemaining() { return remaining; }
    }
}
