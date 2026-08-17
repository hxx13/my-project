package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.aup.dto.DictCreateRequest;
import com.example.demo.modules.aup.dto.DictDetailVO;
import com.example.demo.modules.aup.dto.DictItemCreateRequest;
import com.example.demo.modules.aup.dto.DictItemUpdateRequest;
import com.example.demo.modules.aup.dto.DictItemVO;
import com.example.demo.modules.aup.dto.DictRenameRequest;
import com.example.demo.modules.aup.service.AupDictService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** AUP 公共字典管理（管理员）。 */
@RestController
@RequestMapping("/api/aup-dict")
@Tag(name = "AUP 字典", description = "公共字典 + 字典项管理")
public class AupDictController {

    private final AupDictService service;

    public AupDictController(AupDictService service) {
        this.service = service;
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
    @Operation(summary = "新建字典")
    public Result<DictDetailVO> create(@RequestBody DictCreateRequest body) {
        return service.createDict(body);
    }

    @GetMapping("/{dictKey}")
    @Operation(summary = "字典详情（含有序项）")
    public Result<DictDetailVO> get(@PathVariable String dictKey) {
        DictDetailVO vo = service.getDict(dictKey);
        return vo != null ? Result.success(vo) : Result.error("字典不存在");
    }

    @PutMapping("/{dictKey}")
    @Operation(summary = "字典改名")
    public Result<?> rename(@PathVariable String dictKey, @RequestBody DictRenameRequest body) {
        return service.renameDict(dictKey, body);
    }

    @DeleteMapping("/{dictKey}")
    @Operation(summary = "删除字典（校验无字段引用）")
    public Result<?> delete(@PathVariable String dictKey) {
        return service.deleteDict(dictKey);
    }

    @PostMapping("/{dictKey}/items")
    @Operation(summary = "新增字典项")
    public Result<DictItemVO> addItem(@PathVariable String dictKey, @RequestBody DictItemCreateRequest body) {
        return service.addItem(dictKey, body);
    }

    @PutMapping("/{dictKey}/items/{itemId}")
    @Operation(summary = "修改字典项")
    public Result<?> updateItem(@PathVariable String dictKey, @PathVariable Long itemId,
                                @RequestBody DictItemUpdateRequest body) {
        return service.updateItem(dictKey, itemId, body);
    }

    @DeleteMapping("/{dictKey}/items/{itemId}")
    @Operation(summary = "删除字典项")
    public Result<?> deleteItem(@PathVariable String dictKey, @PathVariable Long itemId) {
        return service.deleteItem(dictKey, itemId);
    }

    @PutMapping("/{dictKey}/items/reorder")
    @Operation(summary = "字典项排序")
    public Result<?> reorder(@PathVariable String dictKey, @RequestBody List<Long> itemIds) {
        return service.reorderItems(dictKey, itemIds);
    }
}
