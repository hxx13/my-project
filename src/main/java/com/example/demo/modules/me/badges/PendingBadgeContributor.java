package com.example.demo.modules.me.badges;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;

import java.util.Map;

/**
 * 角标扩展点：新业务实现该接口并注册为 Bean，勿在 {@link com.example.demo.modules.me.service.PendingBadgesService} 内堆分支。
 */
public interface PendingBadgeContributor {

    void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters);
}
