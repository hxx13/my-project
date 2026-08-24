package com.example.demo.modules.scan.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.asset.service.AssetService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoValueMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
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
    private final CageClaimMapper claimMapper;
    private final CageInfoValueMapper infoValueMapper;
    private final AssetService assetService;

    public ScanLookupController(AuthContextService authContextService,
                                CageCellDetailMapper detailMapper,
                                CageCellIndexMapper indexMapper,
                                CageClaimMapper claimMapper,
                                CageInfoValueMapper infoValueMapper,
                                AssetService assetService) {
        this.authContextService = authContextService;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
        this.claimMapper = claimMapper;
        this.infoValueMapper = infoValueMapper;
        this.assetService = assetService;
    }

    @GetMapping("/lookup")
    @Operation(summary = "统一扫码查询：根据编码内容自动识别笼位/笼盒/资产编号")
    public Result<?> lookup(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestParam String code) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.fail(401, "未登录");

        String trimmed = (code != null) ? code.trim() : "";
        if (trimmed.isEmpty()) return Result.fail(400, "缺少扫码内容");

        boolean looksLikeCageCell = trimmed.matches("^\\d+$");

        Map<String, Object> result = new LinkedHashMap<>();

        // 纯数字 → 先按笼位 id (animal_cage_id) 查本地DB，未命中再回退旧笼盒码
        if (looksLikeCageCell) {
            Long animalCageId = parseLongSafe(trimmed);
            if (animalCageId != null) {
                CageCellDetail detail = detailMapper.selectByAnimalCageId(animalCageId);
                if (detail != null) {
                    Map<String, Object> pos = indexMapper.lookupByAnimalCageId(detail.getAnimalCageId());
                    if (pos != null) {
                        Map<String, Object> cageCell = new LinkedHashMap<>();
                        cageCell.put("animalCageId", detail.getAnimalCageId());
                        cageCell.put("shelveId", pos.get("shelveId"));
                        cageCell.put("shelveName", pos.get("shelveName"));
                        cageCell.put("roomId", pos.get("roomId"));
                        cageCell.put("positionX", pos.get("positionX"));
                        cageCell.put("positionY", pos.get("positionY"));
                        Object px = pos.get("positionX");
                        Object py = pos.get("positionY");
                        cageCell.put("positionLabel",
                                (px != null ? px : "?") + "-" + (py != null ? py : "?"));
                        cageCell.put("campusName", pos.getOrDefault("campusName", ""));
                        cageCell.put("roomName", pos.getOrDefault("roomName", ""));
                        result.put("type", "CAGE_CELL");
                        result.put("cageCell", cageCell);

                        CageClaim active = claimMapper.selectActiveByAnimalCageId(detail.getAnimalCageId());
                        if (active != null) {
                            Map<String, Object> claim = new LinkedHashMap<>();
                            claim.put("id", active.getId());
                            claim.put("claimStatus", active.getClaimStatus());
                            claim.put("claimantId", active.getClaimantId());
                            claim.put("claimantName", active.getClaimantName());
                            claim.put("confirmRequired", active.getConfirmRequired());
                            claim.put("aupId", active.getAupId());
                            claim.put("aupNumber", detail.getAupNumber());
                            claim.put("projectPiName", detail.getProjectPiName());
                            claim.put("projectName", detail.getProjectName());
                            claim.put("hasInfo", infoValueMapper.countByAnimalCageId(active.getAnimalCageId()) > 0);
                            result.put("claim", claim);
                        } else {
                            result.put("claim", null);
                        }
                        return Result.success(result);
                    }
                }
            }

            // animal_cage_id 未命中 → 回退旧笼盒码（已废弃，提示改扫笼位码）
            CageCellDetail legacy = detailMapper.selectByCageBoxCode(trimmed);
            if (legacy != null) {
                result.put("type", "LEGACY_CAGE_BOX");
                result.put("message", "旧盒码已废弃，请扫笼位码");
                result.put("animalCageId", legacy.getAnimalCageId());
                result.put("legacy", true);
                Map<String, Object> legacyPos = indexMapper.lookupByAnimalCageId(legacy.getAnimalCageId());
                if (legacyPos != null) {
                    result.put("roomId", legacyPos.get("roomId"));
                    result.put("shelveId", legacyPos.get("shelveId"));
                    result.put("shelveName", legacyPos.get("shelveName"));
                    result.put("positionX", legacyPos.get("positionX"));
                    result.put("positionY", legacyPos.get("positionY"));
                    result.put("campusName", legacyPos.getOrDefault("campusName", ""));
                    result.put("roomName", legacyPos.getOrDefault("roomName", ""));
                }
                return Result.success(result);
            }
            // 本地DB未命中 → fallback 资产查询
        }

        // 非纯数字或笼位未命中 → 查资产
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

        if (looksLikeCageCell) {
            result.put("type", "NOT_FOUND");
            result.put("message", "未找到该笼位或笼盒");
        } else {
            result.put("type", "NOT_FOUND");
            result.put("message", "未找到匹配的资产记录");
        }
        return Result.success(result);
    }

    /** 安全解析 Long：非法的超长数字串返回 null，由调用方回退，不抛异常 */
    private Long parseLongSafe(String s) {
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
