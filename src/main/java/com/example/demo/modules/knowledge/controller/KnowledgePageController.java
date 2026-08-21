package com.example.demo.modules.knowledge.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.knowledge.config.KnowledgeYudaoImportRunner;
import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.model.*;
import com.example.demo.modules.knowledge.service.KnowledgeImportService;
import com.example.demo.modules.knowledge.service.KnowledgePageService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/knowledge/pages")
public class KnowledgePageController {

    private final KnowledgePageService pageService;
    private final KnowledgeImportService importService;
    private final KnowledgeYudaoImportRunner knowledgeImporter;
    private final UserDisplayNameService userDisplayNameService;

    public KnowledgePageController(KnowledgePageService pageService,
                                   KnowledgeImportService importService,
                                   KnowledgeYudaoImportRunner knowledgeImporter,
                                   UserDisplayNameService userDisplayNameService) {
        this.pageService = pageService;
        this.importService = importService;
        this.knowledgeImporter = knowledgeImporter;
        this.userDisplayNameService = userDisplayNameService;
    }

    // ═══════ 查询 ═══════

    @GetMapping("/{id}")
    public Result<KnowledgePage> getById(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(pageService.findById(id));
    }

    @GetMapping("/by-slug")
    public Result<KnowledgePage> getBySlug(@RequestParam Long categoryId,
                                           @RequestParam String slug,
                                           HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(pageService.findBySlug(categoryId, slug));
    }

    @GetMapping("/search")
    public Result<List<KnowledgePage>> search(@RequestParam String q,
                                              @RequestParam(required = false) Long categoryId,
                                              HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(pageService.search(q, categoryId));
    }

    // ═══════ 写入 ═══════

    @PostMapping
    public Result<KnowledgePage> create(@RequestBody KnowledgePageSaveRequest req,
                                        HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        String author = getCurrentUsername(request);
        return Result.success(pageService.create(req, author));
    }

    @PutMapping("/{id}")
    public Result<KnowledgePage> update(@PathVariable Long id,
                                        @RequestBody KnowledgePageSaveRequest req,
                                        HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        String author = getCurrentUsername(request);
        return Result.success(pageService.update(id, req, author));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        pageService.delete(id);
        return Result.success(null);
    }

    // ═══════ 历史 ═══════

    @GetMapping("/{id}/history")
    public Result<List<KnowledgeHistory>> history(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(pageService.getHistory(id));
    }

    @PostMapping("/{id}/rollback/{version}")
    public Result<KnowledgePage> rollback(@PathVariable Long id,
                                          @PathVariable int version,
                                          HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        String author = getCurrentUsername(request);
        return Result.success(pageService.rollback(id, version, author));
    }

    // ═══════ 导入/导出 ═══════

    @PostMapping("/import")
    public Result<KnowledgePage> importPage(@RequestBody KnowledgeImportRequest req,
                                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(importService.importSingle(req));
    }

    @PostMapping("/import-batch")
    public Result<List<KnowledgePage>> importBatch(@RequestBody KnowledgeImportBatchRequest req,
                                                    HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(importService.importBatch(req.getItems()));
    }

    @GetMapping("/{id}/export")
    public Result<String> exportPage(@PathVariable Long id,
                                     @RequestParam(defaultValue = "md") String format,
                                     HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        KnowledgePage page = pageService.findById(id);
        if ("md".equals(format) && page.getContentMd() != null) {
            return Result.success(page.getContentMd());
        }
        return Result.success(page.getContentHtml());
    }

    // ═══════ 工具 ═══════

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    /** 手动触发 MD 导入（SUPER_ADMIN），绕过幂等检查强制重新导入 */
    @PostMapping("/trigger-import")
    public Result<Map<String,Object>> triggerImport(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        KnowledgeYudaoImportRunner.ImportResult result = knowledgeImporter.runImport();
        return Result.success(Map.of(
            "total", result.total(),
            "success", result.success(),
            "skipped", result.skipped(),
            "errors", result.errors()
        ));
    }

    private String getCurrentUsername(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            if (user.getId() != null && !user.getId().isBlank()) {
                String name = userDisplayNameService.resolveDisplayName(user.getId());
                if (name != null && !name.isBlank()) {
                    return name;
                }
            }
            return user.getUsername() != null ? user.getUsername() : "system";
        }
        return "system";
    }
}
