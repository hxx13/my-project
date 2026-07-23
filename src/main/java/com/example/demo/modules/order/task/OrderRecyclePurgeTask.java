package com.example.demo.modules.order.task;

import com.example.demo.modules.purchase.entity.PurchaseOrder;
import com.example.demo.modules.purchase.mapper.PurchaseOrderMapper;
import com.example.demo.modules.purchase.service.PurchaseOrderService;
import com.example.demo.modules.repair.entity.RepairOrder;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import com.example.demo.modules.repair.service.RepairOrderService;
import com.example.demo.modules.upload.service.UploadFileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Component
public class OrderRecyclePurgeTask {
    private static final Logger log = LoggerFactory.getLogger(OrderRecyclePurgeTask.class);
    private final RepairOrderMapper repairOrderMapper;
    private final PurchaseOrderMapper purchaseOrderMapper;
    private final RepairOrderService repairOrderService;
    private final PurchaseOrderService purchaseOrderService;
    private final UploadFileService uploadFileService;

    public OrderRecyclePurgeTask(RepairOrderMapper repairOrderMapper,
                                 PurchaseOrderMapper purchaseOrderMapper,
                                 RepairOrderService repairOrderService,
                                 PurchaseOrderService purchaseOrderService,
                                 UploadFileService uploadFileService) {
        this.repairOrderMapper = repairOrderMapper;
        this.purchaseOrderMapper = purchaseOrderMapper;
        this.repairOrderService = repairOrderService;
        this.purchaseOrderService = purchaseOrderService;
        this.uploadFileService = uploadFileService;
    }

    @Scheduled(cron = "0 0/30 * * * ?")
    public void purgeExpiredRecycleOrders() {
        try {
            LocalDateTime now = LocalDateTime.now();
            List<RepairOrder> repairRows = repairOrderMapper.listDueForPurge(now, 200);
            for (RepairOrder row : repairRows) {
                if (repairOrderMapper.hardDeleteById(row.getId()) > 0) {
                    uploadFileService.deleteByUrls(repairOrderService.fromJsonArray(row.getRequestImagesJson()));
                    uploadFileService.deleteByUrls(repairOrderService.fromJsonArray(row.getResultImagesJson()));
                }
            }

            List<PurchaseOrder> purchaseRows = purchaseOrderMapper.listDueForPurge(now, 200);
            for (PurchaseOrder row : purchaseRows) {
                if (purchaseOrderMapper.hardDeleteById(row.getId()) > 0) {
                    uploadFileService.deleteByUrls(purchaseOrderService.fromJsonArray(row.getRequestImagesJson()));
                    uploadFileService.deleteByUrls(purchaseOrderService.fromJsonArray(row.getResultImagesJson()));
                }
            }
        } catch (Throwable t) {
            log.error("[回收站清理] 定期清理异常，已捕获防止调度线程终止", t);
        }
    }
}
