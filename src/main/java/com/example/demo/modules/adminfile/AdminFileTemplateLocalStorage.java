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
            if (!target.startsWith(root)) return;
            Files.deleteIfExists(target);
            // 顺手清掉随之空掉的父目录。storageKey 是「<文件id>/<随机名>」两级，
            // 只删文件会剩下一个空目录，而目录名就是文件 id —— 内容没泄漏，
            // 但「这台上传过这个文件」这件事还挂在磁盘上，对一次性打印来说就是留痕。
            // 只上挪一层、且必须仍在 upload 根之下；目录非空会抛 DirectoryNotEmptyException，
            // 正好当天然保护（best-effort，不往外抛）。
            Path parent = target.getParent();
            if (parent != null && !parent.equals(root) && parent.startsWith(root)) {
                Files.deleteIfExists(parent);
            }
        } catch (Exception ignored) {
            // best-effort
        }
    }
}
