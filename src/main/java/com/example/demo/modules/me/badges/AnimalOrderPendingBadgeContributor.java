package com.example.demo.modules.me.badges;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.referencedata.service.ReferenceDataService;
import com.example.demo.modules.referencedata.service.RefOrderAccessPolicy;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 动物订购待审角标：侧栏「动物订购审核」入口显示待审核订单数。
 *
 * <p>计数与审核页「新订单」页签同一口径（status=PENDING 的订单数，看全量），
 * 故只发给能看全部订单的人 —— 超管或持「业务」标签者（{@link RefOrderAccessPolicy#canSeeAll}）。
 * 其余人只能看本课题组，本组待审数由页面页签呈现，不占角标。
 */
@Component
@Order(47)
public class AnimalOrderPendingBadgeContributor implements PendingBadgeContributor {

    private final ReferenceDataService referenceDataService;
    private final RefOrderAccessPolicy refOrderAccessPolicy;

    public AnimalOrderPendingBadgeContributor(ReferenceDataService referenceDataService,
                                              RefOrderAccessPolicy refOrderAccessPolicy) {
        this.referenceDataService = referenceDataService;
        this.refOrderAccessPolicy = refOrderAccessPolicy;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        if (!refOrderAccessPolicy.canSeeAll(user)) return;
        badgeCounters.put("processAnimalOrder", referenceDataService.countPendingOrders());
    }
}
