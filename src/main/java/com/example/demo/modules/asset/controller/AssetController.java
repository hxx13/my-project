package com.example.demo.modules.asset.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.asset.dto.AppendTransferPhotosRequest;
import com.example.demo.modules.asset.dto.AssetColumnCreateRequest;
import com.example.demo.modules.asset.dto.AssetTransferApplyRequest;
import com.example.demo.modules.asset.service.AssetService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "资产记录", description = "资产记录与转移流程")
public class AssetController {
    private final AuthContextService authContextService;
    private final AssetService assetService;

    public AssetController(AuthContextService authContextService, AssetService assetService) {
        this.authContextService = authContextService;
        this.assetService = assetService;
    }

    @GetMapping("/assets")
    @Operation(summary = "资产记录分页")
    public Result<?> listAssets(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestParam(required = false) String keyword,
                                @RequestParam(required = false) String assetName,
                                @RequestParam(required = false) String campus,
                                @RequestParam(required = false, name = "user") String userFilter,
                                @RequestParam(required = false) String model,
                                @RequestParam(required = false) Integer lockStatus,
                                @RequestParam(required = false) String status,
                                @RequestParam(defaultValue = "1") int page,
                                @RequestParam(defaultValue = "20") int size,
                                @RequestParam(defaultValue = "updateTime") String sortBy,
                                @RequestParam(defaultValue = "desc") String sortDirection,
                                @RequestParam(required = false) String assetId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(assetService.listAssets(keyword, assetName, campus, userFilter, model, lockStatus, status, page, size, sortBy, sortDirection, assetId));
    }

