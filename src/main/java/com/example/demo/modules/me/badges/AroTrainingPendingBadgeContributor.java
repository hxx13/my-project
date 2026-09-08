package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.training.mapper.TrainingEnrollmentMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/** 培训审核待办：统计本地 training_enrollment 里待审核/待评分的学员数 */
@Component
@Order(43)
public class AroTrainingPendingBadgeContributor implements PendingBadgeContributor {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingPendingBadgeContributor.class);

    private final TrainingEnrollmentMapper enrollmentMapper;

    public AroTrainingPendingBadgeContributor(TrainingEnrollmentMapper enrollmentMapper) {
        this.enrollmentMapper = enrollmentMapper;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        if (user == null || user.getId() == null) return;
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;

        int totalPending = 0;
        try {
            totalPending = enrollmentMapper.countPendingByOwner(user.getId());
        } catch (Exception e) {
            log.warn("[aro-training-badge] 统计待审核学员失败: {}", e.getMessage());
        }

        view.setProcessAroTraining(totalPending);
        badgeCounters.put("ARO_TRAINING_PROCESS", totalPending);
        badgeCounters.put("processAroTraining", totalPending);
    }
}
