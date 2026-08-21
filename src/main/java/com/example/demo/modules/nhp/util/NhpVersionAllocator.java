package com.example.demo.modules.nhp.util;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/**
 * NHP 整表/模板版号分配：取当前活跃占用之外的最小正整数（补位）。
 * <p>软删（active=0）行不参与占用；调用方须只传入活跃版号。
 * <p><b>落库约定</b>：若库中已有同 (code, version) 的 inactive 行，须
 * {@code reactivateAndUpdate} 复活该行，禁止再 INSERT（否则撞
 * {@code uk_crf_*_code_ver}；即便仅约束 active 的 UK 也会留下双行同版号）。
 */
public final class NhpVersionAllocator {

    private NhpVersionAllocator() {}

    /**
     * @param usedActiveVersions 当前仍占用的活跃版号（可含 null，忽略 ≤0）
     * @return 最小未占用正整数（从 1 起）；调用方对返回值须 insert-or-reactivate
     */
    public static int nextAvailable(Collection<? extends Number> usedActiveVersions) {
        Set<Integer> used = new HashSet<>();
        if (usedActiveVersions != null) {
            for (Number n : usedActiveVersions) {
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