    @PostMapping("/assets/import")
    @Operation(summary = "导入资产Excel")
    public Result<?> importAssets(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestParam("file") MultipartFile file) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.importAssetsFromExcel(user.getId(), file));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/assets/export")
    @Operation(summary = "导出资产Excel（含申请记录）")
    public ResponseEntity<byte[]> exportAssets(@RequestHeader(value = "Authorization", required = false) String authorization,
                                               @RequestParam(required = false) String keyword,
                                               @RequestParam(required = false) String assetName,
                                               @RequestParam(required = false) String campus,
                                               @RequestParam(required = false, name = "user") String userFilter,
                                               @RequestParam(required = false) String model,
                                               @RequestParam(required = false) Integer lockStatus,
                                               @RequestParam(required = false) String status) {
        User user = resolveUser(authorization);
        if (requireMinRole(user, RoleEnum.STAFF) != null) {
            return ResponseEntity.status(401).body("无权限".getBytes(StandardCharsets.UTF_8));
        }
        byte[] file = assetService.exportAssetsAsExcel(keyword, assetName, campus, userFilter, model, lockStatus, status);
        String name = "asset-records-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")) + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(file);
    }

    @PostMapping("/assets/columns")
    @Operation(summary = "新增资产动态列")
    public Result<?> createColumn(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestBody AssetColumnCreateRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.createColumn(user.getId(), request == null ? null : request.getColumnLabel()));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/assets")
    @Operation(summary = "新增资产")
    public Result<?> createAsset(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestBody(required = false) Map<String, Object> payload) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        if (payload == null) payload = Map.of();
        @SuppressWarnings("unchecked")
        Map<String, String> dynamicValues = payload.get("dynamicValues") instanceof Map
                ? (Map<String, String>) payload.get("dynamicValues")
                : Map.of();
        try {
            return Result.success(assetService.createAsset(
                    user.getId(),
                    payload.get("assetCode") == null ? null : String.valueOf(payload.get("assetCode")),
                    payload.get("assetName") == null ? null : String.valueOf(payload.get("assetName")),
                    payload.get("status") == null ? null : String.valueOf(payload.get("status")),
                    payload.get("location") == null ? null : String.valueOf(payload.get("location")),
                    payload.get("note") == null ? null : String.valueOf(payload.get("note")),
                    dynamicValues
            ));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/assets/{id}")
    @Operation(summary = "更新资产标注/字段")
    public Result<?> patchAsset(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable String id,
                                @RequestBody(required = false) Map<String, Object> payload) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        if (payload == null) payload = Map.of();
        @SuppressWarnings("unchecked")
        Map<String, String> dynamicValues = payload.get("dynamicValues") instanceof Map
                ? (Map<String, String>) payload.get("dynamicValues")
                : Map.of();
        try {
            return Result.success(assetService.patchAsset(
                    id,
                    payload.get("note") == null ? null : String.valueOf(payload.get("note")),
                    payload.get("status") == null ? null : String.valueOf(payload.get("status")),
                    payload.get("location") == null ? null : String.valueOf(payload.get("location")),
                    dynamicValues
            ));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/assets/search")
    @Operation(summary = "资产检索（二次封装接口）")
    public Result<?> searchAssets(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestParam String keyword,
                                  @RequestParam(defaultValue = "20") int limit) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(assetService.searchAssets(keyword, limit));
    }

    @GetMapping("/assets/facets")
    @Operation(summary = "资产筛选项（资产名称/校区/型号）")
    public Result<?> assetFacets(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam(required = false) String keyword,
                                 @RequestParam(required = false) String assetName,
                                 @RequestParam(required = false) String campus,
                                 @RequestParam(required = false, name = "user") String userFilter,
                                 @RequestParam(required = false) String model) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(assetService.listAssetFacets(keyword, assetName, campus, userFilter, model));
    }

    @DeleteMapping("/assets")
    @Operation(summary = "清空资产表格数据")
    public Result<?> clearAssets(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.clearAllAssetData());
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/assets/{id}")
    @Operation(summary = "删除资产（进入回收站）")
    public Result<?> deleteAsset(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.moveAssetToRecycle(id, user.getId()));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/assets/recycle")
    @Operation(summary = "回收站分页")
    public Result<?> listRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam(required = false) String keyword,
                                 @RequestParam(defaultValue = "1") int page,
                                 @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.listRecycledAssets(keyword, page, size));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/assets/recycle/{id}/restore")
    @Operation(summary = "回收站恢复资产")
    public Result<?> restoreRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.restoreRecycledAsset(id, user.getId()));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/assets/recycle/{id}")
    @Operation(summary = "回收站彻底删除资产")
    public Result<?> purgeRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.purgeRecycledAsset(id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/assets/{id}/lock")
    @Operation(summary = "锁定资产")
    public Result<?> lockAsset(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            assetService.lockAsset(id, user.getId());
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/asset-transfer-requests")
    @Operation(summary = "提交转移申请")
    public Result<?> applyTransfer(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestBody AssetTransferApplyRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.submitTransfer(user.getId(), user.getUsername(), request));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/asset-transfer-requests/{id}/after-photos")
    @Operation(summary = "补充转移后照片（进行中）")
    public Result<?> appendTransferAfterPhotos(@RequestHeader(value = "Authorization", required = false) String authorization,
                                               @PathVariable String id,
                                               @RequestBody(required = false) AppendTransferPhotosRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.appendTransferAfterPhotos(
                    user.getId(),
                    id,
                    body == null ? null : body.getPhotoUrls()
            ));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/asset-transfer-requests/{id}/after-photos/remove")
    @Operation(summary = "删除一张转移后照片（进行中）")
    public Result<?> removeTransferAfterPhoto(@RequestHeader(value = "Authorization", required = false) String authorization,
                                              @PathVariable String id,
                                              @RequestBody(required = false) AppendTransferPhotosRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        String photoUrl = null;
        if (body != null && body.getPhotoUrls() != null && !body.getPhotoUrls().isEmpty()) {
            photoUrl = body.getPhotoUrls().get(0);
        }
        try {
            return Result.success(assetService.removeTransferAfterPhoto(user.getId(), id, photoUrl));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/asset-transfer-requests/{id}/complete")
    @Operation(summary = "确认转移完毕")
    public Result<?> completeTransfer(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.completeTransfer(user.getId(), id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/asset-transfer-requests/{id}/withdraw")
    @Operation(summary = "撤回进行中的转移申请")
    public Result<?> withdrawTransfer(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.withdrawTransfer(user.getId(), id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/asset-transfer-requests/{id}")
    @Operation(summary = "管理员删除转移记录（可回滚已完成记录的地点）")
    public Result<?> deleteTransferRequest(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            return Result.success(assetService.adminDeleteTransferRecord(user.getId(), id));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/asset-transfer-records")
    @Operation(summary = "查询转移记录")
    public Result<?> listTransferRecords(@RequestHeader(value = "Authorization", required = false) String authorization,
                                         @RequestParam(required = false) String keyword,
                                         @RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(assetService.listTransferRequests(keyword, page, size));
    }

    @GetMapping("/asset-transfer-records/export")
    @Operation(summary = "导出转移记录")
    public ResponseEntity<byte[]> exportTransferRecords(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                        @RequestParam(required = false) String keyword) {
        User user = resolveUser(authorization);
        if (requireMinRole(user, RoleEnum.STAFF) != null) {
            return ResponseEntity.status(401).body("无权限".getBytes(StandardCharsets.UTF_8));
        }
        byte[] file = assetService.exportTransferRequestsAsExcel(keyword);
        String name = "asset-transfer-records-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")) + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(file);
    }

    @PostMapping("/asset-transfer-records/{id}/pdf-link")
    @Operation(summary = "生成或复用单条转移记录PDF下载链接")
    public Result<?> createOrReuseTransferPdfLink(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            Map<String, Object> row = assetService.createOrReuseTransferPdfLink(user.getId(), id);
            return Result.success(appendAbsoluteDownloadUrl(row));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/asset-transfer-records/{id}/pdf-links")
    @Operation(summary = "查询单条转移记录的PDF下载链接列表")
    public Result<?> listTransferPdfLinks(@RequestHeader(value = "Authorization", required = false) String authorization,
                                          @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            Map<String, Object> data = assetService.listTransferPdfLinks(id);
            Object linksRaw = data.get("links");
            if (linksRaw instanceof List<?> links) {
                List<Map<String, Object>> normalized = new ArrayList<>();
                for (Object link : links) {
                    if (link instanceof Map<?, ?> map) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> entry : map.entrySet()) {
                            row.put(String.valueOf(entry.getKey()), entry.getValue());
                        }
                        normalized.add(appendAbsoluteDownloadUrl(row));
                    }
                }
                Map<String, Object> out = new LinkedHashMap<>(data);
                out.put("links", normalized);
                return Result.success(out);
            }
            return Result.success(data);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/asset-transfer-records/download/{token}")
    @Operation(summary = "根据下载令牌获取PDF")
    public ResponseEntity<?> downloadTransferPdfByToken(@PathVariable String token) {
        try {
            Map<String, Object> data = assetService.resolveTransferPdfDownload(token);
            String downloadUrl = data.get("downloadUrl") == null ? null : String.valueOf(data.get("downloadUrl"));
            if (downloadUrl == null || downloadUrl.isBlank()) {
                return ResponseEntity.badRequest().body("下载链接无效".getBytes(StandardCharsets.UTF_8));
            }
            return ResponseEntity.status(302)
                    .location(URI.create(downloadUrl))
                    .build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN).body(e.getMessage().getBytes(StandardCharsets.UTF_8));
        }
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) return Result.error("未登录或Token无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        if (user.getRole().getLevel() < minRole.getLevel()) return Result.error("无权限访问");
        return null;
    }

    private Map<String, Object> appendAbsoluteDownloadUrl(Map<String, Object> row) {
        if (row == null) return Map.of();
        Object urlVal = row.get("downloadUrl");
        if (urlVal instanceof String url && url.startsWith("/")) {
            String abs = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString() + url;
            Map<String, Object> out = new LinkedHashMap<>(row);
            out.put("downloadUrl", abs);
            return out;
        }
        return row;
    }
}

