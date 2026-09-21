package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.config.CageTransferApprovalConfigSeed;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import com.example.demo.modules.cageshelf.mapper.CageOwnerApprovalConfigMapper;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 所属人审核配置服务：到位确认 / 分笼审核 / 转移审核三个开关按「所属人」持久化。
 *
 * <p>取代原先全局的 cage.claim.confirm_required / student_divide_approval_required /
 * student_transfer_approval_required —— 现在「需不需要审核」由所属人自己说了算。
 *
 * <p>无配置行的所属人一律按「三个开关全 true」处理（默认需要审核，保守）。
 * 判定点读的是目标所属人（接收方）：分笼/转移取源笼位占用者，认领/代认领取接收人。
 */
@Service
public class CageOwnerApprovalConfigService {

    private final CageOwnerApprovalConfigMapper mapper;
    private final UserDisplayNameService displayNameService;
    private final UserGroupNameResolver userGroupNameResolver;
    private final NotificationSettingsService settingsService;

    public CageOwnerApprovalConfigService(CageOwnerApprovalConfigMapper mapper,
                                          UserDisplayNameService displayNameService,
                                          UserGroupNameResolver userGroupNameResolver,
                                          NotificationSettingsService settingsService) {
        this.mapper = mapper;
        this.displayNameService = displayNameService;
        this.userGroupNameResolver = userGroupNameResolver;
        this.settingsService = settingsService;
    }

