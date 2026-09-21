package com.example.demo.modules.reportform.util;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 下载响应头的文件名编码。
 *
 * <p>RFC 6266 双写法：老客户端读 `filename=`（ASCII 兜底，只留字母数字与安全标点），
 * 现代浏览器读 `filename*=UTF-8''`（原样中文，百分号编码）。
 *
 * <p>踩过的是**兜底那一半**：中文被剔掉后会留下空段连成的 `--`，
 * `20260918-位亚磊-4` 变成 `20260918--4`，老客户端看到的像是坏文件名。
 */
class ReportFormExportFilenameTest {

    private static String disposition(String filename) {
        HttpHeaders h = ReportFormExportFilename.inlineHeaders(filename);
        return h.getFirst(HttpHeaders.CONTENT_DISPOSITION);
    }

    @Test
    void 中文名_现代浏览器走完整UTF8写法() {
        String d = disposition("20260918-位亚磊-4.pdf");
        assertTrue(d.contains("filename*=UTF-8''20260918-%E4%BD%8D%E4%BA%9A%E7%A3%8A-4.pdf"), d);
    }

    @Test
    void 中文名_ASCII兜底不留连续分隔符() {
        String d = disposition("20260918-位亚磊-4.pdf");
        assertTrue(d.contains("filename=\"20260918-4.pdf\""), d);
        assertFalse(d.contains("--"), "剔掉中文后不该留下 `--`：" + d);
    }

    @Test
    void 纯中文名_兜底退到document但保住扩展名() {
        String d = disposition("转移单.pdf");
        assertTrue(d.contains("filename=\"document.pdf\""), d);
    }

    @Test
    void 合并件名_兜底不留前导分隔符() {
        String d = disposition("转移单合并-2张-202609182033.pdf");
        String ascii = d.substring(d.indexOf("filename=\""), d.indexOf("\"; filename*"));
        assertFalse(ascii.contains("\"-"), "兜底名不该以分隔符开头：" + ascii);
        assertFalse(ascii.contains("--"), ascii);
    }

    @Test
    void 全ASCII名_两个写法一致() {
        String d = disposition("report-2026.xlsx");
        assertTrue(d.contains("filename=\"report-2026.xlsx\""), d);
        assertTrue(d.contains("filename*=UTF-8''report-2026.xlsx"), d);
    }

    @Test
    void disposition类型正确() {
        assertEquals("inline", disposition("a.pdf").split(";")[0].trim());
        assertEquals("attachment",
                ReportFormExportFilename.attachmentHeaders("a.pdf")
                        .getFirst(HttpHeaders.CONTENT_DISPOSITION).split(";")[0].trim());
    }
}
