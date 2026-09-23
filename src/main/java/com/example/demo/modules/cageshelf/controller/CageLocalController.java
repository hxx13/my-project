package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageCellHistory;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellHistoryMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.service.CageCellDetailService;
import com.example.demo.modules.cageshelf.service.CageExperimentRecordService;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import com.example.demo.modules.cageshelf.service.CageOccupancyService;
import com.example.demo.modules.cageshelf.service.CageOperationService;
import com.example.demo.modules.cageshelf.service.CageQuotaService;
import com.example.demo.modules.cageshelf.service.CageRegionCapabilityService;
import com.example.demo.modules.cageshelf.service.OutboxService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * 本地业务接口 — 笼位分配/绑定/编辑操作，先写本地DB，异步投递ARO。
 */
@RestController
@RequestMapping("/api/local")
@Tag(name = "本地业务操作")
@Transactional
public class CageLocalController {

    private static final Logger log = LoggerFactory.getLogger(CageLocalController.class);

    private final AuthContextService authContextService;
    private final CageCellDetailService detailService;
    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper indexMapper;
    private final CageCellHistoryMapper historyMapper;
    private final OutboxService outboxService;
    private final JdbcTemplate jdbcTemplate;
    private final UserDisplayNameService userDisplayNameService;
    private final CageQuotaService quotaService;
    private final CageInfoValueService infoValueService;
    private final CageModeVisibilityService modeVisibilityService;
    private final CageClaimMapper claimMapper;
    private final AupRecordMapper aupRecordMapper;
    private final CageOperationService cageOperationService;
    private final CageRegionCapabilityService regionCapabilityService;
    private final CageOccupancyService occupancyService;
    private final CageExperimentRecordService experimentRecordService;

    public CageLocalController(AuthContextService authContextService,
                               CageCellDetailService detailService,
                               CageCellDetailMapper detailMapper,
                               CageCellIndexMapper indexMapper,
                               CageCellHistoryMapper historyMapper,
                               OutboxService outboxService,
                               JdbcTemplate jdbcTemplate,
                               UserDisplayNameService userDisplayNameService,
                               CageQuotaService quotaService,
                               CageInfoValueService infoValueService,
                               CageModeVisibilityService modeVisibilityService,
                               CageClaimMapper claimMapper,
                               AupRecordMapper aupRecordMapper,
                               CageOperationService cageOperationService,
                               CageRegionCapabilityService regionCapabilityService,
                               CageOccupancyService occupancyService,
                               CageExperimentRecordService experimentRecordService) {
        this.authContextService = authContextService;
        this.detailService = detailService;
        this.detailMapper = detailMapper;
        this.indexMapper = indexMapper;
        this.historyMapper = historyMapper;
        this.outboxService = outboxService;
        this.jdbcTemplate = jdbcTemplate;
        this.userDisplayNameService = userDisplayNameService;
        this.quotaService = quotaService;
        this.infoValueService = infoValueService;
        this.modeVisibilityService = modeVisibilityService;
        this.claimMapper = claimMapper;
        this.aupRecordMapper = aupRecordMapper;
        this.cageOperationService = cageOperationService;
        this.regionCapabilityService = regionCapabilityService;
        this.occupancyService = occupancyService;
        this.experimentRecordService = experimentRecordService;
    }

    private String operatorDisplayName(User u) {
        if (u == null || u.getId() == null) {
            return "unknown";
        }
        String name = userDisplayNameService.resolveDisplayName(u.getId());
        return (name != null && !name.isBlank()) ? name : u.getId();
    }

