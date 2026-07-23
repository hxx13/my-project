package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.dto.CageScanProgressDto;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicReference;

/**
 * 笼位数据同步进度（进程内内存，单例）。
 * 同一时刻仅有一个同步任务运行。
 */
@Service
public class CageScanProgressService {

    private static final String STATUS_IDLE = "idle";
    private static final String STATUS_RUNNING = "running";
    private static final String STATUS_DONE = "done";
    private static final String STATUS_FAILED = "failed";

    private final AtomicReference<CageScanProgressDto> state = new AtomicReference<>();
    /** 上一次扫描的 batchId（在 start() 覆盖前暂存，供 diff 使用） */
    private volatile String previousBatchId;

    public void start(String scanBatchId, int totalShelves) {
        // 在覆盖 state 之前，先把当前 batchId 存为 previousBatchId
        CageScanProgressDto old = state.get();
        if (old != null && old.getScanBatchId() != null) {
            this.previousBatchId = old.getScanBatchId();
        }
        CageScanProgressDto dto = new CageScanProgressDto();
        dto.setStatus(STATUS_RUNNING);
        dto.setScanBatchId(scanBatchId);
        dto.setTotalShelves(totalShelves);
        dto.setProcessedShelves(0);
        dto.setPercent(0);
        dto.setMessage("准备拉取笼位数据…");
        dto.setStartedAt(java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        touch(dto);
        state.set(dto);
    }

    public void onShelfDone(int processedShelves, boolean success) {
        CageScanProgressDto dto = state.get();
        if (dto == null || !STATUS_RUNNING.equals(dto.getStatus())) return;
        dto.setProcessedShelves(processedShelves);
        if (success) {
            dto.setShelvesSucceeded(dto.getShelvesSucceeded() + 1);
        } else {
            dto.setShelvesFailed(dto.getShelvesFailed() + 1);
        }
        int pct = dto.getTotalShelves() > 0
                ? Math.min(99, dto.getProcessedShelves() * 100 / dto.getTotalShelves())
                : 0;
        dto.setPercent(pct);
        dto.setMessage("已同步 " + processedShelves + " / " + dto.getTotalShelves() + " 个笼架");
        touch(dto);
    }

    public void setCurrentLocation(String roomName, String shelveName) {
        CageScanProgressDto dto = state.get();
        if (dto == null || !STATUS_RUNNING.equals(dto.getStatus())) return;
        dto.setCurrentRoomName(roomName != null ? roomName : "");
        dto.setCurrentShelveName(shelveName != null ? shelveName : "");
        touch(dto);
    }

    public void done(int cagesScanned, int cagesWithStatus) {
        CageScanProgressDto dto = state.get();
        if (dto == null) return;
        dto.setStatus(STATUS_DONE);
        dto.setCagesScanned(cagesScanned);
        dto.setCagesWithStatus(cagesWithStatus);
        dto.setPercent(100);
        dto.setMessage("同步完成，共 " + cagesScanned + " 个笼位，其中特殊状态 " + cagesWithStatus + " 个");
        touch(dto);
    }

    public void fail(String error) {
        CageScanProgressDto dto = state.get();
        if (dto == null) return;
        dto.setStatus(STATUS_FAILED);
        dto.setMessage(error != null ? error : "同步失败");
        touch(dto);
    }

    public CageScanProgressDto getProgress() {
        CageScanProgressDto dto = state.get();
        return dto != null ? dto : idleDto();
    }

    /** 上次扫描的 batchId（用于写入前清理旧数据）。在 start() 覆盖前从旧 state 中提取并保存。 */
    public String getOldBatchId() {
        return previousBatchId;
    }

    public boolean isRunning() {
        CageScanProgressDto dto = state.get();
        return dto != null && STATUS_RUNNING.equals(dto.getStatus());
    }

    private static CageScanProgressDto idleDto() {
        CageScanProgressDto dto = new CageScanProgressDto();
        dto.setStatus(STATUS_IDLE);
        dto.setMessage("无同步任务");
        return dto;
    }

    private static void touch(CageScanProgressDto dto) {
        dto.setUpdatedAtMs(System.currentTimeMillis());
    }
}
