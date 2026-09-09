package com.example.demo.modules.cardprint.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.fontbox.ttf.TrueTypeCollection;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 渲染引擎 — 只按给定矩形画内容，不懂页面尺寸。
 * 输入槽位矩形 + 槽位绑定 + 一批数据行，输出一个 PDF（每行一页）。
 */
@Service
public class CardRenderEngine {

    private static final Logger log = LoggerFactory.getLogger(CardRenderEngine.class);
    private static final float MM = CardLayoutEngine.MM_TO_PT;

    @Value("${app.pdf.font-path:}")
    private String appPdfFontPath;

    /**
     * @param spec  页面规格
     * @param slots 槽位定义
     * @param rows  每行一条数据，key 为 canonical（含特殊字段 __qr__）
     */
    public byte[] render(CardLayoutEngine.Spec spec, List<CardLayoutEngine.Slot> slots,
                         List<Map<String, Object>> rows) throws IOException {
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("没有可渲染的数据行");
        }
        CardLayoutEngine.Layout layout = CardLayoutEngine.layout(spec, slots);

        try (PDDocument doc = new PDDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDFont font = loadCjkFont(doc, false);
            Map<String, PDImageXObject> qrCache = new java.util.HashMap<>();

            for (Map<String, Object> row : rows) {
                PDPage page = new PDPage(new PDRectangle(layout.pageWidthPt(), layout.pageHeightPt()));
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    if (Boolean.TRUE.equals(spec.rotate90())) {
                        cs.transform(new org.apache.pdfbox.util.Matrix(0, -1, 1, 0, 0, layout.pageHeightPt()));
                    }
                    float layoutH = layout.layoutHeightPt();
                    for (int j = 0; j < slots.size(); j++) {
                        List<CardLayoutEngine.Cell> cells = slots.get(j).effectiveCells();
                        List<CardLayoutEngine.Rect> rects = layout.rows().get(j);
                        for (int i = 0; i < rects.size(); i++) {
                            CardLayoutEngine.Rect r = rects.get(i);
                            // 空格子不产矩形，矩形下标与 cells 下标会错位——按 r.index() 取对应单元格
                            if (r.index() < 0 || r.index() >= cells.size()) continue;
                            drawBorder(cs, spec, r, layoutH);
                            drawCell(cs, font, spec, slots.get(j), cells.get(r.index()), r, layoutH, row);
                        }
                    }
                    if (layout.qrRect() != null) {
                        Object qrValue = row.get(qrFieldKey(spec));
                        if (qrValue != null) {
                            String content = String.valueOf(qrValue);
                            PDImageXObject img = qrCache.get(content);
                            if (img == null) {
                                img = LosslessFactory.createFromImage(doc, encodeQr(content, 600));
                                qrCache.put(content, img);
                            }
                            CardLayoutEngine.Rect q = layout.qrRect();
                            // PDFBox 原点在左下角：y 需翻转
                            cs.drawImage(img, q.x(), layoutH - q.y() - q.h(), q.w(), q.h());
                        }
                    }
                }
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private String qrFieldKey(CardLayoutEngine.Spec spec) {
        return spec.qr() != null && spec.qr().fieldKey() != null ? spec.qr().fieldKey() : "__qr__";
    }

    private void drawBorder(PDPageContentStream cs, CardLayoutEngine.Spec spec,
                            CardLayoutEngine.Rect r, float layoutH) throws IOException {
        if (spec.borderWidthMm() <= 0) return;
        cs.setStrokingColor(parseColor(spec.borderColor()));
        cs.setLineWidth(spec.borderWidthMm() * MM);
        float y = layoutH - r.y() - r.h();
        cs.addRect(r.x(), y, r.w(), r.h());
        cs.stroke();
    }

    private void drawCell(PDPageContentStream cs, PDFont font, CardLayoutEngine.Spec spec,
                          CardLayoutEngine.Slot slot, CardLayoutEngine.Cell cell,
                          CardLayoutEngine.Rect r, float layoutH, Map<String, Object> row) throws IOException {
        float fontSize = slot.fontSizePt() != null ? slot.fontSizePt() : spec.defaultFontSizePt();
        float pad = 1f * MM;
        float baselineY = layoutH - r.y() - r.h() + (r.h() - fontSize) / 2f + 1f;

        String fieldValue = cell.fieldKey() == null ? "" : value(row.get(cell.fieldKey()));
        String content = encodable(text(cell.label()) + fieldValue, font);
        if (!content.isEmpty()) {
            cs.beginText();
            cs.setFont(font, fontSize);
            cs.newLineAtOffset(r.x() + pad, baselineY);
            cs.showText(content);
            cs.endText();
        }
    }

    /** 逐码点试编码，字体无字形的字符替换为 ?，避免 showText/getStringWidth 抛异常中断整批渲染。 */
    private static String encodable(String s, PDFont font) {
        if (s == null || s.isEmpty()) return "";
        StringBuilder sb = new StringBuilder(s.length());
        int i = 0;
        while (i < s.length()) {
            int cp = s.codePointAt(i);
            String ch = new String(Character.toChars(cp));
            try {
                font.encode(ch);
                sb.append(ch);
            } catch (Exception e) {
                sb.append('?');
            }
            i += Character.charCount(cp);
        }
        return sb.toString();
    }

    private static String text(String s) {
        return s == null ? "" : s;
    }

    private static String value(Object v) {
        if (v == null) return "";
        String s = String.valueOf(v);
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static Color parseColor(String hex) {
        if (hex == null || !hex.startsWith("#") || hex.length() != 7) return Color.BLACK;
        try {
            return new Color(Integer.parseInt(hex.substring(1), 16));
        } catch (NumberFormatException e) {
            return Color.BLACK;
        }
    }

    /** 生成二维码位图。渲染与单测共用。 */
    public static BufferedImage encodeQr(String content, int sizePx) throws IOException {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 1);
            BitMatrix matrix = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints);
            return MatrixToImageWriter.toBufferedImage(matrix);
        } catch (Exception e) {
            throw new IOException("二维码生成失败: " + e.getMessage(), e);
        }
    }

    /** 加载可渲染中文的字体，逻辑与 ReportFormExportService.loadCjkFont 一致。 */
    private PDFont loadCjkFont(PDDocument doc, boolean bold) throws IOException {
        String configured = appPdfFontPath == null ? "" : appPdfFontPath.trim();
        if (!configured.isEmpty()) {
            File f = new File(configured);
            if (f.isFile()) {
                PDFont loaded = loadCjkFontFromFile(doc, f);
                if (loaded != null) return loaded;
            }
        }
        try (InputStream in = getClass().getResourceAsStream("/fonts/NotoSansSC-Regular.ttf")) {
            if (in != null) return PDType0Font.load(doc, in, true);
        }
        String[] candidates = bold
                ? new String[]{"C:/Windows/Fonts/msyhbd.ttf", "C:/Windows/Fonts/simhei.ttf"}
                : new String[]{"C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyh.ttf",
                "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/simhei.ttf",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"};
        for (String path : candidates) {
            File f = new File(path);
            if (!f.isFile()) continue;
            PDFont loaded = loadCjkFontFromFile(doc, f);
            if (loaded != null) return loaded;
        }
        throw new IOException("无法加载 PDF 中文字体，请配置 app.pdf.font-path 或安装微软雅黑/思源字体");
    }

    private PDFont loadCjkFontFromFile(PDDocument doc, File file) {
        try {
            String name = file.getName().toLowerCase(Locale.ROOT);
            if (name.endsWith(".ttc")) {
                try (TrueTypeCollection ttc = new TrueTypeCollection(file)) {
                    final TrueTypeFont[] first = new TrueTypeFont[1];
                    ttc.processAllFonts(ttf -> { if (first[0] == null) first[0] = ttf; });
                    if (first[0] != null) return PDType0Font.load(doc, first[0], true);
                }
                return null;
            }
            if (name.endsWith(".ttf") || name.endsWith(".otf")) {
                try (FileInputStream in = new FileInputStream(file)) {
                    return PDType0Font.load(doc, in, true);
                }
            }
        } catch (IOException e) {
            log.debug("[card-print] 字体加载失败 {}: {}", file.getAbsolutePath(), e.getMessage());
        }
        return null;
    }
}
