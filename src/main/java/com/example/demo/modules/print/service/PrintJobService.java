package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.mapper.PrintJobMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 打印任务状态机。
 *
 * <pre>
 * PENDING --claimOne--> SENT --acknowledge--> PRINTED / FAILED
 *    ^                    |
 *    +----retry------ FAILED
 * </pre>
 *
 * 所有状态迁移都做成「带前置条件的 UPDATE + 检查影响行数」，
 * 并发下天然互斥，不需要加锁。
 */
@Service
public class PrintJobService {

    private static final Set<String> SOURCE_TYPES =
            Set.of(PrintJob.SOURCE_CARD_ARCHIVE, PrintJob.SOURCE_ADMIN_FILE);

    private final PrintJobMapper mapper;
    private final PrintStationService stationService;
    private final PrintNotifyService notifyService;
    private final PrintSourceCleaner sourceCleaner;

    public PrintJobService(PrintJobMapper mapper,
                           PrintStationService stationService,
                           PrintNotifyService notifyService,
                           PrintSourceCleaner sourceCleaner) {
        this.mapper = mapper;
        this.stationService = stationService;
        this.notifyService = notifyService;
        this.sourceCleaner = sourceCleaner;
    }

    /** 建单。工位必须存在且启用 —— 否则任务建了也永远没人领。 */
    public PrintJob create(String stationId, String sourceType, String sourceId,
                           String fileName, int copies, String createdBy) {
        PrintStation station = stationService.findById(stationId)
                .orElseThrow(() -> new IllegalArgumentException("工位不存在"));
        if (!station.isEnabled()) {
            throw new IllegalArgumentException("工位已停用");
        }
        if (sourceType == null || !SOURCE_TYPES.contains(sourceType)) {
            throw new IllegalArgumentException("不支持的文件来源: " + sourceType);
        }
        if (sourceId == null || sourceId.isBlank()) {
            throw new IllegalArgumentException("缺少文件 id");
        }
        PrintJob j = new PrintJob();
        j.setId("PJ_" + UUID.randomUUID().toString().replace("-", ""));
        j.setStationId(stationId);
        j.setSourceType(sourceType);
        j.setSourceId(sourceId.trim());
        j.setFileName(fileName == null ? "" : fileName);
        j.setCopies(Math.max(1, Math.min(copies, 99)));
        j.setStatus(PrintJob.STATUS_PENDING);
        j.setAttempts(0);
        j.setCreatedBy(createdBy);
        mapper.insert(j);
        return j;
    }

    /**
     * 原子领取本工位最早的一条待打印任务。抢不到就往下试，
     * 全被抢光返回 null —— 工位页据此结束本轮循环。
     */
    public PrintJob claimOne(String stationId) {
        for (String id : mapper.findPendingIds(stationId, 5)) {
            if (mapper.claim(id, stationId) == 1) {
                return mapper.findById(id).orElse(null);
            }
        }
        return null;
    }

    /** 回执。ok 为真落 PRINTED，为假落 FAILED 并记原因，并发一条失败提醒。 */
    public boolean acknowledge(String jobId, String stationId, boolean ok, String error) {
        String status = ok ? PrintJob.STATUS_PRINTED : PrintJob.STATUS_FAILED;
        String err = ok ? null
                : (error == null || error.isBlank() ? "工位报告打印失败" : error.trim());
        if (mapper.acknowledge(jobId, stationId, status, err) != 1) {
            return false;
        }
        // 通知与清理都放在状态落库之后：PushService 是同步外部 IO，不该被包进状态迁移里。
        // 重复回执在上面已经被挡掉，所以两者都不会重复执行。
        mapper.findById(jobId).ifPresent(j -> {
            if (ok) {
                // 一次性源文件打完即删。工位已经取走文件并渲染完了，服务端留拷没有意义。
                sourceCleaner.cleanupAfterPrinted(j);
            } else {
                // 失败不删：管理员还能点重推，源文件没了就只能拿到「文件已不存在」
                notifyService.notifyFailed(j, err);
            }
        });
        return true;
    }

    public boolean retry(String jobId) {
        return mapper.retry(jobId) == 1;
    }

    public Optional<PrintJob> findById(String id) {
        return mapper.findById(id);
    }

    public List<PrintJob> listByStation(String stationId, int limit) {
        return mapper.listByStation(stationId, limit);
    }

    public List<PrintJob> listByCreator(String userId, int limit) {
        return mapper.listByCreator(userId, limit);
    }

    public List<PrintJob> listAll(int limit) {
        return mapper.listAll(limit);
    }
}
