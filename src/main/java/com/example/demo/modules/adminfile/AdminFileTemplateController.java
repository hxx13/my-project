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
import org.springframework.web.bind.annotation.RequestBody;
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
    private final AdminFileFolderService adminFileFolderService;

    public AdminFileTemplateController(AdminFileTemplateService adminFileTemplateService,
                                       AdminFileFolderService adminFileFolderService) {
        this.adminFileTemplateService = adminFileTemplateService;
        this.adminFileFolderService = adminFileFolderService;
    }

    @GetMapping
    @Operation(summary = "模板列表（元数据）")
    public Result<List<Map<String, Object>>> list(
            @RequestParam(value = "folderId", required = false) Long folderId,
            HttpServletRequest request) {
        Result<?> auth = requireStaff(request);
        if (auth != null) {
            return cast(auth);
        }
        // 只看 TEMPLATE：这张表是全站共用的 blob 表，SOP 文档与学习资料也往里存，
        // 不过滤的话它们会全部串到这个页面来。
        // folderId 原样透传（含 0）：列表场景里 0 是「未归类」这个有意义的筛选条件，
        // 数据层会把它转成 folder_id IS NULL。
        AdminFileTemplateListResult r = adminFileTemplateService.listMetadataForAdmin("TEMPLATE", folderId);
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
            @RequestParam(value = "purpose", required = false) String purpose,
            @RequestParam(value = "ephemeral", required = false) Boolean ephemeral,
            @RequestParam(value = "folderId", required = false) Long folderId,
            HttpServletRequest request
    ) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        User admin = (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        // 0 与 null 等价，都表示「未归类」；必须转成 null，否则会往 folder_id 写进 0 这个脏值
        Long targetFolder = (folderId == null || folderId == 0L) ? null : folderId;
        if (targetFolder != null && !adminFileFolderService.exists(targetFolder)) {
            return Result.error("文件夹不存在");
        }
        try {
            Map<String, Object> row = adminFileTemplateService.saveUpload(
                    file, admin.getId(), purpose, Boolean.TRUE.equals(ephemeral), targetFolder);
            // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）：返回完整元数据供前端就地追加
            return Result.success(row);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("上传失败: " + e.getMessage());
        }
    }

    @PostMapping("/{id}/folder")
    @Operation(summary = "移动文件到文件夹（folderId 缺省或 0 = 移回未归类）")
    public Result<Void> moveToFolder(@PathVariable String id,
                                     @RequestBody(required = false) Map<String, Object> body,
                                     HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        if (!StringUtils.hasText(id)) {
            return Result.error("id 无效");
        }
        Object raw = body == null ? null : body.get("folderId");
        Long targetFolder = null;
        if (raw != null && !"".equals(raw)) {
            long parsed;
            try {
                parsed = Long.parseLong(String.valueOf(raw));
            } catch (NumberFormatException e) {
                return Result.error("folderId 无效");
            }
            // 0 是哨兵值 = 未归类，落库必须是 NULL 而不是 0
            if (parsed != 0L) {
                if (!adminFileFolderService.exists(parsed)) {
                    return Result.error("文件夹不存在");
                }
                targetFolder = parsed;
            }
        }
        try {
            adminFileTemplateService.moveToFolder(id.trim(), targetFolder);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除模板（管理员，或该文件的上传者本人）")
    public Result<Void> delete(@PathVariable String id, HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        if (!StringUtils.hasText(id)) {
            return Result.error("id 无效");
        }
        User u = (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (u == null) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum role = u.getRole() == null ? RoleEnum.MEMBER : u.getRole();
        boolean isAdmin = role.getLevel() >= RoleEnum.ADMIN.getLevel();
        // 非管理员只能删自己上传的 —— 否则「文件夹对教职工放开、文件删除仅 ADMIN」
        // 会让教职工建得出文件夹却清不掉里面的文件，形成死锁
        if (!isAdmin && !adminFileTemplateService.isUploadedBy(id.trim(), u.getId())) {
            return Result.error("只能删除自己上传的文件");
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
        RoleEnum r = u.getRole() == null ? RoleEnum.MEMBER : u.getRole();
        if (r.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> cast(Result<?> r) {
        return (Result<T>) r;
    }
}
