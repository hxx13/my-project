package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.service.CageRegionGrantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 「我的区域」——饲养组长看自己负责的区域与组员。**只读**。
 *
 * <p>饲养组长是**身份**不是角色（role 可能只是 STAFF），所以这个接口不设角色门槛，
 * 只要求登录：不是组长的人拿到的是「空区域 + 空组员」而不是 403，页面据此显示空态。
 * 组员的纳入/移出与逐人勾权限属第四期 B。
 */
@RestController
@RequestMapping("/api/cage-region")
@Tag(name = "我的区域")
public class CageRegionMineController {

    private final AuthContextService authContextService;
    private final CageRegionGrantService regionGrantService;

    public CageRegionMineController(AuthContextService authContextService,
                                    CageRegionGrantService regionGrantService) {
        this.authContextService = authContextService;
        this.regionGrantService = regionGrantService;
    }

    @GetMapping("/mine")
    @Operation(summary = "我负责的区域与我的组员")
    public Result<Map<String, Object>> mine(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");

        List<Map<String, Object>> regions = new ArrayList<>();
        for (CageRegionGrant g : regionGrantService.leaderRegions(u.getId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("regionType", g.getRegionType());
            m.put("regionId", g.getRegionId());
            regions.add(m);
        }

        // 组员姓名由 SQL join personnel 出（user_id 是 personnel.id，不能交给
        // UserDisplayNameService——它按 staff_id/aro_user_id 建索引，二期踩过这个回归）。
        List<Map<String, Object>> members = new ArrayList<>();
        for (Map<String, Object> row : regionGrantService.memberRows(u.getId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("memberUserId", str(row.get("memberUserId")));
            m.put("memberName", str(row.get("memberName")));
            m.put("regionCount", row.get("regionCount"));
            members.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regions", regions);
        out.put("members", members);
        out.put("isLeader", !regions.isEmpty());
        return Result.success(out);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
