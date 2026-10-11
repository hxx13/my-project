package com.example.demo.modules.ai.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.ai.bootstrap.AiDrawerWriteStore.CapabilityItem;
import com.example.demo.modules.ai.service.AiDrawerContentService;
import com.example.demo.modules.ai.service.AiDrawerWriteService;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * AI 对话抽屉内容的接口：**只读**的界面固定文案 + 能力提示词清单（载体无关，小程序抽屉与 web 球球面板共用），
 * 以及**仅超管及以上**可调的两个写口（{@code /copy} 保存文案、{@code /capabilities} 整份保存能力清单）。
 *
 * <p>身份一律来自 JWT（{@code Authorization} 头）。路径落在 {@code /api/v1/**}，
 * 已被 {@code apiAuthInterceptor} 覆盖，**不需要改 WebMvcConfig**。
 *
 * <p>能力清单按调用者**视角**过滤：视角判据同工具包注入（{@code AiOrchestrator#viewOf}），
 * 即 {@link CageModeVisibilityService#isStudent} 经 {@link AiView#of} 取值 —— 同一处判定，不另写一套。
 */
@RestController
@RequestMapping("/api/v1/ai/drawer")
@Tag(name = "AI 对话抽屉内容", description = "抽屉的固定文案与能力提示词清单，两端共用")
public class AiDrawerController {

    private final AuthContextService authContextService;
    private final CageModeVisibilityService modeVisibilityService;
    private final AiDrawerContentService contentService;
    private final AiDrawerWriteService writeService;

    public AiDrawerController(AuthContextService authContextService,
                              CageModeVisibilityService modeVisibilityService,
                              AiDrawerContentService contentService,
                              AiDrawerWriteService writeService) {
        this.authContextService = authContextService;
        this.modeVisibilityService = modeVisibilityService;
        this.contentService = contentService;
        this.writeService = writeService;
    }

    @GetMapping("/content")
    @Operation(summary = "抽屉内容：copy（键→文案，键集合固定在代码清单）+ capabilities（本视角启用中的提示词，按 sort_order 分组）")
    public Result<Map<String, Object>> content(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        AiView view = AiView.of(modeVisibilityService.isStudent(user));
        // 角色档：audience 写 ADMIN / SUPER_ADMIN 的条目只有够级别的才发（工具包的能力闸门就是这么分的）。
        // 取不到角色时按最低档处理 —— 宁可少给管理员条目，也不要把够不到的能力铺给所有人。
        int roleLevel = user.getRole() != null ? user.getRole().getLevel() : RoleEnum.MEMBER.getLevel();
        return Result.success(contentService.content(view, roleLevel));
    }

    /**
     * 输入框上方的**推荐指令条**（两端共用）：按调用者**个人使用频次**排序，点一条回填输入框。
     *
     * <p>与 {@code /content} **分开、而不是塞进它**：详情页要的是**全量分组**，指令条要的是
     * **截断后的个人热榜** —— 两者排序口径不同，混在一个载荷里迟早互相打脸。
     *
     * <p>{@code limit} 传 0 或不传 = 用服务端默认上限；界面自己还会按宽度再截一次。
     */
    @GetMapping("/recommended")
    @Operation(summary = "推荐指令条：按个人使用频次排序的启用卡片（含全站热度回落），受 limit 截断")
    public Result<List<Map<String, Object>>> recommended(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "limit", required = false, defaultValue = "0") int limit) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        AiView view = AiView.of(modeVisibilityService.isStudent(user));
        int roleLevel = user.getRole() != null ? user.getRole().getLevel() : RoleEnum.MEMBER.getLevel();
        return Result.success(contentService.recommended(view, roleLevel, user.getId(), limit));
    }

    /**
     * **管理端**只读口（**仅 ≥SUPER_ADMIN**）：给编辑态用，返回**未按视角过滤**的整份内容 ——
     * 文案每条带中文名，能力清单每条带 id / groupName / title / promptText / sortOrder / enabled / audience（含停用行）。
     *
     * <p>为什么必须另开一面：编辑器是「读整份 → 改 → 存整份」，若照 {@code /content} 发给它，
     * 就会缺 {@code enabled / audience} 与停用行，存整份时被清空 —— 「谁看得见」全变全员、启用位被重置。
     * 权限判据同写口（{@code AiTimerService#isSuper}），非超管明确拒、不静默。
     */
    @GetMapping("/admin/content")
    @Operation(summary = "管理端抽屉内容（仅超管及以上）：未按视角过滤的完整清单，含 enabled/audience 与每键中文名")
    public Result<?> adminContent(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(contentService.adminContent(user));
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 保存抽屉文案（**仅 ≥SUPER_ADMIN**）。
     *
     * <p>请求体是「键 → 新值」的对象，例如 {@code {"ai.copy.detail.title":"我能帮你做这些"}}。
     * 键必须落在 {@code ai.copy.*} 白名单内，**有一个越界键就整批拒、一个都不写**；
     * 空串 = 恢复默认。越权（非超管）明确拒，不静默成功。
     */
    @PostMapping("/copy")
    @Operation(summary = "保存抽屉文案（仅超管及以上）：键→新值，键须在 ai.copy. 白名单内，空串=恢复默认")
    public Result<?> saveCopy(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, String> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            int n = writeService.saveCopy(user, body);
            return Result.success(n, "已保存 " + n + " 条文案");
        } catch (IllegalStateException | IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    /**
     * 整份保存能力清单（**仅 ≥SUPER_ADMIN**）：新增 / 修改 / 删除 / 排序一次提交。
     *
     * <p>请求体是一个数组，每条形如
     * {@code {"id":12,"groupName":"笼位与实验","title":"有哪些房间","promptText":"笼架有哪些房间？","sortOrder":100,"enabled":true,"audience":""}}。
     * {@code id} 省略 = 新增；库里在、提交里没有的 id = 删除。这张表只有本功能一个写手，整份保存是安全的。
     */
    @PostMapping("/capabilities")
    @Operation(summary = "整份保存能力清单（仅超管及以上）：提交里没有的 id 即删，sort_order 允许并列")
    public Result<?> saveCapabilities(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody List<CapabilityItem> items) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            return Result.success(writeService.saveCapabilities(user, items));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }
}
