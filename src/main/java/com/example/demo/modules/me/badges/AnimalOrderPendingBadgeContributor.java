package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.referencedata.service.ReferenceDataService;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 动物订购待审角标：侧栏「动物订购审核」入口显示待审核订单数。
 *
 * <p>计数与审核页「新订单」页签同一口径（status=PENDING 的订单数，不分课题组——
 * 审核页本身就是看全量的），避免角标和列表第一行「共 N 单」对不上。
 */
@Component
@Order(47)
public class AnimalOrderPendingBadgeContributor implements PendingBadgeContributor {

    private final ReferenceDataService referenceDataService;

    public AnimalOrderPendingBadgeContributor(ReferenceDataService referenceDataService) {
        this.referenceDataService = referenceDataService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        // 审核页入口从 ADMIN 起（admin-nav.manifest 的 fallbackMinRole）；低角色不用算
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return;
        badgeCounters.put("processAnimalOrder", referenceDataService.countPendingOrders());
    }
}