    private User resolveUser(String auth) {
        User u = authContextService.resolveUserFromBearer(auth);
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }
    private Result<?> requireRole(User u, RoleEnum min) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole().getLevel() < min.getLevel()) return Result.error("无权限");
        return null;
    }

    // ═══════════════════════════════════════════
    // 绑定/解绑
    // ═══════════════════════════════════════════

    @PostMapping("/bind")
    @Operation(summary = "已退役：扫码绑定已被预约/分配流程取代")
    public Result<?> bind(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;
        log.info("[local/bind] 退役拒绝 user={}", u.getId());
        return Result.fail(410, "扫码绑定已退役，请使用预约/分配流程");
    }

    @PostMapping("/unbind")
    @Operation(summary = "已退役：扫码绑定已被预约/分配流程取代")
    public Result<?> unbind(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;
        log.info("[local/unbind] 退役拒绝 user={}", u.getId());
        return Result.fail(410, "扫码绑定已退役，请使用预约/分配流程");
    }

    // ═══════════════════════════════════════════
    // 分配/取消
    // ═══════════════════════════════════════════

    @PostMapping("/allocate")
    @Operation(summary = "分配笼位 → 写本地 + 异步投递ARO")
    public Result<?> allocate(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.ADMIN);
        if (denied != null) return denied;

        Object idsObj = body.get("animalCageIds");
        if (!(idsObj instanceof List<?> list) || list.isEmpty())
            return Result.fail(400, "animalCageIds 必填");

        Long aupId = toLong(body.get("aupId"));
        Long roomId = toLong(body.get("roomId"));
        Long shelveId = toLong(body.get("shelveId"));
        String piName = str(body, "piName");
        String aupNumber = str(body, "aupNumber");
        // 项目名称不在请求里传：按 AUP 注册号从本地 aup_record 取（前端只需传 registerNo）
        AupRecord aupRecord = (aupNumber == null || aupNumber.isBlank()) ? null : aupRecordMapper.selectByRegisterNo(aupNumber);
        String projectName = aupRecord == null ? null : aupRecord.getProjectName();

        // 配额校验：实际占用 + 本次 ≤ 该 AUP 可用数（键用 register_number）
        quotaService.assertCanAllocate(roomId, aupNumber, list.size());

        // ① 本地DB逐笼更新（含PI姓名、AUP编号、项目名称、院系）+ 直写表单(cage_info_value)自动填充
        List<Long> cageIds = new ArrayList<>();
        for (Object id : list) {
            Long animalCageId = toLong(id);
            if (animalCageId == null) continue;
            CageCellDetail d = detailService.allocate(animalCageId, piName, aupNumber, aupId, projectName, String.valueOf(u.getId()));
            Map<String, Object> auto = new HashMap<>();
            if (d.getProjectPiName() != null && !d.getProjectPiName().isBlank()) auto.put("project_pi_name", d.getProjectPiName());
            if (d.getProjectName() != null && !d.getProjectName().isBlank()) auto.put("project_name", d.getProjectName());
            if (d.getDepartmentName() != null && !d.getDepartmentName().isBlank()) auto.put("department_name", d.getDepartmentName());
            if (d.getAupNumber() != null && !d.getAupNumber().isBlank()) auto.put("aup_number", d.getAupNumber());
            if (!auto.isEmpty()) infoValueService.syncFromMapped(animalCageId, auto);
            cageIds.add(animalCageId);
        }

        String summary = String.format("%s 分配 %d 个笼位到 AUP %s", operatorDisplayName(u), cageIds.size(),
                aupId != null ? String.valueOf(aupId) : "?");
        log.info("[local/allocate] {}", summary);
        return Result.success(Map.of("ok", true, "count", cageIds.size(), "local", true));
    }

    @PostMapping("/cancel-allocate")
    @Operation(summary = "取消分配 → 写本地 + 异步投递ARO")
    public Result<?> cancelAllocate(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.ADMIN);
        if (denied != null) return denied;

        Object idsObj = body.get("animalCageIds");
        if (!(idsObj instanceof List<?> list) || list.isEmpty())
            return Result.fail(400, "animalCageIds 必填");

        // ① 本地DB逐笼更新
        List<Long> cageIds = new ArrayList<>();
        for (Object id : list) {
            Long animalCageId = toLong(id);
            if (animalCageId == null) continue;
            detailService.cancelAllocate(animalCageId, String.valueOf(u.getId()));
            infoValueService.clearOccupancyFields(animalCageId, "UNALLOCATE", String.valueOf(u.getId()));
            cageIds.add(animalCageId);
        }

        String summary = String.format("%s 取消 %d 个笼位分配", operatorDisplayName(u), cageIds.size());
        log.info("[local/cancel-allocate] {}", summary);
        return Result.success(Map.of("ok", true, "count", cageIds.size(), "local", true));
    }

    // ═══════════════════════════════════════════
    // 编辑（特殊状态标记）
    // ═══════════════════════════════════════════

    /** 状态标记的中文名，仅用于日志/审计摘要。新增状态时在此登记一行。 */
    private static final Map<String, String> TOGGLE_LABELS = Map.of(
            "needs_division", "需分笼",
            "needs_special_feeding", "需特殊饲养",
            "has_health_abnormality", "健康异常",
            "needs_transfer", "动物转移",
            "needs_cohabitation", "合笼");

    @PostMapping("/edit")
    @Operation(summary = "编辑笼位状态标记 → 只写本地")
    public Result<?> edit(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.MEMBER);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        String toggle = str(body, "toggle");
        Boolean enable = body.get("enable") instanceof Boolean b ? b : "true".equals(str(body, "enable"));
        if (animalCageId == null || toggle == null)
            return Result.fail(400, "animalCageId 和 toggle 必填");

        // 学生侧单独一条路：只放行矩阵里授权的学生状态动作（cage.student.edit.*），
        // 且只能动**本人使用中**的笼位。
        // 不能复用 canUseMode(u,"edit") —— 它按教职工状态模式的身份码判，
        // 而学生也可能带 BREEDER/BREEDING_GROUP_LEADER，那样会把五个动作和别人的笼位一起放开。
        // 教职工侧维持原判定不动。
        if (modeVisibilityService.isStudent(u)) {
            if (!modeVisibilityService.canStudentEdit(u, toggle)) {
                return Result.fail(403, "学生当前可标记的状态动作不含该项");
            }
            if (!cageOperationService.isOccupantSelf(u, animalCageId)) {
                return Result.fail(403, "只能标记本人使用中的笼位");
            }
            // 区域级学生能力：状态动作也要**该笼位所在区域**的饲养组长开着（当前学生侧只有合笼）
            if (!regionCapabilityService.studentEditEnabledOnCage(u, animalCageId, toggle)) {
                return Result.fail(403, "该笼位所在区域未开放该状态标记，请联系该区域饲养组长");
            }
        } else if (!modeVisibilityService.canUseMode(u, "edit")) {
            return Result.fail(403, "无状态编辑权限（仅状态模式身份可操作）");
        }

        // 状态标记以表单(cage_info_value)为唯一真相源：只写表单，不回写固定表、不再 ARO 投递。
        // 留痕走 setStatus 内部的 CageFormAuditService.logDataChange（operator=当前账号显示名），
        // 与教职工标记同一张表、同一条读取端（/admin/cage-form/audit/operations），不要另开旁路写入。
        infoValueService.setStatus(animalCageId, toggle, Boolean.TRUE.equals(enable), operatorDisplayName(u));

        String action = Boolean.TRUE.equals(enable) ? "标记" : "取消";
        String toggleLabel = TOGGLE_LABELS.getOrDefault(toggle, toggle);
        log.info("[local/edit] {} {} [{}] → 笼位 {} {}",
                operatorDisplayName(u), action, toggleLabel, animalCageId, buildPositionLabel(animalCageId));
        return Result.success(Map.of("ok", true, "local", true));
    }

    /**
     * 写入某个「状态子值」字段（**整体覆盖**）：特殊饲养明细（多选）、健康异常严重程度（单选）。
     *
     * <p>子值的项由码表维护、可增长，逐项接口会让前端每次改动都要知道「另一头」的状态；
     * 整体覆盖天然幂等，也能一次提交一批（走待提交的批量提交）。
     *
     * <p>`canonical` 必须落在 {@link CageInfoValueService#isStatusDetailCanonical} 的白名单里 ——
     * 否则请求体就能指定任意表单字段，绕过字段级写权限。多选传多个值，单选传 0 或 1 个值
     * （单选取多个由服务端拒）。
     *
     * <p>权限与中间态判定跟 {@link #edit} 完全同口径，只是动作码换成该 canonical 对应的那一个。
     */
    @PostMapping("/status-detail")
    @Operation(summary = "写入笼位「状态子值」（特殊饲养明细 / 健康异常严重程度，整体覆盖）→ 只写本地")
    public Result<?> statusDetail(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.MEMBER);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");
        String canonical = str(body, "canonical");
        if (!CageInfoValueService.isStatusDetailCanonical(canonical)) {
            return Result.fail(400, "不支持的状态子值字段: " + canonical);
        }
        List<String> itemCodes = new ArrayList<>();
        if (body.get("itemCodes") instanceof List<?> list) {
            for (Object o : list) if (o != null) itemCodes.add(String.valueOf(o));
        }

        if (modeVisibilityService.isStudent(u)) {
            if (!modeVisibilityService.canStudentEdit(u, canonical)) {
                return Result.fail(403, "学生当前可标记的状态动作不含该项");
            }
            if (!cageOperationService.isOccupantSelf(u, animalCageId)) {
                return Result.fail(403, "只能标记本人使用中的笼位");
            }
            if (!regionCapabilityService.studentEditEnabledOnCage(u, animalCageId, canonical)) {
                return Result.fail(403, "该笼位所在区域未开放该状态标记，请联系该区域饲养组长");
            }
        } else if (!modeVisibilityService.canUseMode(u, "edit")) {
            return Result.fail(403, "无状态编辑权限（仅状态模式身份可操作）");
        }

        // 与 /edit 同一口径：只写表单真相源，留痕走 setStatusDetail 内部按子值项逐条写审计
        infoValueService.setStatusDetail(animalCageId, canonical, itemCodes, operatorDisplayName(u));
        log.info("[local/status-detail] {} {} = {} → 笼位 {} {}",
                operatorDisplayName(u), canonical, itemCodes, animalCageId, buildPositionLabel(animalCageId));
        return Result.success(Map.of("ok", true, "local", true));
    }

    /**
     * 归档笼位：释放占用、回退为空笼盒（type2）。
     *
     * <p>**学生只能归档本人的笼位** —— 活跃认领人是本人 或 表单实验员是本人，与状态标记共用同一判据
     * （{@code CageOperationService.isOccupantSelf}）；此外还要「矩阵给了归档模式」+「该笼位所在区域开着」，
     * 与其它学生模式同口径：**入口可见性按区域算，动手时按笼位收口**。
     * 教职工维持原判定（{@code cage.mode.archive}），管理员/额外操作身份的旁路不受影响。
     */
    @PostMapping("/archive")
    @Operation(summary = "归档笼位（释放占用 → 空笼盒）→ 只写本地")
    public Result<?> archive(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.MEMBER);
        if (denied != null) return denied;

        Long animalCageId = toLong(body == null ? null : body.get("animalCageId"));
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");

        if (modeVisibilityService.isStudent(u)) {
            if (!modeVisibilityService.canStudentMode(u, "archive")) {
                return Result.fail(403, "学生当前可用的模式不含归档");
            }
            if (!cageOperationService.isOccupantSelf(u, animalCageId)) {
                return Result.fail(403, "只能归档本人使用中的笼位");
            }
            if (!regionCapabilityService.cageRegionEnabled(u, animalCageId,
                    CageRegionCapabilityService.modeCapability("archive"))) {
                return Result.fail(403, "该笼位所在区域未开放归档，请联系该区域饲养组长");
            }
        } else if (!modeVisibilityService.canUseMode(u, "archive")) {
            return Result.fail(403, "无归档权限（仅归档模式身份可操作）");
        }

        Map<String, Object> out = occupancyService.archive(animalCageId, u.getId(), str(body, "reason"));
        log.info("[local/archive] {} 归档笼位 {} {}", operatorDisplayName(u), animalCageId,
                buildPositionLabel(animalCageId));
        return Result.success(out);
    }

    // ═══════════════════════════════════════════
    // 实验记录 & 照片
    // ═══════════════════════════════════════════
    @GetMapping("/annotate/{animalCageId}")
    @Operation(summary = "读取笼位实验记录和照片")
    public Result<?> getAnnotate(@PathVariable Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        Map<String, Object> local = infoValueService.getLocalFields(animalCageId);
        Object ed = local.get("experiment_desc");
        Object img = local.get("images_json");
        Object sp = local.get("extra_data");
        // 实验记录内容按台账同一条判据脱敏：这个接口兼着状态照片的读口（各端都读），
        // 不能一边收严台账、一边从这里照样把别人的 experiment_desc 发出去。
        boolean canViewRecords = cageOperationService.canViewExperimentRecords(u, animalCageId);
        return Result.success(Map.of(
            "experimentDesc", (!canViewRecords || ed == null) ? "" : String.valueOf(ed),
            "imagesJson", (!canViewRecords || img == null) ? "[]" : String.valueOf(img),
            "statusPhotos", sp == null ? "{}" : String.valueOf(sp)
        ));
    }

    @PostMapping("/annotate")
    @Operation(summary = "写入笼位实验记录和照片")
    public Result<?> annotate(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.MEMBER);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");

        String experimentDesc = body.containsKey("experimentDesc") ? str(body, "experimentDesc") : null;
        String imagesJson = body.containsKey("imagesJson") ? str(body, "imagesJson") : null;
        String statusPhotos = body.containsKey("statusPhotos") ? str(body, "statusPhotos") : null;

        // 字段级拆权：
        //  - experimentDesc/imagesJson = 实验记录/图片，仅「该笼位占用者本人」可写；
        //  - statusPhotos = 状态照片，仅「能控制状态模式」的身份可写。
        //
        // 只统计**真的改了**的字段。客户端习惯把 GET 读到的整包原样回传（详情弹窗其实只改实验记录，
        // 却把界面上只读的 statusPhotos 一起带上），按「key 在不在」判权限等于把没碰过的字段的闸也叠上
        // —— 实验员存实验记录被「状态照片」权限拦死就是这么来的。
        Map<String, Object> current = infoValueService.getLocalFields(animalCageId);
        boolean wantsRecord =
                changed(experimentDesc, current.get("experiment_desc"), "") ||
                changed(imagesJson, current.get("images_json"), "[]");
        boolean wantsStatusPhoto = changed(statusPhotos, current.get("extra_data"), "{}");

        if (!wantsRecord && !wantsStatusPhoto) {
            // 一个字段都没变：不写库、不留痕，直接当成功
            return Result.success(Map.of("ok", true, "unchanged", true));
        }

        if (wantsRecord) {
            // 双 id 安全：claimantId 可能是 STAFF_ 前缀也可能是 ARO 编号，同一个人的两种形态。
            // 占用者 = 活跃认领人 **或** 表单「实验员」（experimenter_name）—— 与归档、网格 mine、
            // 通知收件人同一条口径；只认认领记录会把「表单里写着名字的实验员」判成外人。
            boolean isOwner = cageOperationService.isOccupantSelf(u, animalCageId);
            if (!isOwner) return Result.fail(403, "仅笼位占用者本人可编辑实验记录与图片");
        }
        if (wantsStatusPhoto) {
            // 学生只被下放「合笼」这一个标记动作，状态照片不跟着开 —— 这条必须显式判 isStudent：
            // 光看 canUseMode 会漏，因为带 BREEDER/LEADER 身份 code 的学生本来就能过那一道。
            if (modeVisibilityService.isStudent(u) || !modeVisibilityService.canUseMode(u, "edit")) {
                return Result.fail(403, "无状态照片编辑权限（仅状态模式身份可操作）");
            }
        }

        Map<String, Object> values = new HashMap<>();
        if (experimentDesc != null) values.put("experiment_desc", experimentDesc);
        if (imagesJson != null) values.put("images_json", imagesJson);
        if (statusPhotos != null) values.put("extra_data", statusPhotos);
        infoValueService.saveLocalFields(animalCageId, values, u.getId());

        // 同时写入历史归档（标注类操作，statusField="_annotation"）
        CageCellHistory h = new CageCellHistory();
        h.setAnimalCageId(animalCageId);
        h.setStatusField("_annotation");
        h.setImagesJson(imagesJson);
        h.setExperimentDesc(experimentDesc);
        h.setToggledBy(operatorDisplayName(u));
        h.setAction("annotated");
        historyMapper.insert(h);

        log.info("[local/annotate] user={} animalCageId={}", operatorDisplayName(u), animalCageId);
        return Result.success(Map.of("ok", true));
    }

    // ═══════════════════════════════════════════
    // 实验记录台账（追加式，时间戳留痕）
    // ═══════════════════════════════════════════

    @GetMapping("/experiment-record/mine")
    @Operation(summary = "我的实验记录：按房间分组，含已失去权限/已归档的历史笼位")
    public Result<?> getMyExperimentRecords(HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        return Result.success(experimentRecordService.groupMineByRoom(u));
    }

    @GetMapping("/experiment-record/{animalCageId}")
    @Operation(summary = "读取笼位实验记录台账（含本人草稿）")
    public Result<?> getExperimentRecords(@PathVariable Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        return Result.success(experimentRecordState(u, animalCageId));
    }

    /**
     * 写台账：{@code action=draft} 存草稿（有则覆盖），{@code action=submit} 提交成一条新记录。
     *
     * <p>**没有**改/删已提交记录的入口 —— 不可编辑不可删除是设计约束，不是权限门。
     * 写权限只有实验员本人（与旧的实验记录分支同口径）。
     */
    @PostMapping("/experiment-record")
    @Operation(summary = "存草稿 / 提交一条实验记录")
    public Result<?> saveExperimentRecord(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.MEMBER);
        if (denied != null) return denied;

        Long animalCageId = toLong(body.get("animalCageId"));
        if (animalCageId == null) return Result.fail(400, "animalCageId 必填");
        if (!cageOperationService.canWriteExperimentRecords(u, animalCageId)) {
            return Result.fail(403, "仅笼位占用者本人可记录实验记录");
        }

        boolean submit = "submit".equals(str(body, "action"));
        String content = body.containsKey("content") ? str(body, "content") : null;
        String imagesJson = body.containsKey("imagesJson") ? str(body, "imagesJson") : null;
        if (submit && !hasRecordBody(content, imagesJson)) {
            return Result.fail(400, "记录内容不能为空，请填写文字或添加照片");
        }

        if (submit) {
            experimentRecordService.submit(animalCageId, u, content, imagesJson);
        } else {
            experimentRecordService.saveDraft(animalCageId, u, content, imagesJson);
        }
        log.info("[local/experiment-record] {} 笼位 {} {}", operatorDisplayName(u),
                submit ? "提交" : "存草稿", animalCageId);
        return Result.success(experimentRecordState(u, animalCageId));
    }

    /**
     * 台账状态：能不能看、能不能写、已提交记录、本人当前草稿。
     *
     * <p>看不到时**记录与草稿一律不下发**（前端只渲染 *** 占位）—— 脱敏在服务端做完，
     * 不靠前端自觉，否则同一个接口换个客户端就是漏的。
     */
    private Map<String, Object> experimentRecordState(User u, Long animalCageId) {
        boolean canView = cageOperationService.canViewExperimentRecords(u, animalCageId);
        boolean canWrite = cageOperationService.canWriteExperimentRecords(u, animalCageId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("canView", canView);
        out.put("canWrite", canWrite);
        if (!canView) {
            out.put("records", List.of());
            out.put("draft", null);
            return out;
        }
        out.put("records", experimentRecordService.listSubmitted(animalCageId));
        out.put("draft", canWrite ? experimentRecordService.myDraft(animalCageId, u) : null);
        return out;
    }

    /** 一条记录正文或照片至少有一项 */
    private static boolean hasRecordBody(String content, String imagesJson) {
        return (content != null && !content.isBlank())
                || (imagesJson != null && !imagesJson.isBlank() && !"[]".equals(imagesJson.trim()));
    }

    // ═══════════════════════════════════════════
    // 图片笔记历史归档
    // ═══════════════════════════════════════════

    @GetMapping("/history/{animalCageId}")
    @Operation(summary = "读取笼位图片笔记归档历史")
    public Result<?> getHistory(@PathVariable Long animalCageId, HttpServletRequest req) {
        if (resolveUser(req.getHeader("Authorization")) == null) return Result.fail(401, "未登录");
        List<CageCellHistory> list = historyMapper.selectByAnimalCageId(animalCageId);
        return Result.success(list);
    }

    @DeleteMapping("/history/{id}")
    @Operation(summary = "删除单条归档历史记录")
    public Result<?> deleteHistory(@PathVariable Long id, HttpServletRequest req) {
        User u = resolveUser(req.getHeader("Authorization"));
        Result<?> denied = requireRole(u, RoleEnum.STAFF);
        if (denied != null) return denied;
        int affected = historyMapper.deleteById(id);
        return affected > 0 ? Result.success("已删除") : Result.fail(404, "记录不存在");
    }

    // ═══════════════════════════════════════════
    // 本地扫码检索
    // ═══════════════════════════════════════════

    @GetMapping("/scan-lookup")
    @Operation(summary = "本地DB扫码检索：先查 cage_box_code，再查 animal_cage_id")
    public Result<?> scanLookup(@RequestParam String code, HttpServletRequest req) {
        if (resolveUser(req.getHeader("Authorization")) == null) return Result.fail(401, "未登录");
        if (code == null || code.isBlank()) return Result.fail(400, "code 不能为空");
        String q = code.trim();

        // ① 查 cage_box_code
        CageCellDetail d = detailMapper.selectByCageBoxCode(q);
        if (d != null) {
            Map<String, Object> pos = indexMapper.selectByAnimalCageId(d.getAnimalCageId());
            return Result.success(buildScanResult(d.getAnimalCageId(), q, pos, "CAGE_BOX"));
        }

        // ② 尝试作为 animalCageId 数字检索
        try {
            Long aid = Long.parseLong(q);
            Map<String, Object> pos = indexMapper.selectByAnimalCageId(aid);
            if (pos != null) {
                return Result.success(buildScanResult(aid, q, pos, "CAGE_ID"));
            }
        } catch (NumberFormatException ignored) {}

        return Result.success(Map.of("type", "NOT_FOUND", "message", "未找到对应笼位: " + q));
    }

    private Map<String, Object> buildScanResult(Long animalCageId, String code, Map<String, Object> pos, String type) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("type", type);
        r.put("animalCageId", animalCageId);
        r.put("code", code);
        if (pos != null) {
            r.put("roomId", pos.get("roomId"));
            r.put("roomName", pos.get("room_name"));
            // shelf_index_id = cage_shelf_index.id (主键)，后端用 findById 直接加载
            Object sid = pos.get("shelf_index_id");
            if (sid == null) sid = pos.get("shelve_id");
            r.put("shelveId", sid);
            r.put("shelveName", pos.get("shelve_name"));
            r.put("positionX", pos.get("position_x"));
            r.put("positionY", pos.get("position_y"));
        }
        return r;
    }

    // ═══════════════════════════════════════════
    // helpers
    // ═══════════════════════════════════════════

    /** 根据 animalCageId 查出位置信息，生成可读的位置标签 */
    private String buildPositionLabel(Long animalCageId) {
        try {
            Map<String, Object> idx = indexMapper.selectByAnimalCageId(animalCageId);
            if (idx != null) {
                String room = String.valueOf(idx.getOrDefault("room_name", "?"));
                String shelf = String.valueOf(idx.getOrDefault("shelve_name", "?"));
                int x = toInt(idx.get("position_x"));
                int y = toInt(idx.get("position_y"));
                return String.format("(%s/%s %d,%d)", room, shelf, x, y);
            }
        } catch (Exception e) {
            log.warn("[local] buildPositionLabel 查询失败 animalCageId={}: {}", animalCageId, e.getMessage());
        }
        return "";
    }

    private static int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return 0; }
    }

    private static String str(Map<String, Object> m, String k) { Object v = m.get(k); return v == null ? null : String.valueOf(v).trim(); }

    /**
     * 入参是不是**真的改了**这个字段。
     *
     * <p>null（请求体里没带这个 key）永远算「没改」；与库里的当前值相等也算没改，
     * 当前值缺失时按该字段的「空值」（{@code emptyDefault}）比 —— 与 GET 的默认值口径一致。
     * 客户端把整包原样回传是常态，按「key 存在」判会把只读字段的写权限也一并要求上。
     */
    private static boolean changed(String incoming, Object stored, String emptyDefault) {
        if (incoming == null) return false;
        String cur = stored == null ? emptyDefault : String.valueOf(stored);
        return !incoming.trim().equals(cur.trim());
    }
    private static Long toLong(Object v) {
        if (v == null) return null; if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
}
