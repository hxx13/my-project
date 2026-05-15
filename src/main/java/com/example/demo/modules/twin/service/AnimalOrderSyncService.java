package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public class AnimalOrderSyncService {
    private static final int LITE_MAX_RECORDS = 3000;
    private static final int DEFAULT_PAGE_SIZE = 100;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private AroService aroService;

    @Autowired
    private LongRunningSyncCancel longRunningSyncCancel;

    @Scheduled(cron = "0 0 0 * * 4")
    public void syncOfficialAnimalOrders() {
        System.out.println("🐭 [定时任务/手动触发] 开始同步青春版官方订单流水（最近3000笔）...");
        syncLatestOrdersLite(LITE_MAX_RECORDS);
    }

    public void syncOfficialAnimalOrdersFull() {
        System.out.println("🐭 [手动触发] 开始同步全量实验动物订单流水...");
        syncAllOrders();
    }

    public void syncLatestOrdersLite(int maxRecords) {
        int safeMax = maxRecords <= 0 ? LITE_MAX_RECORDS : maxRecords;
        syncOrdersWithLimit(safeMax, false);
    }

    public void syncAllOrders() {
        syncOrdersWithLimit(Integer.MAX_VALUE, true);
    }

    private void syncOrdersWithLimit(int maxRecords, boolean fullMode) {
        longRunningSyncCancel.clearAnimalOrderSyncCancel();
        int pageNum = 1;
        int pageSize = DEFAULT_PAGE_SIZE;
        int totalProcessed = 0;
        boolean hasMore = true;
        int maxPages = Math.max(1, (int) Math.ceil(maxRecords * 1.0 / pageSize));
        System.out.println((fullMode ? "🚀 启动全量订单流水抽水泵..." : "🚀 启动青春版订单流水抽水泵，最多处理 " + maxRecords + " 条..."));

        while (hasMore) {
            if (longRunningSyncCancel.isAnimalOrderSyncCancelled()) {
                System.out.println("⏸ [订单同步] 已收到暂停指令，停止翻页。");
                break;
            }
            if (!fullMode && pageNum > maxPages) {
                System.out.println("🛑 [订单同步] 已达到青春版页数上限，停止拉取。");
                break;
            }
            try {
                // 调用 AroService
                Map<String, Object> data = aroService.fetchAnimalOrderPage(pageNum, pageSize);
                if (data != null) {
                    List<Map<String, Object>> orders = (List<Map<String, Object>>) data.get("list");
                    if (orders == null || orders.isEmpty()) { hasMore = false; break; }
                    int canTake = fullMode ? orders.size() : Math.max(0, maxRecords - totalProcessed);
                    if (!fullMode && canTake <= 0) {
                        System.out.println("🛑 [订单同步] 已达到青春版条数上限，停止拉取。");
                        break;
                    }
                    int processCount = Math.min(orders.size(), canTake);

                    // 1. 遍历官方订单
                    for (int i = 0; i < processCount; i++) {
                        Map<String, Object> order = orders.get(i);
                        String sn = (String) order.get("sn");
                        String areaName = (String) order.get("areaName");
                        String projectName = (String) order.get("projectName");
                        String piName = (String) order.get("piName");
                        String createTime = (String) order.get("createTime");
                        String collectorName = (String) order.get("username");
                        String collectorTel = (String) order.get("contact");
                        String orderStateName = (String) order.get("orderStateName");

                        // 💥 终极防崩溃：无论官方传 String 还是 Integer，统统安全转为 int！
                        int quantity = order.get("quantity") != null ? Integer.parseInt(String.valueOf(order.get("quantity"))) : 0;
                        int orderState = order.get("orderState") != null ? Integer.parseInt(String.valueOf(order.get("orderState"))) : 0;

                        // 2. 必须遍历 data.list[i].orderItems 打平源数据！
                        List<Map<String, Object>> items = (List<Map<String, Object>>) order.get("orderItems");
                        if (items != null) {
                            for (Map<String, Object> item : items) {
                                // 💥 终极防崩溃：安全解析长城主键 ID！
                                long itemId = Long.parseLong(String.valueOf(item.get("id")));

                                String arrivalDate = (String) item.get("arrivalDateString");
                                String supplierName = (String) item.get("supplierName");
                                String strainName = (String) item.get("animalStrainName");
                                String specName = (String) item.get("animalSpecName");
                                String memo = (String) item.get("memo");

                                // 💥 终极防崩溃：安全解析雌雄数量
                                int maleQty = item.get("maleQuantity") != null ? Integer.parseInt(String.valueOf(item.get("maleQuantity"))) : 0;
                                int femaleQty = item.get("femaleQuantity") != null ? Integer.parseInt(String.valueOf(item.get("femaleQuantity"))) : 0;

                                String consumeLocation = "未知方式";
                                // 💥 终极防崩溃：安全解析领用方式
                                Integer consumeType = item.get("consumeType") != null ? Integer.parseInt(String.valueOf(item.get("consumeType"))) : null;
                                String roomName = (String) item.get("roomName");

                                if (consumeType != null) {
                                    if (consumeType == 1) {
                                        consumeLocation = "取走";
                                    } else if (consumeType == 2) {
                                        consumeLocation = (roomName != null && !roomName.isEmpty()) ? roomName : "动科部(房间未定)";
                                    }
                                }

                                dashboardMapper.saveOrUpdateOrderDetail(
                                        itemId, sn, areaName, projectName, piName, createTime,
                                        arrivalDate, supplierName, strainName, specName, maleQty, femaleQty,
                                        collectorName, collectorTel, orderStateName, consumeLocation, memo
                                );
                            }
                        }
                    }

                    totalProcessed += processCount;
                    System.out.println("✅ 第 " + pageNum + " 页解析落库完成，本页处理 " + processCount + " 个订单 (已打平)...");

                    // 💥 终极防崩溃：安全解析官方总条数
                    int officialTotal = data.get("total") != null ? Integer.parseInt(String.valueOf(data.get("total"))) : 0;
                    if (!fullMode && totalProcessed >= maxRecords) {
                        hasMore = false;
                    } else if (orders.size() < pageSize || pageNum * pageSize >= officialTotal) {
                        hasMore = false;
                    } else {
                        pageNum++;
                        Thread.sleep(800);
                    }
                } else { System.err.println("❌ 获取第 " + pageNum + " 页数据失败，停止拉取。"); hasMore = false; }
            } catch (Exception e) { System.err.println("❌ 翻页拉取崩溃: " + e.getMessage()); hasMore = false; }
        }
        if (fullMode) {
            System.out.println("🎉 全量动物订单同步彻底完成！共解析了 " + totalProcessed + " 个官方订单流水入库。");
        } else {
            System.out.println("🎉 青春版订单同步完成！本次共解析 " + totalProcessed + " 个官方订单流水入库。");
        }
    }
}