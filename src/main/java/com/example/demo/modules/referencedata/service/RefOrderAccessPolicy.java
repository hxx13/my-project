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

    /**
     * 订购域**后台配置**的准入（时间管理、规格模板）。现与 {@link #canSeeAll} 同条件，
     * 独立命名以便日后分叉 —— 与 {@link #canReview} 是同一个先例。
     *
     * <p>「业务」是人员标签不是角色，所以这里必须显式读标签：{@code RoleEnum} 的等级比较
     * 表达不了它（规格模板原先是 capability 的角色等级 5 阈值，业务必被拒）。
     */
    public boolean canManageOrderConfig(User user) {
        return canSeeAll(user);
    }
}
