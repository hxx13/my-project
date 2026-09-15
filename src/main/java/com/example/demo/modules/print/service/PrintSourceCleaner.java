package com.example.demo.modules.print.service;

import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.print.entity.PrintJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 打完清理一次性源文件。
 *
 * 只在**打印成功**后删，不在失败时删：失败的任务管理员还能点「重推」，
 * 这时源文件已经没了的话，重推只会拿到「文件已不存在」。
 * 没人管的失败文件交给过期清理兜底（{@link EphemeralFileSweeper}）。
 *
 * 卡牌归档（CARD_ARCHIVE）不走这里 —— 那是正式产物，本来就要长期留着。
 */
@Service
public class PrintSourceCleaner {

    private static final Logger log = LoggerFactory.getLogger(PrintSourceCleaner.class);

    private final AdminFileTemplateService adminFileTemplateService;

    public PrintSourceCleaner(AdminFileTemplateService adminFileTemplateService) {
        this.adminFileTemplateService = adminFileTemplateService;
    }

    public void cleanupAfterPrinted(PrintJob job) {
        if (job == null || !PrintJob.SOURCE_ADMIN_FILE.equals(job.getSourceType())) return;
        try {
            if (adminFileTemplateService.deleteIfEphemeral(job.getSourceId())) {
                log.info("[print] 一次性文件已随打印完成清理 jobId={} fileId={}", job.getId(), job.getSourceId());
            }
        } catch (Exception e) {
            // 清理失败不该影响打印结果 —— 文件多留一会儿有过期清理兜底
            log.warn("[print] 清理一次性文件失败 jobId={}: {}", job.getId(), e.getMessage());
        }
    }
}
