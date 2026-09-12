package com.example.demo.modules.referencedata.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Component;

/**
 * 动物订购审核的访问策略：可见范围与审核权同一条件 —— 超管（后门）或持「业务」标签。
 *
 * <p>其余人（含 ADMIN）只能看本人课题组订单，也无审核权。可见范围由
 * {@code ReferenceDataService.scopeToMyGroup} 在 SQL 层强制收窄，本类只回答「是否全量视角」。
 */
@Component
public class RefOrderAccessPolicy {

    private final PersonIdentityService personIdentityService;

    public RefOrderAccessPolicy(PersonIdentityService personIdentityService) {
        this.personIdentityService = personIdentityService;
    }

    /** 全量可见（全部订单）：超管或持「业务」标签。 */
    public boolean canSeeAll(User user) {
        if (user == null) {
            return false;
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() >= RoleEnum.SUPER_ADMIN.getLevel()) {
            return true;
        }
        return personIdentityService.isBusiness(user.getId());
    }

    /** 是否可审核（批准/驳回/完成）。现与 {@link #canSeeAll} 同条件，独立命名以便日后分叉。 */
    public boolean canReview(User user) {
        return canSeeAll(user);
    }
}