    /** 全局是否强制开启转移审核。强制开着时，所属人那一行的 false 不生效。 */
    public boolean transferForced() {
        return "true".equalsIgnoreCase(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED,
                CageTransferApprovalConfigSeed.DEFAULT_TRANSFER_FORCED));
    }

    /** 写强制开关。只应由 SUPER_ADMIN 的入口调用，门槛在控制器。 */
    @Transactional
    public void setTransferForced(boolean forced, String operatorId) {
        writeGlobal(CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED, forced ? "true" : "false", operatorId);
    }

    /**
     * 转移待审提醒的二级开关。**只**管「提交时给审核人发的那条提醒」。
     *
     * <p>与 push-config 上 {@code CAGE_TRANSFER_REVIEW} 源的总控是两个独立的值，判定级联：
     * 总控关 → 引擎那边就不发；二级关 → 我们这里根本不调。审核结果回执（{@code CAGE_TRANSFER_REVIEWED}）
     * 不受这个开关影响 —— 那一条是发给申请人本人的，不该被笼架页的开关静音。
     *
     * <p>缺值按**开**处理（{@link CageTransferApprovalConfigSeed#DEFAULT_REVIEW_NOTIFY_ENABLED}）：
     * 配置行没播上时静默不发，比多发一条难查得多。
     */
    public boolean transferReviewNotifyEnabled() {
        return !"false".equalsIgnoreCase(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_REVIEW_NOTIFY_ENABLED,
                CageTransferApprovalConfigSeed.DEFAULT_REVIEW_NOTIFY_ENABLED));
    }

    @Transactional
    public void setTransferReviewNotifyEnabled(boolean enabled, String operatorId) {
        writeGlobal(CageTransferApprovalConfigSeed.KEY_REVIEW_NOTIFY_ENABLED, enabled ? "true" : "false", operatorId);
    }

    /** 按 key 写模块级全局配置。两个开关共用一段取行 + 覆盖 remark 的逻辑。 */
    private void writeGlobal(String key, String value, String operatorId) {
        List<SystemConfigItem> items = settingsService.listConfigs(CageTransferApprovalConfigSeed.MODULE);
        SystemConfigItem target = items.stream()
                .filter(it -> key.equals(it.getConfigKey()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "配置项 " + CageTransferApprovalConfigSeed.MODULE + "." + key
                                + " 未初始化，通常是启动播种尚未执行"));
        UpdateSystemConfigRequest req = new UpdateSystemConfigRequest();
        req.setConfigValue(value);
        // updateConfig 会把 remark 一并写回，不带上就被清空
        req.setRemark(target.getRemark());
        if (!settingsService.updateConfig(target.getId(), req, operatorId)) {
            throw new IllegalStateException("配置保存失败：" + key);
        }
    }

    /** 把账号 id 折算成 canonical 形式（STAFF_* → ARO 编号），保证同一个人只有一份配置。 */
    public String canonical(String accountId) {
        return accountId == null ? null : userGroupNameResolver.canonicalUserId(accountId.trim());
    }

    /** 生效配置：无行则返回三个开关全 true 的默认值，调用方永远拿到确定的布尔。 */
    public CageOwnerApprovalConfig effective(String accountId) {
        CageOwnerApprovalConfig row = selectRow(accountId);
        if (row != null) {
            return row;
        }
        CageOwnerApprovalConfig d = new CageOwnerApprovalConfig();
        d.setOwnerAccountId(canonical(accountId));
        d.setConfirmRequired(Boolean.TRUE);
        d.setDivideApprovalRequired(Boolean.TRUE);
        d.setTransferApprovalRequired(Boolean.TRUE);
        return d;
    }

    /** 该所属人是否需要「审核通过后到场扫码确认」。 */
    public boolean confirmRequiredFor(String accountId) {
        return Boolean.TRUE.equals(effective(accountId).getConfirmRequired());
    }

    /** 该所属人的分笼 / 转移是否需要先审。转移在全局强制开启时恒为 true。 */
    public boolean approvalRequiredFor(String accountId, String opType) {
        if (CageOpRequest.TYPE_TRANSFER.equals(opType) && transferForced()) {
            return true;
        }
        CageOwnerApprovalConfig c = effective(accountId);
        return CageOpRequest.TYPE_DIVIDE.equals(opType)
                ? Boolean.TRUE.equals(c.getDivideApprovalRequired())
                : Boolean.TRUE.equals(c.getTransferApprovalRequired());
    }

    /** 已配置的所属人列表（带姓名），供设置中心总览。 */
    public List<Map<String, Object>> listDetailed() {
        List<CageOwnerApprovalConfig> rows = mapper.listAll();
        if (rows.isEmpty()) {
            return List.of();
        }
        List<String> ids = rows.stream()
                .map(CageOwnerApprovalConfig::getOwnerAccountId)
                .filter(StringUtils::hasText)
                .distinct()
                .toList();
        Map<String, String> names = displayNameService.resolveDisplayNames(ids);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOwnerApprovalConfig r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            String id = r.getOwnerAccountId();
            m.put("ownerAccountId", id);
            m.put("ownerName", names.getOrDefault(id, id));
            m.put("confirmRequired", Boolean.TRUE.equals(r.getConfirmRequired()));
            m.put("divideApprovalRequired", Boolean.TRUE.equals(r.getDivideApprovalRequired()));
            m.put("transferApprovalRequired", Boolean.TRUE.equals(r.getTransferApprovalRequired()));
            m.put("updateBy", r.getUpdateBy());
            m.put("updateTime", r.getUpdateTime() == null ? null : r.getUpdateTime().toString());
            out.add(m);
        }
        return out;
    }

    @Transactional
    public void save(String accountId, Boolean confirmRequired, Boolean divideRequired,
                     Boolean transferRequired, String operatorId) {
        String owner = canonical(accountId);
        if (!StringUtils.hasText(owner)) {
            throw new IllegalArgumentException("所属人账号不能为空");
        }
        CageOwnerApprovalConfig row = new CageOwnerApprovalConfig();
        row.setOwnerAccountId(owner);
        row.setConfirmRequired(confirmRequired == null || confirmRequired);
        row.setDivideApprovalRequired(divideRequired == null || divideRequired);
        boolean transfer = transferRequired == null || transferRequired;
        if (transferForced()) {
            // 强制开启时忽略传入的 false —— 界面置灰只是提示，真正的闸在这里
            transfer = true;
        }
        row.setTransferApprovalRequired(transfer);
        row.setUpdateBy(operatorId);
        mapper.upsert(row);
    }

    private CageOwnerApprovalConfig selectRow(String accountId) {
        String owner = canonical(accountId);
        if (!StringUtils.hasText(owner)) {
            return null;
        }
        return mapper.selectByOwner(owner);
    }
}
