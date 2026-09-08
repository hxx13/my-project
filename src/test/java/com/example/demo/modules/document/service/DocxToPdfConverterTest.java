package com.example.demo.modules.document.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.model.XWPFHeaderFooterPolicy;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class DocxToPdfConverterTest {

    private static boolean sofficeAvailable() {
        try {
            Process p = new ProcessBuilder("soffice", "--version").redirectErrorStream(true).start();
            p.waitFor();
            return p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    @Test
    void convert_keepsFooterTextInPdf() throws Exception {
        assumeTrue(sofficeAvailable(), "本机未安装 LibreOffice，跳过真实转换测试");

        byte[] pdf = new DocxToPdfConverter("soffice", 60_000L)
                .convert(buildDocxWithFooter("页脚测试-版本2.0"));

        assertThat(new String(pdf, 0, 4)).isEqualTo("%PDF");
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertThat(doc.getNumberOfPages()).isGreaterThanOrEqualTo(1);
            assertThat(new PDFTextStripper().getText(doc)).contains("页脚测试-版本2.0");
        }
    }

    @Test
    void convert_emptyBytes_throws() {
        assertThatThrownBy(() -> new DocxToPdfConverter("soffice", 60_000L).convert(new byte[0]))
                .hasMessageContaining("文档内容为空");
    }

    private static byte[] buildDocxWithFooter(String footerText) throws Exception {
        try (XWPFDocument doc = new XWPFDocument()) {
            doc.createParagraph().createRun().setText("正文内容");
            XWPFHeaderFooterPolicy policy = doc.createHeaderFooterPolicy();
            XWPFFooter footer = policy.createFooter(XWPFHeaderFooterPolicy.DEFAULT);
            footer.createParagraph().createRun().setText(footerText);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.write(out);
            return out.toByteArray();
        }
    }
}
