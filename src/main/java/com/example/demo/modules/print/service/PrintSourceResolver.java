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
        return resolve(job.getSourceType(), job.getSourceId());
    }

    /**
     * 按来源取要打印的字节，不依赖任务。
     *
     * 派发前的预览走这条 —— 预览必须给**实际会被打印的那份**
     * （Word 是转换后的 PDF，不是用户上传的原文件），否则预览和出纸对不上。
     */
    public Optional<byte[]> resolve(String sourceType, String sourceId) throws IOException {
        if (sourceId == null || sourceId.isBlank()) return Optional.empty();

        if (PrintJob.SOURCE_CARD_ARCHIVE.equals(sourceType)) {
            return Optional.of(cardPrintService.downloadArchive(Long.valueOf(sourceId.trim())));
        }
        if (PrintJob.SOURCE_ADMIN_FILE.equals(sourceType)) {
            Optional<Map<String, Object>> row = adminFileTemplateService.findForDownload(sourceId.trim());
            if (row.isEmpty()) return Optional.empty();
            // 优先取转换出来的 PDF：Word/Excel 走的就是这一条。
            // 工位只会渲染 PDF 和图片，原样的 .docx 它打不了。
            String storageKey = preferConvertedPdf(row.get());
            if (storageKey == null) return Optional.empty();
            try (InputStream in = adminFileTemplateService.openDownloadStream(storageKey)) {
                return Optional.of(in.readAllBytes());
            }
        }
        return Optional.empty();
    }

    /** 有转换产物就用它，否则用原文件。 */
    private static String preferConvertedPdf(Map<String, Object> row) {
        Object pdfKey = row.get("pdfStorageKey");
        if (pdfKey != null && !String.valueOf(pdfKey).isBlank()) {
            return String.valueOf(pdfKey);
        }
        Object key = row.get("storageKey");
        return key == null ? null : String.valueOf(key);
    }
}
