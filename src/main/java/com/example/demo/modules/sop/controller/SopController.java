package com.example.demo.modules.sop.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.sop.service.SopTreeService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

/**
 * SOP 操作文档：分类树 + 文档登记 + 受保护的 PDF 字节流。
 *
 * 文件本体一律走 {@link AdminFileTemplateService}（复用 /api/admin/file-templates 的上传通道），
 * 本模块只登记「哪个文件挂在哪个分类下、叫什么名字」。
 * 整段路径已被 AdminAuthInterceptor 按 STAFF 卡过；写操作在控制器内再收紧到 ADMIN。
 */
@RestController
@RequestMapping("/api/admin/sop")
public class SopController {

    private static final Logger log = LoggerFactory.getLogger(SopController.class);

    private final SopTreeService sopTreeService;
    private final AdminFileTemplateService adminFileTemplateService;

    public SopController(SopTreeService sopTreeService, AdminFileTemplateService adminFileTemplateService) {
        this.sopTreeService = sopTreeService;
        this.adminFileTemplateService = adminFileTemplateService;
    }

    /* ────────────── 读 ────────────── */

    /** 一次拉全量（节点 + 文档），前端建树。SOP 总量小，不分页。 */
    @GetMapping("/tree")
    public Result<Map<String, Object>> tree() {
        return Result.success(Map.of(
                "nodes", sopTreeService.listNodes(),
                "documents", sopTreeService.listDocuments()
        ));
    }

    /**
     * 查看 PDF 字节流。
     *
     * 只在这里做「谁能取到字节」这一道；**别把 token 拼进 URL** —— 前端用 adminHttp 带
     * Authorization 头取 ArrayBuffer 再转 blob URL，token 不进历史/日志/Referer。
     */
    @GetMapping("/documents/{id}/content")
    public ResponseEntity<byte[]> content(@PathVariable Long id) {
        var doc = sopTreeService.findDocument(id);
        if (doc == null) {
            return ResponseEntity.status(404).build();
        }
        try {
            var row = adminFileTemplateService.findForDownload(doc.getFileId());
            if (row.isEmpty()) {
                return ResponseEntity.status(404).build();
            }
            String storageKey = String.valueOf(row.get().get("storageKey"));
            InputStream in = adminFileTemplateService.openDownloadStream(storageKey);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/pdf")
                    .header("Content-Disposition", "inline; filename=\"sop.pdf\"")
                    .header("Cache-Control", "no-store")
                    .body(in.readAllBytes());
        } catch (Exception e) {
            return ResponseEntity.status(404).build();
        }
    }

    /* ────────────── 分类树写 ────────────── */

    /** 登记一条分类：{parentId?, name} */
    @PostMapping("/nodes")
    public Result<?> createNode(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return denied;
        String name = str(body.get("name"));
        if (name == null) return Result.fail(400, "分类名称不能为空");
        try {
            return Result.success(sopTreeService.createNode(lng(body.get("parentId")), name));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * 改名 / 移动分类：{name?, parentId?, moveParent?, sortOrder?}
     * 改名走 name；移动必须显式带 moveParent=true（否则「移到顶层」与「不改」无法区分）。
     */
    @PutMapping("/nodes/{id}")
    public Result<?> updateNode(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return denied;
        String name = str(body.get("name"));
        boolean moveParent = Boolean.TRUE.equals(body.get("moveParent"));
        try {
            return Result.success(sopTreeService.updateNode(id, name, lng(body.get("parentId")), moveParent, intOf(body.get("sortOrder"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @DeleteMapping("/nodes/{id}")
    public Result<?> deleteNode(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return denied;
        try {
            sopTreeService.deleteNode(id);
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /* ────────────── 文档写 ────────────── */

    /** 登记一条：{nodeId?, fileId, title}。fileId 必须是已上传成功的 admin_file_template.id */
    @PostMapping("/documents")
    public Result<?> createDocument(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return denied;
        User admin = currentUser(request);
        String fileId = str(body.get("fileId"));
        String title = str(body.get("title"));
        if (fileId == null) return Result.fail(400, "缺少 fileId");
        if (title == null) return Result.fail(400, "文档名称不能为空");
        if (adminFileTemplateService.findForDownload(fileId).isEmpty()) {
            return Result.fail(400, "上传的文件不存在，请重新上传");
        }
        try {
            return Result.success(sopTreeService.createDocument(lng(body.get("nodeId")), fileId, title, admin == null ? null : admin.getId()));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 改名 / 转移分类：{title?, nodeId?, moveNode?, sortOrder?} */
    @PutMapping("/documents/{id}")
    public Result<?> updateDocument(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return denied;
        try {
            return Result.success(sopTreeService.updateDocument(
                    id, str(body.get("title")), lng(body.get("nodeId")),
                    Boolean.TRUE.equals(body.get("moveNode")), intOf(body.get("sortOrder"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @DeleteMapping("/documents/{id}")
    public Result<?> deleteDocument(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return denied;
        String orphanFileId = sopTreeService.deleteDocument(id);
        // 登记行已经删掉了，文件本体清理失败不该把整个请求判失败 —— 否则前端重试时行已不在，
        // 用户看到的是「删除失败」但文档明明没了。失败只记日志，接受一次网络抖动换来的一枚孤儿文件。
        if (orphanFileId != null) {
            try {
                adminFileTemplateService.delete(orphanFileId);
            } catch (Exception e) {
                log.warn("[sop] 文档已删除，但清理文件本体失败 fileId={}: {}", orphanFileId, e.getMessage());
            }
        }
        return Result.success(Map.of("ok", true));
    }

    /* ────────────── 收藏 ────────────── */

    /*
     * 收藏是「个人数据」，只卡 STAFF（拦截器已统一卡过），不再收紧到 ADMIN ——
     * 普通教职工当然可以收藏常用的 SOP。按人存，换设备/换浏览器都还在。
     */

    /** 当前用户的收藏文档 id，最近收藏的在前 */
    @GetMapping("/favorites")
    public Result<List<Long>> favorites(HttpServletRequest request) {
        User u = currentUser(request);
        if (u == null) return Result.fail(401, "当前登录信息无效");
        return Result.success(sopTreeService.listFavoriteDocumentIds(u.getId()));
    }

    @PostMapping("/favorites/{documentId}")
    public Result<?> addFavorite(@PathVariable Long documentId, HttpServletRequest request) {
        User u = currentUser(request);
        if (u == null) return Result.fail(401, "当前登录信息无效");
        try {
            sopTreeService.addFavorite(u.getId(), documentId);
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @DeleteMapping("/favorites/{documentId}")
    public Result<?> removeFavorite(@PathVariable Long documentId, HttpServletRequest request) {
        User u = currentUser(request);
        if (u == null) return Result.fail(401, "当前登录信息无效");
        sopTreeService.removeFavorite(u.getId(), documentId);
        return Result.success(Map.of("ok", true));
    }

    /* ────────────── helpers ────────────── */

    private User currentUser(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        return attr instanceof User u ? u : null;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        User u = currentUser(request);
        if (u == null) {
            return Result.fail(401, "当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.MEMBER : u.getRole();
        if (r.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.fail(403, "需要管理员权限");
        }
        return null;
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Long lng(Object v) {
        if (v instanceof Number n) return n.longValue();
        String s = str(v);
        if (s == null) return null;
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer intOf(Object v) {
        if (v instanceof Number n) return n.intValue();
        String s = str(v);
        if (s == null) return null;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
