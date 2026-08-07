package com.example.demo.modules.scan.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.asset.service.AssetService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/scan")
@Tag(name = "统一扫码查询", description = "根据二维码/条形码内容自动识别类型并返回目标信息")
public class ScanLookupController {

    private final AuthContextService authContextService;
    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper indexMapper;
    private final AssetService assetService;

    public ScanLookupController(AuthContextService authContextService,
                                CageCellDetailMapper detailMapper,
                                CageCellIndexMapper indexMapper,
                                AssetService assetService) {
        this.authContextService = authContextService;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
        this.assetService = assetService;
    }

    @GetMapping("/lookup")
    @Operation(summary = "统一扫码查询：根据编码内容自动识别笼盒二维码或资产编号")
    public Result<?> lookup(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestParam String code) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.fail(401, "未登录");

        String trimmed = (code != null) ? code.trim() : "";
        if (trimmed.isEmpty()) return Result.fail(400, "缺少扫码内容");

        boolean looksLikeCageBox = trimmed.matches("^\\d+$");

        Map<String, Object> result = new LinkedHashMap<>();

        // 纯数字 → 查本地DB笼盒（cage_cell_detail → cage_cell_index 实时定位）
        if (looksLikeCageBox) {
            CageCellDetail detail = detailMapper.selectByCageBoxCode(trimmed);
            if (detail != null) {
                Map<String, Object> pos = indexMapper.lookupByAnimalCageId(detail.getAnimalCageId());
                if (pos != null) {
                    Map<String, Object> cageBox = new LinkedHashMap<>();
                    cageBox.put("shelveId", pos.get("shelveId"));
                    cageBox.put("positionX", pos.get("positionX"));
                    cageBox.put("positionY", pos.get("positionY"));
                    Object px = pos.get("positionX");
                    Object py = pos.get("positionY");
                    cageBox.put("positionLabel",
                            (px != null ? px : "?") + "-" + (py != null ? py : "?"));
                    cageBox.put("campusName", pos.getOrDefault("campusName", ""));
                    cageBox.put("roomName", pos.getOrDefault("roomName", ""));
                    result.put("type", "CAGE_BOX");
                    result.put("cageBox", cageBox);
                    return Result.success(result);
                }
            }
            // 本地DB未命中 → fallback 资产查询
        }

        // 非纯数字或笼盒未命中 → 查资产
        try {
            Map<String, Object> asset = assetService.findByCode(trimmed);
            if (asset != null && !asset.isEmpty()) {
                result.put("type", "ASSET");
                result.put("asset", asset);
                return Result.success(result);
            }
        } catch (Exception ignored) {
            // 资产查询失败，继续返回 NOT_FOUND
        }

        if (looksLikeCageBox) {
            result.put("type", "NOT_FOUND");
            result.put("message", "未找到该笼盒编号对应的笼位");
        } else {
            result.put("type", "NOT_FOUND");
            result.put("message", "未找到匹配的资产记录");
        }
        return Result.success(result);
    }
}
