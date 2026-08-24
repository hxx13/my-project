package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aup.dto.DictCreateRequest;
import com.example.demo.modules.aup.dto.DictDetailVO;
import com.example.demo.modules.aup.dto.DictItemCreateRequest;
import com.example.demo.modules.aup.dto.DictItemUpdateRequest;
import com.example.demo.modules.aup.dto.DictItemVO;
import com.example.demo.modules.aup.dto.DictRenameRequest;
import com.example.demo.modules.aup.dto.DictReviewRequest;
import com.example.demo.modules.aup.dto.DictUsageVO;
import com.example.demo.modules.aup.dto.DictVerdictRequest;
import com.example.demo.modules.aup.dto.DictVersionVO;
import com.example.demo.modules.aup.service.AupDictService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** AUP 公共字典管理（管理员）。 */
@RestController
@RequestMapping("/api/aup-dict")
@Tag(name = "AUP 字典", description = "公共字典 + 字典项管理 + 版本状态机")
public class AupDictController {

    private final AupDictService service;
    private final AuthContextService authContextService;

    public AupDictController(AupDictService service, AuthContextService authContextService) {
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
    @Operation(summary = "字典分页列表（可按分类筛选）")
    public Result<Map<String, Object>> list(
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "category", required = false) String category,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        return Result.success(service.listDicts(keyword, category, page, size));
    }

    @PostMapping
    @Operation(summary = "新建字典（version=1,status=DRAFT）")
    public Result<DictDetailVO> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                       @RequestBody DictCreateRequest body) {
        return service.createDict(body, resolveUser(auth));
    }

    @GetMapping("/{dictKey}")
    @Operation(summary = "字典详情（含有序项；version 参数按版本取）")
    public Result<DictDetailVO> get(@PathVariable String dictKey,
                                    @RequestParam(value = "version", required = false) Integer version) {
        DictDetailVO vo = service.getDict(dictKey, version);
        return vo != null ? Result.success(vo) : Result.error("字典不存在");
    }

    @PutMapping("/{dictKey}")
    @Operation(summary = "字典改名")
    public Result<?> rename(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable String dictKey, @RequestBody DictRenameRequest body) {
        return service.renameDict(dictKey, body, resolveUser(auth));
    }

    @DeleteMapping("/{dictKey}")
    @Operation(summary = "删除字典（校验无字段引用）")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable String dictKey) {
        return service.deleteDict(dictKey, resolveUser(auth));
    }

    @PostMapping("/{dictKey}/items")
    @Operation(summary = "新增字典项")
    public Result<DictItemVO> addItem(@RequestHeader(value = "Authorization", required = false) String auth,
                                      @PathVariable String dictKey, @RequestBody DictItemCreateRequest body) {
        return service.addItem(dictKey, body, resolveUser(auth));
    }

    @PutMapping("/{dictKey}/items/{itemId}")
    @Operation(summary = "修改字典项（value 稳定码不可改）")
    public Result<?> updateItem(@RequestHeader(value = "Authorization", required = false) String auth,
                                @PathVariable String dictKey, @PathVariable Long itemId,
                                @RequestBody DictItemUpdateRequest body) {
        return service.updateItem(dictKey, itemId, body, resolveUser(auth));
    }

    @DeleteMapping("/{dictKey}/items/{itemId}")
    @Operation(summary = "删除字典项")
    public Result<?> deleteItem(@RequestHeader(value = "Authorization", required = false) String auth,
                                @PathVariable String dictKey, @PathVariable Long itemId) {
        return service.deleteItem(dictKey, itemId, resolveUser(auth));
    }

    @PutMapping("/{dictKey}/items/reorder")
    @Operation(summary = "字典项排序")
    public Result<?> reorder(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable String dictKey, @RequestBody List<Long> itemIds) {
        return service.reorderItems(dictKey, itemIds, resolveUser(auth));
    }

    /* ── 版本状态机 ── */

    @GetMapping("/{dictKey}/versions")
    @Operation(summary = "版本列表")
    public Result<List<DictVersionVO>> versions(@PathVariable String dictKey) {
        return Result.success(service.listVersions(dictKey));
    }

    @GetMapping("/{dictKey}/usage")
    @Operation(summary = "引用链")
    public Result<DictUsageVO> usage(@PathVariable String dictKey) {
        return Result.success(service.getUsage(dictKey));
    }

    @PostMapping("/{dictKey}/submit-review")
    @Operation(summary = "提交审核 DRAFT→PENDING_REVIEW")
    public Result<?> submitReview(@RequestHeader(value = "Authorization", required = false) String auth,
                                  @PathVariable String dictKey) {
        return service.submitReview(dictKey, resolveUser(auth));
    }

    @PostMapping("/{dictKey}/approve")
    @Operation(summary = "通过发布 PENDING_REVIEW→PUBLISHED")
    public Result<?> approve(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable String dictKey,
                             @RequestBody(required = false) DictReviewRequest body) {
        return service.approve(dictKey, body != null ? body.getComment() : null, resolveUser(auth));
    }

    @PostMapping("/{dictKey}/reject")
    @Operation(summary = "驳回 PENDING_REVIEW→DRAFT（意见必填）")
    public Result<?> reject(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable String dictKey, @RequestBody DictReviewRequest body) {
        return service.reject(dictKey, body != null ? body.getComment() : null, resolveUser(auth));
    }

    @PostMapping("/{dictKey}/unfreeze")
    @Operation(summary = "解冻 PUBLISHED→DRAFT（无字段引用才可）")
    public Result<?> unfreeze(@RequestHeader(value = "Authorization", required = false) String auth,
                              @PathVariable String dictKey) {
        return service.unfreeze(dictKey, resolveUser(auth));
    }

    @PostMapping("/{dictKey}/draft")
    @Operation(summary = "从已发布版克隆新草稿")
    public Result<DictVersionVO> draft(@RequestHeader(value = "Authorization", required = false) String auth,
                                       @PathVariable String dictKey) {
        return service.draft(dictKey, resolveUser(auth));
    }

    @PostMapping("/{dictKey}/items/{itemId}/verdict")
    @Operation(summary = "逐项校对四态")
    public Result<?> verdict(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable String dictKey, @PathVariable Long itemId,
                             @RequestBody DictVerdictRequest body) {
        return service.setVerdict(dictKey, itemId, body, resolveUser(auth));
    }
}
