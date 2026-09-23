package com.example.demo.modules.training.service;

import com.example.demo.modules.training.entity.TrainingCertificate;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 培训证书 PDF 出件（A4，版式按用户提供的两份扫描件重建）。
 *
 * 中文字体用仓库自带的 {@code /fonts/NotoSansSC-Regular.ttf}（PDFBox 内置字体没有中文）；
 * 粗体没有独立字重，用 FILL_STROKE 的描边填充模拟。
 * 正文取自 {@link CertificateTemplates}，只有姓名/培训日期/培训者签字三个变量。
 */
@Service
public class TrainingCertificatePdfService {

    private static final float A4_W = PDRectangle.A4.getWidth();
    private static final float A4_H = PDRectangle.A4.getHeight();
    private static final float M_L = 45.35f;   // 16mm
    private static final float M_R = 45.35f;
    private static final float M_TOP = 39.7f;  // 14mm
    private static final float CONTENT_W = A4_W - M_L - M_R;

    private static final float BODY_SIZE = 11f;
    private static final float LINE_H = BODY_SIZE * 1.75f;
    private static final float FAUX_BOLD = 0.35f;

    /** 页眉下那条蓝灰横线 */
    private static final float[] RULE_RGB = {154f / 255f, 167f / 255f, 189f / 255f};

