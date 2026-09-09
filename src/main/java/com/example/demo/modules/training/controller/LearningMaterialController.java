package com.example.demo.modules.training.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.entity.LearningMaterial;
import com.example.demo.modules.training.mapper.LearningMaterialMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.util.Map;

/** 学习资料管理（上传后登记元数据；文件本体走 /api/admin/file-templates）。 */
@RestController
@RequestMapping("/api/admin/training/learning-materials")
public class LearningMaterialController {

    private final LearningMaterialMapper mapper;
    private final AuthContextService authContextService;
    private final AdminFileTemplateService adminFileTemplateService;
    private final HttpServletRequest request;

    public LearningMaterialController(LearningMaterialMapper mapper,
                                      AuthContextService authContextService,
                                      AdminFileTemplateService adminFileTemplateService,
                                      HttpServletRequest request) {
        this.mapper = mapper;
        this.authContextService = authContextService;
        this.adminFileTemplateService = adminFileTemplateService;
        this.request = request;
    }

    @GetMapping
    public Result<?> list() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(mapper.listAll());
    }

    /** 登记一条：{fileId, title, category?, sortOrder?} */
    @PostMapping
    public Result<?> create(@RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        String fileId = str(body.get("fileId"));
        String title = str(body.get("title"));
        if (fileId == null || title == null) return Result.fail(400, "缺少 fileId/title");
        LearningMaterial m = new LearningMaterial();
        m.setFileId(fileId);
        m.setTitle(title);
        m.setCategory(str(body.get("category")));
        m.setSortOrder(body.get("sortOrder") instanceof Number n ? n.intValue() : 0);
        m.setActive(1);
        m.setCreatedBy(user.getId());
        mapper.insert(m);
        return Result.success(mapper.findById(m.getId()));
    }

    /** 改标题/分类/排序/上下架：{title, category, sortOrder, active} */
    @PutMapping("/{id}")
    public Result<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        LearningMaterial cur = mapper.findById(id);
        if (cur == null) return Result.fail(404, "资料不存在");
        if (body.get("title") != null) cur.setTitle(str(body.get("title")));
        if (body.containsKey("category")) cur.setCategory(str(body.get("category")));
        if (body.get("sortOrder") instanceof Number n) cur.setSortOrder(n.intValue());
        if (body.get("active") instanceof Number n) cur.setActive(n.intValue());
        mapper.update(cur);
        return Result.success(mapper.findById(id));
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(Map.of("ok", mapper.delete(id) > 0));
    }

    /** 在线查看（inline，不下载）。 */
    @GetMapping("/{id}/file")
    public ResponseEntity<byte[]> file(@PathVariable Long id) {
        if (resolveUser() == null) return ResponseEntity.status(401).build();
        LearningMaterial m = mapper.findById(id);
        if (m == null) return ResponseEntity.status(404).build();
        try {
            var row = adminFileTemplateService.findForDownload(m.getFileId());
            if (row.isEmpty()) return ResponseEntity.status(404).build();
            String storageKey = String.valueOf(row.get().get("storageKey"));
            InputStream in = adminFileTemplateService.openDownloadStream(storageKey);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/pdf")
                    .header("Content-Disposition", "inline; filename=\"material.pdf\"")
                    .body(in.readAllBytes());
        } catch (Exception e) {
            return ResponseEntity.status(404).build();
        }
    }

    private User resolveUser() {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
