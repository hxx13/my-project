package com.example.demo.modules.broadcast.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.broadcast.client.DsppaClient;
import com.example.demo.modules.broadcast.dto.PlanRequest;
import com.example.demo.modules.broadcast.dto.PlayRequest;
import com.example.demo.modules.broadcast.dto.SongListNameRequest;
import com.example.demo.modules.broadcast.dto.SongMoveRequest;
import com.example.demo.modules.broadcast.dto.StopRequest;
import com.example.demo.modules.broadcast.dto.VolumeRequest;
import com.example.demo.modules.broadcast.dto.ZoneResumeRequest;
import com.example.demo.modules.broadcast.service.BroadcastPlanService;
import com.example.demo.modules.broadcast.service.BroadcastPlayService;
import com.example.demo.modules.broadcast.service.BroadcastSongsService;
import com.example.demo.modules.broadcast.service.BroadcastZoneControlService;
import com.example.demo.modules.broadcast.service.BroadcastZonesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 网络广播管理接口。**ADMIN 及以上**。
 *
 * <p>前缀 /api/admin/** 已由 adminAuthInterceptor 把关，方法内再自守一道（仓库惯例）。
 *
 * <p>这套接口是**业务能力的唯一出口**：后台页面与小程序共用同一份实现，
 * 平台命令与「先选中分区再下发」那套机制都封在下层，不会漏到这里。
 *
 * <p>查询类接口在未连接时**降级返回**（带 connected=false），不报错；
 * 写操作在未连接时直接报错，不做隐式重连 —— 播出类操作不能悄悄发生。
 */
@RestController
@RequestMapping("/api/admin/broadcast")
@Tag(name = "网络广播", description = "DSPPA 广播平台接入：连接状态、分区与音量、曲库上传、定时播放")
public class AdminBroadcastController {

    private final DsppaClient client;
    private final BroadcastZonesService zonesService;
    private final BroadcastSongsService songsService;
    private final BroadcastPlayService playService;
    private final BroadcastPlanService planService;
    private final BroadcastZoneControlService zoneControlService;
    private final AuthContextService authContextService;

    public AdminBroadcastController(DsppaClient client,
                                    BroadcastZonesService zonesService,
                                    BroadcastSongsService songsService,
                                    BroadcastPlayService playService,
                                    BroadcastPlanService planService,
                                    BroadcastZoneControlService zoneControlService,
                                    AuthContextService authContextService) {
        this.client = client;
        this.zonesService = zonesService;
        this.songsService = songsService;
        this.playService = playService;
        this.planService = planService;
        this.zoneControlService = zoneControlService;
        this.authContextService = authContextService;
    }

    // ---------------------------------------------------------------- 连接

    @GetMapping("/status")
    @Operation(summary = "连接与登录状态")
    public Result<?> status(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(client.status());
    }

