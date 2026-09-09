package com.example.demo.modules.cardprint.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cardprint.entity.CardPrintArchive;
import com.example.demo.modules.cardprint.entity.CardPrintTemplate;
import com.example.demo.modules.cardprint.service.CardFieldDictionaryService;
import com.example.demo.modules.cardprint.service.CardPrintService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** 卡牌打印：模板、字段字典、预览、生成、归档。 */
@RestController
@RequestMapping("/api/admin/card-print")
@Tag(name = "卡牌打印")
public class CardPrintController {

    private final CardPrintService cardPrintService;
    private final CardFieldDictionaryService dictionaryService;
    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;

    public CardPrintController(CardPrintService cardPrintService,
                               CardFieldDictionaryService dictionaryService,
                               AuthContextService authContextService,
                               UserDisplayNameService userDisplayNameService) {
        this.cardPrintService = cardPrintService;
        this.dictionaryService = dictionaryService;
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
    }

    private User requireStaff(String authHeader) {
        User u = authContextService.resolveUserFromBearer(authHeader);
        if (u == null || u.getRole() == null
                || u.getRole().getLevel() < RoleEnum.STAFF.getLevel()) {
            throw new TwinBusinessException(403, "需要管理后台权限");
        }
        return u;
    }

    private String displayName(User u) {
        return userDisplayNameService.resolveDisplayName(u.getId());
    }

    @GetMapping("/fields")
    @Operation(summary = "字段字典")
    public Result<List<Map<String, Object>>> fields(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        requireStaff(auth);
        return Result.success(dictionaryService.listOptions());
    }

    @GetMapping("/templates")
    @Operation(summary = "模板列表")
    public Result<List<CardPrintTemplate>> templates(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        requireStaff(auth);
        return Result.success(cardPrintService.listTemplates());
    }

    @PostMapping("/templates")
    @Operation(summary = "新建模板")
    public Result<CardPrintTemplate> createTemplate(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody CardPrintTemplate body) {
        User u = requireStaff(auth);
        body.setId(null);
        return Result.success(cardPrintService.saveTemplate(body, displayName(u)));
    }

    @PutMapping("/templates/{id}")
    @Operation(summary = "更新模板")
    public Result<CardPrintTemplate> updateTemplate(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable Long id,
            @RequestBody CardPrintTemplate body) {
        User u = requireStaff(auth);
        body.setId(id);
        return Result.success(cardPrintService.saveTemplate(body, displayName(u)));
    }

    @DeleteMapping("/templates/{id}")
    @Operation(summary = "删除模板")
    public Result<Void> deleteTemplate(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable Long id) {
        User u = requireStaff(auth);
        cardPrintService.deleteTemplate(id, displayName(u));
        return Result.success();
    }

    @PostMapping("/preview")
    @Operation(summary = "试打单张（返回 PDF）")
    public ResponseEntity<byte[]> preview(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody Map<String, Object> body) throws IOException {
        requireStaff(auth);
        Long templateId = Long.valueOf(String.valueOf(body.get("templateId")));
        Long cageId = Long.valueOf(String.valueOf(body.get("animalCageId")));
        return pdfResponse(cardPrintService.preview(templateId, cageId), "card-preview.pdf");
    }

    @PostMapping("/generate")
    @Operation(summary = "批量生成并归档")
    public Result<Map<String, Object>> generate(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody Map<String, Object> body) throws IOException {
        User u = requireStaff(auth);
        Long templateId = Long.valueOf(String.valueOf(body.get("templateId")));
        List<Long> cageIds = cardPrintService.parseCageIds(
                body.get("animalCageIds") instanceof List<?> l ? l : null);
        return Result.success(cardPrintService.generate(templateId, cageIds, displayName(u)));
    }

    @PostMapping("/data")
    @Operation(summary = "取卡牌数据（前端预览用，不生成 PDF）")
    public Result<List<Map<String, Object>>> data(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody Map<String, Object> body) {
        requireStaff(auth);
        List<Long> cageIds = cardPrintService.parseCageIds(
                body.get("animalCageIds") instanceof List<?> l ? l : null);
        return Result.success(cardPrintService.assembleData(cageIds));
    }

    @GetMapping("/archives")
    @Operation(summary = "归档列表")
    public Result<Map<String, Object>> archives(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        requireStaff(auth);
        return Result.success(cardPrintService.listArchives(page, size));
    }

    @GetMapping("/archives/{id}/download")
    @Operation(summary = "下载归档 PDF")
    public ResponseEntity<byte[]> download(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable Long id) throws IOException {
        requireStaff(auth);
        CardPrintArchive a = cardPrintService.getArchive(id);
        return pdfResponse(cardPrintService.downloadArchive(id), a.getFileName());
    }

    @DeleteMapping("/archives/{id}")
    @Operation(summary = "删除归档")
    public Result<Void> deleteArchive(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable Long id) {
        User u = requireStaff(auth);
        cardPrintService.deleteArchive(id, displayName(u));
        return Result.success();
    }

    private static ResponseEntity<byte[]> pdfResponse(byte[] pdf, String fileName) {
        String safe = fileName == null || fileName.isBlank() ? "card.pdf" : fileName;
        String encoded = URLEncoder.encode(safe, StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE)
                .body(pdf);
    }
}
