package com.example.demo.modules.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.dahua.service.DahuaTvWallService;
import com.example.demo.modules.dahua.service.DahuaVideoChannelCategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 电视墙（视频上墙）。前端：选电视墙 → 挑通道拖进窗口 → 立即上墙 / 存为预设。
 * 全部为人工操作，预留后续小程序与自动计划复用同一套接口。
 */
@RestController
@RequestMapping("/api/v1/dahua/tvwall")
@Tag(name = "大华电视墙", description = "电视墙、通道、布局上墙与预设")
public class DahuaTvWallController {

    private final DahuaTvWallService tvWallService;
    private final DahuaVideoChannelCategoryService videoCategoryService;

    public DahuaTvWallController(DahuaTvWallService tvWallService,
                                 DahuaVideoChannelCategoryService videoCategoryService) {
        this.tvWallService = tvWallService;
        this.videoCategoryService = videoCategoryService;
    }

    @GetMapping("/list")
    @Operation(summary = "电视墙列表")
    public Result<List<Map<String, Object>>> list() {
        return Result.success(tvWallService.listTvWalls());
    }

    @GetMapping("/detail")
    @Operation(summary = "电视墙详情（含物理屏幕布局）")
    public Result<Map<String, Object>> detail(@RequestParam String tvWallId) {
        return Result.success(tvWallService.getTvWall(tvWallId));
    }

    @GetMapping("/current")
    @Operation(summary = "各电视墙当前正在播放的任务")
    public Result<List<Map<String, Object>>> current(@RequestParam(required = false) String tvWallId) {
        return Result.success(tvWallService.listCurrentTasks(tvWallId));
    }

    @GetMapping("/capacity")
    @Operation(summary = "电视墙屏幕容量")
    public Result<Map<String, Object>> capacity(@RequestParam String tvWallId) {
        return Result.success(tvWallService.getCapacity(tvWallId));
    }

    @GetMapping("/channels")
    @Operation(summary = "可用视频通道（IPC + NVR），上墙的通道源")
    public Result<List<Map<String, Object>>> channels() {
        return Result.success(tvWallService.listVideoChannels());
    }

    @GetMapping("/tasks")
    @Operation(summary = "某电视墙的预设列表")
    public Result<List<Map<String, Object>>> tasks(@RequestParam String tvWallId) {
        return Result.success(tvWallService.listTasks(tvWallId));
    }

    @GetMapping("/task")
    @Operation(summary = "预设详情（含 TVWallScheme XML）")
    public Result<Map<String, Object>> task(@RequestParam String tvWallId,
                                            @RequestParam String taskId) {
        return Result.success(tvWallService.getTask(tvWallId, taskId));
    }

