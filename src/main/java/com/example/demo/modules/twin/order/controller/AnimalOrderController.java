package com.example.demo.modules.twin.order.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.twin.common.dto.GroupedOrderAdminResponseDTO;
import com.example.demo.modules.twin.common.dto.ListMapDataResponseDTO;
import com.example.demo.modules.twin.common.dto.SimpleMessageResponseDTO;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.service.AnimalOrderProcurementService;
import com.example.demo.modules.twin.common.service.AnimalOrderSyncService;
import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import com.example.demo.modules.twin.common.service.JobSchedulerService;
import com.example.demo.modules.twin.common.service.LongRunningSyncCancel;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/order")

@Tag(name = "订单统计", description = "订单看板与同步接口")
public class AnimalOrderController {

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private AnimalOrderSyncService syncService;

    @Autowired
    private LongRunningSyncCancel longRunningSyncCancel;
    @Autowired
    private JobSchedulerService jobSchedulerService;

    @Autowired
    private AnimalOrderProcurementService procurementService;

    /**
     * 采购汇总：面向供应商的备货口径统计，维度 到货日期 × 供应商 × 品系 × 规格 × 性别，不含课题组/PI。
     * dateField=arrival 按到货日期筛选（默认），dateField=order 按下单时间筛选。
     */
    @GetMapping("/admin/procurement-summary")
    @Operation(summary = "采购汇总（含供应商小计与总计）")
    public Result<ListMapDataResponseDTO> getProcurementSummary(@RequestParam(defaultValue = "arrival") String dateField,
                                                                @RequestParam(required = false) String startDate,
                                                                @RequestParam(required = false) String endDate) {
        return Result.success(new ListMapDataResponseDTO(procurementService.buildRows(dateField, startDate, endDate)));
    }

    @GetMapping("/admin/procurement-summary/export")
    @Operation(summary = "导出采购汇总 Excel")
    public ResponseEntity<byte[]> exportProcurementSummary(@RequestParam(defaultValue = "arrival") String dateField,
                                                           @RequestParam(required = false) String startDate,
                                                           @RequestParam(required = false) String endDate) {
        try {
            byte[] body = procurementService.buildExcel(dateField, startDate, endDate);
            String fn = "procurement-summary-" + LocalDate.now() + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (IllegalStateException ex) {
            return ResponseEntity.internalServerError().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() == null ? "导出失败" : ex.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
    }

    /**
     * 🏆 接口：Debug 页面专属 - 按课题组聚合分页的高级查询 (一页一组画像)
     * 💥 完美接入 SEARCH 搜索功能！
     */
    @GetMapping("/admin/grouped-all")
    @Operation(summary = "按课题组分页查询订单聚合")
    public Result<GroupedOrderAdminResponseDTO> getGroupedAllData(@RequestParam(defaultValue = "1") int page,
                                                                  @RequestParam(required = false, defaultValue = "") String keyword) {
        int offset = page - 1; // page=1 代表 offset 0
        GroupedOrderAdminResponseDTO result = new GroupedOrderAdminResponseDTO();

        // 1. 获取满足搜索条件的课题组总页数 (一页一个)
        int totalGroups = dashboardMapper.getGroupedStatsPageTotalCount(keyword);
        result.setTotal(totalGroups);

        if (totalGroups > 0 && offset < totalGroups) {
            // 2. 核心决断：查出当前名次（排名第 offset）的课题组名字和 PI
            Map<String, Object> groupInfo = dashboardMapper.getResearchGroupInfoByRank(keyword, offset);

            if (groupInfo != null) {
                String projectName = (String) groupInfo.get("projectName");
                String piName = (String) groupInfo.get("piName");

                // 3. 异步并发查询 (此处简写，可改为 CompletableFuture )：
                // a. 针对该组计算大屏第一行统计 (本月新增 + 本周vs上周增量)
                LocalDate thisMonday = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                LocalDate lastMonday = thisMonday.minusWeeks(1);
                DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");
                String weekStart = thisMonday.format(fmt) + " 00:00:00";
                String lastWeekStart = lastMonday.format(fmt) + " 00:00:00";
                result.setRow1Summary(dashboardMapper.getResearchGroupRow1Summary(projectName, piName, weekStart, lastWeekStart));
                // b. 针对该组拉取全量详情源数据流水
                result.setDetailLogs(dashboardMapper.getResearchGroupDetailLog(projectName, piName));
            } else {
                result.setRow1Summary(null);
                result.setDetailLogs(new ArrayList<>());
            }
        } else {
            result.setRow1Summary(null);
            result.setDetailLogs(new ArrayList<>());
        }

        return Result.success(result);
    }

    @GetMapping("/admin/sync")
    @Operation(summary = "触发订单青春版同步（最近3000笔）")
    public Result<SimpleMessageResponseDTO> triggerSync() {
        jobSchedulerService.runManual(JobExecutionRegistry.JOB_ORDER_SYNC, "manual-api");
        return Result.success(new SimpleMessageResponseDTO("青春版订单流水同步指令已下发（最近3000笔）"));
    }

    @GetMapping("/admin/sync/full")
    @Operation(summary = "触发订单全量同步")
    public Result<SimpleMessageResponseDTO> triggerFullSync() {
        syncService.syncOfficialAnimalOrdersFull();
        return Result.success(new SimpleMessageResponseDTO("全量订单流水同步指令已下发"));
    }

    @PostMapping("/admin/sync/cancel")
    @Operation(summary = "暂停正在进行的订单全量同步翻页")
    public Result<SimpleMessageResponseDTO> cancelOrderSync() {
        longRunningSyncCancel.requestAnimalOrderSyncCancel();
        return Result.success(new SimpleMessageResponseDTO("已请求暂停订单同步"));
    }

    // ==========================================
    // 🏆 接口 1 - 大屏排行榜专用 (支持 TOTAL, PUDONG, PUXI + 黑名单 + 周偏移)
    // ==========================================
    @GetMapping("/ranking")
    @Operation(summary = "获取订单排行榜（按周）")
    public Result<ListMapDataResponseDTO> getOrderRanking(@RequestParam(defaultValue = "TOTAL") String region,
                                                          @RequestParam(defaultValue = "0") int weekOffset,
                                                          @RequestParam(defaultValue = "50") int limit) {
        // 💥 黑名单配置中心 💥
        java.util.List<String> blacklist = java.util.Arrays.asList(
                ""
        );

        LocalDate today = LocalDate.now();
        LocalDate thisMonday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate targetMonday = thisMonday.plusWeeks(weekOffset);
        LocalDate targetNextMonday = targetMonday.plusWeeks(1);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");

        String startTime = targetMonday.format(fmt) + " 00:00:00";
        String endTime = targetNextMonday.format(fmt) + " 00:00:00";

        return Result.success(new ListMapDataResponseDTO(
                dashboardMapper.getOrderRankingByTimeRange(region, blacklist, startTime, endTime, limit)));
    }
}