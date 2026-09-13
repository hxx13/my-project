package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import org.springframework.stereotype.Service;

/**
 * 笼架域「全局可见」口径的单一真相源。
 *
 * <p>只回答一个问题：这个人能不能看到全部笼位 —— 即越过课题组脱敏、待审收口、
 * 区域归属过滤，直接拿到全量数据。凡是要判「这个人是否不受可见性限制」的地方都走这里，
 * 不允许再写裸的 {@code role.getLevel() >= RoleEnum.X.getLevel()}。
 *
 * <p>后台管理接口的鉴权（能不能写数据、改配置）不归这里管，仍用各自的 requireMinRole。
 *
 * <p>阈值 {@code SUPER_ADMIN}：ADMIN 只保留后台管理能力，不再自动看全院数据。
 */
@Service
public class CageVisibilityPolicy {

    public boolean isGlobalViewer(User user) {
        return user != null && user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }
}
