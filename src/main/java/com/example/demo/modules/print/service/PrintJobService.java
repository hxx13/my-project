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

    /**
     * 建单。工位必须存在且启用 —— 否则任务建了也永远没人领。
     *
     * @param note     派发备注。工位旁边站着的人靠它知道手上这叠纸是什么。
     * @param priority 越大越先被领走，见 {@link PrintJob#PRIORITY_NORMAL} / {@link PrintJob#PRIORITY_URGENT}。
     */
    public PrintJob create(String stationId, String sourceType, String sourceId,
                           String fileName, int copies, String createdBy,
                           String note, int priority) {
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
        j.setNote(note == null || note.isBlank() ? null : note.trim());
        j.setPriority(Math.max(0, priority));
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

    /**
     * 定向领取一条已知的任务。直发工位用这条而不是 {@link #claimOne} ——
     * 直发明知道要打的是哪一条，按"最早的待领"去捞会在并发建单时捞错人，
     * 把本该这条的留成 PENDING（而 PENDING 没有任何超时兜底，就是永久卡住）。
     */
    public Optional<PrintJob> claim(String jobId, String stationId) {
        if (mapper.claim(jobId, stationId) != 1) {
            return Optional.empty();
        }
        return mapper.findById(jobId);
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

    /**
     * 撤回。只有还没被工位领走的能撤 —— 一旦 SENT，活已经在工位页和它那台机器上了，
     * 我们改数据库也拦不住它。
     */
    public boolean cancel(String jobId) {
        return mapper.cancel(jobId) == 1;
    }

    /** 该工位还排着几条，给工位页显示。 */
    public int countPending(String stationId) {
        return mapper.countPending(stationId);
    }

    public List<PrintJob> listQueue(String stationId, int limit) {
        return mapper.listQueue(stationId, limit);
    }

    public List<PrintJob> listHistory(String stationId, String statusCsv, int limit) {
        return mapper.listHistory(stationId, statusCsv, limit);
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