    public byte[] render(TrainingCertificate cert) throws IOException {
        Map<String, Object> tpl = CertificateTemplates.of(cert.getTemplateKey());
        try (PDDocument doc = new PDDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDFont font = loadFont(doc);
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                float y = A4_H - M_TOP;
                y = drawHeader(doc, cs, y);
                y = drawTitle(cs, font, tpl, y);

                String intro = str(tpl == null ? null : tpl.get("intro"));
                if (!intro.isEmpty()) {
                    y = drawParagraph(cs, font, intro, M_L, y, M_L + CONTENT_W);
                }
                y -= 2f;

                List<Object> items = tpl != null && tpl.get("items") instanceof List<?> l
                        ? new ArrayList<>(l) : List.of();
                int no = 1;
                for (Object it : items) {
                    String s = str(it);
                    if (s.isEmpty()) continue;
                    y = drawNumberedItem(cs, font, no++, s, y);
                }

                String outro = str(tpl == null ? null : tpl.get("outro"));
                if (!outro.isEmpty()) {
                    y -= 2f;
                    y = drawParagraph(cs, font, outro, M_L, y, M_L + CONTENT_W);
                }

                // 三个变量：标签 + 带下划线的值
                y -= 73.7f; // 26mm
                y = drawField(cs, font, "姓名(Print Name):", str(cert.getPersonName()), y);
                y = drawField(cs, font, "培训日期(Date of Training):", fmtDate(cert.getTrainingDate()), y);
                y = drawField(cs, font, "培训者签字(Trainer’s Signature):", str(cert.getTrainerName()), y);

                drawFooter(cs, font, cert, tpl, y);
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    // ────────────────────────────────────────────────────────────

    /** 页眉：左院校 logo、右 AAALAC，下面一条蓝灰横线。 */
    private float drawHeader(PDDocument doc, PDPageContentStream cs, float yTop) throws IOException {
        float schoolH = 39.7f;   // 14mm
        float aaalacH = 31.2f;   // 11mm
        float maxH = schoolH;
        drawLogo(doc, cs, "/static/brand/logo-shsmu.png", M_L, yTop, schoolH);
        PDImageXObject aaalac = loadLogo(doc, "/static/brand/logo-aaalac.png");
        if (aaalac != null) {
            float w = aaalacH * aaalac.getWidth() / aaalac.getHeight();
            cs.drawImage(aaalac, A4_W - M_R - w, yTop - aaalacH, w, aaalacH);
        }
        float y = yTop - maxH - 5.7f;
        cs.setStrokingColor(RULE_RGB[0], RULE_RGB[1], RULE_RGB[2]);
        cs.setLineWidth(1.2f);
        cs.moveTo(M_L, y);
        cs.lineTo(A4_W - M_R, y);
        cs.stroke();
        cs.setStrokingColor(0f, 0f, 0f);
        cs.setLineWidth(1f);
        return y;
    }

    private void drawLogo(PDDocument doc, PDPageContentStream cs, String path, float x, float yTop, float h) throws IOException {
        PDImageXObject img = loadLogo(doc, path);
        if (img == null) return;
        float w = h * img.getWidth() / img.getHeight();
        cs.drawImage(img, x, yTop - h, w, h);
    }

    private PDImageXObject loadLogo(PDDocument doc, String path) {
        try (InputStream in = getClass().getResourceAsStream(path)) {
            if (in == null) return null;
            return PDImageXObject.createFromByteArray(doc, in.readAllBytes(), path);
        } catch (Exception e) {
            return null; // 缺 logo 不影响出件，只是没有页眉图
        }
    }

    /** 标题：中文主标题 + 英文副标题，居中。 */
    private float drawTitle(PDPageContentStream cs, PDFont font, Map<String, Object> tpl, float y) throws IOException {
        String zh = str(tpl == null ? null : tpl.get("titleZh"));
        String en = str(tpl == null ? null : tpl.get("titleEn"));
        y -= 25.5f; // 9mm
        if (!zh.isEmpty()) {
            float size = 15f;
            y -= size;
            drawText(cs, font, size, centeredX(font, size, zh), y, zh, true);
        }
        if (!en.isEmpty()) {
            float size = 11.5f;
            y -= 7f + size;
            drawText(cs, font, size, centeredX(font, size, en), y, en, true);
        }
        return y - 20f; // 标题与正文之间
    }

    /** 段落：按内容宽度折行（中文逐字断行）。 */
    private float drawParagraph(PDPageContentStream cs, PDFont font, String text, float x, float y, float rightEdge) throws IOException {
        for (String line : wrap(font, BODY_SIZE, text, rightEdge - x)) {
            y -= LINE_H;
            drawText(cs, font, BODY_SIZE, x, y, line, false);
        }
        return y;
    }

    /** 编号条目：序号在左，正文续行挂起缩进对齐。 */
    private float drawNumberedItem(PDPageContentStream cs, PDFont font, int no, String text, float y) throws IOException {
        float indent = 17f;            // 6mm
        String prefix = no + ". ";
        float x = M_L + indent;
        float textX = x + font.getStringWidth(prefix) / 1000f * BODY_SIZE;
        List<String> lines = wrap(font, BODY_SIZE, text, M_L + CONTENT_W - textX);
        for (int i = 0; i < lines.size(); i++) {
            y -= LINE_H;
            if (i == 0) drawText(cs, font, BODY_SIZE, x, y, prefix + lines.get(i), false);
            else drawText(cs, font, BODY_SIZE, textX, y, lines.get(i), false);
        }
        return y;
    }

    /** 变量字段：加粗标签 + 加粗值 + 值下方一条到右边距的下划线。 */
    private float drawField(PDPageContentStream cs, PDFont font, String label, String value, float y) throws IOException {
        float x = M_L + 62.4f; // 22mm
        String text = str(value).isEmpty() ? "—" : value;
        y -= LINE_H;
        drawText(cs, font, BODY_SIZE, x, y + 2f, label, true);
        float valueX = x + font.getStringWidth(label) / 1000f * BODY_SIZE + 2f;
        drawText(cs, font, BODY_SIZE, valueX, y + 2f, text, true);
        cs.setLineWidth(0.8f);
        cs.moveTo(valueX, y);
        cs.lineTo(M_L + CONTENT_W, y);
        cs.stroke();
        return y - 22.7f; // 8mm
    }

    /** 页脚：一条细线 + 版本与模板日期。 */
    private void drawFooter(PDPageContentStream cs, PDFont font, TrainingCertificate cert,
                            Map<String, Object> tpl, float y) throws IOException {
        y -= 10f;
        cs.setLineWidth(0.6f);
        cs.setStrokingColor(0.72f, 0.72f, 0.72f);
        cs.moveTo(M_L, y);
        cs.lineTo(A4_W - M_R, y);
        cs.stroke();
        cs.setStrokingColor(0f, 0f, 0f);
        y -= 13f;
        String version = cert.getTemplateVersion() != null
                ? cert.getTemplateVersion()
                : str(tpl == null ? null : tpl.get("version"));
        String date = str(tpl == null ? null : tpl.get("templateDate"));
        drawText(cs, font, 9.5f, M_L, y, "版本（Version）:" + version, false);
        drawText(cs, font, 9.5f, M_L + 130f, y, "日期（Date）:" + date, false);
    }

    // ── 基础绘制 ──

    private void drawText(PDPageContentStream cs, PDFont font, float size, float x, float y,
                          String s, boolean bold) throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(x, y);
        if (bold) {
            cs.setRenderingMode(RenderingMode.FILL_STROKE);
            cs.setLineWidth(FAUX_BOLD);
        }
        cs.showText(s);
        if (bold) {
            cs.setRenderingMode(RenderingMode.FILL);
        }
        cs.endText();
    }

    private float centeredX(PDFont font, float size, String s) throws IOException {
        return M_L + Math.max(0f, (CONTENT_W - font.getStringWidth(s) / 1000f * size) / 2f);
    }

    /** 不能出现在行首的标点（中文避头尾的最简版）：宁可让本行略微超出，也不要断开在前面。 */
    private static final String NO_LINE_START = "，。、；：？！）】》」』’”%,.;:?!)]}";

    /** 按内容宽度折行；中文无空格，逐字断，标点不落行首。 */
    private List<String> wrap(PDFont font, float size, String text, float maxW) throws IOException {
        List<String> out = new ArrayList<>();
        if (maxW <= 0) {
            out.add(text);
            return out;
        }
        StringBuilder cur = new StringBuilder();
        float w = 0f;
        for (int i = 0; i < text.length(); i++) {
            String ch = String.valueOf(text.charAt(i));
            float cw = font.getStringWidth(ch) / 1000f * size;
            boolean noStart = NO_LINE_START.indexOf(text.charAt(i)) >= 0;
            if (w + cw > maxW && cur.length() > 0 && !noStart) {
                out.add(cur.toString());
                cur.setLength(0);
                w = 0f;
            }
            cur.append(ch);
            w += cw;
        }
        if (cur.length() > 0) out.add(cur.toString());
        return out;
    }

    private PDFont loadFont(PDDocument doc) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/fonts/NotoSansSC-Regular.ttf")) {
            if (in != null) {
                return PDType0Font.load(doc, in, true);
            }
        }
        throw new IOException("缺少中文字体 /fonts/NotoSansSC-Regular.ttf，PDF 正文含中文无法用内置字体渲染");
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static String fmtDate(LocalDate d) {
        return d == null ? "—" : d.toString();
    }
}
