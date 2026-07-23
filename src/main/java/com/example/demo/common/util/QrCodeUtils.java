package com.example.demo.common.util;

import com.google.zxing.*;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

public final class QrCodeUtils {

    private static final Logger log = LoggerFactory.getLogger(QrCodeUtils.class);

    private QrCodeUtils() {}

    private static final Map<DecodeHintType, Object> HINTS = new EnumMap<>(DecodeHintType.class);
    static {
        HINTS.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        HINTS.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
        HINTS.put(DecodeHintType.CHARACTER_SET, "UTF-8");
    }

    public static String decode(InputStream inputStream) throws IOException, NotFoundException {
        BufferedImage image = ImageIO.read(inputStream);
        if (image == null) throw new IOException("无法读取图片文件");

        int w = image.getWidth(), h = image.getHeight();
        logSample(image, w, h);

        // 从原彩图四角算亮度，检测深色模式（微信深色主题背景接近黑色）
        int darkCorners = 0;
        int[] cornerLum = new int[4];
        int[][] corners = {{0,0},{w-1,0},{0,h-1},{w-1,h-1}};
        for (int i = 0; i < 4; i++) {
            int rgb = image.getRGB(corners[i][0], corners[i][1]);
            int lum = ((rgb>>16)&0xFF)*299/1000 + ((rgb>>8)&0xFF)*587/1000 + (rgb&0xFF)*114/1000;
            cornerLum[i] = lum;
            if (lum < 100) darkCorners++;
        }
        log.warn("  四角亮度={}/{}/{}/{} dark={}", cornerLum[0], cornerLum[1], cornerLum[2], cornerLum[3], darkCorners);
        BufferedImage gray = toGray(image);
        if (darkCorners >= 2) {
            log.warn("  深色模式，翻转");
            gray = invert(gray);
        }

        // 自适应二值化
        BufferedImage binary = binarizeFromGray(gray);

        // 原尺寸 + 多级缩小（逐级增大QR码占比）
        int[] shrinkTargets = (w > 400 || h > 400) ? new int[]{800, 400, 200} : new int[]{};
        java.util.List<BufferedImage> candidates = new java.util.ArrayList<>();
        candidates.add(binary);
        for (int t : shrinkTargets) {
            if (binary.getWidth() > t || binary.getHeight() > t) {
                candidates.add(shrink(binary, t));
            }
        }

        for (BufferedImage img : candidates) {
            String label = img == binary ? "原尺寸" : "缩小" + img.getWidth();
            String result = tryAllStrategies(img, label);
            if (result != null) return result;
        }

        log.warn("✗ 全部失败");
        throw NotFoundException.getNotFoundInstance();
    }

    private static String tryAllStrategies(BufferedImage img, String label) {
        // 1. HybridBinarizer
        BufferedImageLuminanceSource src = new BufferedImageLuminanceSource(img);
        try {
            Result r = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(src)), HINTS);
            log.warn("✓ {} Hybrid: {}", label, r.getText());
            return r.getText();
        } catch (NotFoundException | ChecksumException | FormatException e) {}

        // 2. GlobalHistogramBinarizer
        try {
            BufferedImageLuminanceSource src2 = new BufferedImageLuminanceSource(img);
            Result r = new QRCodeReader().decode(new BinaryBitmap(new GlobalHistogramBinarizer(src2)), HINTS);
            log.warn("✓ {} GlobalHist: {}", label, r.getText());
            return r.getText();
        } catch (NotFoundException | ChecksumException | FormatException e) {}

        // 3. 反转 + HybridBinarizer
        BufferedImage inv = invert(img);
        try {
            BufferedImageLuminanceSource src3 = new BufferedImageLuminanceSource(inv);
            Result r = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(src3)), HINTS);
            log.warn("✓ {} 反转: {}", label, r.getText());
            return r.getText();
        } catch (NotFoundException | ChecksumException | FormatException e) {}

        log.warn("  {} ✗", label);
        return null;
    }

    // ==================== 图像处理 ====================

    private static void logSample(BufferedImage image, int w, int h) {
        int[] s = new int[5];
        image.getRGB(0, 0, 1, 1, s, 0, 1);
        image.getRGB(w-1, 0, 1, 1, s, 1, 1);
        image.getRGB(0, h-1, 1, 1, s, 2, 1);
        image.getRGB(w-1, h-1, 1, 1, s, 3, 1);
        image.getRGB(w/2, h/2, 1, 1, s, 4, 1);
        log.warn("ZXing {}×{} type={} 四角={}/{}/{}/{} 中心={}",
            w, h, image.getType(),
            Integer.toHexString(s[0]&0xFFFFFF), Integer.toHexString(s[1]&0xFFFFFF),
            Integer.toHexString(s[2]&0xFFFFFF), Integer.toHexString(s[3]&0xFFFFFF),
            Integer.toHexString(s[4]&0xFFFFFF));
    }

    private static long pixelSum(BufferedImage gray) {
        long sum = 0;
        int[] row = new int[gray.getWidth()];
        for (int y = 0; y < gray.getHeight(); y++) {
            gray.getRGB(0, y, row.length, 1, row, 0, 1);
            for (int x = 0; x < row.length; x++) sum += (row[x] & 0xFF);
        }
        return sum;
    }

    private static BufferedImage binarizeFromGray(BufferedImage gray) {
        long sum = pixelSum(gray);
        int threshold = (int) (sum / ((long) gray.getWidth() * gray.getHeight()));

        BufferedImage out = new BufferedImage(gray.getWidth(), gray.getHeight(), BufferedImage.TYPE_BYTE_GRAY);
        int[] row = new int[gray.getWidth()];
        for (int y = 0; y < gray.getHeight(); y++) {
            gray.getRGB(0, y, row.length, 1, row, 0, 1);
            for (int x = 0; x < row.length; x++) {
                out.setRGB(x, y, (row[x] & 0xFF) >= threshold ? 0xFFFFFF : 0x000000);
            }
        }
        log.warn("  二值化阈值={} 白={}%", threshold,
            Math.round(100.0 * sum / 255.0 / (gray.getWidth() * gray.getHeight())));
        return out;
    }

    private static BufferedImage toGray(BufferedImage src) {
        if (src.getType() == BufferedImage.TYPE_BYTE_GRAY) return src;
        BufferedImage g = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g2 = g.createGraphics();
        g2.drawImage(src, 0, 0, null);
        g2.dispose();
        return g;
    }

    private static BufferedImage shrink(BufferedImage src, int maxDim) {
        double scale = maxDim / (double) Math.max(src.getWidth(), src.getHeight());
        int nw = (int) (src.getWidth() * scale), nh = (int) (src.getHeight() * scale);
        BufferedImage out = new BufferedImage(nw, nh, src.getType());
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(src, 0, 0, nw, nh, null);
        g.dispose();
        return out;
    }

    private static BufferedImage invert(BufferedImage src) {
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), src.getType());
        for (int y = 0; y < src.getHeight(); y++) {
            for (int x = 0; x < src.getWidth(); x++) {
                int rgb = src.getRGB(x, y);
                int r = 255 - ((rgb >> 16) & 0xFF);
                int g = 255 - ((rgb >> 8) & 0xFF);
                int b = 255 - (rgb & 0xFF);
                out.setRGB(x, y, (r << 16) | (g << 8) | b);
            }
        }
        return out;
    }
}
