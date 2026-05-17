package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dto.ScanPopupAnnouncementSettingsDTO;
import com.example.demo.modules.twin.entity.TwinScanPopupAnnouncement;
import com.example.demo.modules.twin.service.TwinScanPopupAnnouncementConfigService;
import com.example.demo.modules.twin.service.TwinScanPopupAnnouncementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/twin/scan-popup-announcements")
@Tag(name = "Twin-Scan-Popup-Announcement", description = "扫码弹窗公告（富文本、多条翻页）")
public class AdminTwinScanPopupAnnouncementController {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final TwinScanPopupAnnouncementService announcementService;
    private final TwinScanPopupAnnouncementConfigService configService;
    private final AuthContextService authContextService;

    public AdminTwinScanPopupAnnouncementController(
            TwinScanPopupAnnouncementService announcementService,
            TwinScanPopupAnnouncementConfigService configService,
            AuthContextService authContextService
    ) {
        this.announcementService = announcementService;
        this.configService = configService;
        this.authContextService = authContextService;
    }

    @GetMapping("/settings")
    @Operation(summary = "扫码公告全局配置")
    public Result<?> getSettings(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(configService.getSettings());
    }

    @PutMapping("/settings")
    @Operation(summary = "保存扫码公告全局配置")
    public Result<?> saveSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanPopupAnnouncementSettingsDTO body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        configService.saveSettings(body, admin == null ? null : admin.getId());
        return Result.success(configService.getSettings());
    }

    @GetMapping
    @Operation(summary = "公告列表")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (TwinScanPopupAnnouncement row : announcementService.listForAdmin()) {
            out.add(toRow(row));
        }
        return Result.success(out);
    }

    @GetMapping("/{id}")
    @Operation(summary = "公告详情")
    public Result<?> get(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        TwinScanPopupAnnouncement row = announcementService.getById(id);
        if (row == null) {
            return Result.error("公告不存在");
        }
        return Result.success(toRow(row));
    }

    @PostMapping
    @Operation(summary = "新建公告")
    public Result<?> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody UpsertBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        try {
            TwinScanPopupAnnouncement row = announcementService.create(
                    body.getTitle(),
                    body.getContentHtml(),
                    body.getEnabled() == null || body.getEnabled(),
                    body.getSortOrder() != null ? body.getSortOrder() : 0,
                    parseDateTime(body.getPublishAt()),
                    parseDateTime(body.getExpireAt()),
                    admin == null ? null : admin.getId()
            );
            return Result.success(toRow(row));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新公告")
    public Result<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id,
            @RequestBody UpsertBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            TwinScanPopupAnnouncement row = announcementService.update(
                    id,
                    body.getTitle(),
                    body.getContentHtml(),
                    body.getEnabled() == null || body.getEnabled(),
                    body.getSortOrder() != null ? body.getSortOrder() : 0,
                    body.getStatus(),
                    parseDateTime(body.getPublishAt()),
                    parseDateTime(body.getExpireAt())
            );
            if (row == null) {
                return Result.error("公告不存在");
            }
            return Result.success(toRow(row));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除公告")
    public Result<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (!announcementService.delete(id)) {
            return Result.error("删除失败或公告不存在");
        }
        return Result.success();
    }

    private Map<String, Object> toRow(TwinScanPopupAnnouncement row) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", row.getId());
        m.put("title", row.getTitle());
        m.put("contentHtml", row.getContentHtml());
        m.put("enabled", row.getEnabled() != null && row.getEnabled() == 1);
        m.put("sortOrder", row.getSortOrder());
        m.put("status", row.getStatus());
        m.put("publishAt", row.getPublishAt());
        m.put("expireAt", row.getExpireAt());
        m.put("createdByUserId", row.getCreatedByUserId());
        m.put("createdAt", row.getCreatedAt());
        m.put("updatedAt", row.getUpdatedAt());
        return m;
    }

    private static LocalDateTime parseDateTime(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return LocalDateTime.parse(raw.trim(), DT);
        } catch (Exception ignored) {
            try {
                return LocalDateTime.parse(raw.trim().replace(" ", "T"), DT);
            } catch (Exception e2) {
                return null;
            }
        }
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问（需管理员及以上）");
        }
        return null;
    }

    @Data
    public static class UpsertBody {
        private String title;
        private String contentHtml;
        private Boolean enabled;
        private Integer sortOrder;
        private String status;
        private String publishAt;
        private String expireAt;
    }
}
