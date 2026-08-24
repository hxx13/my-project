package com.example.demo.modules.aup.util;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/**
 * AUP 码表/模板版号分配：取当前活跃占用之外的最小正整数（补位）。
 * <p>沿用 {@code NhpVersionAllocator} 的思路；版本号一旦占用（含 ARCHIVED）不再复用，
 * 调用方须把该 key 下所有已存在版本号传入。
 */
public final class AupVersionAllocator {

    private AupVersionAllocator() {}

    /**
     * @param usedVersions 当前该 key 下已占用的版本号（可含 null，忽略 ≤0）
     * @return 最小未占用正整数（从 1 起）
     */
    public static int nextAvailable(Collection<? extends Number> usedVersions) {
        Set<Integer> used = new HashSet<>();
        if (usedVersions != null) {
            for (Number n : usedVersions) {
                if (n == null) continue;
                int v = n.intValue();
                if (v > 0) used.add(v);
            }
        }
        int candidate = 1;
        while (used.contains(candidate)) {
            candidate++;
        }
        return candidate;
    }
}
