package com.example.demo.modules.site;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

@Component
public class LoginBrandingUploadStorage {

    private static final Pattern SAFE_NAME = Pattern.compile("^[a-f0-9]{32}\\.(jpg|jpeg|png|webp|gif)$", Pattern.CASE_INSENSITIVE);

    private final Path baseDir;

    public LoginBrandingUploadStorage(
            @Value("${app.login-branding.upload-dir:${user.home}/.twin-system/login-branding-uploads}") String uploadDir
    ) throws IOException {
        this.baseDir = Path.of(uploadDir).toAbsolutePath().normalize();
        Files.createDirectories(this.baseDir);
    }

    public void put(String fileName, byte[] bytes) throws IOException {
        Path target = resolveSafe(fileName);
        Files.write(target, bytes);
    }

    public Path resolveSafe(String fileName) {
        if (fileName == null || !SAFE_NAME.matcher(fileName).matches()) {
            throw new IllegalArgumentException("非法文件名");
        }
        Path resolved = baseDir.resolve(fileName).normalize();
        if (!resolved.startsWith(baseDir)) {
            throw new IllegalArgumentException("非法路径");
        }
        return resolved;
    }
}
