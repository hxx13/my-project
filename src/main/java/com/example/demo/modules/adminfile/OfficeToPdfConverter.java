package com.example.demo.modules.adminfile;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.PDFStreamEngine;
import org.apache.pdfbox.contentstream.operator.DrawObject;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.contentstream.operator.state.Concatenate;
import org.apache.pdfbox.contentstream.operator.state.Restore;
import org.apache.pdfbox.contentstream.operator.state.Save;
import org.apache.pdfbox.contentstream.operator.state.SetGraphicsStateParameters;
import org.apache.pdfbox.contentstream.operator.state.SetMatrix;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.util.Matrix;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 用 LibreOffice headless 把 Office 文档转成 PDF。
 *
 * <p>为什么必须转：工位页是靠浏览器渲染的，只能吃 PDF 和图片。Word 渲染不了，
 * 硬派给工位只会卡住。转成 PDF 之后，**打印链路一行都不用改**。
 *
 * <p>为什么在「上传时」转：成本只付一次，而且转坏了当场就能看见，不用等打印时才暴露。
 *
 * <p><b>中文字体是这条路最容易翻车的地方</b>：转换机器上没装中文的话，字体会被
 * 静默替换，行宽和分页跟着变 —— 表现不是报错，是排版悄悄跑掉。
 * Linux 上装 {@code fonts-noto-cjk} 或 {@code wqy-zenhei-fonts}；
 * 本机验证过 7 个中文字体都会内嵌进产出的 PDF，下游不再依赖系统字体。
 *
 * <p>临时文件一律用 **ASCII 文件名**：中文文件名进命令行参数会被按本地代码页转换，
 * 在 Windows 上实测会毁成问号（同一个坑在 curl 上踩过）。
 */
@Service
public class OfficeToPdfConverter {

    private static final Logger log = LoggerFactory.getLogger(OfficeToPdfConverter.class);

    /** 能转的扩展名。别加图片/PDF —— 那些本来就能直接打，转一遍是白费 */
    private static final Set<String> OFFICE_EXT = Set.of(
            "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf");

    private final Path sofficePath;
    private final long timeoutSeconds;

    public OfficeToPdfConverter(
            @Value("${app.office.soffice-path:}") String configuredPath,
            @Value("${app.office.convert-timeout-seconds:120}") long timeoutSeconds) {
        this.sofficePath = resolveSoffice(configuredPath);
        this.timeoutSeconds = Math.max(10, timeoutSeconds);
    }

    public static boolean isOfficeExt(String ext) {
        return ext != null && OFFICE_EXT.contains(ext.toLowerCase(Locale.ROOT));
    }

