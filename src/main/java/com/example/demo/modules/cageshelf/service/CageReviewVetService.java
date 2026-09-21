package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.cageshelf.config.CageTransferApprovalConfigSeed;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 全局审核兽医名单：转移审核「兽医」那一关的资格来源。
 *
 * <p>与 {@link CageRegionVetService}（区域指定兽医）**并存且互不影响**：那个只服务健康异常通知的收件人，
 * 这个只服务转移审核的签署资格。名单不分区域，由 SUPER_ADMIN 维护。
 *
 * <p>签发资格要**两层都过**：在名单里，且身份标签现在还是 VETERINARIAN。
 * 只看名单会让标签被撤销后残留的人继续签（与 {@code CageRegionVetService.replaceRegionVets} 同口径）。
 *
 * <p><b>名单按 canonical 账号 id 存储</b>（{@code STAFF_*} 已经 {@link UserGroupNameResolver#canonicalUserId}
 * 折算成 ARO 编号）—— 写入方给的是 {@code COALESCE(staff_id, aro_user_id)}，审核路径拿的是
 * {@code reviewer.getId()}，两种形态只有折算到同一把尺子上才能对上，否则合法兽医会被静默拒签。
 */
@Service
public class CageReviewVetService {

    private final NotificationSettingsService settingsService;
    private final PersonIdentityService personIdentityService;
    private final UserGroupNameResolver userGroupNameResolver;

    public CageReviewVetService(NotificationSettingsService settingsService,
                                PersonIdentityService personIdentityService,
                                UserGroupNameResolver userGroupNameResolver) {
        this.settingsService = settingsService;
        this.personIdentityService = personIdentityService;
        this.userGroupNameResolver = userGroupNameResolver;
    }

    /**
     * 名单（canonical 账号 id 列表）。配置缺失或 JSON 坏掉都退回空集，不让审核链因为配置问题炸掉。
     * 读的时候也 trim 并丢空 —— 手工改过的 {@code ["A1 ", "A2"]} 不能把真兽医锁在门外（与写入同口径）。
     */
    public List<String> vetAccountIds() {
        String raw = settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_REVIEW_VET_IDS,
                CageTransferApprovalConfigSeed.DEFAULT_REVIEW_VET_IDS);
        if (!StringUtils.hasText(raw)) return List.of();
        try {
            List<String> ids = JSON.parseArray(raw, String.class);
            if (ids == null) return List.of();
            List<String> out = new ArrayList<>();
            for (String id : ids) {
                if (StringUtils.hasText(id)) out.add(id.trim());
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 该账号能否签转移审核的「兽医」那一关。入参先折算 canonical，再与名单同尺比较。 */
    public boolean canSignAsVet(String accountId) {
        if (!StringUtils.hasText(accountId)) return false;
        String canonical = userGroupNameResolver.canonicalUserId(accountId.trim());
        if (!StringUtils.hasText(canonical)) return false;
        if (!vetAccountIds().contains(canonical)) return false;
        return personIdentityService.isVeterinarian(accountId.trim());
    }

    /** 账号 id 的 canonical 折算，供界面把候选人与已存名单（canonical）对齐比对。 */
    public String canonical(String accountId) {
        return accountId == null ? null : userGroupNameResolver.canonicalUserId(accountId.trim());
    }

    /**
     * 候选人列表 + 每人补一个 {@code canonicalAccountId}。
     *
     * <p>名单**存的是 canonical**（签发时要和 reviewer.getId() 对齐），而 memberCandidates 回的是原始
     * STAFF_ 形态；不补这一列，界面拿原始 id 去比 canonical 名单会永远显示「未勾选」，也删不掉人。
     */
    public List<Map<String, Object>> annotateCandidates(List<Map<String, Object>> candidates) {
        if (candidates == null) return List.of();
        List<Map<String, Object>> out = new ArrayList<>(candidates.size());
        for (Map<String, Object> c : candidates) {
            Map<String, Object> copy = c == null ? new LinkedHashMap<>() : new LinkedHashMap<>(c);
            Object raw = copy.get("accountId");
            copy.put("canonicalAccountId", canonical(raw == null ? null : String.valueOf(raw)));
            out.add(copy);
        }
        return out;
    }

    /** 全量替换名单。入参先折算 canonical 再校验、再存 —— 这个接口在信任边界上，不能只靠前端候选列表把关。 */
    @Transactional
    public void replace(Collection<String> accountIds, String operatorId) {
        LinkedHashSet<String> target = new LinkedHashSet<>();
        if (accountIds != null) {
            for (String id : accountIds) {
                if (!StringUtils.hasText(id)) continue;
                String canonical = userGroupNameResolver.canonicalUserId(id.trim());
                if (StringUtils.hasText(canonical)) target.add(canonical);
            }
        }
        // 必须在写之前校验：先写后拒会留下一份半残名单。
        List<String> rejected = new ArrayList<>();
        for (String id : target) {
            if (!personIdentityService.isVeterinarian(id)) rejected.add(id);
        }
        if (!rejected.isEmpty()) {
            throw new IllegalArgumentException("账号 " + String.join("、", rejected) + " 不是「兽医」身份，无法加入审核兽医名单");
        }
        SystemConfigItem config = settingsService.listConfigs(CageTransferApprovalConfigSeed.MODULE).stream()
                .filter(it -> CageTransferApprovalConfigSeed.KEY_REVIEW_VET_IDS.equals(it.getConfigKey()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "配置项 " + CageTransferApprovalConfigSeed.MODULE + "."
                                + CageTransferApprovalConfigSeed.KEY_REVIEW_VET_IDS
                                + " 未初始化，通常是启动播种尚未执行"));
        UpdateSystemConfigRequest req = new UpdateSystemConfigRequest();
        req.setConfigValue(JSON.toJSONString(target));
        // updateConfig 会把 request 的 remark 无条件写回，必须把原值带上，否则配置项描述被清空
        req.setRemark(config.getRemark());
        if (!settingsService.updateConfig(config.getId(), req, operatorId)) {
            throw new IllegalStateException("审核兽医名单保存失败");
        }
    }
}
