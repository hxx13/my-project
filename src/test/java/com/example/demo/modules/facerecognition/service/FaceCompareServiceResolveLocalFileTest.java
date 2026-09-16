package com.example.demo.modules.facerecognition.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 底库图片地址 -> 本地文件 的换算。回归 FaceVerifyService 报
 * "人脸比对失败: Can't read input file!" 那一次：app.public-base-url 为空时
 * 落库的是相对路径，不换算就会被当成本地相对路径解析到当前盘根目录下。
 */
class FaceCompareServiceResolveLocalFileTest {

    @TempDir
    Path baseDir;

    @Test
    void resolvesRelativePublicUrlUnderBaseDir() throws Exception {
        Path photo = baseDir.resolve("face-baseline/2026-09-16/a.jpg");
        Files.createDirectories(photo.getParent());
        Files.write(photo, new byte[] {1, 2, 3});

        File resolved = FaceCompareService.resolveLocalFile(
                baseDir.toString(), "/api/upload/files/face-baseline/2026-09-16/a.jpg");

        assertEquals(photo.toAbsolutePath(), resolved.toPath().toAbsolutePath());
    }

    @Test
    void leavesNonPublicUrlUntouched() throws Exception {
        File absolute = baseDir.resolve("somewhere/x.jpg").toFile();

        assertEquals(absolute, FaceCompareService.resolveLocalFile(baseDir.toString(), absolute.getPath()));
    }

    @Test
    void rejectsTraversal() {
        IOException e = assertThrows(IOException.class, () -> FaceCompareService.resolveLocalFile(
                baseDir.toString(), "/api/upload/files/../../etc/passwd"));

        assertTrue(e.getMessage().contains("非法图片路径"), e.getMessage());
    }

    @Test
    void reportsMissingFileWithResolvedPath() {
        IOException e = assertThrows(IOException.class, () -> FaceCompareService.resolveLocalFile(
                baseDir.toString(), "/api/upload/files/face-baseline/2026-09-16/gone.jpg"));

        assertTrue(e.getMessage().contains("gone.jpg"), e.getMessage());
    }
}
