package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aup.dto.AupFieldCreateRequest;
import com.example.demo.modules.aup.dto.AupFieldMoveRequest;
import com.example.demo.modules.aup.dto.AupFieldReviewRequest;
import com.example.demo.modules.aup.dto.AupFieldUpdateRequest;
import com.example.demo.modules.aup.dto.AupFieldVO;
import com.example.demo.modules.aup.dto.ExtractFromTemplateRequest;
import com.example.demo.modules.aup.dto.ExtractFromTemplateResponse;
import com.example.demo.modules.aup.service.AupFieldService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** AUP 字段字典层（ADMIN）。 */
@RestController
@RequestMapping("/api/aup-field")
@Tag(name = "AUP 字段字典", description = "字段字典层 CRUD + 状态机 + 从模板抽取")
public class AupFieldController {

    private final AupFieldService service;
    private final AuthContextService authContextService;

    public AupFieldController(AupFieldService service, AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    private User resolveUser(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) {
            return null;
        }
        return authContextService.resolveUserFromBearer(authHeader);
    }

    @GetMapping
    @Operation(summary = "字段列表")
    public Result<Map<String, Object>> list(
            @RequestParam(value = "folderId", required = false) Long folderId,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "50") int size) {
        List<AupFieldVO> items = service.list(folderId, status, keyword, page, size);
        int total = service.count(folderId, status, keyword);
        Map<String, Object> out = new HashMap<>();
        out.put("items", items);
        out.put("total", total);
        return Result.success(out);
    }

    @PostMapping
    @Operation(summary = "新建字段（DRAFT）")
    public Result<AupFieldVO> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                     @RequestBody AupFieldCreateRequest body) {
        return service.create(body, resolveUser(auth));
    }

    @PutMapping("/{id}")
    @Operation(summary = "修改字段（仅 DRAFT）")
    public Result<AupFieldVO> update(@RequestHeader(value = "Authorization", required = false) String auth,
                                     @PathVariable Long id, @RequestBody AupFieldUpdateRequest body) {
        return service.update(id, body, resolveUser(auth));
    }

    @PutMapping("/{id}/move")
    @Operation(summary = "移动到别的文件夹")
    public Result<Void> move(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable Long id, @RequestBody AupFieldMoveRequest body) {
        return service.move(id, body, resolveUser(auth));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除字段（被原子域引用则拒绝）")
    public Result<Void> remove(@RequestHeader(value = "Authorization", required = false) String auth,
                               @PathVariable Long id) {
        return service.delete(id, resolveUser(auth));
    }

    @GetMapping("/{id}/usage")
    @Operation(summary = "被哪些原子域引用")
    public Result<Map<String, Object>> usage(@PathVariable Long id) {
        return Result.success(service.usage(id));
    }

    @PostMapping("/{id}/submit-review")
    @Operation(summary = "提交审核")
    public Result<?> submitReview(@RequestHeader(value = "Authorization", required = false) String auth,
                                  @PathVariable Long id) {
        return service.submitReview(id, resolveUser(auth));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "通过发布")
    public Result<?> approve(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable Long id) {
        return service.approve(id, resolveUser(auth));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "驳回（意见必填）")
    public Result<?> reject(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable Long id, @RequestBody(required = false) AupFieldReviewRequest body) {
        return service.reject(id, body != null ? body.getComment() : null, resolveUser(auth));
    }

    @PostMapping("/{id}/unfreeze")
    @Operation(summary = "解冻")
    public Result<?> unfreeze(@RequestHeader(value = "Authorization", required = false) String auth,
                              @PathVariable Long id) {
        return service.unfreeze(id, resolveUser(auth));
    }

    @PostMapping("/actions/extract-from-template")
    @Operation(summary = "从已发布计划书模板反向抽取字段入库")
    public Result<ExtractFromTemplateResponse> extractFromTemplate(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody ExtractFromTemplateRequest body) {
        return service.extractFromTemplate(body, resolveUser(auth));
    }
}
