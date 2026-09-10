package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import com.example.demo.modules.cageshelf.mapper.CageOwnerApprovalConfigMapper;
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

    public CageOwnerApprovalConfigService(CageOwnerApprovalConfigMapper mapper,
                                          UserDisplayNameService displayNameService,
                                          UserGroupNameResolver userGroupNameResolver) {
        this.mapper = mapper;
        this.displayNameService = displayNameService;
        this.userGroupNameResolver = userGroupNameResolver;
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

    /** 该所属人的分笼 / 转移是否需要先审。 */
    public boolean approvalRequiredFor(String accountId, String opType) {
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
        row.setTransferApprovalRequired(transferRequired == null || transferRequired);
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
