package com.example.demo.modules.me.badges;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageVetService;
import com.example.demo.modules.me.dto.PendingBadgesView;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 兽医收件箱未读角标：写 {@code badgeCounters.vetInbox}，前端挂在笼架页侧栏项上（再汇总到分组）。
 *
 * <p>**只有拿得到 {@code cage.vet.inbox} 的账号才计数** —— 收件箱是全局的（未读表不按兽医分片），
 * 对没权限的人回一个非零数字等于泄露「有几条兽医通知」，所以先过 {@link CageVetService#canEnter}。
 */
@Component
@Order(43)
public class CageVetPendingBadgeContributor implements PendingBadgeContributor {

    private final CageVetService cageVetService;

    public CageVetPendingBadgeContributor(CageVetService cageVetService) {
        this.cageVetService = cageVetService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        if (!cageVetService.canEnter(user)) return;
        badgeCounters.put("vetInbox", cageVetService.unreadCount());
    }
}
