package com.example.demo.common.excel;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 逐层小计配置：用户可勾选保留哪些小计层级、排除哪些板块。
 * <p>levels：{@code total,lv1,lv2,lv3} 的逗号子集；缺省或空串 = 全保留（向后兼容）；
 * 哨兵 {@code none} = 一个层级都不保留（空串已被「全保留」占用）。</p>
 * <p>excludeBlocks：不要小计的板块 key（直接用该板块的 lv1 名，如课题组名）逗号分隔；
 * 用 lv1 名而非序号，保证配置跨筛选条件复用。</p>
 * <p>未知层名、不存在的板块 key 一律忽略不报错。</p>
 */
public final class SubtotalConfig {

    private final Set<Integer> keptLevels;
    private final Set<String> excludedBlocks;

    private SubtotalConfig(Set<Integer> keptLevels, Set<String> excludedBlocks) {
        this.keptLevels = keptLevels;
        this.excludedBlocks = excludedBlocks;
    }

    /** 全保留、不排除任何板块。 */
    public static SubtotalConfig all() {
        return new SubtotalConfig(Set.of(0, 1, 2, 3), Set.of());
    }

    /** 解析前端传入的逗号配置；任一项缺省/空/未知均按容错规则处理。 */
    public static SubtotalConfig parse(String levels, String excludeBlocks) {
        Set<String> excluded = new LinkedHashSet<>();
        if (excludeBlocks != null) {
            for (String s : excludeBlocks.split(",")) {
                String t = s.trim();
                if (!t.isEmpty()) excluded.add(t);
            }
        }
        if (levels == null || levels.trim().isEmpty()) {
            return new SubtotalConfig(Set.of(0, 1, 2, 3), excluded);
        }
        if ("none".equalsIgnoreCase(levels.trim())) {
            return new SubtotalConfig(Set.of(), excluded);
        }
        Set<Integer> kept = new LinkedHashSet<>();
        for (String s : levels.split(",")) {
            int lv = levelOf(s.trim());
            if (lv >= 0) kept.add(lv);   // 未知层名忽略
        }
        return new SubtotalConfig(kept, excluded);
    }

    public boolean keepLevel(int level) {
        return keptLevels.contains(level);
    }

    /** 板块 key 未出现在排除列表中即保留；null 视为空串（不排除）。 */
    public boolean keepBlock(String lv1) {
        return !excludedBlocks.contains(lv1 == null ? "" : lv1);
    }

    private static int levelOf(String name) {
        return switch (name) {
            case "total" -> 0;
            case "lv1" -> 1;
            case "lv2" -> 2;
            case "lv3" -> 3;
            default -> -1;
        };
    }
}
