package com.example.demo.modules.exam.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.exam.service.ExamPaperService;
import com.example.demo.modules.exam.service.ExamSeedService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 试卷管理（管理端，SuperAdminGuard 保护页面；接口仅校验登录） */
@RestController
@RequestMapping("/api/admin/exam-papers")
public class ExamPaperController {

    private final ExamPaperService service;
    private final ExamSeedService seedService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public ExamPaperController(ExamPaperService service,
                               ExamSeedService seedService,
                               AuthContextService authContextService,
                               HttpServletRequest request) {
        this.service = service;
        this.seedService = seedService;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping("/seeds")
    public Result<?> listSeeds() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(seedService.listSeeds());
    }

    @PostMapping("/import-seeds")
    public Result<?> importSeeds(@RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        List<String> codes = body.get("codes") instanceof List<?> l
                ? l.stream().map(String::valueOf).toList()
                : List.of();
        return Result.success(Map.of("imported", seedService.importSeeds(codes)));
    }

    @GetMapping
    public Result<?> list(@RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "20") int pageSize,
                          @RequestParam(required = false) String keyword) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        List<Map<String, Object>> all = service.list(keyword);
        int total = all.size();
        int from = Math.max(0, (page - 1) * pageSize);
        int to = Math.min(from + pageSize, total);
        List<Map<String, Object>> slice = from < total ? all.subList(from, to) : List.of();
        return Result.success(Map.of("list", slice, "total", total,
                "page", (int) Math.ceil((double) total / pageSize)));
    }

    @GetMapping("/folders")
    public Result<?> listFolders() {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(service.listFolders());
    }

    @PostMapping("/folders")
    public Result<?> createFolder(@RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        String name = str(body.get("name"));
        if (name == null) return Result.fail(400, "缺少 name");
        return Result.success(service.createFolder(name));
    }

    @PutMapping("/folders/{id}")
    public Result<?> renameFolder(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        String name = str(body.get("name"));
        if (name == null) return Result.fail(400, "缺少 name");
        return Result.success(Map.of("ok", service.renameFolder(id, name)));
    }

    @DeleteMapping("/folders/{id}")
    public Result<?> deleteFolder(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        return Result.success(Map.of("ok", service.deleteFolder(id) > 0));
    }

    @PutMapping("/{id}/folder")
    public Result<?> movePaper(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        Long folderId = body.get("folderId") instanceof Number n ? n.longValue() : null;
        return Result.success(Map.of("ok", service.movePaper(id, folderId)));
    }

    @GetMapping("/{id}")
    public Result<?> get(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        Map<String, Object> paper = service.get(id);
        if (paper == null) return Result.fail(404, "试卷不存在");
        return Result.success(paper);
    }

    @PostMapping
    public Result<?> create(@RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        String code = str(body.get("code"));
        String title = str(body.get("title"));
        if (code == null || title == null) return Result.fail(400, "缺少 code 或 title");
        return Result.success(service.create(code, title, user.getId()));
    }

    @PutMapping("/{id}")
    public Result<?> save(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        User user = resolveUser();
        if (user == null) return Result.fail(401, "未登录");
        Map<String, Object> paper = service.save(id, body, user.getId());
        if (paper == null) return Result.fail(404, "试卷不存在");
        return Result.success(paper);
    }

    @PostMapping("/{id}/publish")
    public Result<?> publish(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        Map<String, Object> paper = service.publish(id);
        if (paper == null) return Result.fail(404, "试卷不存在");
        return Result.success(paper);
    }

    @PostMapping("/{id}/unpublish")
    public Result<?> unpublish(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        Map<String, Object> paper = service.unpublish(id);
        if (paper == null) return Result.fail(404, "试卷不存在");
        return Result.success(paper);
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable Long id) {
        if (resolveUser() == null) return Result.fail(401, "未登录");
        int rows = service.delete(id);
        return Result.success(Map.of("ok", rows > 0, "rows", rows));
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
