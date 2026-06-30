package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayRequestService;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/** 延迟免冻结待审：与 MaterialReviewPage / listPendingEnriched 同源 */
@Component
@Order(42)
public class ScanDelayPendingBadgeContributor implements PendingBadgeContributor {

    private final ScanDelayRequestService scanDelayRequestService;

    public ScanDelayPendingBadgeContributor(ScanDelayRequestService scanDelayRequestService) {
        this.scanDelayRequestService = scanDelayRequestService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        if (user == null || user.getId() == null) return;
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;

        int pending = scanDelayRequestService.listPendingEnriched(user.getId().trim()).size();
        view.setProcessScanDelay(pending);
        badgeCounters.put("SCAN_DELAY_PROCESS", pending);
        badgeCounters.put("processScanDelay", pending);
    }
}
