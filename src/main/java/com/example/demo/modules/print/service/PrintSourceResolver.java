package com.example.demo.modules.print.service;

import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.cardprint.service.CardPrintService;
import com.example.demo.modules.print.entity.PrintJob;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Optional;

/**
 * 按 sourceType 取回要打印的文件字节。
 *
 * 两个来源都用各自模块的现成能力，不重写落盘与读取逻辑。
 * 新增来源时在这里加一个分支即可。
 */
@Service
public class PrintSourceResolver {

    private final CardPrintService cardPrintService;
    private final AdminFileTemplateService adminFileTemplateService;

    public PrintSourceResolver(CardPrintService cardPrintService,
                               AdminFileTemplateService adminFileTemplateService) {
        this.cardPrintService = cardPrintService;
        this.adminFileTemplateService = adminFileTemplateService;
    }

    /** 文件不存在返回 empty —— 归档可能已被删，任务记录本身仍应留存。 */
    public Optional<byte[]> resolve(PrintJob job) throws IOException {
        if (PrintJob.SOURCE_CARD_ARCHIVE.equals(job.getSourceType())) {
            return Optional.of(cardPrintService.downloadArchive(Long.valueOf(job.getSourceId())));
        }
        if (PrintJob.SOURCE_ADMIN_FILE.equals(job.getSourceType())) {
            Optional<Map<String, Object>> row =
                    adminFileTemplateService.findForDownload(job.getSourceId());
            if (row.isEmpty()) return Optional.empty();
            String storageKey = (String) row.get().get("storageKey");
            if (storageKey == null) return Optional.empty();
            try (InputStream in = adminFileTemplateService.openDownloadStream(storageKey)) {
                return Optional.of(in.readAllBytes());
            }
        }
        return Optional.empty();
    }
}
