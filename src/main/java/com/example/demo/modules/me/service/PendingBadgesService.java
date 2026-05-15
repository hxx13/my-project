package com.example.demo.modules.me.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.badges.PendingBadgeContributor;
import com.example.demo.modules.me.dto.PendingBadgesView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 待处理角标：由各 {@link PendingBadgeContributor} 汇总；与列表同源逻辑在各 Contributor 内保持。
 */
@Service
public class PendingBadgesService {

    private static final Logger log = LoggerFactory.getLogger(PendingBadgesService.class);

    private final List<PendingBadgeContributor> contributors;

    public PendingBadgesService(List<PendingBadgeContributor> contributors) {
        this.contributors = contributors;
    }

    public PendingBadgesView build(User user) {
        PendingBadgesView v = new PendingBadgesView();
        Map<String, Integer> counters = new LinkedHashMap<>();
        for (PendingBadgeContributor c : contributors) {
            try {
                c.contribute(user, v, counters);
            } catch (Exception ex) {
                log.warn("[pending-badges] contributor {} failed: {}", c.getClass().getSimpleName(), ex.getMessage());
            }
        }
        v.setBadgeCounters(counters);
        v.setRepairText(formatBadgeText(v.getRepair()));
        v.setPurchaseText(formatBadgeText(v.getPurchase()));
        v.setSuppliesText(formatBadgeText(v.getSupplies()));
        v.setNotifyText(formatBadgeText(v.getNotify()));
        v.setProcessRepairText(formatBadgeText(v.getProcessRepair()));
        v.setProcessPurchaseText(formatBadgeText(v.getProcessPurchase()));
        v.setProcessSuppliesText(formatBadgeText(v.getProcessSupplies()));
        v.setChatUnreadText(formatBadgeText(v.getChatUnread()));
        int staffSidebar = Math.max(0, v.getChatUnread())
                + Math.max(0, v.getNotify())
                + Math.max(0, v.getStaffUnifiedWorkInboxPending());
        v.setStaffMessagesSidebarTotal(staffSidebar);
        v.setStaffMessagesSidebarTotalText(formatBadgeText(staffSidebar));
        return v;
    }

    private static String formatBadgeText(int n) {
        if (n <= 0) {
            return "";
        }
        return n > 99 ? "99+" : String.valueOf(n);
    }
}
