package com.example.demo.modules.animalorder.engine;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import static com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels.WindowRule;

/**
 * Save-time validation: opposite-effect window rules must not overlap (spec §4).
 */
public final class WindowRuleConflictValidator {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final int MAX_PROBE_DAYS = 400;

    private WindowRuleConflictValidator() {
    }

    /**
     * Scans a 400-day horizon minute-by-minute; throws if any instant is covered by both OPEN and DISABLE rules.
     */
    public static void validateNoOppositeOverlap(List<WindowRule> rules) {
        if (rules == null || rules.size() < 2) {
            return;
        }
        ZonedDateTime start = ZonedDateTime.of(2026, 1, 1, 0, 0, 0, 0, ZONE);
        ZonedDateTime limit = start.plusDays(MAX_PROBE_DAYS);
        ZonedDateTime cursor = start;
        while (!cursor.isAfter(limit)) {
            if (hasOppositeOverlapAt(cursor, rules)) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.ANIMAL_ORDER_WINDOW_RULE_CONFLICT,
                        "存在相反效果的重叠时间段，请调整规则");
            }
            cursor = cursor.plusMinutes(1);
        }
    }

    private static boolean hasOppositeOverlapAt(ZonedDateTime instant, List<WindowRule> rules) {
        boolean hasOpen = false;
        boolean hasDisable = false;
        for (WindowRule rule : rules) {
            if (!AnimalOrderTimeEngine.ruleCoversInstant(rule, instant)) {
                continue;
            }
            if (AnimalOrderTimeEngine.EFFECT_OPEN.equals(rule.effect())) {
                hasOpen = true;
            } else if (AnimalOrderTimeEngine.EFFECT_DISABLE.equals(rule.effect())) {
                hasDisable = true;
            }
            if (hasOpen && hasDisable) {
                return true;
            }
        }
        return false;
    }
}
