package com.example.demo.modules.me.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.purchase.entity.PurchaseOrder;
import com.example.demo.modules.purchase.enums.PurchaseOrderStatus;
import com.example.demo.modules.purchase.mapper.PurchaseOrderMapper;
import com.example.demo.modules.repair.entity.RepairOrder;
import com.example.demo.modules.repair.enums.RepairOrderStatus;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import com.example.demo.modules.supplies.service.SuppliesService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 与前端 {@code StaffNotificationWorkInbox.loadPendingUnified} 同源：待出库领用 + 报修/采购
 * {@code PENDING}/{@code PROCESSING} 各取第一页至多 {@link #INBOX_LIST_CAP} 条，用于 pending-badges 与消息页「待处理」条数一致。
 */
@Service
public class StaffUnifiedWorkInboxPendingCounter {

    /** 与前端 workOrderListParams 中 page=1,size=40 对齐 */
    public static final int INBOX_LIST_CAP = 40;

    private final SuppliesService suppliesService;
    private final RepairOrderMapper repairOrderMapper;
    private final PurchaseOrderMapper purchaseOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;

    public StaffUnifiedWorkInboxPendingCounter(SuppliesService suppliesService,
                                               RepairOrderMapper repairOrderMapper,
                                               PurchaseOrderMapper purchaseOrderMapper,
                                               CapabilityPolicyService capabilityPolicyService) {
        this.suppliesService = suppliesService;
        this.repairOrderMapper = repairOrderMapper;
        this.purchaseOrderMapper = purchaseOrderMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    /**
     * 教职工及以上：与 GET /supplies/claims/pending-tasks + GET /repair/orders + GET /purchase/orders
     * 在消息页合并逻辑一致；非 STAFF 返回 0。
     */
    public int count(User user) {
        if (user == null) {
            return 0;
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return 0;
        }
        int sum = 0;
        if (capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM) == null) {
            sum += suppliesService.listPendingTasks(user).size();
        }
        if (capabilityPolicyService.requireSubmit(user, BizDomains.REPAIR) == null) {
            sum += repairInboxSlice(user, RepairOrderStatus.PENDING.name());
            sum += repairInboxSlice(user, RepairOrderStatus.PROCESSING.name());
        }
        if (capabilityPolicyService.requireSubmit(user, BizDomains.PURCHASE) == null) {
            sum += purchaseInboxSlice(user, PurchaseOrderStatus.PENDING.name());
            sum += purchaseInboxSlice(user, PurchaseOrderStatus.PROCESSING.name());
        }
        return sum;
    }

    /** 与 RepairOrderController.list：onlyMine ⇔ 非 ADMIN；ADMIN 且可处理时用 includePrivate 全量池 */
    private int repairInboxSlice(User user, String statusValue) {
        boolean onlyMine = !isAdminRole(user);
        List<RepairOrder> rows;
        if (onlyMine) {
            rows = repairOrderMapper.listForApplicant(user.getId(), statusValue, null, null, INBOX_LIST_CAP, 0);
        } else if (capabilityPolicyService.canProcess(user, BizDomains.REPAIR)) {
            rows = repairOrderMapper.listAll(statusValue, null, null, INBOX_LIST_CAP, 0);
        } else {
            rows = repairOrderMapper.listVisible(user.getId(), statusValue, null, null, INBOX_LIST_CAP, 0);
        }
        return rows.size();
    }

    /** 与 PurchaseOrderController.list 分支一致 */
    private int purchaseInboxSlice(User user, String statusValue) {
        boolean onlyMine = !isAdminRole(user);
        List<PurchaseOrder> rows;
        if (onlyMine) {
            rows = purchaseOrderMapper.listForApplicant(user.getId(), statusValue, null, null, INBOX_LIST_CAP, 0);
        } else if (capabilityPolicyService.canProcess(user, BizDomains.PURCHASE)) {
            rows = purchaseOrderMapper.listAll(statusValue, null, null, INBOX_LIST_CAP, 0);
        } else {
            rows = purchaseOrderMapper.listVisible(user.getId(), statusValue, null, null, INBOX_LIST_CAP, 0);
        }
        return rows.size();
    }

    private static boolean isAdminRole(User user) {
        RoleEnum r = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        return r.getLevel() >= RoleEnum.ADMIN.getLevel();
    }
}
