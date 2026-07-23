package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.dto.CageAuditProgressDto;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * 笼架占用清算进度（进程内内存，重启后清空）。
 */
@Service
public class AnalyticsCageAuditProgressService {

    private static final String STATUS_IDLE = "idle";
    private static final String STATUS_RUNNING = "running";
    private static final String STATUS_DONE = "done";
    private static final String STATUS_FAILED = "failed";

    private final ConcurrentHashMap<Long, Entry> byViewId = new ConcurrentHashMap<>();

    public void start(long viewId, String userId, int cycleTotal, int totalShelves) {
        Entry e = new Entry();
        e.userId = userId;
        e.dto = base(viewId, STATUS_RUNNING);
        e.dto.setCycleTotal(Math.max(1, cycleTotal));
        e.dto.setCycleIndex(0);
        e.dto.setTotalShelves(Math.max(0, totalShelves));
        e.dto.setProcessedShelves(0);
        e.dto.setMessage("准备拉取笼架数据…");
        e.dto.setPercent(0);
        touch(e.dto);
        byViewId.put(viewId, e);
    }

    public void onCycleStart(long viewId, int cycleIndex, String periodType, String periodLabel) {
        Entry e = byViewId.get(viewId);
        if (e == null || e.dto == null) {
            return;
        }
        e.dto.setCycleIndex(cycleIndex);
        e.dto.setPeriodType(periodType);
        e.dto.setPeriodLabel(periodLabel);
        e.dto.setProcessedShelves(0);
        e.dto.setBatchIndex(0);
        e.dto.setBatchCount(0);
        e.dto.setMessage(periodMessage(periodType, periodLabel));
        recomputePercent(e.dto);
        touch(e.dto);
    }

    public void onShelfBatch(
            long viewId, int processedShelves, int totalShelves, int batchIndex, int batchCount) {
        Entry e = byViewId.get(viewId);
        if (e == null || e.dto == null) {
            return;
        }
        e.dto.setProcessedShelves(processedShelves);
        e.dto.setTotalShelves(totalShelves);
        e.dto.setBatchIndex(batchIndex);
        e.dto.setBatchCount(batchCount);
        if (totalShelves > 0) {
            e.dto.setMessage(
                    String.format(
                            "正在拉取笼架 %d/%d（第 %d/%d 批）",
                            processedShelves, totalShelves, batchIndex, Math.max(1, batchCount)));
        }
        recomputePercent(e.dto);
        touch(e.dto);
    }

    public void complete(long viewId) {
        Entry e = byViewId.get(viewId);
        if (e == null) {
            return;
        }
        e.dto.setStatus(STATUS_DONE);
        e.dto.setPercent(100);
        e.dto.setMessage("清算完成");
        e.dto.setProcessedShelves(e.dto.getTotalShelves());
        touch(e.dto);
    }

    public void fail(long viewId, String message) {
        Entry e = byViewId.get(viewId);
        if (e == null) {
            CageAuditProgressDto dto = base(viewId, STATUS_FAILED);
            dto.setMessage(message != null ? message : "清算失败");
            touch(dto);
            Entry created = new Entry();
            created.dto = dto;
            byViewId.put(viewId, created);
            return;
        }
        e.dto.setStatus(STATUS_FAILED);
        e.dto.setMessage(message != null ? message : "清算失败");
        touch(e.dto);
    }

    public CageAuditProgressDto getForUser(String userId, long viewId) {
        Entry e = byViewId.get(viewId);
        if (e == null || e.dto == null) {
            CageAuditProgressDto idle = base(viewId, STATUS_IDLE);
            idle.setMessage("暂无进行中的拉取任务");
            return idle;
        }
        if (userId != null && e.userId != null && !userId.equals(e.userId)) {
            CageAuditProgressDto denied = base(viewId, STATUS_IDLE);
            denied.setMessage("无权查看");
            return denied;
        }
        CageAuditProgressDto copy = copyOf(e.dto);
        if (STATUS_DONE.equals(copy.getStatus()) && System.currentTimeMillis() - copy.getUpdatedAtMs() > 120_000) {
            byViewId.remove(viewId, e);
            CageAuditProgressDto idle = base(viewId, STATUS_IDLE);
            idle.setMessage("暂无进行中的拉取任务");
            return idle;
        }
        return copy;
    }

    private void recomputePercent(CageAuditProgressDto dto) {
        int cycles = Math.max(1, dto.getCycleTotal());
        int cycleIdx = Math.max(0, dto.getCycleIndex());
        int shelves = Math.max(1, dto.getTotalShelves());
        int processed = Math.min(dto.getProcessedShelves(), shelves);
        double cycleWeight = 1.0 / cycles;
        double within = shelves > 0 ? (double) processed / shelves : 1.0;
        int baseCycle = Math.max(0, cycleIdx - 1);
        double overall = (baseCycle * cycleWeight) + (within * cycleWeight);
        dto.setPercent((int) Math.min(99, Math.round(overall * 100)));
    }

    private static String periodMessage(String periodType, String periodLabel) {
        String name =
                switch (periodType != null ? periodType : "") {
                    case "day" -> "每日";
                    case "week" -> "每周";
                    case "month" -> "每月";
                    default -> "周期";
                };
        if (periodLabel != null && !periodLabel.isBlank()) {
            return String.format("正在清算%s快照 · %s", name, periodLabel);
        }
        return String.format("正在清算%s快照", name);
    }

    private static CageAuditProgressDto base(long viewId, String status) {
        CageAuditProgressDto dto = new CageAuditProgressDto();
        dto.setViewId(viewId);
        dto.setStatus(status);
        return dto;
    }

    private static void touch(CageAuditProgressDto dto) {
        dto.setUpdatedAtMs(System.currentTimeMillis());
    }

    private static CageAuditProgressDto copyOf(CageAuditProgressDto src) {
        CageAuditProgressDto dto = new CageAuditProgressDto();
        dto.setStatus(src.getStatus());
        dto.setViewId(src.getViewId());
        dto.setMessage(src.getMessage());
        dto.setPeriodType(src.getPeriodType());
        dto.setPeriodLabel(src.getPeriodLabel());
        dto.setCycleIndex(src.getCycleIndex());
        dto.setCycleTotal(src.getCycleTotal());
        dto.setTotalShelves(src.getTotalShelves());
        dto.setProcessedShelves(src.getProcessedShelves());
        dto.setBatchIndex(src.getBatchIndex());
        dto.setBatchCount(src.getBatchCount());
        dto.setPercent(src.getPercent());
        dto.setUpdatedAtMs(src.getUpdatedAtMs());
        return dto;
    }

    private static final class Entry {
        String userId;
        CageAuditProgressDto dto;
    }
}