    /**
     * 按操作系统猜 LibreOffice 的位置；配置项优先。
     * 猜错不抛异常 —— 由第一次转换时给出明确的报错。
     */
    private static Path resolveSoffice(String configured) {
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured.trim());
        }
        List<String> candidates = new ArrayList<>();
        if (isWindows()) {
            candidates.add("C:/Program Files/LibreOffice/program/soffice.exe");
            candidates.add("C:/Program Files (x86)/LibreOffice/program/soffice.exe");
        } else {
            candidates.add("/usr/bin/soffice");
            candidates.add("/usr/local/bin/soffice");
            candidates.add("/opt/libreoffice/program/soffice");
        }
        for (String c : candidates) {
            if (Files.isRegularFile(Path.of(c))) return Path.of(c);
        }
        // 交给 PATH 解析（Linux 上一般都能找到）
        return Path.of("soffice");
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    /** 转换。失败时抛带明确原因的 IOException —— 不做静默降级。 */
    public byte[] convert(byte[] source, String ext) throws IOException {
        Path work = Files.createTempDirectory("officetopdf-");
        try {
            // ASCII 文件名，见类注释
            Path in = work.resolve("src." + ext.toLowerCase(Locale.ROOT));
            Files.write(in, source);
            Path outDir = work.resolve("out");
            Files.createDirectories(outDir);

            List<String> cmd = new ArrayList<>();
            cmd.add(sofficePath.toString());
            cmd.add("--headless");
            cmd.add("--norestore");
            // 用一个独立的用户配置目录：并行调用时共用默认 profile 会互相锁死
            cmd.add("-env:UserInstallation=file:///" + work.resolve("profile").toAbsolutePath()
                    .toString().replace('\\', '/'));
            cmd.add("--convert-to");
            cmd.add("pdf");
            cmd.add("--outdir");
            cmd.add(outDir.toAbsolutePath().toString());
            cmd.add(in.toAbsolutePath().toString());

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            // 必须把输出读掉，否则缓冲区满了子进程会卡住
            String output = new String(proc.getInputStream().readAllBytes());

            if (!proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                proc.destroyForcibly();
                throw new IOException("转换超时（" + timeoutSeconds + " 秒），文档可能过于复杂");
            }
            if (proc.exitValue() != 0) {
                throw new IOException("转换失败（soffice 退出码 " + proc.exitValue() + "）：" + output.trim());
            }

            Path produced = outDir.resolve("src.pdf");
            if (!Files.isRegularFile(produced)) {
                throw new IOException("转换没有产出 PDF：" + output.trim());
            }
            byte[] pdf = Files.readAllBytes(produced);
            if (pdf.length == 0) {
                throw new IOException("转换产出了空文件");
            }
            try {
                return dropTrailingRepeatedPages(pdf);
            } catch (IOException e) {
                // 裁尾只是锦上添花：这份 PDF 读不动就按原样交付，别把整个转换搞挂
                log.warn("[office-convert] 裁尾页失败，按原样输出 {} 字节：{}", pdf.length, e.getMessage());
                return pdf;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("转换被中断");
        } finally {
            deleteRecursively(work);
        }
    }

    /**
     * 删掉「纯重复页」：LibreOffice 会把表格行撑高，于是多出一张只带重复页眉/页脚的空白尾页 ——
     * Word 里明明是 1 页，我们输出 2 页、打印两张纸。
     *
     * <p><b>判据</b>（保守优先：宁可少裁，不可错裁）。从第 2 页起逐页比对，一页同时满足下面三条
     * 才算「纯重复页」：
     * <ol>
     *   <li><b>没有新文字</b>：该页的文字按行拆开，行内连续空白压成一个空格再 trim，丢掉空行；
     *       剩下的行全部能在<b>前面任意一页</b>里找到（按行比，不管顺序）。</li>
     *   <li><b>没有新图片</b>：图片身份 = 固有宽高 + 图片流字节的 SHA-256 + 绘制时的 CTM
     *       （即图片在页面上的位置和尺寸）。每页同一位置出现的同一张页眉 logo 因此不算「新东西」。</li>
     *   <li><b>没有新矢量图元</b>：绘制类操作符（S/s/f/F/f&#42;/B/B&#42;/b/b&#42;/n）+ 绘制时的 CTM
     *       算一个身份，位置不同的线条/矩形因此算「新东西」。</li>
     * </ol>
     * 三条里任何一条不成立就保留该页。另外几点：
     * <ul>
     *   <li>删的是<b>每一张</b>这样的页，不是「从某页起截断」：多页文档里中间夹一张重复页、
     *       后面还有真内容时，只删那一张，后面的真内容不动。</li>
     *   <li>矢量只按「操作符 + 绘制时的 CTM」认，不认路径各点的坐标 —— 同一 CTM 下画的两种不同
     *       形状会被当成同一个。这是比「按真实几何比」更粗的判据，粗的一侧更容易被判成重复，
     *       也就是偏激进的一侧；但一页要被裁还得文字和图片也全不新，而且真实图元的位置基本都
     *       体现在 CTM 里，形状换了位置多半也换，实际风险很低。</li>
     *   <li>认得到的只有「内容流里的 Do 图片 + 路径绘制操作符 + 文字」。内联图片（BI/ID/EI）
     *       不经过 Do，认不到；纯靠内联图片撑起来的一页会被误判成重复页 —— LibreOffice 产出的
     *       PDF 不走这条写法，属已知边界。解析出错的页一律保留。</li>
     * </ul>
     */
    private byte[] dropTrailingRepeatedPages(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            int total = doc.getNumberOfPages();
            if (total <= 1) return pdf;

            List<PageContent> pages = new ArrayList<>(total);
            for (int i = 0; i < total; i++) pages.add(describe(doc, i));

            // 累积「前面所有页出现过的内容」
            Set<String> seenText = new HashSet<>(pages.get(0).text);
            Set<String> seenImages = new HashSet<>(pages.get(0).images);
            Set<String> seenVectors = new HashSet<>(pages.get(0).vectors);
            boolean[] drop = new boolean[total];
            int dropped = 0;
            for (int i = 1; i < total; i++) {
                PageContent p = pages.get(i);
                if (!p.unreadable && seenText.containsAll(p.text)
                        && seenImages.containsAll(p.images) && seenVectors.containsAll(p.vectors)) {
                    drop[i] = true;
                    dropped++;
                } else {
                    seenText.addAll(p.text);
                    seenImages.addAll(p.images);
                    seenVectors.addAll(p.vectors);
                }
            }
            // 没得裁就别重建 PDF：原样返回原字节，白重写一遍对象没有意义
            if (dropped == 0) return pdf;

            for (int i = total - 1; i >= 1; i--) {
                if (drop[i]) doc.removePage(i);
            }
            // 改了用户的文档就得留痕迹：出问题时这行日志是唯一线索
            log.warn("[office-convert] 裁掉 {} 张纯重复页（内容全是前面页已有的页眉/页脚/图元）：{} 页 -> {} 页",
                    dropped, total, doc.getNumberOfPages());

            ByteArrayOutputStream out = new ByteArrayOutputStream(pdf.length);
            doc.save(out);
            return out.toByteArray();
        }
    }

    /** 把一页的内容读成三类身份集合。读不动的页标记 unreadable，后面永不裁它。 */
    private static PageContent describe(PDDocument doc, int index) {
        PDPage page = doc.getPage(index);
        PageContent pc = new PageContent();
        try {
            // PDFBox 3 的 PDFTextStripper 只有 getText(PDDocument)，单页要自己框范围
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(index + 1);
            stripper.setEndPage(index + 1);
            for (String line : stripper.getText(doc).split("\\R")) {
                String norm = line.replaceAll("\\s+", " ").trim();
                if (!norm.isEmpty()) pc.text.add(norm);
            }
            ContentProbe probe = new ContentProbe();
            probe.processPage(page);
            pc.images.addAll(probe.images);
            pc.vectors.addAll(probe.vectors);
        } catch (IOException | RuntimeException e) {
            pc.unreadable = true;
        }
        return pc;
    }

    /** 一页的内容指纹。判据见 {@link #dropTrailingRepeatedPages}。 */
    private static final class PageContent {
        final Set<String> text = new HashSet<>();
        final Set<String> images = new HashSet<>();
        final Set<String> vectors = new HashSet<>();
        /** 解析过程中出过错，这一页一律保留 */
        boolean unreadable;
    }

    /**
     * 内容流探针：捕图片（{@code Do}）和矢量绘制操作符，把「在页面上的位置尺寸」一并记进身份里。
     * 位置来自绘制那一刻的 CTM。
     */
    private static final class ContentProbe extends PDFStreamEngine {

        /** PDF 里「把路径画出来」的操作符：描边/填充的各组合，n = 只结束路径不画 */
        private static final Set<String> PAINT_OPS =
                Set.of("S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n");

        final Set<String> images = new HashSet<>();
        final Set<String> vectors = new HashSet<>();

        ContentProbe() {
            // 基类不注册任何操作符；状态类（q/Q/cm/gs）不挂上，CTM 永远是单位矩阵，
            // 位置就全成了 0 —— 这一挂是位置判据成立的前提。DrawObject 负责进 Form XObject。
            addOperator(new Concatenate(this));
            addOperator(new Save(this));
            addOperator(new Restore(this));
            addOperator(new SetGraphicsStateParameters(this));
            addOperator(new SetMatrix(this));
            addOperator(new DrawObject(this));
        }

        @Override
        protected void processOperator(Operator operator, List<COSBase> operands) throws IOException {
            String op = operator.getName();
            if ("Do".equals(op) && !operands.isEmpty() && operands.get(0) instanceof COSName name) {
                PDXObject xo = getResources() == null ? null : getResources().getXObject(name);
                if (xo instanceof PDImageXObject img) {
                    images.add(img.getWidth() + "x" + img.getHeight() + "@" + ctmKey() + ":" + digest(img));
                }
            } else if (PAINT_OPS.contains(op)) {
                // 只认「操作符 + CTM」，不认路径各点的坐标：同一 CTM 下画的两种不同形状会被当成
                // 同一个，比「按真实几何比」粗，属偏激进的一侧（见方法注释）。
                vectors.add(op + "@" + ctmKey());
            }
            super.processOperator(operator, operands);
        }

        /** 当前 CTM 里的平移和缩放，舍到 0.1 吸收浮点抖动。图片/矢量在页面上的位置就靠它。 */
        private String ctmKey() {
            Matrix m = getGraphicsState().getCurrentTransformationMatrix();
            return r(m.getTranslateX()) + "," + r(m.getTranslateY())
                    + "," + r(m.getScaleX()) + "," + r(m.getScaleY());
        }

        private static String r(float v) {
            return String.format(Locale.ROOT, "%.1f", v);
        }

        /** 图片流字节的摘要：尺寸相同但内容不同的两张图不会被混成同一张。取不到就退回只认尺寸+位置。 */
        private static String digest(PDImageXObject img) {
            try (InputStream in = img.getCOSObject().createRawInputStream()) {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
                return HexFormat.of().formatHex(md.digest());
            } catch (IOException | NoSuchAlgorithmException e) {
                return "?";
            }
        }
    }

    private static void deleteRecursively(Path dir) {
        try (var walk = Files.walk(dir)) {
            walk.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                            // best-effort
                        }
                    });
        } catch (IOException e) {
            log.warn("[office-convert] 临时目录清理失败 {}: {}", dir, e.getMessage());
        }
    }

    /** 给「上传时立刻给出明确报错」用的可用性判断。 */
    public boolean isAvailable() {
        if (sofficePath.isAbsolute()) return new File(sofficePath.toString()).isFile();
        // 非绝对路径 = 指望 PATH，这里没法可靠判断，交给实际调用
        return true;
    }
}
