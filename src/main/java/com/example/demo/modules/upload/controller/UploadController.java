package com.example.demo.modules.upload.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.upload.service.UploadFileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.InputStream;
import java.nio.file.StandardCopyOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/upload")
@Tag(name = "文件上传", description = "上传文件与文件访问接口")
public class UploadController {
    private final AuthContextService authContextService;
    private final UploadFileService uploadFileService;

    public UploadController(AuthContextService authContextService, UploadFileService uploadFileService) {
        this.authContextService = authContextService;
        this.uploadFileService = uploadFileService;
    }

    @PostMapping
    @Operation(summary = "上传文件")
    public Result<?> upload(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestParam("file") MultipartFile file) throws Exception {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("无权限上传文件");
        }
        if (file == null || file.isEmpty()) {
            return Result.error("文件不能为空");
        }

        String ext = extractExtension(file.getOriginalFilename());
        String dateDir = LocalDate.now().toString().replace("-", "");
        Path baseDir = uploadFileService.resolveBaseDir();
        Path targetDir = baseDir.resolve(dateDir);
        Files.createDirectories(targetDir);
        String fileName = UUID.randomUUID().toString().replace("-", "") + (ext.isEmpty() ? "" : "." + ext);
        Path target = targetDir.resolve(fileName);
        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("url", "/api/upload/files/" + dateDir + "/" + fileName);
        return Result.success(data);
    }

    @GetMapping("/files/**")
    @Operation(summary = "按路径读取文件")
    public ResponseEntity<Resource> getFile(jakarta.servlet.http.HttpServletRequest request) {
        String uri = request.getRequestURI();
        int idx = uri.indexOf("/api/upload/files/");
        if (idx < 0) {
            return ResponseEntity.notFound().build();
        }
        String relativePath = uri.substring(idx + "/api/upload/files/".length());
        if (!StringUtils.hasText(relativePath) || relativePath.contains("..")) {
            return ResponseEntity.badRequest().build();
        }
        File file = uploadFileService.resolveBaseDir().resolve(relativePath).toFile();
        if (!file.exists() || !file.isFile()) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new FileSystemResource(file);
        MediaType mediaType = resolveMediaType(file.toPath());
        return ResponseEntity.ok()
                .contentType(mediaType)
                .body(resource);
    }

    private String extractExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int idx = filename.lastIndexOf('.');
        if (idx < 0 || idx == filename.length() - 1) {
            return "";
        }
        String ext = filename.substring(idx + 1).toLowerCase();
        return ext.replaceAll("[^a-z0-9]", "");
    }

    private MediaType resolveMediaType(Path filePath) {
        try {
            String contentType = Files.probeContentType(filePath);
            if (StringUtils.hasText(contentType)) {
                return MediaType.parseMediaType(contentType);
            }
        } catch (Exception ignored) {
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
