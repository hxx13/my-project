package com.example.demo.modules.scan.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.asset.service.AssetService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.entity.CageSpecialStatusSnapshot;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
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
    private final CageSpecialStatusSnapshotMapper snapshotMapper;
    private final CageShelfMapper cageShelfMapper;
    private final AssetService assetService;

    public ScanLookupController(AuthContextService authContextService,
                                CageSpecialStatusSnapshotMapper snapshotMapper,
                                CageShelfMapper cageShelfMapper,
                                AssetService assetService) {
        this.authContextService = authContextService;
        this.snapshotMapper = snapshotMapper;
        this.cageShelfMapper = cageShelfMapper;
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

        // 纯数字 → 优先查笼盒快照表（毫秒级）
        if (looksLikeCageBox) {
            CageSpecialStatusSnapshot cell = snapshotMapper.findByCageBoxCode(trimmed);
            if (cell != null) {
                Map<String, Object> cageBox = new LinkedHashMap<>();
                // shelveId 来自快照表 → 调 ARO API 加载网格数据用
                cageBox.put("shelveId", cell.getShelveId());
                cageBox.put("positionX", cell.getPositionX());
                cageBox.put("positionY", cell.getPositionY());
                cageBox.put("positionLabel", cell.getPositionLabel());

                // campusName/roomName 优先从 index 表取 → 前端展开列表层级用
                CageShelfIndex idx = cageShelfMapper.findFirstByRoomNameAndCampus(
                        cell.getRoomName(), cell.getCampusName());
                if (idx != null) {
                    cageBox.put("campusName", idx.getCampusName());
                    cageBox.put("roomName", idx.getRoomName());
                } else {
                    cageBox.put("campusName", cell.getCampusName());
                    cageBox.put("roomName", cell.getRoomName());
                }
                result.put("type", "CAGE_BOX");
                result.put("cageBox", cageBox);
                return Result.success(result);
            }
            // 笼盒未命中 → fallback 资产查询
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
