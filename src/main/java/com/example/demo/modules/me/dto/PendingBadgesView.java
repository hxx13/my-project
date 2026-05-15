package com.example.demo.modules.me.dto;

import lombok.Data;

import java.util.LinkedHashMap;
import java.util.Map;

/** 与小程序、后台侧栏待办角标字段一致 */
@Data
public class PendingBadgesView {
    /** 扩展角标（key 建议使用 biz_domain 或 REPAIR_APPLICANT / REPAIR_PROCESS 等），新域优先写 Map，避免持续增加 int 字段 */
    private Map<String, Integer> badgeCounters = new LinkedHashMap<>();

    private int repair;
    private int purchase;
    private int supplies;
    private int notify;
    private int processRepair;
    private int processPurchase;
    private int processSupplies;

    /** 站内信（好友）未读条数 */
    private int chatUnread;

    private String repairText = "";
    private String purchaseText = "";
    private String suppliesText = "";
    private String notifyText = "";
    private String processRepairText = "";
    private String processPurchaseText = "";
    private String processSuppliesText = "";
    private String chatUnreadText = "";

    /**
     * 与消息页「待处理」合并列表条数同源（领用 pending-tasks + 报修/采购 PENDING/PROCESSING 各至多 40 条），
     * 由 {@link com.example.demo.modules.me.badges.StaffUnifiedWorkInboxBadgeContributor} 写入。
     */
    private int staffUnifiedWorkInboxPending;

    /**
     * 侧栏置顶「消息」入口单一汇总：私聊未读 + 系统通知未读 + {@link #staffUnifiedWorkInboxPending}，
     * 由 {@link com.example.demo.modules.me.service.PendingBadgesService} 在 contributors 之后计算。
     */
    private int staffMessagesSidebarTotal;

    private String staffMessagesSidebarTotalText = "";
}
