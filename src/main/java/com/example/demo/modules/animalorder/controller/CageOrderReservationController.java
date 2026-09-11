package com.example.demo.modules.animalorder.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.animalorder.service.CageOrderReservationService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 动物订购的笼位预定接口。
 *
 * <p>流程：开规格弹窗 → 拉 {@code /reservable} 渲染本课题组笼架 → 点笼位 {@code POST /}
 * 锁住（预定态，笼位仍是 type2）→ 加入购物车时把预定挂到购物车行；关闭弹窗未加购则
 * {@code POST /{id}/release} 放掉。
 */
@RestController
@RequestMapping("/api/animal-order/cage-reservations")
@Tag(name = "动物订购-笼位预定", description = "加购时把订单锁到 type2 笼位并回填笼位表单")
public class CageOrderReservationController {

    private final CageOrderReservationService service;
    private final AuthContextService authContextService;

    public CageOrderReservationController(CageOrderReservationService service,
                                          AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    @GetMapping("/group-shelves")
    @Operation(summary = "本课题组占用的笼架（抽屉渲染范围，与 AUP 无关）")
    public Result<java.util.List<Map<String, Object>>> groupShelves(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.groupShelves(user.getId()));
    }

    @GetMapping("/reservable")
    @Operation(summary = "该 AUP 名下可点的笼位（只管可点性，不管渲染哪些笼架）")
    public Result<Map<String, Object>> reservable(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam Long aupRecordId) {
        User user = resolveUser(authorization);
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.reservableCages(aupRecordId, user.getId()));
    }

    @PostMapping
    @Operation(summary = "预定笼位（锁定 + 把订购信息写进笼位表单）")
    public Result<Map<String, Object>> reserve(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ReserveRequest req) {
        User user = resolveUser(authorization);
        if (user == null) return Result.fail(401, "未登录");
        CageOrderReservation row = service.reserve(
                req.aupRecordId, req.animalCageId, req.refDataId, req.specOptionLabel, req.quantity, user.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", String.valueOf(row.getId()));
        out.put("animalCageId", String.valueOf(row.getAnimalCageId()));
        out.put("status", row.getStatus());
        out.put("quantity", row.getQuantity());
        out.put("sex", row.getSex());
        out.put("strainName", row.getStrainName());
        return Result.success(out);
    }

    @GetMapping("/active")
    @Operation(summary = "全部活跃预定（笼架网格打「已被订单预定」标记）")
    public Result<java.util.List<Map<String, Object>>> active(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        if (user == null) return Result.fail(401, "未登录");
        return Result.success(service.listActiveViews());
    }

    @PostMapping("/{id}/release")
    @Operation(summary = "释放预定（关闭弹窗未加购 / 换笼位）")
    public Result<Map<String, Object>> release(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        if (user == null) return Result.fail(401, "未登录");
        service.release(id, "手动释放");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return Result.success(out);
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(com.example.demo.common.enums.RoleEnum.MEMBER);
        return user;
    }

    /** 预定请求体。specOptionLabel 用规格选项原文（「模板名: 选项」）。 */
    public static class ReserveRequest {
        public Long aupRecordId;
        public Long animalCageId;
        public Long refDataId;
        public String specOptionLabel;
        public Integer quantity;
    }
}
