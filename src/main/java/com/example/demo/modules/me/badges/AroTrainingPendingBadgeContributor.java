package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.aro.entity.AroTrainingTrainee;
import com.example.demo.modules.aro.mapper.AroTrainingFavoriteMapper;
import com.example.demo.modules.aro.mapper.AroTrainingTraineeMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** 培训审核待办：与 /api/admin/aro-training/sessions/pending 同源 */
@Component
@Order(43)
public class AroTrainingPendingBadgeContributor implements PendingBadgeContributor {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingPendingBadgeContributor.class);

    private final AroTrainingTraineeMapper traineeMapper;
    private final AroTrainingFavoriteMapper favoriteMapper;

    public AroTrainingPendingBadgeContributor(AroTrainingTraineeMapper traineeMapper,
                                               AroTrainingFavoriteMapper favoriteMapper) {
        this.traineeMapper = traineeMapper;
        this.favoriteMapper = favoriteMapper;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        if (user == null || user.getId() == null) return;
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;

        int totalPending = 0;
        try {
            List<String> favoriteSessionIds = favoriteMapper.findByUserId(user.getId().trim());
            if (favoriteSessionIds == null || favoriteSessionIds.isEmpty()) {
                view.setProcessAroTraining(0);
                badgeCounters.put("ARO_TRAINING_PROCESS", 0);
                badgeCounters.put("processAroTraining", 0);
                return;
            }

            for (String sessionIdStr : favoriteSessionIds) {
                Long sessionId;
                try {
                    sessionId = Long.valueOf(sessionIdStr);
                } catch (NumberFormatException e) {
                    log.debug("[aro-training-badge] skip non-numeric session_id: {}", sessionIdStr);
                    continue;
                }
                List<AroTrainingTrainee> trainees = traineeMapper.selectBySessionId(sessionId);
                if (trainees == null) continue;
                for (AroTrainingTrainee t : trainees) {
                    // audit pending: testYn IS NULL OR testYn = 0
                    // score pending: testYn = 1 AND (testFraction IS NULL OR testFraction = 0)
                    if (t.getTestYn() == null || t.getTestYn() == 0
                            || (t.getTestYn() == 1 && (t.getTestFraction() == null || t.getTestFraction() == 0))) {
                        totalPending++;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[aro-training-badge] failed to count pending trainees: {}", e.getMessage());
        }

        view.setProcessAroTraining(totalPending);
        badgeCounters.put("ARO_TRAINING_PROCESS", totalPending);
        badgeCounters.put("processAroTraining", totalPending);
    }
}
