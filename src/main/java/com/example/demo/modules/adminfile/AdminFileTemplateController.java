package com.example.demo.modules.adminfile;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/admin/file-templates")
@Tag(name = "管理端-文件模板", description = "教职工可上传/下载模板；管理员及以上可删除")
public class AdminFileTemplateController {

    private final AdminFileTemplateService adminFileTemplateService;

    public AdminFileTemplateController(AdminFileTemplateService adminFileTemplateService) {
        this.adminFileTemplateService = adminFileTemplateService;
    }

    @GetMapping
    @Operation(summary = "模板列表（元数据）")
    public Result<List<Map<String, Object>>> list(HttpServletRequest request) {
        Result<?> auth = requireStaff(request);
        if (auth != null) {
            return cast(auth);
        }
        AdminFileTemplateListResult r = adminFileTemplateService.listMetadataForAdmin();
        if (r.schemaHint() != null) {
            return Result.success(r.items(), r.schemaHint());
        }
        return Result.success(r.items());
    }

    @GetMapping("/{id}/download")
    @Operation(summary = "下载模板文件")
    public ResponseEntity<?> download(@PathVariable String id, HttpServletRequest request) {
        Result<?> auth = requireStaff(request);
        if (auth != null) {
            return ResponseEntity.status(403).body(auth);
        }
        if (!StringUtils.hasText(id)) {
            return ResponseEntity.badRequest().body(Result.error("id 无效"));
        }
        Optional<Map<String, Object>> row = adminFileTemplateService.findForDownload(id.trim());
        if (row.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> meta = row.get();
        String storageKey = (String) meta.get("storageKey");
        String originalName = (String) meta.get("originalName");
        String mime = (String) meta.get("mimeType");
        try {
            InputStream in = adminFileTemplateService.openDownloadStream(storageKey);
            MediaType mt = MediaType.APPLICATION_OCTET_STREAM;
            if (StringUtils.hasText(mime)) {
                try {
                    mt = MediaType.parseMediaType(mime);
                } catch (Exception ignored) {
                    // keep octet-stream
                }
            }
            ContentDisposition disposition = ContentDisposition.attachment()
                    .filename(originalName, StandardCharsets.UTF_8)
                    .build();
            InputStreamResource body = new InputStreamResource(in);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                    .contentType(mt)
                    .body(body);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Result.error("读取文件失败: " + e.getMessage()));
        }
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "上传模板（教职工及以上）")
    public Result<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request
    ) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        User admin = (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        try {
            Map<String, Object> row = adminFileTemplateService.saveUpload(file, admin.getId());
            // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）：返回完整元数据供前端就地追加
            return Result.success(row);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("上传失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除模板（管理员及以上）")
    public Result<Void> delete(@PathVariable String id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        if (!StringUtils.hasText(id)) {
            return Result.error("id 无效");
        }
        try {
            adminFileTemplateService.delete(id.trim());
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private Result<?> requireStaff(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User u)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.STUDENT : u.getRole();
        if (r.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User u)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.STUDENT : u.getRole();
        if (r.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> cast(Result<?> r) {
        return (Result<T>) r;
    }
}
