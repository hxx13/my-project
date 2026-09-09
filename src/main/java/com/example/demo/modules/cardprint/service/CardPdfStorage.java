package com.example.demo.modules.cardprint.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;

/** 卡牌 PDF 落盘：${app.card-print.dir}/yyyyMMdd/{uuid}.pdf。 */
@Service
public class CardPdfStorage {

    private final Path root;

    public CardPdfStorage(@Value("${app.card-print.dir:./data/card-print}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    /** 写入并返回相对路径（yyyyMMdd/{uuid}.pdf）。 */
    public String store(byte[] pdfBytes) throws IOException {
        String dateDir = LocalDate.now().toString().replace("-", "");
        Path dir = root.resolve(dateDir);
        Files.createDirectories(dir);
        String fileName = java.util.UUID.randomUUID().toString().replace("-", "") + ".pdf";
        Path target = dir.resolve(fileName);
        Files.write(target, pdfBytes);
        return dateDir + "/" + fileName;
    }

    public byte[] read(String relativePath) throws IOException {
        return Files.readAllBytes(resolve(relativePath));
    }

    public void delete(String relativePath) {
        try {
            Files.deleteIfExists(resolve(relativePath));
        } catch (IOException ignored) {
            // 文件已不存在时静默
        }
    }

    private Path resolve(String relativePath) {
        Path p = root.resolve(relativePath).normalize();
        if (!p.startsWith(root)) throw new IllegalArgumentException("非法路径: " + relativePath);
        return p;
    }
}