    @PostMapping("/apply")
    @Operation(summary = "应用已有预设（立即上墙）")
    public Result<Map<String, Object>> apply(@RequestBody Map<String, String> body) {
        String tvWallId = body.getOrDefault("tvWallId", "1");
        String taskId = body.get("taskId");
        if (taskId == null || taskId.isBlank()) {
            return Result.error("taskId 不能为空");
        }
        return Result.success(tvWallService.applyTask(tvWallId, taskId));
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/layout")
    @Operation(summary = "按屏上墙：screens=[{screenId, splitNum, windows}]（未提到的屏 = 清空该屏）")
    public Result<Map<String, Object>> layout(@RequestBody Map<String, Object> body) {
        String tvWallId = String.valueOf(body.getOrDefault("tvWallId", "1"));
        Object screens = body.get("screens");
        if (screens instanceof List) {
            return Result.success(tvWallService.operateScreens(tvWallId, (List<Map<String, Object>>) screens));
        }
        // 兼容旧调用：同一宫格与窗口铺到墙上每一块屏
        Integer splitNum = body.get("splitNum") == null ? 0
                : Integer.valueOf(String.valueOf(body.get("splitNum")));
        List<Map<String, Object>> windows = (List<Map<String, Object>>) body.get("windows");
        return Result.success(tvWallService.operateLayout(tvWallId, splitNum, windows));
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/preset/save")
    @Operation(summary = "保存/另存预设（taskId 传空为新建）")
    public Result<Map<String, Object>> savePreset(@RequestBody Map<String, Object> body) {
        String tvWallId = String.valueOf(body.getOrDefault("tvWallId", "1"));
        String taskId = body.get("taskId") == null ? null : String.valueOf(body.get("taskId"));
        String taskName = body.get("taskName") == null ? null : String.valueOf(body.get("taskName"));
        if (taskName == null || taskName.isBlank()) {
            return Result.error("taskName 不能为空");
        }
        Object screens = body.get("screens");
        if (screens instanceof List) {
            return Result.success(tvWallService.savePreset(
                    tvWallId, taskId, taskName, (List<Map<String, Object>>) screens));
        }
        Integer splitNum = body.get("splitNum") == null ? 0
                : Integer.valueOf(String.valueOf(body.get("splitNum")));
        List<Map<String, Object>> windows = (List<Map<String, Object>>) body.get("windows");
        return Result.success(tvWallService.savePreset(tvWallId, taskId, taskName, splitNum, windows));
    }

    @PostMapping("/preset/rename")
    @Operation(summary = "重命名预设（保留方案内容，只换名字）")
    public Result<Map<String, Object>> renamePreset(@RequestBody Map<String, String> body) {
        String tvWallId = body.getOrDefault("tvWallId", "1");
        String taskId = body.get("taskId");
        if (taskId == null || taskId.isBlank()) {
            return Result.error("taskId 不能为空");
        }
        return Result.success(tvWallService.renamePreset(tvWallId, taskId, body.get("taskName")));
    }

    @PostMapping("/preset/delete")
    @Operation(summary = "删除预设")
    public Result<Map<String, Object>> deletePreset(@RequestBody Map<String, String> body) {
        String tvWallId = body.getOrDefault("tvWallId", "1");
        String taskId = body.get("taskId");
        if (taskId == null || taskId.isBlank()) {
            return Result.error("taskId 不能为空");
        }
        return Result.success(tvWallService.deletePreset(tvWallId, taskId));
    }

    // ---------------- 参观模式：预设播放队列 ----------------

    @GetMapping("/tour")
    @Operation(summary = "这面墙的参观顺序（预设 id 有序）")
    public Result<List<String>> tour(@RequestParam String tvWallId) {
        return Result.success(tvWallService.listTour(tvWallId));
    }

    @PutMapping("/tour")
    @Operation(summary = "整队替换参观顺序（taskIds 的顺序即播放顺序）")
    @SuppressWarnings("unchecked")
    public Result<List<String>> saveTour(@RequestBody Map<String, Object> body) {
        String tvWallId = String.valueOf(body.getOrDefault("tvWallId", "1"));
        Object ids = body.get("taskIds");
        List<String> list = new ArrayList<>();
        if (ids instanceof List) {
            for (Object o : (List<Object>) ids) {
                if (o != null) {
                    list.add(String.valueOf(o));
                }
            }
        }
        return Result.success(tvWallService.replaceTour(tvWallId, list));
    }

    // ---------------- 监控分类树 ----------------
    // 独立于门禁通道的备注分类（`/v1/dahua/meta/device-channels/remark-categories`）：
    // 那套是给门禁通道打扁平标签，这套是监控画面自己的文件夹树。

    @GetMapping("/categories")
    @Operation(summary = "监控分类树（扁平节点列表，含每个节点直挂的通道数）")
    public Result<List<Map<String, Object>>> categories() {
        return Result.success(videoCategoryService.listTree());
    }

    @PostMapping("/categories/rebuild")
    @Operation(summary = "重建监控分类树（按通道名重新分楼层/相机组）")
    public Result<Map<String, Object>> rebuildCategories() {
        return Result.success(videoCategoryService.rebuild());
    }

    @PostMapping("/categories")
    @Operation(summary = "新增文件夹")
    public Result<Map<String, Object>> createCategory(@RequestBody Map<String, Object> body) {
        Long parentId = body.get("parentId") == null ? null
                : Long.valueOf(String.valueOf(body.get("parentId")));
        String name = body.get("name") == null ? null : String.valueOf(body.get("name"));
        return Result.success(videoCategoryService.createNode(parentId, name));
    }

    @PutMapping("/categories/{id}")
    @Operation(summary = "重命名文件夹")
    public Result<Void> renameCategory(@PathVariable long id, @RequestBody Map<String, Object> body) {
        videoCategoryService.renameNode(id, body.get("name") == null ? null : String.valueOf(body.get("name")));
        return Result.success();
    }

    @DeleteMapping("/categories/{id}")
    @Operation(summary = "删除文件夹（仅空文件夹，先删子文件夹）")
    public Result<Void> deleteCategory(@PathVariable long id) {
        videoCategoryService.deleteNode(id);
        return Result.success();
    }

    @PatchMapping("/channels/{id}/category")
    @Operation(summary = "把通道挪到某个分类节点（categoryId 为空 = 移出到未分类）")
    public Result<Void> assignChannelCategory(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Long categoryId = body.get("categoryId") == null ? null
                : Long.valueOf(String.valueOf(body.get("categoryId")));
        videoCategoryService.assignChannel(id, categoryId);
        return Result.success();
    }

    @PatchMapping("/channels/{id}/link")
    @Operation(summary = "设置通道的设备跳转地址（空串 = 清除）")
    public Result<Void> setChannelLink(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String url = body.get("linkUrl") == null ? null : String.valueOf(body.get("linkUrl"));
        videoCategoryService.setChannelLink(id, url);
        return Result.success();
    }
}
