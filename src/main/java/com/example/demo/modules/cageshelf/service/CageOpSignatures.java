package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 转移三签的判定：照着 {@link CageOpSignature} 的列表算状态，不碰数据库。
 *
 * <p>三个角色（归属地 / 目的地 / 兽医）**并联**：全部签通过才算通过，任一驳回立即终局。
 * 兽医的一票否决就落在「任一驳回即终局」这条上 —— 不存在翻案路径。
 */
public final class CageOpSignatures {

    /** 三关的固定顺序，界面上按这个顺序画进度。 */
    public static final List<String> ROLES = List.of(
            CageOpSignature.ROLE_ORIGIN, CageOpSignature.ROLE_DEST, CageOpSignature.ROLE_VET);

    private CageOpSignatures() {
    }

    /** 解析 JSON 列。空值或坏 JSON 都退回空集 —— 配置/数据问题不该让审核链炸掉。 */
    public static List<CageOpSignature> parse(String json) {
        if (!StringUtils.hasText(json)) return List.of();
        try {
            List<CageOpSignature> list = JSON.parseArray(json, CageOpSignature.class);
            return list == null ? List.of() : list;
        } catch (Exception e) {
            return List.of();
        }
    }

    public static String render(List<CageOpSignature> signatures) {
        return JSON.toJSONString(signatures == null ? List.of() : signatures);
    }

    /** 某角色已签过没有。注意：签过 ≠ 定了 —— 暂缓也是一条签名，但仍算未决。 */
    public static boolean hasRole(List<CageOpSignature> signatures, String role) {
        if (signatures == null) return false;
        for (CageOpSignature s : signatures) {
            if (s != null && Objects.equals(role, s.getRole())) return true;
        }
        return false;
    }

    /**
     * 某角色是否已明确同意。暂缓不算 —— 签过（{@link #hasRole}）不等于定了。
     *
     * <p>判据是「有一条第该角色且 decision=approved 的签名」。三关是否已齐、某角色能不能再签，
     * 都以这个为准；暂缓会留下签名但不算同意，所以那一关仍缺。
     */
    public static boolean hasApproved(List<CageOpSignature> signatures, String role) {
        if (signatures == null) return false;
        for (CageOpSignature s : signatures) {
            if (s != null && Objects.equals(role, s.getRole())
                    && CageOpSignature.DECISION_APPROVED.equals(s.getDecision())) return true;
        }
        return false;
    }

    /**
     * 按角色覆盖式追加：同角色已有则替换，不产生第二条。
     *
     * <p>{@code add} 为空是调用方的编程错误（不是脏数据），这里直接抛而不是静默吞掉 ——
     * 静默返回原列表会让「签了」在审核链里显示成已签，实际却没落库。
     */
    public static List<CageOpSignature> withSignature(List<CageOpSignature> existing, CageOpSignature add) {
        if (add == null) throw new IllegalArgumentException("签名不能为空");
        Map<String, CageOpSignature> byRole = new LinkedHashMap<>();
        if (existing != null) {
            for (CageOpSignature s : existing) {
                if (s != null && StringUtils.hasText(s.getRole())) byRole.put(s.getRole(), s);
            }
        }
        byRole.put(add.getRole(), add);
        return new ArrayList<>(byRole.values());
    }

    /**
     * 还没定的角色（驳回即终局，所以驳回状态下没有「缺的角色」）。
     *
     * <p>判据是「没有同意」而不是「没有签名」：暂缓会留下一条签名，但单据仍在待签，
     * 用 hasRole 会让三关全显示已签、单据却永远待审。所以暂缓的角色照样算缺。
     */
    public static List<String> missingRoles(List<CageOpSignature> signatures) {
        if (statusOf(signatures).equals(CageOpSignature.STATUS_REJECTED)) return List.of();
        List<String> out = new ArrayList<>();
        for (String role : ROLES) {
            if (!hasApproved(signatures, role)) out.add(role);
        }
        return out;
    }

    /** 兽医那一关的结论，供「是否同意」三态渲染：approved=同意 / held=暂缓 / rejected=不同意；还没签返回 null。 */
    public static String vetOutcomeOf(List<CageOpSignature> signatures) {
        if (signatures == null) return null;
        for (CageOpSignature s : signatures) {
            if (s != null && CageOpSignature.ROLE_VET.equals(s.getRole())) return s.getDecision();
        }
        return null;
    }

    /** 任一驳回 → 驳回；三角色全通过 → 通过；其余 → 待签。 */
    public static String statusOf(List<CageOpSignature> signatures) {
        if (signatures == null || signatures.isEmpty()) return CageOpSignature.STATUS_PENDING;
        for (CageOpSignature s : signatures) {
            if (s != null && CageOpSignature.DECISION_REJECTED.equals(s.getDecision())) {
                return CageOpSignature.STATUS_REJECTED;
            }
        }
        for (String role : ROLES) {
            boolean approved = false;
            for (CageOpSignature s : signatures) {
                if (s != null && role.equals(s.getRole())
                        && CageOpSignature.DECISION_APPROVED.equals(s.getDecision())) {
                    approved = true;
                    break;
                }
            }
            if (!approved) return CageOpSignature.STATUS_PENDING;
        }
        return CageOpSignature.STATUS_APPROVED;
    }
}
