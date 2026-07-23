package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinViolationRuleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
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
        if (!StringUtils.hasText(row.getRuleName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        // rule_code 自动生成：从 rule_name 取前20个可打印字符 + 时间戳，确保唯一
        if (!StringUtils.hasText(row.getRuleCode())) {
            String base = row.getRuleName().trim()
                    .replaceAll("[^\\u4e00-\\u9fa5a-zA-Z0-9]", "")
                    .replaceAll("\\s+", "");
            if (base.length() > 20) base = base.substring(0, 20);
            if (base.isEmpty()) base = "RULE";
            String ts = String.valueOf(System.currentTimeMillis()).substring(7); // 后6位
            row.setRuleCode(base + "_" + ts);
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
     * 时间窗口起点计算。
     * 滑动窗口：NOW - N 天
     * 固定周期：根据 MM-DD 起止计算当前所在周期的起点。
     *   若当前日期在 [start, end] 区间内 → 返回本年 start 的 00:00:00
     *   若当前日期在 end 之后 → 返回本年 start（区间已过，仍计本年）
     *   若当前日期在 start 之前 → 返回上年 start
     */
    public LocalDateTime computeWindowStart(TwinViolationRule rule) {
        if (rule == null) return LocalDateTime.now().minusDays(30);
        String type = rule.getUnblockWindowType();
        if (!StringUtils.hasText(type) || "滑动窗口".equals(type)) {
            int days = (rule.getUnblockWindowValue() != null && rule.getUnblockWindowValue() > 0)
                    ? rule.getUnblockWindowValue() : 30;
            return LocalDateTime.now().minusDays(days);
        }
        // 固定周期：基于 unblockWindowStart / unblockWindowEnd
        String startMMDD = rule.getUnblockWindowStart();
        if (!StringUtils.hasText(startMMDD)) {
            // 未配起止 → 默认自然月
            return LocalDateTime.now().withDayOfMonth(1)
                      .withHour(0).withMinute(0).withSecond(0).withNano(0);
        }
        int[] parts = parseMMDD(startMMDD);
        if (parts == null) {
            return LocalDateTime.now().withDayOfMonth(1)
                      .withHour(0).withMinute(0).withSecond(0).withNano(0);
        }
        int startMonth = parts[0];
        int startDay = parts[1];
        LocalDateTime now = LocalDateTime.now();
        // 构造本年起始日期
        LocalDateTime thisYearStart = LocalDateTime.of(now.getYear(), startMonth, startDay, 0, 0, 0);
        // 如果今天已经过了今年的 start，返回今年 start；否则返回去年 start
        if (!now.isBefore(thisYearStart)) {
            return thisYearStart;
        } else {
            return LocalDateTime.of(now.getYear() - 1, startMonth, startDay, 0, 0, 0);
        }
    }

    /** 解析 MM-DD 字符串 */
    private static int[] parseMMDD(String mmdd) {
        if (mmdd == null || mmdd.isBlank()) return null;
        String[] parts = mmdd.trim().split("[-/]");
        if (parts.length != 2) return null;
        try {
            int m = Integer.parseInt(parts[0]);
            int d = Integer.parseInt(parts[1]);
            if (m < 1 || m > 12 || d < 1 || d > 31) return null;
            return new int[]{m, d};
        } catch (NumberFormatException e) {
            return null;
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
     * 违规创建时的解禁判定（K = 窗口内已有 COUNT + 1，含即将写入的这条）。
     */
    public UnblockDecision evaluate(String targetUserId, long ruleId) {
        return evaluateInternal(targetUserId, ruleId, true);
    }

    /**
     * 扫码展示已有违规时的解禁判定（K = 窗口内已有 COUNT，不再 +1）。
     */
    public UnblockDecision evaluateForExisting(String targetUserId, long ruleId) {
        return evaluateInternal(targetUserId, ruleId, false);
    }

    private UnblockDecision evaluateInternal(String targetUserId, long ruleId, boolean includePendingCreate) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) {
            return UnblockDecision.noLimit();
        }
        int existingCount = countViolationsInWindow(targetUserId, ruleId);
        int k = existingCount + (includePendingCreate ? 1 : 0);
        Integer max = rule.getUnblockMaxCount();

        if (max == null) {
            boolean forbid = rule.getForbidEnter() != null && rule.getForbidEnter() == 1;
            return new UnblockDecision(forbid, false, null, Integer.MAX_VALUE);
        }

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
