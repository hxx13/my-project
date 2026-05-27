package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile;
import com.example.demo.modules.accessfusion.mapper.AccessCleanRuleProfileMapper;
import com.example.demo.modules.accessfusion.support.SwingDirectionFilterSupport;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingStatsPullTask;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingStatsPullMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 全局共享的清洗规则方案：各审计/定时任务仅「选择」方案 ID，不再按任务生成专属方案。
 */
@Service
public class AccessCleanRuleProfileService {

    public static final String STANDARD_PROFILE_NAME = "标准纳入（推荐）";

    private final AccessCleanRuleProfileMapper profileMapper;
    private final DahuaSwingStatsPullMapper statsPullMapper;

    public AccessCleanRuleProfileService(
            AccessCleanRuleProfileMapper profileMapper, DahuaSwingStatsPullMapper statsPullMapper) {
        this.profileMapper = profileMapper;
        this.statsPullMapper = statsPullMapper;
    }

    public List<AccessCleanRuleProfile> listAll() {
        ensureSeededProfiles();
        return profileMapper.selectAll();
    }

    public AccessCleanRuleProfile get(long id) {
        AccessCleanRuleProfile p = profileMapper.selectById(id);
        if (p == null) {
            throw new IllegalArgumentException("清洗规则方案不存在");
        }
        return p;
    }

    @Transactional
    public AccessCleanRuleProfile create(AccessCleanRuleProfile row) {
        validate(row);
        normalize(row);
        profileMapper.insert(row);
        return get(row.getId());
    }

    @Transactional
    public AccessCleanRuleProfile update(AccessCleanRuleProfile row) {
        if (row.getId() == null || row.getId() <= 0) {
            throw new IllegalArgumentException("id 无效");
        }
        validate(row);
        normalize(row);
        profileMapper.update(row);
        return get(row.getId());
    }

    @Transactional
    public void delete(long id) {
        profileMapper.deleteById(id);
    }

    /** 任务绑定的方案；未绑定时使用「标准纳入」或列表首项，不再读任务专属遗留 settings */
    public AccessCleanRuleProfile resolveForStatsTask(long statsTaskId) {
        ensureSeededProfiles();
        if (statsTaskId > 0) {
            DahuaSwingStatsPullTask task = statsPullMapper.findById(statsTaskId);
            if (task != null
                    && task.getCleanRuleProfileId() != null
                    && task.getCleanRuleProfileId() > 0) {
                return get(task.getCleanRuleProfileId());
            }
        }
        return getStandardOrFirst();
    }

    public int debounceSeconds(AccessCleanRuleProfile profile) {
        if (profile == null || profile.getDebounceSeconds() == null) {
            return AccessCleanTaskSettingsService.DEFAULT_DEBOUNCE_SECONDS;
        }
        return Math.max(
                AccessCleanTaskSettingsService.MIN_DEBOUNCE_SECONDS,
                Math.min(AccessCleanTaskSettingsService.MAX_DEBOUNCE_SECONDS, profile.getDebounceSeconds()));
    }

    public boolean requireMapping(AccessCleanRuleProfile profile) {
        return profile != null && profile.getRequireMapping() != null && profile.getRequireMapping() != 0;
    }

    public boolean openSuccessOnly(AccessCleanRuleProfile profile) {
        return profile == null || profile.getOpenSuccessOnly() == null || profile.getOpenSuccessOnly() != 0;
    }

    public String directionFilter(AccessCleanRuleProfile profile, String requestOverride) {
        if (StringUtils.hasText(requestOverride)
                && !SwingDirectionFilterSupport.ALL.equals(
                        SwingDirectionFilterSupport.normalize(requestOverride))) {
            return SwingDirectionFilterSupport.normalize(requestOverride);
        }
        if (profile != null && StringUtils.hasText(profile.getSwingDirectionFilter())) {
            return SwingDirectionFilterSupport.normalize(profile.getSwingDirectionFilter());
        }
        return SwingDirectionFilterSupport.ALL;
    }

    private AccessCleanRuleProfile getStandardOrFirst() {
        for (AccessCleanRuleProfile p : profileMapper.selectAll()) {
            if (STANDARD_PROFILE_NAME.equals(p.getName())) {
                return p;
            }
        }
        List<AccessCleanRuleProfile> all = profileMapper.selectAll();
        if (all.isEmpty()) {
            return create(standardProfileTemplate());
        }
        return all.get(0);
    }

    private void ensureSeededProfiles() {
        if (!profileMapper.selectAll().isEmpty()) {
            return;
        }
        AccessCleanRuleProfile standard = standardProfileTemplate();
        profileMapper.insert(standard);
        AccessCleanRuleProfile mappedOnly = standardProfileTemplate();
        mappedOnly.setName("仅已映射用户");
        mappedOnly.setDescription("仅纳入已在系统中映射 ARO 的刷卡人；未映射记录会排除");
        mappedOnly.setRequireMapping(1);
        profileMapper.insert(mappedOnly);
    }

    private static AccessCleanRuleProfile standardProfileTemplate() {
        AccessCleanRuleProfile p = new AccessCleanRuleProfile();
        p.setName(STANDARD_PROFILE_NAME);
        p.setDescription(
                "推荐默认：不限制用户映射；仅开门成功记录纳入；全部进出；去抖 45 秒。学生/工作人员仅作统计标签，不按受众排除。");
        p.setDebounceSeconds(AccessCleanTaskSettingsService.DEFAULT_DEBOUNCE_SECONDS);
        p.setSwingDirectionFilter(SwingDirectionFilterSupport.ALL);
        p.setAutoCleanPackage(1);
        p.setRequireMapping(0);
        p.setOpenSuccessOnly(1);
        p.setDefaultDoorMode("DAHUA_ENTER_EXIT");
        return p;
    }

    private static void validate(AccessCleanRuleProfile row) {
        if (!StringUtils.hasText(row.getName())) {
            throw new IllegalArgumentException("方案名称不能为空");
        }
    }

    private static void normalize(AccessCleanRuleProfile row) {
        row.setName(row.getName().trim());
        if (row.getDebounceSeconds() == null) {
            row.setDebounceSeconds(AccessCleanTaskSettingsService.DEFAULT_DEBOUNCE_SECONDS);
        }
        row.setSwingDirectionFilter(SwingDirectionFilterSupport.normalize(row.getSwingDirectionFilter()));
        if (row.getAutoCleanPackage() == null) {
            row.setAutoCleanPackage(1);
        }
        if (row.getRequireMapping() == null) {
            row.setRequireMapping(0);
        }
        if (row.getOpenSuccessOnly() == null) {
            row.setOpenSuccessOnly(1);
        }
        if (!StringUtils.hasText(row.getDefaultDoorMode())) {
            row.setDefaultDoorMode("DAHUA_ENTER_EXIT");
        }
    }
}
