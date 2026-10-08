package com.example.demo.modules.training.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Component;

/**
 * 培训管理的**入口口径**：非学生视角，且（角色 ≥ SUPER_ADMIN 或 饲养组长）。
 *
 * <p><b>只此一处</b>：HTTP 拦截器（{@code AdminAuthInterceptor#preHandleTrainingAdmin}）与
 * AI 工具（{@code TrainingReviewToolPack} 的能力码）都调它。两边各写一遍就是「同一动作两种权限口径」，
 * 抄错一次即漏洞 —— 设计文档 §7.1 明确要求 Controller 与工具调同一个方法。
 *
 * <p>注意这只回答「能不能进培训管理」；**能不能动某一条报名由业务侧回答** ——
 * {@code TrainingService} 里 {@code checkOwner}（培训所属人或超管）才是对象级那道门。
 */
@Component
public class TrainingAdminGate {

    private final PersonIdentityService personIdentityService;

    public TrainingAdminGate(PersonIdentityService personIdentityService) {
        this.personIdentityService = personIdentityService;
    }

    public boolean canManage(User user) {
        if (user == null) {
            return false;
        }
        // 学生视角一律不算 —— 管理端不做 H5，学生侧只在学生端
        if ("STUDENT".equalsIgnoreCase(String.valueOf(user.getAccountSource()))) {
            return false;
        }
        RoleEnum role = user.getRole();
        if (role != null && role.getLevel() >= RoleEnum.SUPER_ADMIN.getLevel()) {
            return true;
        }
        return user.getId() != null && personIdentityService.isBreedingGroupLeader(user.getId());
    }
}
