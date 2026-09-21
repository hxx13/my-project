package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageVetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 兽医收件箱：兽医在笼架页那个入口背后的接口。
 *
 * <p>门槛统一是 {@code cage.vet.inbox}（默认勾给 VETERINARIAN 身份，超管走逃生口），
 * 所以每个端点都先过 {@link CageVetService#canEnter}；不带笼位 id 的读接口不下发别人看不到的数据 ——
 * 列表里只回「有消息的笼位」，与网格里能看见的笼位是同一批。
 */
@RestController
@RequestMapping("/api/cage-vet")
@Tag(name = "兽医收件箱")
public class CageVetController {

    private final AuthContextService authContextService;
    private final CageVetService vetService;

    public CageVetController(AuthContextService authContextService, CageVetService vetService) {
        this.authContextService = authContextService;
        this.vetService = vetService;
    }

    private User resolveUser(HttpServletRequest request) {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }

    @GetMapping("/entry")
    @Operation(summary = "入口探测：只回能否进入与未读数，给小程序笼架页那枚图标用（不必为此拉整份列表）")
    public Result<Map<String, Object>> entry(HttpServletRequest request) {
        User u = resolveUser(request);
        if (u == null) return Result.fail(401, "未登录");
        boolean canEnter = vetService.canEnter(u);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("canEnter", canEnter);
        out.put("unreadCount", canEnter ? vetService.unreadCount() : 0);
        return Result.success(out);
    }

    @GetMapping("/inbox")
    @Operation(summary = "兽医收件箱（列表 + 未读数；无可进权限时 canEnter=false）")
    public Result<Map<String, Object>> inbox(HttpServletRequest request) {
        User u = resolveUser(request);
        if (u == null) return Result.fail(401, "未登录");
        Map<String, Object> out = new LinkedHashMap<>();
        boolean canEnter = vetService.canEnter(u);
        out.put("canEnter", canEnter);
        // 没权限就只回一个 false，连条数都不给（角标也算信息泄露）
        out.put("unreadCount", canEnter ? vetService.unreadCount() : 0);
        out.put("messages", canEnter ? vetService.inbox() : List.of());
        return Result.success(out);
    }

    @PostMapping("/messages/{id}/read")
    @Operation(summary = "点「已查看」：清掉该条的未读（网格紫色描边随之消失）")
    public Result<?> markRead(@PathVariable long id, HttpServletRequest request) {
        User u = resolveUser(request);
        if (u == null) return Result.fail(401, "未登录");
        if (!vetService.canEnter(u)) return Result.fail(403, "无兽医收件箱权限");
        vetService.markRead(id, u.getId());
        return Result.success(Map.of("ok", true, "unreadCount", vetService.unreadCount()));
    }

    @PostMapping("/messages/read-all")
    @Operation(summary = "一键查看：把所有未读一次清掉")
    public Result<?> markAllRead(HttpServletRequest request) {
        User u = resolveUser(request);
        if (u == null) return Result.fail(401, "未登录");
        if (!vetService.canEnter(u)) return Result.fail(403, "无兽医收件箱权限");
        int n = vetService.markAllRead(u.getId());
        return Result.success(Map.of("ok", true, "cleared", n, "unreadCount", vetService.unreadCount()));
    }

    /** body: {@code { animalCageId, text, images: [url...] }} —— 指导意见按**笼位**落，不按消息。 */
    @PostMapping("/advice")
    @Operation(summary = "写兽医指导意见（文字 + 图片）：落到表单字段，随表单归档")
    public Result<?> saveAdvice(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = resolveUser(request);
        if (u == null) return Result.fail(401, "未登录");
        if (!vetService.canEnter(u)) return Result.fail(403, "无兽医收件箱权限");
        Long cageId = toLong(body == null ? null : body.get("animalCageId"));
        if (cageId == null) return Result.fail(400, "animalCageId 必填");
        String text = body.get("text") == null ? "" : String.valueOf(body.get("text"));
        List<String> images = new ArrayList<>();
        if (body.get("images") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) images.add(String.valueOf(o));
            }
        }
        vetService.saveAdvice(cageId, text, images, u.getId());
        return Result.success(Map.of("ok", true));
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
