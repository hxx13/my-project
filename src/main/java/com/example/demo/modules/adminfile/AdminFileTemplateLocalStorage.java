package com.example.demo.modules.adminfile;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

@Component
public class AdminFileTemplateLocalStorage {

    private final Path root;

    public AdminFileTemplateLocalStorage(@Value("${app.admin.template-upload-dir:./data/admin-template-uploads}") String uploadDir) {
        this.root = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    public void put(String storageKey, byte[] content) throws IOException {
        Path target = root.resolve(storageKey).normalize();
        if (!target.startsWith(root)) {
            throw new IOException("非法路径");
        }
        Files.createDirectories(target.getParent());
        Files.write(target, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
    }

    public InputStream openStream(String storageKey) throws IOException {
        Path target = root.resolve(storageKey).normalize();
        if (!target.startsWith(root) || !Files.isRegularFile(target)) {
            throw new IOException("文件不存在");
        }
        return new BufferedInputStream(Files.newInputStream(target, StandardOpenOption.READ));
    }

    public void deleteIfExists(String storageKey) {
        try {
            Path target = root.resolve(storageKey).normalize();
            if (target.startsWith(root) && Files.isRegularFile(target)) {
                Files.deleteIfExists(target);
            }
        } catch (Exception ignored) {
            // best-effort
        }
    }
}
