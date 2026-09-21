package com.example.demo.modules.cageshelf.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 批量打印：多张转移单合并成一份多页 PDF 的回归测试。
 *
 * <p>这里用的是 PDFBox 现造的空白页，不是真渲染转移单 —— 真渲染要起 LibreOffice（一次 ~3.5s），
 * 而这条逻辑的风险在**页序与页数**，不在内容（内容由各自的单张渲染负责，已单独验过）。
 *
 * <p>页序错了的表现是：打印出来第一张对、后面全错位，而没有任何报错。
 */
class TransferFormMergeTest {

    /** 造一份 n 页的 PDF，每页尺寸不同，用来验证合并后第几页来自哪一份。 */
    private static byte[] pdf(int pages, float width) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(new org.apache.pdfbox.pdmodel.common.PDRectangle(width, 800)));
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static int pageCount(byte[] bytes) throws Exception {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            return doc.getNumberOfPages();
        }
    }

    private static float pageWidth(byte[] bytes, int index) throws Exception {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            return doc.getPage(index).getMediaBox().getWidth();
        }
    }

    @Test
    void 两张单页合并成两页_顺序与入参一致() throws Exception {
        byte[] a = pdf(1, 500);
        byte[] b = pdf(1, 700);
        byte[] merged = TransferFormService.mergePdfs(List.of(a, b));
        assertEquals(2, pageCount(merged));
        assertEquals(500f, pageWidth(merged, 0), 0.5f, "第一页应来自第一张单");
        assertEquals(700f, pageWidth(merged, 1), 0.5f, "第二页应来自第二张单");
    }

    @Test
    void 顺序反过来_页序也跟着反() throws Exception {
        byte[] a = pdf(1, 500);
        byte[] b = pdf(1, 700);
        byte[] merged = TransferFormService.mergePdfs(List.of(b, a));
        assertEquals(700f, pageWidth(merged, 0), 0.5f);
        assertEquals(500f, pageWidth(merged, 1), 0.5f);
    }

    @Test
    void 多页单也照原样搬过去() throws Exception {
        byte[] merged = TransferFormService.mergePdfs(List.of(pdf(2, 500), pdf(3, 700)));
        assertEquals(5, pageCount(merged));
    }

    @Test
    void 只有一张时原样返回_不白跑一趟解析() throws Exception {
        byte[] one = pdf(1, 500);
        assertSame(one, TransferFormService.mergePdfs(List.of(one)));
    }

    @Test
    void 空列表报错而不是产出空文件() {
        assertThrows(Exception.class, () -> TransferFormService.mergePdfs(List.of()));
        assertThrows(Exception.class, () -> TransferFormService.mergePdfs(null));
    }
}