    @PostMapping("/reconnect")
    @Operation(summary = "重新连接（断线时用）")
    public Result<?> reconnect(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            client.reconnectNow();
            return Result.success(client.status(), "已发起重连");
        } catch (Exception e) {
            return Result.error("重连失败: " + readableError(e));
        }
    }

    @PostMapping("/relogin")
    @Operation(summary = "重新登录（会话失效时用）")
    public Result<?> relogin(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            client.reloginNow();
            return Result.success(client.status(), "已发起重新登录");
        } catch (Exception e) {
            return Result.error("重新登录失败: " + readableError(e));
        }
    }

    // ---------------------------------------------------------------- 分区与音量

    @GetMapping("/zones")
    @Operation(summary = "分区列表（含音量、播放状态、当前曲目）")
    public Result<?> zones(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        if (!client.isLoggedIn()) {
            // 查询类降级：把连接状态一并给出，前端好显示「重新连接」按钮
            Map<String, Object> degraded = new LinkedHashMap<>();
            degraded.put("connected", client.isConnected());
            degraded.put("loggedIn", false);
            degraded.put("zones", List.of());
            return Result.success(degraded, "广播平台未登录");
        }
        try {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("connected", true);
            out.put("loggedIn", true);
            out.put("zones", zonesService.listZones());
            return Result.success(out);
        } catch (Exception e) {
            return Result.error("读取分区失败: " + readableError(e));
        }
    }

    @PutMapping("/zones/volume")
    @Operation(summary = "批量设置音量")
    public Result<?> setVolume(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestBody VolumeRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            zonesService.setVolume(body.macs(), body.volume());
            return Result.success(zonesService.listZones(), "音量已设置");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("设置音量失败: " + readableError(e));
        }
    }

    // ---------------------------------------------------------------- 立即播放

    @PostMapping("/play")
    @Operation(summary = "立即播放")
    public Result<?> play(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestBody PlayRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            playService.play(body.macs(), body.songPath(), body.volume(),
                    BroadcastPlayService.SOURCE_MANUAL, null, operatorOf(user));
            return Result.success(null, "已下发播放");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("播放失败: " + readableError(e));
        }
    }

    @PostMapping("/stop")
    @Operation(summary = "停止播放")
    public Result<?> stop(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestBody StopRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            playService.stop(body.macs(), BroadcastPlayService.SOURCE_MANUAL, null, operatorOf(user));
            return Result.success(null, "已下发停止");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("停止失败: " + readableError(e));
        }
    }

    // ---------------------------------------------------------------- 分区级独立控制
    //
    // 方案只是「批量启动器」：启动之后每一路分区独立。下面这两组接口就是「只动这一路」，
    // 不会波及其它分区；被人工暂停的分区，方案的循环/兜底也不会再把它带起来。

    @PostMapping("/zones/pause")
    @Operation(summary = "只暂停这几路分区（其余不受影响）")
    public Result<?> pauseZones(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestBody StopRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            zoneControlService.pauseZones(body.macs(), operatorOf(user));
            return Result.success(null, "已暂停所选分区");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("暂停失败: " + readableError(e));
        }
    }

    @PostMapping("/zones/resume")
    @Operation(summary = "只恢复这几路分区")
    public Result<?> resumeZones(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestBody ZoneResumeRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            zoneControlService.resumeZones(body.macs(), body.songPath(), operatorOf(user));
            return Result.success(null, "已恢复所选分区");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("恢复失败: " + readableError(e));
        }
    }

    @GetMapping("/active")
    @Operation(summary = "正在执行的方案与逐分区状态")
    public Result<?> active(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(zoneControlService.activeView());
        } catch (Exception e) {
            return Result.error("读取执行状态失败: " + readableError(e));
        }
    }

    // ---------------------------------------------------------------- 曲库

    @GetMapping("/song-lists")
    @Operation(summary = "曲库列表及曲目")
    public Result<?> songLists(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(songsService.listSongLists());
        } catch (Exception e) {
            return Result.error("读取曲库失败: " + readableError(e));
        }
    }

    @PostMapping("/song-lists")
    @Operation(summary = "新建曲库列表（文件夹）")
    public Result<?> createSongList(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestBody SongListNameRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(songsService.createList(body.listName()), "已新建列表");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("新建列表失败: " + readableError(e));
        }
    }

    @PutMapping("/song-lists/{id}")
    @Operation(summary = "曲库列表改名")
    public Result<?> renameSongList(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable("id") String id,
                                    @RequestBody SongListNameRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            songsService.renameList(id, body.listName());
            return Result.success(null, "已改名");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("改名失败: " + readableError(e));
        }
    }

    /** 删除列表：只摘掉列表本身，**不删音频文件**。 */
    @DeleteMapping("/song-lists/{id}")
    @Operation(summary = "删除曲库列表（不动音频文件）")
    public Result<?> deleteSongList(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable("id") String id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            songsService.deleteList(id);
            return Result.success(null, "已删除列表");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("删除列表失败: " + readableError(e));
        }
    }

    @PostMapping("/song-lists/{id}/songs")
    @Operation(summary = "把曲目加入列表")
    public Result<?> addSongToList(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable("id") String id,
                                   @RequestParam("path") String songPath) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            songsService.addSongToList(id, songPath);
            return Result.success(null, "已加入列表");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("加入列表失败: " + readableError(e));
        }
    }

    /** 从列表移除曲目：**不删音频文件**。 */
    @DeleteMapping("/song-lists/{id}/songs")
    @Operation(summary = "把曲目移出列表（不动音频文件）")
    public Result<?> removeSongFromList(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @PathVariable("id") String id,
                                        @RequestParam("path") String songPath) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            songsService.removeSongFromList(id, songPath);
            return Result.success(null, "已移出列表");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("移出列表失败: " + readableError(e));
        }
    }

    @PostMapping("/songs/move")
    @Operation(summary = "把曲目移到另一个列表（不动音频文件）")
    public Result<?> moveSong(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @RequestBody SongMoveRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            songsService.moveSong(body.fromListId(), body.toListId(), body.songPath());
            return Result.success(null, "已移动");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("移动失败: " + readableError(e));
        }
    }

    @PostMapping("/songs/upload")
    @Operation(summary = "上传音频到曲库（可多文件）")
    public Result<?> uploadSongs(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam("listId") String listId,
                                 @RequestParam("files") MultipartFile[] files) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        if (files == null || files.length == 0) {
            return Result.error("未选择文件");
        }
        List<Map<String, Object>> results = new ArrayList<>();
        int ok = 0;
        for (MultipartFile f : files) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("fileName", f.getOriginalFilename());
            one.put("size", f.getSize());
            try {
                one.put("path", songsService.uploadSong(f, listId));
                one.put("success", true);
                ok++;
            } catch (IllegalArgumentException e) {
                one.put("success", false);
                one.put("message", e.getMessage());
            } catch (Exception e) {
                one.put("success", false);
                one.put("message", readableError(e));
            }
            results.add(one);
        }
        String msg = "上传完成：" + ok + "/" + files.length + " 成功";
        return ok == files.length ? Result.success(results, msg) : Result.fail(500, msg);
    }

    // ---------------------------------------------------------------- 定时方案

    @GetMapping("/plans")
    @Operation(summary = "定时方案列表")
    public Result<?> listPlans(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(planService.list());
    }

    @PostMapping("/plans")
    @Operation(summary = "新建定时方案")
    public Result<?> createPlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestBody PlanRequest body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            return Result.success(planService.create(body, operatorOf(user)));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("新建方案失败: " + readableError(e));
        }
    }

    @PutMapping("/plans/{id}")
    @Operation(summary = "修改定时方案")
    public Result<?> updatePlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable("id") Long id,
                                @RequestBody PlanRequest body) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(planService.update(id, body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("修改方案失败: " + readableError(e));
        }
    }

    @DeleteMapping("/plans/{id}")
    @Operation(summary = "删除定时方案")
    public Result<?> deletePlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable("id") Long id) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            planService.delete(id);
            return Result.success(null, "已删除");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("删除方案失败: " + readableError(e));
        }
    }

    @PostMapping("/plans/{id}/toggle")
    @Operation(summary = "启用/停用定时方案")
    public Result<?> togglePlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable("id") Long id,
                                @RequestParam("enabled") Boolean enabled) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(planService.toggle(id, enabled));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("操作失败: " + readableError(e));
        }
    }

    @PostMapping("/plans/{id}/run")
    @Operation(summary = "立刻试跑一次")
    public Result<?> runPlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @PathVariable("id") Long id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            planService.runNow(id, operatorOf(user));
            return Result.success(null, "已下发播放");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("试跑失败: " + readableError(e));
        }
    }

    @PostMapping("/plans/{id}/pause")
    @Operation(summary = "暂停整个方案（调度器不再自动重发）")
    public Result<?> pausePlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable("id") Long id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            planService.pausePlan(id, operatorOf(user));
            return Result.success(null, "方案已暂停");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("暂停方案失败: " + readableError(e));
        }
    }

    @PostMapping("/plans/{id}/resume")
    @Operation(summary = "恢复整个方案")
    public Result<?> resumePlan(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable("id") Long id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        Result<?> denied = requireAdmin(user);
        if (denied != null) return denied;
        try {
            planService.resumePlan(id, operatorOf(user));
            return Result.success(null, "方案已恢复");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("恢复方案失败: " + readableError(e));
        }
    }

    // ---------------------------------------------------------------- 播放记录

    @GetMapping("/play-logs")
    @Operation(summary = "播放记录")
    public Result<?> playLogs(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @RequestParam(value = "planId", required = false) Long planId,
                              @RequestParam(value = "limit", defaultValue = "100") int limit) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(playService.recentLogs(planId, limit));
        } catch (Exception e) {
            return Result.error("读取播放记录失败: " + readableError(e));
        }
    }

    // ---------------------------------------------------------------- 内部

    private String operatorOf(User user) {
        if (user == null) {
            return null;
        }
        if (user.getName() != null && !user.getName().isBlank()) {
            return user.getName();
        }
        return user.getUsername();
    }

    private Result<?> requireAdmin(String authorization) {
        return requireAdmin(authContextService.resolveUserFromBearer(authorization));
    }

    private Result<?> requireAdmin(User user) {
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private String readableError(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = throwable.getMessage();
        }
        if (msg == null || msg.isBlank()) {
            return "未知错误（无可读错误信息）";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }
}
