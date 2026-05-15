package com.example.demo.modules.policy.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.entity.BizCapabilityPolicy;
import com.example.demo.modules.policy.dto.CapabilitySummaryRow;
import com.example.demo.modules.policy.mapper.BizCapabilityPolicyMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 业务能力策略唯一读取入口；缓存以 policy_version 总和为指纹失效。
 */
@Service
public class CapabilityPolicyService {

    private final BizCapabilityPolicyMapper policyMapper;
    private final Map<String, BizCapabilityPolicy> cache = new ConcurrentHashMap<>();
    private volatile long cachedVersionSum = Long.MIN_VALUE;

    public CapabilityPolicyService(BizCapabilityPolicyMapper policyMapper) {
        this.policyMapper = policyMapper;
    }

    public BizCapabilityPolicy resolve(String bizDomain) {
        String domain = normalizeDomain(bizDomain);
        refreshCacheIfNeeded();
        BizCapabilityPolicy row = cache.get(domain);
        if (row != null && row.getEnabled() != null && row.getEnabled() == 1) {
            return row;
        }
        return defaultRow(domain);
    }

    public List<BizCapabilityPolicy> listAllResolved() {
        refreshCacheIfNeeded();
        return List.of(BizDomains.REPAIR, BizDomains.PURCHASE, BizDomains.SUPPLIES_CLAIM, BizDomains.SUPPLIES_ADMIN)
                .stream()
                .map(this::resolve)
                .toList();
    }

    /** 小程序/前端运行时按钮显隐：按当前用户与策略计算 */
    public List<CapabilitySummaryRow> summarizeForUser(User user) {
        List<CapabilitySummaryRow> rows = new ArrayList<>();
        for (String d : List.of(BizDomains.REPAIR, BizDomains.PURCHASE, BizDomains.SUPPLIES_CLAIM, BizDomains.SUPPLIES_ADMIN)) {
            CapabilitySummaryRow r = new CapabilitySummaryRow();
            r.setBizDomain(d);
            r.setCanSubmit(canSubmit(user, d));
            r.setCanProcess(canProcess(user, d));
            r.setCanViewAllPending(canViewAllPending(user, d));
            r.setApplicantOnlyMineMode(isApplicantOnlyMineMode(d));
            rows.add(r);
        }
        return rows;
    }

    public Result<?> requireSubmit(User user, String bizDomain) {
        return requireMinLevel(user, resolve(bizDomain).getMinRoleSubmit(), "无权限访问");
    }

    public Result<?> requireProcess(User user, String bizDomain) {
        return requireMinLevel(user, resolve(bizDomain).getMinRoleProcess(), "无权限访问");
    }

    public boolean canSubmit(User user, String bizDomain) {
        return user != null && level(user) >= resolve(bizDomain).getMinRoleSubmit();
    }

    public boolean canProcess(User user, String bizDomain) {
        return user != null && level(user) >= resolve(bizDomain).getMinRoleProcess();
    }

    /** 处理侧是否使用「全库」待办计数/队列（阈值由 biz_capability_policy.min_role_view_all_pending 决定） */
    public boolean canViewAllPending(User user, String bizDomain) {
        return user != null && level(user) >= resolve(bizDomain).getMinRoleViewAllPending();
    }

    public boolean isApplicantOnlyMineMode(String bizDomain) {
        String mode = resolve(bizDomain).getApplicantListMode();
        return StringUtils.hasText(mode) && "ONLY_MINE".equalsIgnoreCase(mode.trim());
    }

    public void invalidateCache() {
        cachedVersionSum = Long.MIN_VALUE;
        cache.clear();
    }

    private Result<?> requireMinLevel(User user, int minLevel, String message) {
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        if (level(user) < minLevel) {
            return Result.error(message);
        }
        return null;
    }

    private static int level(User user) {
        RoleEnum r = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        return r.getLevel();
    }

    private void refreshCacheIfNeeded() {
        long sum = policyMapper.sumPolicyVersions();
        if (sum == cachedVersionSum && !cache.isEmpty()) {
            return;
        }
        synchronized (this) {
            sum = policyMapper.sumPolicyVersions();
            if (sum == cachedVersionSum && !cache.isEmpty()) {
                return;
            }
            List<BizCapabilityPolicy> rows = policyMapper.selectAll();
            Map<String, BizCapabilityPolicy> next = rows.stream()
                    .filter(r -> StringUtils.hasText(r.getBizDomain()))
                    .collect(Collectors.toMap(
                            r -> r.getBizDomain().trim().toUpperCase(),
                            Function.identity(),
                            (a, b) -> a));
            cache.clear();
            cache.putAll(next);
            cachedVersionSum = sum;
        }
    }

    private static String normalizeDomain(String bizDomain) {
        return bizDomain == null ? "" : bizDomain.trim().toUpperCase();
    }

    private static BizCapabilityPolicy defaultRow(String domain) {
        BizCapabilityPolicy p = new BizCapabilityPolicy();
        p.setBizDomain(domain);
        p.setApplicantListMode("VISIBLE_POOL");
        p.setVisibilityPublicAllowed(1);
        p.setEnabled(1);
        p.setPolicyVersion(0L);
        switch (domain) {
            case BizDomains.REPAIR, BizDomains.PURCHASE -> {
                p.setMinRoleSubmit(2);
                p.setMinRoleProcess(5);
                p.setMinRoleViewAllPending(5);
                p.setSortOrder(BizDomains.REPAIR.equals(domain) ? 10 : 20);
            }
            case BizDomains.SUPPLIES_CLAIM -> {
                p.setMinRoleSubmit(2);
                p.setMinRoleProcess(5);
                p.setMinRoleViewAllPending(5);
                p.setSortOrder(30);
            }
            case BizDomains.SUPPLIES_ADMIN -> {
                p.setMinRoleSubmit(5);
                p.setMinRoleProcess(5);
                p.setMinRoleViewAllPending(5);
                p.setSortOrder(40);
            }
            default -> {
                p.setMinRoleSubmit(2);
                p.setMinRoleProcess(5);
                p.setMinRoleViewAllPending(5);
                p.setSortOrder(999);
            }
        }
        return p;
    }
}
