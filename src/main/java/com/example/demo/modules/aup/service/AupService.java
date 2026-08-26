package com.example.demo.modules.aup.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.aup.dto.AupAttachmentVO;
import com.example.demo.modules.aup.dto.AupBatchDeleteRequest;
import com.example.demo.modules.aup.dto.AupDetailVO;
import com.example.demo.modules.aup.dto.AupListItem;
import com.example.demo.modules.aup.dto.AupSnapshotVO;
import com.example.demo.modules.aup.dto.AupTraceVO;
import com.example.demo.modules.aup.dto.AupValidationErrorDTO;
import com.example.demo.modules.aup.dto.SignatureContextVO;
import com.example.demo.modules.aup.entity.AupAttachment;
import com.example.demo.modules.aup.entity.AupAuditLog;
import com.example.demo.modules.aup.entity.AupData;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.entity.AupSnapshot;
import com.example.demo.modules.aup.mapper.AupAttachmentMapper;
import com.example.demo.modules.aup.mapper.AupAuditLogMapper;
import com.example.demo.modules.aup.mapper.AupDataMapper;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileRecordService;
import com.example.demo.modules.upload.service.UploadFileStorageService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AUP 计划书主链路：草稿/保存/提交/快照/留痕/附件/注册号/到期 + 状态机 transition（审批子模块接缝）。
 */
@Service
public class AupService {

    private static final Logger log = LoggerFactory.getLogger(AupService.class);

    public static final String FORM_KEY = "aup";

    // 状态机
    public static final String STAGE_DRAFT = "draft";
    public static final String STAGE_PI_REVIEW = "piReview";
    public static final String STAGE_FORMAT_REVIEW = "formatReview";
    public static final String STAGE_EXPERT_REVIEW = "expertReview";
    public static final String STAGE_APPROVED = "approved";
    public static final String STAGE_TERMINATED = "terminated";
    public static final String STAGE_EXPIRED = "expired";

    // 通知源
    private static final String SRC_SUBMITTED = "AUP_SUBMITTED";
    private static final String SRC_PI_RETURNED = "AUP_PI_RETURNED";
    private static final String SRC_TO_FORMAT = "AUP_TO_FORMAT";
    private static final String SRC_FORMAT_RETURNED = "AUP_FORMAT_RETURNED";
    private static final String SRC_ASSIGNED = "AUP_ASSIGNED";
    private static final String SRC_EXPERT_RETURNED = "AUP_EXPERT_RETURNED";
    private static final String SRC_TERMINATED = "AUP_TERMINATED";
    private static final String SRC_APPROVED = "AUP_APPROVED";
    private static final String SRC_EXPIRED = "AUP_EXPIRED";

    private final AupRecordMapper recordMapper;
    private final AupDataMapper dataMapper;
    private final AupAuditLogMapper auditLogMapper;
    private final AupAttachmentMapper attachmentMapper;
    private final AupSnapshotService snapshotService;
    private final AupAccessPolicy accessPolicy;
    private final NotificationService notificationService;
    private final UploadFileStorageService uploadFileStorageService;
    private final UploadFileRecordService uploadFileRecordService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AroService aroService;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final UserAroBindingMapper userAroBindingMapper;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AupDemoSeeder aupDemoSeeder;
    private final AupAnimalAllowlistCompat allowlistCompat;

    /** 签名可信邮箱域（逗号分隔），不硬编码、可配置 */
    @Value("${aup.signature.trusted-domains:@shsmu.edu.cn}")
    private String trustedDomains;

    /** 附件大小上限（字节），默认 20MB */
    @Value("${aup.attachment.max-size:20971520}")
    private long maxAttachmentSize;

    /** 单计划附件数量上限 */
    @Value("${aup.attachment.max-count:10}")
    private int maxAttachmentCount;

    /** PI 身份标识 code（统一体系，key=staff_id），与 AupAccessPolicy 同键、不硬编码 */
    @Value("${aup.identity.pi-code:PI}")
    private String piCode;

    public AupService(AupRecordMapper recordMapper,
                      AupDataMapper dataMapper,
                      AupAuditLogMapper auditLogMapper,
                      AupAttachmentMapper attachmentMapper,
                      AupSnapshotService snapshotService,
                      AupAccessPolicy accessPolicy,
                      NotificationService notificationService,
                      UploadFileStorageService uploadFileStorageService,
                      UploadFileRecordService uploadFileRecordService,
                      AroPersonnelMapper aroPersonnelMapper,
                      AroService aroService,
                      UserMapper userMapper,
                      UserDisplayNameService userDisplayNameService,
                      UserAroBindingMapper userAroBindingMapper,
                      JdbcTemplate jdbcTemplate,
                      ObjectMapper objectMapper,
                      AupDemoSeeder aupDemoSeeder,
                      AupAnimalAllowlistCompat allowlistCompat) {
        this.recordMapper = recordMapper;
        this.dataMapper = dataMapper;
        this.auditLogMapper = auditLogMapper;
        this.attachmentMapper = attachmentMapper;
        this.snapshotService = snapshotService;
        this.accessPolicy = accessPolicy;
        this.notificationService = notificationService;
        this.uploadFileStorageService = uploadFileStorageService;
        this.uploadFileRecordService = uploadFileRecordService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.aroService = aroService;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.userAroBindingMapper = userAroBindingMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.aupDemoSeeder = aupDemoSeeder;
        this.allowlistCompat = allowlistCompat;
    }

    // ======================================================================
    // 草稿 / 保存 / 提交
    // ======================================================================

    /** 新建草稿：冻结当前 PUBLISHED 模板版本，初始化 draft/round_no=1/draft_source=first + 空 aup_data */
    @Transactional
    public AupRecord createDraft(User user, String templateVersion) {
        long[] tpl = resolvePublishedTemplate();
        Long templateId = tpl[0];
        // 忽略客户端 templateVersion，防止绑定非发布模板或 id/version 不一致
        String frozenVersion = String.valueOf(tpl[1]);

        AupRecord record = new AupRecord();
        record.setTemplateId(templateId);
        record.setTemplateVersion(frozenVersion);
        record.setVersion(0L);
        record.setCurrentStage(STAGE_DRAFT);
        record.setRoundNo(1);
        record.setDraftSource("first");
        record.setCarriedOverCount(0);
        record.setCreatedBy(user.getId());
        record.setProjectGroupName(resolveProjectGroupName(user.getId()));
        record.setIsDemo(0);
        recordMapper.insert(record);

        AupData data = new AupData();
        data.setAupId(record.getId());
        data.setData("{}");
        data.setVersion(0L);
        data.setUpdatedBy(user.getId());
        dataMapper.insert(data);
        return record;
    }

    /** 从 aro_personnel 取用户课题组名（学生端按课题组协作查看用）；学生库没有时回退 sys_user.project_group_name（教职工账号） */
    private String resolveProjectGroupName(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            // STAFF_* 账号需经 user_aro_binding 展开成 aro_user_id，再索引 aro_personnel
            String aroUserId = userId;
            if (userId.startsWith("STAFF_")) {
                UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
                if (binding != null && StringUtils.hasText(binding.getAroUserId())) {
                    aroUserId = binding.getAroUserId();
                }
            }
            AroPersonnel p = aroPersonnelMapper.findByUserId(aroUserId);
            if (p != null && StringUtils.hasText(p.getProjectGroupName())) {
                return p.getProjectGroupName();
            }
            if (!aroUserId.equals(userId)) {
                AroPersonnel p2 = aroPersonnelMapper.findByUserId(userId);
                if (p2 != null && StringUtils.hasText(p2.getProjectGroupName())) {
                    return p2.getProjectGroupName();
                }
            }
            List<String> rows = jdbcTemplate.queryForList(
                    "SELECT project_group_name FROM sys_user WHERE id = ?", String.class, userId);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** 保存草稿（乐观锁 CAS，非 draft 只读 403） */
    @Transactional
    public Map<String, Object> save(Long aupId, String dataJson, Long expectedVersion, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertDraftWritable(record, user);
        if (!STAGE_DRAFT.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(403, "计划书非草稿状态，仅可查看");
        }
        // 保存/自动保存用静默剥离（不落审计）：隐藏区块值清洗是保存期的常规动作，
        // 若在此写审计，提交前的 flushSave 会与 submit 各留一条重复 strip 留痕。
        String cleaned = stripHiddenFieldsQuiet(record.getTemplateId(), dataJson);
        return persistDraftData(aupId, cleaned, expectedVersion, user.getId());
    }

    /** 自动保存：语义同 save（防抖/幂等） */
    @Transactional
    public Map<String, Object> autosave(Long aupId, String dataJson, Long expectedVersion, User user) {
        return save(aupId, dataJson, expectedVersion, user);
    }

    /** 提交：校验 + 签名 + CAS 流转 draft→formatReview + 快照 + 审计 + 通知秘书 */
    @Transactional
    public AupRecord submit(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertDraftWritable(record, user);
        if (!STAGE_DRAFT.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "计划书非草稿状态，无法提交");
        }

        AupData data = dataMapper.selectByAupId(aupId);
        String raw = data == null ? "{}" : data.getData();
        // 剥离隐藏区块注入值（写审计）
        String cleaned = stripHiddenFields(record.getTemplateId(), aupId, raw, user.getId());
        Map<String, Object> dataMap = parseMap(cleaned);

        // 1. 字段校验
        List<AupValidationErrorDTO> errors = validateData(record.getTemplateId(), dataMap);
        if (!errors.isEmpty()) {
            throw TwinBusinessException.of(400, "VALIDATION_FAILED:" + errors.size());
        }

        // 2. 签名（3.8）：可信域自动写占位；否则须手写签名，且持久化剥离后的数据
        SignatureContextVO sig = resolveSignature(user);
        if (sig.isDomainTrusted()) {
            Map<String, Object> signed = parseMap(cleaned);
            signed.put("signature", "EMAIL_TRUSTED:" + (sig.getEmail() == null ? "" : sig.getEmail()));
            signed.put("signSource", "EMAIL_TRUSTED");
            persistDraftData(aupId, toJson(signed), null, user.getId());
            cleaned = dataMapper.selectByAupId(aupId).getData();
        } else {
            if (!hasHandSignature(cleaned)) {
                throw TwinBusinessException.of(400, "SIGNATURE_REQUIRED:邮箱不在可信域，请手写签名后提交");
            }
            persistDraftData(aupId, cleaned, null, user.getId());
        }

        // 3. 回填项目冗余字段（组长 = 课题组 GROUP_LEADER 身份标识者）
        applyProjectMeta(record, cleaned);

        // 4. 提交鉴权 + 按提交者身份决定目标阶段：组长/教职工/管理员直接进格式审查，学生实验员/同组进组长审核
        accessPolicy.assertCanSubmit(record, user);
        String role = accessPolicy.resolveOperatorRole(record, user);
        // 教职工判定统一按 role（切学生视角后 accountSource 变 STUDENT，id 变学号，仅 role 被 resolveUnifiedRole 统一）
        boolean skipPiReview = accessPolicy.isAdmin(user) || accessPolicy.isPi(user)
                || (user.getRole() != null && user.getRole().getLevel() >= RoleEnum.STAFF.getLevel());
        String targetStage = skipPiReview ? STAGE_FORMAT_REVIEW : STAGE_PI_REVIEW;
        return transition(aupId, STAGE_DRAFT, targetStage, "submit", user.getId(), role, null);
    }

    // ======================================================================
    // 状态机 transition（审批子模块接缝，签名固定，勿改）
    // ======================================================================

    /**
     * 状态机流转（乐观锁 CAS）。审批子 agent 依赖此签名，请勿变更。
     * 内部：CAS 更新 current_stage + 写快照（版本号递增）+ 写审计 + 触发通知。
     */
    @Transactional
    public AupRecord transition(Long aupId, String fromStage, String toStage, String action,
                                String operatorId, String operatorRole, String comment) {
        AupRecord record = recordMapper.selectById(aupId);
        if (record == null) {
            throw TwinBusinessException.of(404, "计划书不存在");
        }
        if (isDemo(record)) {
            throw TwinBusinessException.of(409, "演示示例已阻止流转，不可推进到下一步");
        }
        if (!fromStage.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "计划书状态已变更，请刷新后重试");
        }

        String act = action == null ? "" : action;
        boolean isReturn = (STAGE_DRAFT.equals(toStage) || STAGE_PI_REVIEW.equals(toStage)) && !STAGE_DRAFT.equals(fromStage);
        boolean isReassign = "reassign".equals(act);
        boolean isSubmit = "submit".equals(act);
        boolean isApprove = STAGE_APPROVED.equals(toStage);
        boolean isExpire = "expire".equals(act);

        int roundNo = record.getRoundNo() == null ? 1 : record.getRoundNo();
        String draftSource = null;
        LocalDateTime submittedAt = null;
        LocalDateTime approvedAt = null;
        LocalDateTime expireAt = null;
        String registerNo = null;
        Integer registerYear = null;
        Integer registerSeq = null;

        if (isReturn) {
            String src = returnSourceOf(fromStage);
            draftSource = src;
            // piReturn（组长退回给实验员）是内部打回，不算委员会轮次，不递增 roundNo
            if (!"piReturn".equals(src)) {
                roundNo += 1;
            }
        }
        if (isReassign) {
            // 全弃权/全回避重分配（expertReview→formatReview）也递增轮次，
            // 避免新分配 assignment 仍写同一 (aup_id, round_no, reviewer_id) 撞唯一键。
            roundNo += 1;
        }
        if (isSubmit) {
            draftSource = "first";
            submittedAt = LocalDateTime.now();
        }
        if (isApprove) {
            LocalDateTime now = LocalDateTime.now();
            approvedAt = now;
            expireAt = now.plusYears(3);
        }

        int rows = 0;
        int attempts = isSubmit ? 2 : 1;
        for (int i = 0; i < attempts; i++) {
            if (isSubmit && record.getRegisterNo() == null) {
                String[] parts = computeRegisterParts(record);
                registerNo = parts[0];
                registerYear = Integer.valueOf(parts[1]);
                registerSeq = Integer.valueOf(parts[2]);
            }
            try {
                rows = recordMapper.updateStageCas(aupId, fromStage, toStage, record.getVersion(),
                        draftSource, roundNo, registerNo, registerYear, registerSeq,
                        expireAt, approvedAt, submittedAt);
            } catch (DuplicateKeyException e) {
                if (isSubmit && i == 0) {
                    log.warn("[AUP] 注册号唯一冲突，重试一次 aupId={}", aupId);
                    continue;
                }
                throw e;
            }
            if (rows == 0) {
                throw TwinBusinessException.of(409, "计划书状态已变更，请刷新后重试");
            }
            break;
        }

        // 快照（到期动作不写快照，§3.2）
        if (!isExpire) {
            AupData data = dataMapper.selectByAupId(aupId);
            // 草稿来源：退回/提交时用本次流转算出的新值，其余（通过/终止等）沿用 record 现值
            String snapDraftSource = draftSource != null ? draftSource : record.getDraftSource();
            snapshotService.createSnapshot(record, toStage, snapDraftSource, data == null ? null : data.getData(), operatorId);
        }

        // 批准时固化动物白名单（B5 大类 SUBTREE + B6 品系 EXACT），供订购侧可购校验
        if (isApprove) {
            AupData approveData = dataMapper.selectByAupId(aupId);
            String allowlist = allowlistCompat.buildFromFormJson(approveData == null ? null : approveData.getData());
            recordMapper.updateRegistryMeta(aupId, allowlist, "active");
        }

        // 审计
        audit(aupId, operatorId, operatorRole, act, fromStage, toStage, comment);

        // 通知（与主事务同事务，失败不阻塞）
        notifyForTransition(record, fromStage, toStage, act, operatorId, comment);

        return recordMapper.selectById(aupId);
    }

    private String returnSourceOf(String fromStage) {
        if (STAGE_PI_REVIEW.equals(fromStage)) {
            return "piReturn";
        }
        if (STAGE_FORMAT_REVIEW.equals(fromStage)) {
            return "formatReturn";
        }
        if (STAGE_EXPERT_REVIEW.equals(fromStage)) {
            return "expertReturn";
        }
        return "first";
    }

    // ======================================================================
    // 注册号（§3.6）
    // ======================================================================

    /**
     * 生成注册号 JUMC{yyyy}-{seq}[-字母]。
     * 字母 A/B/C 由项目负责人所属机构类型映射（校内/附属医院/其他科研机构）；
     * 当前无可靠机构类型字段，默认不追加字母（见未决问题）。
     */
    public String generateRegisterNo(AupRecord record) {
        return computeRegisterParts(record)[0];
    }

    private String[] computeRegisterParts(AupRecord record) {
        int year = LocalDate.now().getYear();
        int seq = nextSeqForYear(year);
        String letter = resolveInstitutionLetter(record);
        String no = "JUMC" + year + "-" + seq + (letter.isEmpty() ? "" : "-" + letter);
        return new String[]{no, String.valueOf(year), String.valueOf(seq)};
    }

    private int nextSeqForYear(int year) {
        Integer max = recordMapper.selectMaxSeqByYear(year);
        return (max == null ? 0 : max) + 1;
    }

    /** 机构类型 → 字母。无可靠来源字段时返回空串（不追加字母）。 */
    private String resolveInstitutionLetter(AupRecord record) {
        // TODO: 机构类型字段落定后按「校内 A / 附属医院 B / 其他科研机构 C」映射
        return "";
    }

    // ======================================================================
    // 校验（§3.4）
    // ======================================================================

    /** 按发布版模板逐字段校验，返回结构化 errors[]（供 submit/save 兜底与预检）。校验前先剥离隐藏区块值。 */
    public List<AupValidationErrorDTO> validate(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        AupData data = dataMapper.selectByAupId(aupId);
        String raw = data == null ? "{}" : data.getData();
        String cleaned = stripHiddenFieldsQuiet(record.getTemplateId(), raw);
        return validateData(record.getTemplateId(), parseMap(cleaned));
    }

    private List<AupValidationErrorDTO> validateData(Long templateId, Map<String, Object> data) {
        List<AupValidationErrorDTO> errors = new ArrayList<>();
        List<FieldDef> fields = loadFieldDefs(templateId);
        for (FieldDef f : fields) {
            // 被三层 showWhen 条件隐藏的字段不参与校验（必填/类型/字典/表格）
            if (isFieldHidden(f, data)) {
                continue;
            }
            Object value = valueOf(data, f.fieldKey);
            // 必填
            if (f.required && isBlankValue(value)) {
                errors.add(new AupValidationErrorDTO(f.fieldKey, "REQUIRED", "「" + f.label + "」为必填项"));
                continue;
            }
            if (isBlankValue(value)) {
                continue;
            }
            // 字数上限
            Integer maxLen = f.maxLength;
            if (maxLen != null && value instanceof String s && s.length() > maxLen) {
                errors.add(new AupValidationErrorDTO(f.fieldKey, "MAX_LENGTH_EXCEEDED",
                        "「" + f.label + "」超出字数上限 " + maxLen + " 字"));
            }
            // 数字
            if ("number".equals(f.type) && !isNumeric(value)) {
                errors.add(new AupValidationErrorDTO(f.fieldKey, "TYPE_INVALID", "「" + f.label + "」须为数字"));
            }
            // 字典白名单
            if (StringUtils.hasText(f.dictKey)) {
                Set<String> allowed = loadDictValues(f.dictKey);
                if (!allowed.isEmpty()) {
                    List<String> vals = flattenValues(value);
                    for (String v : vals) {
                        if (!allowed.contains(v)) {
                            errors.add(new AupValidationErrorDTO(f.fieldKey, "DICT_ILLEGAL",
                                    "「" + f.label + "」取值非法：" + v));
                            break;
                        }
                    }
                }
            }
            // 表格逐行校验
            if ("table".equals(f.type) && value instanceof List<?> rows) {
                for (int ri = 0; ri < rows.size(); ri++) {
                    Object row = rows.get(ri);
                    if (!(row instanceof Map<?, ?> m)) {
                        continue;
                    }
                    for (Map.Entry<String, String> e : f.tableColumnLabels.entrySet()) {
                        Object cell = m.get(e.getKey());
                        if (isBlankValue(cell)) {
                            String colLabel = (e.getValue() != null && !e.getValue().isBlank()) ? e.getValue() : e.getKey();
                            errors.add(new AupValidationErrorDTO(f.fieldKey, "ROW_INCOMPLETE",
                                    "「" + f.label + "」第 " + (ri + 1) + " 行「" + colLabel + "」未填写", ri + 1));
                        }
                    }
                }
            }
            // 可重复块逐项校验（块内必填/字数，showWhen 对块对象求值）
            if ("repeatGroup".equals(f.type) && value instanceof List<?> blocks) {
                for (int bi = 0; bi < blocks.size(); bi++) {
                    Object blk = blocks.get(bi);
                    if (!(blk instanceof Map<?, ?> bm)) {
                        continue;
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, Object> block = (Map<String, Object>) bm;
                    for (FieldDef c : f.repeatGroupChildren) {
                        if (c.fieldKey == null) {
                            continue;
                        }
                        if (StringUtils.hasText(c.showWhen) && !evaluateShowWhen(c.showWhen, block)) {
                            continue;
                        }
                        Object cv = block.get(c.fieldKey);
                        String cLabel = (c.label != null && !c.label.isBlank()) ? c.label : c.fieldKey;
                        if (c.required && isBlankValue(cv)) {
                            errors.add(new AupValidationErrorDTO(f.fieldKey, "BLOCK_INCOMPLETE",
                                    "「" + f.label + "」第 " + (bi + 1) + " 项「" + cLabel + "」未填写", bi + 1));
                            continue;
                        }
                        Integer cMax = c.maxLength;
                        if (cMax != null && cv instanceof String s && s.length() > cMax) {
                            errors.add(new AupValidationErrorDTO(f.fieldKey, "MAX_LENGTH_EXCEEDED",
                                    "「" + f.label + "」第 " + (bi + 1) + " 项「" + cLabel + "」超出字数上限 " + cMax + " 字"));
                        }
                    }
                }
            }
        }
        // B6 数量 > 1000 → B7 必选「依据充分」
        checkB6Threshold(data, errors);
        // 联动一致性
        checkLinkage(data, errors);
        return errors;
    }

    private void checkB6Threshold(Map<String, Object> data, List<AupValidationErrorDTO> errors) {
        Double sum = sumAnimalCount(data);
        if (sum != null && sum > 1000) {
            boolean b7Ok = containsAnyValue(data, "B7", "依据充分", "充分", "justified");
            if (!b7Ok) {
                errors.add(new AupValidationErrorDTO("B7", "B7_REQUIRED", "动物数量超过 1000 只，须勾选「依据充分」类选项"));
            }
        }
    }

    /** 联动一致性（auto-set 后端兜底）。数据形状未定，仅做可确定的断言，不确定则跳过。 */
    private void checkLinkage(Map<String, Object> data, List<AupValidationErrorDTO> errors) {
        // B6 目录D → A8 勾 I（关键词用「目录D」，不可用裸 D——会误伤「SD 大鼠」等品种名）
        if (containsAnyValue(data, "B6", "目录D", "目录 D", "catalogD")
                && !containsAnyValue(data, "A8", "I", "i")) {
            errors.add(new AupValidationErrorDTO("A8", "LINKAGE_REQUIRED", "B6 含目录D，须在 A8 勾选 I"));
        }
        // B6 国外 → A7 勾进口
        if (containsAnyValue(data, "B6", "国外", "imported", "进口")
                && !containsAnyValue(data, "A7", "进口", "import")) {
            errors.add(new AupValidationErrorDTO("A7", "LINKAGE_REQUIRED", "B6 含国外来源，须在 A7 勾选进口"));
        }
        // C1 课题组管理区域 → A8 勾 L/H
        if (containsAnyValue(data, "C1", "课题组", "projectGroup")
                && !containsAnyValue(data, "A8", "L", "H", "l", "h")) {
            errors.add(new AupValidationErrorDTO("A8", "LINKAGE_REQUIRED", "C1 为课题组管理区域，须在 A8 勾选 L/H"));
        }
        // E3 放射性/生物危害 → A8 勾 G
        if (containsAnyValue(data, "E3", "放射性", "生物危害", "biohazard", "radioactive")
                && !containsAnyValue(data, "A8", "G", "g")) {
            errors.add(new AupValidationErrorDTO("A8", "LINKAGE_REQUIRED", "E3 含放射性/生物危害，须在 A8 勾选 G"));
        }
        // D2 保定 → 补 I
        if (containsAnyValue(data, "D2", "保定", "restraint")
                && !containsAnyValue(data, "A8", "I", "i")) {
            errors.add(new AupValidationErrorDTO("A8", "LINKAGE_REQUIRED", "D2 含保定，须补充勾选 I"));
        }
        // J 国外来源 → A7 勾进口
        if (containsAnyValue(data, "J", "国外", "imported", "进口")
                && !containsAnyValue(data, "A7", "进口", "import")) {
            errors.add(new AupValidationErrorDTO("A7", "LINKAGE_REQUIRED", "J 含国外来源，须在 A7 勾选进口"));
        }
    }

    // ======================================================================
    // 快照 / 回退
    // ======================================================================

    @Transactional
    public AupRecord rollback(Long aupId, Long snapshotId, User user) {
        AupRecord record = requireRecord(aupId);
        if (isDemo(record)) {
            throw TwinBusinessException.of(409, "演示示例已阻止流转，不可回退");
        }
        boolean admin = accessPolicy.isAdmin(user);
        if (!admin) {
            accessPolicy.assertDraftWritable(record, user);
        }
        // 阶段守卫：仅草稿可回退快照；已批准/终止/专家审查等状态回退走 unlock（管理员）或重新提交
        if (!STAGE_DRAFT.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "仅草稿阶段可回退快照");
        }
        AupSnapshot target = snapshotService.get(aupId, snapshotId);
        if (target == null) {
            throw TwinBusinessException.of(404, "快照不存在");
        }
        // 先给当前状态打新快照（可逆）
        AupData current = dataMapper.selectByAupId(aupId);
        snapshotService.createSnapshot(record, record.getCurrentStage(), record.getDraftSource(),
                current == null ? null : current.getData(), user.getId());
        // 覆盖草稿数据
        AupData d = dataMapper.selectByAupId(aupId);
        if (d != null) {
            dataMapper.updateCas(aupId, target.getData() == null ? "{}" : target.getData(), d.getVersion(), user.getId());
        }
        // 回退流转：任意 → draft，draft_source=rollback，round_no+1
        int roundNo = (record.getRoundNo() == null ? 1 : record.getRoundNo()) + 1;
        int rows = recordMapper.updateStageCas(aupId, record.getCurrentStage(), STAGE_DRAFT,
                record.getVersion(), "rollback", roundNo, null, null, null, null, null, null);
        if (rows == 0) {
            throw TwinBusinessException.of(409, "计划书状态已变更，请刷新后重试");
        }
        audit(aupId, user.getId(), accessPolicy.resolveOperatorRole(record, user),
                "rollback", record.getCurrentStage(), STAGE_DRAFT, "回退至快照 #" + target.getVersionNo());
        return recordMapper.selectById(aupId);
    }

    /** 解锁锁定终态（terminated/approved/expired → draft 返修），仅管理员。 */
    @Transactional
    public AupRecord unlock(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        if (!accessPolicy.isAdmin(user)) {
            throw TwinBusinessException.of(403, "仅管理员可解锁计划书");
        }
        String stage = record.getCurrentStage();
        if (!STAGE_TERMINATED.equals(stage) && !STAGE_APPROVED.equals(stage) && !STAGE_EXPIRED.equals(stage)) {
            throw TwinBusinessException.of(409, "仅已终止/已批准/已过期状态的计划书可解锁");
        }
        if (isDemo(record)) {
            throw TwinBusinessException.of(409, "演示示例不可解锁");
        }
        int roundNo = (record.getRoundNo() == null ? 1 : record.getRoundNo()) + 1;
        int rows = recordMapper.updateStageCas(aupId, stage, STAGE_DRAFT, record.getVersion(),
                "rollback", roundNo, null, null, null, null, null, null);
        if (rows == 0) {
            throw TwinBusinessException.of(409, "计划书状态已变更，请刷新后重试");
        }
        // 解锁回 draft 后清空提交时间、通过时间与到期时间；注册号已锁定为该计划书，作废不复用，不清空
        jdbcTemplate.update("UPDATE aup_record SET expire_at = NULL, approved_at = NULL, submitted_at = NULL WHERE id = ?", aupId);
        recordMapper.clearRegistryMeta(aupId);
        AupData data = dataMapper.selectByAupId(aupId);
        snapshotService.createSnapshot(record, STAGE_DRAFT, "rollback", data == null ? null : data.getData(), user.getId());
        audit(aupId, user.getId(), "admin", "unlock", stage, STAGE_DRAFT, "管理员解锁，重新打开计划书");
        return recordMapper.selectById(aupId);
    }

    /**
     * 续期：计划书 expired 后，申请人/组长/管理员基于旧计划书新建一条 draft 草稿，
     * 引用原注册号（originRegisterNo）、结转未用动物数置 0（carriedOverCount，暂不支持自动结转）、复制填报数据，
     * 重新走完整审核（新注册号在提交时重新生成）。
     */
    @Transactional
    public AupRecord renew(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        if (!STAGE_EXPIRED.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "仅已过期状态的计划书可续期");
        }
        if (isDemo(record)) {
            throw TwinBusinessException.of(409, "演示示例不可续期");
        }
        boolean admin = accessPolicy.isAdmin(user);
        if (!admin) {
            String uid = user.getId();
            boolean applicant = uid != null && uid.equals(record.getCreatedBy());
            boolean pi = uid != null && uid.equals(record.getPiUserId());
            if (!applicant && !pi) {
                throw TwinBusinessException.of(403, "仅申请人、组长或管理员可发起续期");
            }
        }

        // 复用当前 PUBLISHED 模板（与 createDraft 一致），复制旧填报数据
        long[] tpl = resolvePublishedTemplate();
        AupData oldData = dataMapper.selectByAupId(aupId);
        String copiedData = stripSignatureFields(oldData == null ? "{}" : oldData.getData());

        AupRecord fresh = new AupRecord();
        fresh.setTemplateId(tpl[0]);
        fresh.setTemplateVersion(String.valueOf(tpl[1]));
        fresh.setVersion(0L);
        fresh.setCurrentStage(STAGE_DRAFT);
        fresh.setRoundNo(1);
        fresh.setDraftSource("first");
        fresh.setOriginRegisterNo(record.getRegisterNo());
        fresh.setCarriedOverCount(0);
        fresh.setCreatedBy(user.getId());
        fresh.setProjectGroupName(resolveProjectGroupName(user.getId()));
        fresh.setIsDemo(0);
        recordMapper.insert(fresh);

        AupData data = new AupData();
        data.setAupId(fresh.getId());
        data.setData(copiedData);
        data.setVersion(0L);
        data.setUpdatedBy(user.getId());
        dataMapper.insert(data);

        // 快照 + 审计（沿用现有写法，留痕在新记录上）
        snapshotService.createSnapshot(fresh, STAGE_DRAFT, "first", copiedData, user.getId());
        audit(fresh.getId(), user.getId(), accessPolicy.resolveOperatorRole(record, user),
                "renew", record.getCurrentStage(), STAGE_DRAFT,
                "续期自注册号 " + (record.getRegisterNo() == null ? "" : record.getRegisterNo()));
        return fresh;
    }

    public List<AupSnapshotVO> listSnapshots(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        List<AupSnapshotVO> out = new ArrayList<>();
        for (AupSnapshot s : snapshotService.listLight(aupId)) {
            out.add(toSnapshotVO(s, false));
        }
        enrichSnapshotCreatedByNames(out);
        return out;
    }

    public AupSnapshotVO getSnapshot(Long aupId, Long snapshotId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        AupSnapshot s = snapshotService.get(aupId, snapshotId);
        if (s == null) {
            throw TwinBusinessException.of(404, "快照不存在");
        }
        AupSnapshotVO vo = toSnapshotVO(s, true);
        enrichSnapshotCreatedByNames(List.of(vo));
        return vo;
    }

    // ======================================================================
    // 查询
    // ======================================================================

    public Map<String, Object> list(User user, int page, int size, String keyword, String registerNo,
                                    String stage, String excludeStage, List<String> excludeStages,
                                    String projectGroupName, String dept,
                                    boolean excludeDraft, String draftSource, Integer roundNo,
                                    String submitterId, String reviewerId,
                                    String submitterName, String reviewerName,
                                    boolean relatedToMe, boolean groupScopeOnly,
                                    String sortBy, String sortDir) {
        String scopeRole = accessPolicy.resolveScopeRole(user);
        String scopeUserId = user.getId();
        String scopeProjectGroup = resolveProjectGroupName(scopeUserId);
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        List<AupListItem> items = recordMapper.selectPage(scopeRole, scopeUserId, scopeProjectGroup, keyword, registerNo,
                stage, excludeStage, excludeStages, projectGroupName, dept, excludeDraft, draftSource, roundNo,
                submitterId, reviewerId, submitterName, reviewerName, relatedToMe, groupScopeOnly, sortBy, sortDir, offset, safeSize);
        Map<Long, String> speciesByAup = loadSpeciesByAup(items);
        for (AupListItem item : items) {
            item.setSummaryJson(buildSummaryJson(item, speciesByAup.get(item.getId())));
            item.setMiniSteps(buildMiniSteps(item));
        }
        Map<Long, Integer> expertRounds = resolveExpertRounds(items);
        fillNames(items, expertRounds);
        fillVoteNames(items, expertRounds);
        int total = recordMapper.countPage(scopeRole, scopeUserId, scopeProjectGroup, keyword, registerNo, stage, excludeStage, excludeStages, projectGroupName, dept, excludeDraft, draftSource, roundNo, submitterId, reviewerId, submitterName, reviewerName, relatedToMe, groupScopeOnly);
        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("items", items);
        return data;
    }

    /** 列表筛选用：去重课题组名称（下拉选项） */
    public List<String> listProjectGroups() {
        return recordMapper.selectDistinctProjectGroups();
    }

    /** 订购侧：按课题组名列出已批准 AUP 下拉（含 projectGroupId），供下单必选 AUP 用。 */
    /** 订购侧：仅返回当前登录用户所属课题组的已批准 AUP；无课题组则空列表。 */
    public List<Map<String, Object>> listApprovedForOrder(User user) {
        String projectGroupName = resolveProjectGroupName(user.getId());
        if (!StringUtils.hasText(projectGroupName)) {
            return List.of();
        }
        return recordMapper.selectApprovedForOrder(projectGroupName);
    }

    /** 课题组下拉数据源（本地 project_group 字典表，active=1），返回 [{value: id, label: name}]。 */
    public List<Map<String, Object>> listProjectGroupOptions() {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT CAST(id AS CHAR) AS value, name AS label FROM project_group "
                            + "WHERE active = 1 ORDER BY sort_order ASC, id ASC");
        } catch (Exception e) {
            log.warn("[aup] 读取课题组下拉失败: {}", e.getMessage());
            return List.of();
        }
    }

    /** 表单选择器数据源：person / department / cage / animal */
    public List<Map<String, Object>> listPickers(String type, Map<String, String> params) {
        String t = type == null ? "" : type.trim().toLowerCase();
        try {
            switch (t) {
                case "person":
                    return jdbcTemplate.queryForList(
                            "SELECT user_id AS value, "
                                    + "CONCAT(name, IF(job_number IS NOT NULL AND job_number != '', "
                                    + "CONCAT(' (', job_number, ')'), '')) AS label "
                                    + "FROM aro_personnel WHERE name IS NOT NULL AND TRIM(name) != '' "
                                    + "ORDER BY name LIMIT 500");
                case "department":
                    return jdbcTemplate.queryForList(
                            "SELECT DISTINCT department_name AS value, department_name AS label "
                                    + "FROM aro_personnel WHERE department_name IS NOT NULL "
                                    + "AND TRIM(department_name) != '' ORDER BY department_name LIMIT 200");
                case "cage":
                    return jdbcTemplate.queryForList(
                            "SELECT CAST(room_id AS CHAR) AS value, "
                                    + "IFNULL(name, CAST(room_id AS CHAR)) AS label "
                                    + "FROM cage_booking_room ORDER BY name LIMIT 500");
                case "animal":
                    return jdbcTemplate.queryForList(
                            "SELECT di.value AS value, di.label AS label FROM dict_item di "
                                    + "INNER JOIN dict d ON d.id = di.dict_id "
                                    + "WHERE d.dict_key IN ('animalSpecies', 'animalBreed', 'species', 'breed') "
                                    + "ORDER BY di.sort_order, di.label LIMIT 300");
                default:
                    throw TwinBusinessException.of(400, "未知选择器类型: " + type);
            }
        } catch (TwinBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[aup] pickers type={} failed: {}", type, e.getMessage());
            return List.of();
        }
    }

    public AupDetailVO detail(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        AupDetailVO vo = new AupDetailVO();
        vo.setRecord(record);
        if (STAGE_DRAFT.equals(record.getCurrentStage())) {
            AupData d = dataMapper.selectByAupId(aupId);
            vo.setDraftData(d == null ? null : d.getData());
        }
        vo.setSnapshotCount(snapshotService.count(aupId));
        vo.setSnapshots(listSnapshots(aupId, user));
        vo.setTraces(listTraces(aupId, user));
        return vo;
    }

    public List<AupTraceVO> listTraces(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        List<AupTraceVO> out = new ArrayList<>();
        for (AupAuditLog l : auditLogMapper.selectByAupId(aupId)) {
            AupTraceVO t = new AupTraceVO();
            t.setId(l.getId());
            t.setActor(l.getActor());
            t.setActorName(resolveName(l.getActor()));
            t.setRole(l.getRole());
            t.setAction(l.getAction());
            t.setFromStage(l.getFromStage());
            t.setToStage(l.getToStage());
            t.setComment(l.getComment());
            t.setCreatedAt(l.getCreatedAt());
            out.add(t);
        }
        return out;
    }

    /** 打印数据（§5.6 print-data） */
    public Map<String, Object> printData(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        AupData d = dataMapper.selectByAupId(aupId);
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> core = new LinkedHashMap<>();
        core.put("projectName", record.getProjectName());
        core.put("piName", record.getPiName());
        core.put("dept", record.getDept());
        core.put("registerNo", record.getRegisterNo());
        core.put("submittedAt", record.getSubmittedAt());
        core.put("approvedAt", record.getApprovedAt());
        core.put("expireAt", record.getExpireAt());
        out.put("core", core);
        out.put("registerNo", record.getRegisterNo());
        Map<String, Object> parsed = parseMap(d == null ? "{}" : d.getData());
        out.put("supplements", parsed);
        out.put("signature", parsed.get("signature"));
        out.put("reviewSheet", listTraces(aupId, user));
        return out;
    }

    // ======================================================================
    // 签名（§3.8 / §5.6）
    // ======================================================================

    public SignatureContextVO signatureContext(User user) {
        return resolveSignature(user);
    }

    private SignatureContextVO resolveSignature(User user) {
        String email = resolveEmail(user);
        boolean domainTrusted = email != null && domainMatches(email);
        SignatureContextVO vo = new SignatureContextVO();
        vo.setEmail(email);
        vo.setDomainTrusted(domainTrusted);
        vo.setSignatureRequired(!domainTrusted);
        return vo;
    }

    private String resolveEmail(User user) {
        if (user == null) {
            return null;
        }
        try {
            AroPersonnel p = aroPersonnelMapper.findByUserId(user.getId());
            if (p != null) {
                if (StringUtils.hasText(p.getEmail())) {
                    return p.getEmail().trim();
                }
                if (StringUtils.hasText(p.getContactEmail())) {
                    return p.getContactEmail().trim();
                }
            }
        } catch (Exception ignored) {
            // 人员库异常时回退到本地邮箱
        }
        return user.getContactEmail();
    }

    private boolean domainMatches(String email) {
        String domains = trustedDomains == null ? "" : trustedDomains.trim();
        if (domains.isEmpty()) {
            return false;
        }
        String lower = email.trim().toLowerCase();
        for (String d : domains.split(",")) {
            String dom = d.trim().toLowerCase();
            if (!dom.isEmpty() && lower.endsWith(dom)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasHandSignature(String dataJson) {
        Map<String, Object> map = parseMap(dataJson);
        for (Map.Entry<String, Object> e : map.entrySet()) {
            String key = e.getKey() == null ? "" : e.getKey().toLowerCase();
            if (!key.endsWith("signature")) {
                continue; // 只认签名字段（F.leaderSignature 等），跳过 signSource 等元数据
            }
            Object v = e.getValue();
            if (v != null && StringUtils.hasText(String.valueOf(v))
                    && !String.valueOf(v).startsWith("EMAIL_TRUSTED:")) {
                return true;
            }
        }
        return false;
    }

    /** 续期复制旧填报数据时剥离签名相关字段：旧签名跨计划书沿用会导致提交时误判已签名而跳过重新签名。 */
    private String stripSignatureFields(String dataJson) {
        if (dataJson == null || dataJson.isBlank()) {
            return dataJson;
        }
        Map<String, Object> map = parseMap(dataJson);
        if (map.isEmpty()) {
            return dataJson;
        }
        boolean removed = map.keySet().removeIf(this::isSignatureField);
        return removed ? toJson(map) : dataJson;
    }

    /** 签名相关字段：提交时写入的 signature/signSource，以及模板签名字段 F.leaderSignature/F.coLeaderSignature 等 *Signature/signSource。 */
    private boolean isSignatureField(String key) {
        if (key == null) {
            return false;
        }
        String k = key.trim().toLowerCase();
        return k.equals("signature") || k.equals("signsource")
                || k.endsWith("signature") || k.endsWith("signsource");
    }

    // ======================================================================
    // 附件（§5.5）
    // ======================================================================

    @Transactional
    public AupAttachmentVO uploadAttachment(Long aupId, MultipartFile file, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertDraftWritable(record, user);
        if (file == null || file.isEmpty()) {
            throw TwinBusinessException.of(400, "文件不能为空");
        }
        if (file.getSize() > maxAttachmentSize) {
            throw TwinBusinessException.of(400, "文件大小超过上限");
        }
        int count = attachmentMapper.countActiveByAupId(aupId);
        if (count >= maxAttachmentCount) {
            throw TwinBusinessException.of(400, "附件数量已达上限 " + maxAttachmentCount + " 个");
        }
        try {
            UploadFileStorageService.StoredUploadFile stored = uploadFileStorageService.store(file, "AUP");
            AupAttachment att = new AupAttachment();
            att.setAupId(aupId);
            att.setFileId(stored.recordId());
            att.setFileName(file.getOriginalFilename());
            att.setCreatedBy(user.getId());
            att.setDeleted(0);
            attachmentMapper.insert(att);
            audit(aupId, user.getId(), accessPolicy.resolveOperatorRole(record, user),
                    "upload", record.getCurrentStage(), record.getCurrentStage(), file.getOriginalFilename());

            UploadFileRecord r = uploadFileRecordService.findById(stored.recordId());
            return toAttachmentVO(att, r);
        } catch (TwinBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[AUP] 附件上传失败 aupId={} err={}", aupId, e.getMessage());
            throw TwinBusinessException.of(500, "附件上传失败：" + e.getMessage());
        }
    }

    public List<AupAttachmentVO> listAttachments(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        List<AupAttachmentVO> out = new ArrayList<>();
        for (AupAttachment att : attachmentMapper.selectActiveByAupId(aupId)) {
            out.add(toAttachmentVO(att, uploadFileRecordService.findById(att.getFileId())));
        }
        return out;
    }

    /** 解析下载目标文件记录（权限校验后返回，供 Controller 流式响应） */
    public UploadFileRecord resolveDownload(Long fileId, User user) {
        AupAttachment att = attachmentMapper.selectByFileId(fileId);
        if (att == null || (att.getDeleted() != null && att.getDeleted() == 1)) {
            throw TwinBusinessException.of(404, "附件不存在");
        }
        AupRecord record = requireRecord(att.getAupId());
        accessPolicy.assertViewable(record, user);
        UploadFileRecord r = uploadFileRecordService.findById(fileId);
        if (r == null) {
            throw TwinBusinessException.of(404, "附件文件不存在");
        }
        return r;
    }

    @Transactional
    public void deleteAttachment(Long aupId, Long fileId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertDraftWritable(record, user);
        AupAttachment att = attachmentMapper.selectByAupIdAndFileId(aupId, fileId);
        if (att == null || (att.getDeleted() != null && att.getDeleted() == 1)) {
            throw TwinBusinessException.of(404, "附件不存在");
        }
        attachmentMapper.softDeleteById(att.getId());
        audit(aupId, user.getId(), accessPolicy.resolveOperatorRole(record, user),
                "delFile", record.getCurrentStage(), record.getCurrentStage(), att.getFileName());
    }

    // ======================================================================
    // 到期（§3.6 / task）
    // ======================================================================

    /** 扫描 approved 且 expire_at<=now → expired + 审计 + 通知。返回处理条数。 */
    @Transactional
    public int expireDueApproved() {
        List<AupRecord> due = recordMapper.selectExpiringApproved(LocalDateTime.now());
        int n = 0;
        for (AupRecord r : due) {
            int rows = recordMapper.updateStageCas(r.getId(), STAGE_APPROVED, STAGE_EXPIRED, r.getVersion(),
                    null, r.getRoundNo(), null, null, null, null, null, null);
            if (rows == 0) {
                continue;
            }
            audit(r.getId(), "system", "system", "expire", STAGE_APPROVED, STAGE_EXPIRED, "到期自动置为 expired");
            notifyForTransition(r, STAGE_APPROVED, STAGE_EXPIRED, "expire", "system", null);
            n++;
        }
        return n;
    }

    // ======================================================================
    // 私有辅助
    // ======================================================================

    private AupRecord requireRecord(Long aupId) {
        AupRecord record = recordMapper.selectById(aupId);
        if (record == null) {
            throw TwinBusinessException.of(404, "计划书不存在");
        }
        return record;
    }

    private boolean isDemo(AupRecord record) {
        return record != null && record.getIsDemo() != null && record.getIsDemo() == 1;
    }

    /** 恢复单条演示示例到内置种子态（仅管理员）。 */
    @Transactional
    public void restoreDemo(Long aupId, User user) {
        if (!accessPolicy.isAdmin(user)) {
            throw TwinBusinessException.of(403, "仅管理员可恢复演示示例");
        }
        aupDemoSeeder.restoreDemo(aupId);
    }

    /** 重新生成演示示例（按内置种子补齐缺失的 demo 计划书，幂等）。仅管理员。 */
    @Transactional
    public Map<String, Object> reseedDemo(User user) {
        if (!accessPolicy.isAdmin(user)) {
            throw TwinBusinessException.of(403, "仅管理员可重新生成演示示例");
        }
        aupDemoSeeder.seedIfNeeded();
        return Map.of("ok", true);
    }

    /** 删除草稿状态计划书（申请人本人或管理员），级联清理相关数据。 */
    @Transactional
    public void delete(Long aupId, User user, User impersonator) {
        AupRecord record = requireRecord(aupId);
        // 模拟学生视图时，删除权限沿用教职工（impersonator）角色；否则用当前用户
        User adminUser = impersonator != null ? impersonator : user;
        boolean platformOwner = accessPolicy.isPlatformOwner(adminUser);
        if (!platformOwner) {
            // 非平台管理者：仅申请人本人可删自己的首次草稿（未提交过的）
            if (!STAGE_DRAFT.equals(record.getCurrentStage())) {
                throw TwinBusinessException.of(409, "仅草稿状态的计划书可删除");
            }
            if (record.getDraftSource() != null && !"first".equals(record.getDraftSource())) {
                throw TwinBusinessException.of(409, "该计划书已提交过（返修/回退），不可删除");
            }
            if (user.getId() == null || !user.getId().equals(record.getCreatedBy())) {
                throw TwinBusinessException.of(403, "仅申请人或平台管理者可删除");
            }
        }
        jdbcTemplate.update("DELETE FROM aup_review_item WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_review WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_review_assignment WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_audit_log WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_snapshot WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_attachment WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_data WHERE aup_id = ?", aupId);
        jdbcTemplate.update("DELETE FROM aup_record WHERE id = ?", aupId);
    }

    /**
     * 批量删除计划书：逐条复用单删权限校验与级联删除，单条失败不阻断其余。
     * @return { deletedCount, failed:[{id, reason}] }
     */
    public Map<String, Object> batchDelete(List<Long> ids, User user, User impersonator) {
        int deleted = 0;
        List<Map<String, Object>> failed = new ArrayList<>();
        for (Long id : ids) {
            if (id == null) {
                continue;
            }
            try {
                delete(id, user, impersonator);
                deleted++;
            } catch (Exception e) {
                failed.add(Map.of("id", id, "reason", e.getMessage() == null ? "未知错误" : e.getMessage()));
            }
        }
        Map<String, Object> out = new HashMap<>();
        out.put("deletedCount", deleted);
        out.put("failed", failed);
        return out;
    }

    /** 按筛选条件分页遍历，返回全部匹配记录 id（供全选删除，含未加载分页）。 */
    public List<Long> listMatchingIds(User user, String keyword, String registerNo, String stage,
                                      List<String> excludeStages, String projectGroupName, String dept, String draftSource,
                                      Integer roundNo, String submitterName, String reviewerName,
                                      boolean relatedToMe, String sortBy, String sortDir) {
        String scopeRole = accessPolicy.resolveScopeRole(user);
        String scopeUserId = user.getId();
        String scopeProjectGroup = resolveProjectGroupName(scopeUserId);
        List<Long> ids = new ArrayList<>();
        int offset = 0;
        int size = 100;
        while (true) {
            List<AupListItem> items = recordMapper.selectPage(scopeRole, scopeUserId, scopeProjectGroup, keyword, registerNo,
                    stage, null, excludeStages, projectGroupName, dept, true, draftSource, roundNo,
                    null, null, submitterName, reviewerName, relatedToMe, false, sortBy, sortDir, offset, size);
            if (items.isEmpty()) {
                break;
            }
            for (AupListItem item : items) {
                ids.add(item.getId());
            }
            if (items.size() < size) {
                break;
            }
            offset += size;
        }
        return ids;
    }

    /** 全选删除：按筛选条件取全部 id 后逐条删除（复用单删权限校验）。 */
    public Map<String, Object> batchDeleteAll(AupBatchDeleteRequest req, User user, User impersonator) {
        List<Long> ids = listMatchingIds(user, req.getKeyword(), req.getRegisterNo(), req.getStage(),
                req.getExcludeStages(), req.getProjectGroupName(), req.getDept(), req.getDraftSource(), req.getRoundNo(),
                req.getSubmitterName(), req.getReviewerName(), req.isRelatedToMe(), req.getSortBy(), req.getSortDir());
        return batchDelete(ids, user, impersonator);
    }

    private Map<String, Object> persistDraftData(Long aupId, String dataJson, Long expectedVersion, String updatedBy) {
        AupData data = dataMapper.selectByAupId(aupId);
        if (data == null) {
            AupData d = new AupData();
            d.setAupId(aupId);
            d.setData(dataJson);
            d.setVersion(0L);
            d.setUpdatedBy(updatedBy);
            dataMapper.insert(d);
            Map<String, Object> out = new HashMap<>();
            out.put("id", aupId);
            out.put("version", 0L);
            return out;
        }
        Long exp = expectedVersion == null ? data.getVersion() : expectedVersion;
        int rows = dataMapper.updateCas(aupId, dataJson, exp, updatedBy);
        if (rows == 0) {
            throw TwinBusinessException.of(409, "草稿已在其他端修改，请刷新后重试");
        }
        Map<String, Object> out = new HashMap<>();
        out.put("id", aupId);
        out.put("version", exp + 1);
        return out;
    }

    private void audit(Long aupId, String actor, String role, String action, String fromStage, String toStage, String comment) {
        AupAuditLog l = new AupAuditLog();
        l.setAupId(aupId);
        l.setActor(actor);
        l.setRole(role);
        l.setAction(action);
        l.setFromStage(fromStage);
        l.setToStage(toStage);
        l.setComment(comment);
        auditLogMapper.insert(l);
    }

    private void notifyForTransition(AupRecord record, String fromStage, String toStage, String action,
                                     String operatorId, String comment) {
        String source = null;
        Set<String> related = new LinkedHashSet<>();
        if ("submit".equals(action) && STAGE_PI_REVIEW.equals(toStage)) {
            // 实验员提交 draft→piReview：通知组长
            source = SRC_SUBMITTED;
            related.addAll(resolvePiRecipientIds(record));
        } else if ("submit".equals(action)) {
            // 组长提交 draft→formatReview：通知秘书
            source = SRC_SUBMITTED;
            related.addAll(accessPolicy.listSecretaryUserIds());
        } else if (STAGE_DRAFT.equals(toStage)) {
            // 退回 draft（组长退回/秘书格式退回/专家返修）：通知申请人 + 全组
            if (STAGE_PI_REVIEW.equals(fromStage)) {
                source = SRC_PI_RETURNED;
            } else if (STAGE_FORMAT_REVIEW.equals(fromStage)) {
                source = SRC_FORMAT_RETURNED;
            } else if (STAGE_EXPERT_REVIEW.equals(fromStage)) {
                source = SRC_EXPERT_RETURNED;
            }
            if (source != null) {
                related.addAll(resolveGroupRecipientIds(record));
            }
        } else if (STAGE_FORMAT_REVIEW.equals(toStage)) {
            // 组长通过 piReview→formatReview 或 全弃权重分配 expertReview→formatReview：通知秘书
            source = SRC_TO_FORMAT;
            related.addAll(accessPolicy.listSecretaryUserIds());
        } else if (STAGE_TERMINATED.equals(toStage)) {
            // 专家终止 expertReview→terminated：通知组长 + 全组
            source = SRC_TERMINATED;
            related.addAll(resolveGroupRecipientIds(record));
        } else if (STAGE_APPROVED.equals(toStage)) {
            // 专家通过 expertReview→approved：通知组长 + 全组
            source = SRC_APPROVED;
            related.addAll(resolveGroupRecipientIds(record));
        } else if (STAGE_EXPIRED.equals(toStage)) {
            // 到期 approved→expired：通知组长 + 全组
            source = SRC_EXPIRED;
            related.addAll(resolveGroupRecipientIds(record));
        }
        // AUP_ASSIGNED（formatReview→expertReview）由审批子模块在持有 expertIds 时精准发布，此处不重复
        if (source == null) {
            return;
        }
        publish(source, record, operatorId, null, related, comment);
    }

    /** 「组长」通知对象：以 piUserId 为准（通知失败不影响主流程） */
    private Set<String> resolvePiRecipientIds(AupRecord record) {
        Set<String> out = new LinkedHashSet<>();
        if (StringUtils.hasText(record.getPiUserId())) {
            out.add(record.getPiUserId());
        }
        return out;
    }

    /** 「组长 + 全组」通知对象：组长 + 同课题组全体成员 userId（通知失败不影响主流程） */
    private Set<String> resolveGroupRecipientIds(AupRecord record) {
        Set<String> out = new LinkedHashSet<>();
        if (StringUtils.hasText(record.getPiUserId())) {
            out.add(record.getPiUserId());
        }
        if (StringUtils.hasText(record.getCreatedBy())) {
            out.add(record.getCreatedBy());
        }
        String group = record.getProjectGroupName();
        if (StringUtils.hasText(group)) {
            try {
                List<String> ids = aroService.findUserIdsByProjectGroup(group);
                if (ids != null) {
                    for (String id : ids) {
                        if (StringUtils.hasText(id)) {
                            out.add(id.trim());
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[AUP] 查询课题组成员失败 aupId={} group={} err={}", record.getId(), group, e.getMessage());
            }
        }
        return out;
    }

    private void publish(String source, AupRecord record, String senderId, String targetUserId,
                         Set<String> related, String comment) {
        try {
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType(source);
            event.setBizType("AUP");
            event.setBizId(record.getId() == null ? null : String.valueOf(record.getId()));
            event.setSenderId(senderId);
            event.setApplicantId(record.getCreatedBy());
            if (StringUtils.hasText(targetUserId)) {
                event.setProcessorId(targetUserId);
            }
            if (related != null && !related.isEmpty()) {
                event.setRelatedUserIds(related);
            }
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("registerNo", safe(record.getRegisterNo()));
            vars.put("projectName", safe(record.getProjectName()));
            vars.put("comment", safe(comment));
            if (StringUtils.hasText(targetUserId)) {
                vars.put("targetUserId", targetUserId);
            }
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("[AUP] 通知发送失败 source={} aupId={} err={}", source, record.getId(), e.getMessage());
        }
    }

    /** 解析当前 PUBLISHED 模板，返回 [templateId, version] */
    private long[] resolvePublishedTemplate() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, version FROM form_template WHERE form_key = ? AND status = 'PUBLISHED' "
                        + "ORDER BY version DESC LIMIT 1", FORM_KEY);
        if (rows.isEmpty()) {
            throw TwinBusinessException.of(400, "尚未发布 AUP 表单模板，无法创建计划书");
        }
        Map<String, Object> row = rows.get(0);
        long id = ((Number) row.get("id")).longValue();
        int version = row.get("version") == null ? 1 : ((Number) row.get("version")).intValue();
        return new long[]{id, version};
    }

    // ---- 模板/字段读取（JdbcTemplate，避免与模板子模块 Mapper 耦合） ----

    private static class FieldDef {
        String fieldKey;
        String label;
        String type;
        boolean required;
        String dictKey;
        Integer maxLength;
        String showWhen;
        String subsectionShowWhen;
        String sectionShowWhen;
        Map<String, String> tableColumnLabels = new LinkedHashMap<>();
        /** repeatGroup 块内子字段（config.fields 解析；fieldKey 为块内相对键） */
        List<FieldDef> repeatGroupChildren = new ArrayList<>();
    }

    private List<FieldDef> loadFieldDefs(Long templateId) {
        List<FieldDef> out = new ArrayList<>();
        if (templateId == null) {
            return out;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT f.field_key, f.label, f.type, f.required, f.dict_key, f.config, f.show_when, "
                        + "sub.show_when AS subsection_show_when, sec.show_when AS section_show_when "
                        + "FROM form_field f "
                        + "LEFT JOIN form_subsection sub ON f.subsection_id = sub.id "
                        + "LEFT JOIN form_section sec ON sec.id = COALESCE(f.section_id, sub.section_id) "
                        + "WHERE f.section_id IN (SELECT id FROM form_section WHERE template_id = ?) "
                        + "   OR f.subsection_id IN (SELECT id FROM form_subsection "
                        + "       WHERE section_id IN (SELECT id FROM form_section WHERE template_id = ?))",
                templateId, templateId);
        for (Map<String, Object> row : rows) {
            FieldDef f = new FieldDef();
            f.fieldKey = str(row.get("field_key"));
            f.label = str(row.get("label"));
            f.type = str(row.get("type"));
            f.required = row.get("required") != null && ((Number) row.get("required")).intValue() == 1;
            f.dictKey = str(row.get("dict_key"));
            f.showWhen = str(row.get("show_when"));
            f.subsectionShowWhen = str(row.get("subsection_show_when"));
            f.sectionShowWhen = str(row.get("section_show_when"));
            f.maxLength = parseMaxLength(str(row.get("config")));
            f.tableColumnLabels = parseTableColumns(str(row.get("config")));
            f.repeatGroupChildren = parseRepeatGroupChildren(str(row.get("config")));
            out.add(f);
        }
        return out;
    }

    private Integer parseMaxLength(String config) {
        try {
            Map<String, Object> c = parseMap(config);
            Object v = c.get("maxLength");
            if (v instanceof Number n) {
                return n.intValue();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> parseTableColumns(String config) {
        Map<String, String> cols = new LinkedHashMap<>();
        try {
            Map<String, Object> c = parseMap(config);
            Object columns = c.get("columns");
            if (columns instanceof List<?> list) {
                for (Object col : list) {
                    if (col instanceof Map<?, ?> m) {
                        String key = str(m.get("fieldKey"));
                        if (key == null || key.isBlank()) {
                            key = str(m.get("key"));
                        }
                        if (key != null && !key.isBlank()) {
                            cols.put(key, str(m.get("label")));
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return cols;
    }

    /** repeatGroup 的 config.fields 解析为子字段定义（块内相对键；showWhen 对块对象求值） */
    private List<FieldDef> parseRepeatGroupChildren(String config) {
        List<FieldDef> out = new ArrayList<>();
        try {
            Map<String, Object> c = parseMap(config);
            Object fields = c.get("fields");
            if (fields instanceof List<?> list) {
                for (Object child : list) {
                    if (child instanceof Map<?, ?> m) {
                        FieldDef cd = new FieldDef();
                        cd.fieldKey = str(m.get("fieldKey"));
                        cd.label = str(m.get("label"));
                        cd.type = str(m.get("type"));
                        cd.required = Boolean.TRUE.equals(m.get("required"))
                                || (m.get("required") instanceof Number n && n.intValue() == 1);
                        cd.dictKey = str(m.get("dictKey"));
                        cd.maxLength = parseMaxLength(jsonOf(m.get("config")));
                        if (m.get("showWhen") instanceof Map<?, ?> sw) {
                            cd.showWhen = jsonOf(sw);
                        }
                        out.add(cd);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private String jsonOf(Object o) {
        if (o == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    private Set<String> loadDictValues(String dictKey) {
        Set<String> out = new LinkedHashSet<>();
        try {
            List<String> vals = jdbcTemplate.queryForList(
                    "SELECT di.value FROM dict_item di JOIN dict d ON di.dict_id = d.id "
                            + "WHERE d.dict_key = ? AND d.status = 'PUBLISHED'",
                    String.class, dictKey);
            out.addAll(vals);
        } catch (Exception e) {
            log.warn("[AUP] 加载字典失败 dictKey={} err={}", dictKey, e.getMessage());
        }
        return out;
    }

    // ---- showWhen 反推剥离（§3.4.7） ----

    private String stripHiddenFields(Long templateId, Long aupId, String dataJson, String operatorId) {
        if (dataJson == null || dataJson.isBlank()) {
            return dataJson;
        }
        Map<String, Object> map = parseMap(dataJson);
        List<String> stripped = stripMap(templateId, map);
        if (!stripped.isEmpty()) {
            // 写审计：隐藏区块剥离（防注入脏值）
            audit(aupId, operatorId, "system", "strip", null, null,
                    "剥离隐藏区块字段：" + String.join(",", stripped));
            return toJson(map);
        }
        return dataJson;
    }

    /** 校验前静默剥离（不落库、不审计） */
    private String stripHiddenFieldsQuiet(Long templateId, String dataJson) {
        if (dataJson == null || dataJson.isBlank()) {
            return dataJson;
        }
        Map<String, Object> map = parseMap(dataJson);
        stripMap(templateId, map);
        return toJson(map);
    }

    /** 返回被剥离的字段键列表 */
    private List<String> stripMap(Long templateId, Map<String, Object> map) {
        List<String> stripped = new ArrayList<>();
        for (FieldDef f : loadFieldDefs(templateId)) {
            if (isFieldHidden(f, map)) {
                Object v = map.get(f.fieldKey);
                if (v != null && !isBlankValue(v)) {
                    map.remove(f.fieldKey);
                    stripped.add(f.fieldKey);
                }
            }
        }
        return stripped;
    }

    /** 字段可见当且仅当字段级 + 父小章节级 + 父大段级三层 showWhen 全部满足；任一层不满足即隐藏。 */
    private boolean isFieldHidden(FieldDef f, Map<String, Object> data) {
        if (StringUtils.hasText(f.sectionShowWhen) && !evaluateShowWhen(f.sectionShowWhen, data)) {
            return true;
        }
        if (StringUtils.hasText(f.subsectionShowWhen) && !evaluateShowWhen(f.subsectionShowWhen, data)) {
            return true;
        }
        if (StringUtils.hasText(f.showWhen) && !evaluateShowWhen(f.showWhen, data)) {
            return true;
        }
        return false;
    }

    private boolean evaluateShowWhen(String showWhenJson, Map<String, Object> data) {
        try {
            Map<String, Object> cond = parseMap(showWhenJson);
            String field = str(cond.get("field"));
            String op = str(cond.get("op"));
            Object expected = cond.get("value");
            if (field == null || field.isBlank()) {
                return true;
            }
            Object actual = valueOf(data, field);
            if (op == null || op.isBlank() || "eq".equals(op) || "equals".equals(op)) {
                return equalsValue(actual, expected);
            }
            if ("neq".equals(op) || "notEquals".equals(op)) {
                return !equalsValue(actual, expected);
            }
            if ("in".equals(op) || "notIn".equals(op)) {
                boolean contains = containsExpected(actual, expected);
                return "in".equals(op) ? contains : !contains;
            }
            if ("contains".equals(op)) {
                return actual != null && String.valueOf(actual).contains(String.valueOf(expected));
            }
            if ("notContains".equals(op)) {
                return actual == null || !String.valueOf(actual).contains(String.valueOf(expected));
            }
            if ("exists".equals(op) || "notEmpty".equals(op)) {
                return actual != null && !isBlankValue(actual);
            }
            if ("notExists".equals(op) || "empty".equals(op)) {
                return actual == null || isBlankValue(actual);
            }
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    // ---- 项目冗余字段回填 ----

    private void applyProjectMeta(AupRecord record, String dataJson) {
        Map<String, Object> map = parseMap(dataJson);
        String projectName = firstValue(map, "A1.name", "projectName", "A1.项目名称");
        String dept = firstValue(map, "A2.department", "dept", "A2.单位", "A2.dept");
        String projectSource = firstValue(map, "A1.source", "projectSource", "A2.projectSource", "A2.项目来源");
        // 组长 = 计划书所属课题组的 GROUP_LEADER 身份标识者（非提交者，避免实验员提交时把自己写成组长）
        String piUserId = resolveGroupLeader(record.getProjectGroupName());
        String piName = piUserId == null ? null : resolveName(piUserId);
        // 课题组主键：按名称反查 project_group.id，落主键外键（关键枢纽，名称仅冗余留痕）
        Long projectGroupId = resolveProjectGroupId(record.getProjectGroupName());
        recordMapper.updateProjectMeta(record.getId(), projectName, piUserId, piName, dept, projectSource, projectGroupId);
    }

    /** 按课题组名反查 project_group.id；找不到返回 null（名称快照仍保留，主键待后续回填）。 */
    private Long resolveProjectGroupId(String projectGroupName) {
        if (!StringUtils.hasText(projectGroupName)) {
            return null;
        }
        try {
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM project_group WHERE name = ? LIMIT 1",
                    Long.class, projectGroupName.trim());
            return (ids == null || ids.isEmpty()) ? null : ids.get(0);
        } catch (Exception e) {
            log.warn("[aup] 解析课题组主键失败 group={} err={}", projectGroupName, e.getMessage());
            return null;
        }
    }

    /** 按课题组名解析组长 staff_id：该课题组中挂 PI 身份标签的人（person_identity key=personnel.id）。返回 staff_id 供 aup_record.pi_user_id 匹配登录人；找不到返回 null。 */
    private String resolveGroupLeader(String projectGroupName) {
        if (!StringUtils.hasText(projectGroupName)) {
            return null;
        }
        try {
            List<String> ids = jdbcTemplate.queryForList(
                    "SELECT per.staff_id " +
                    "FROM personnel per " +
                    "JOIN person_identity pi ON pi.user_id = CAST(per.id AS CHAR) " +
                    "JOIN person_identity_tag t ON t.id = pi.tag_id AND t.code = ? AND t.active = 1 " +
                    "WHERE per.project_group_name = ? AND per.staff_id IS NOT NULL " +
                    "ORDER BY pi.id ASC " +
                    "LIMIT 1",
                    String.class, piCode, projectGroupName.trim());
            return (ids == null || ids.isEmpty()) ? null : ids.get(0);
        } catch (Exception e) {
            log.warn("[aup] 解析课题组长失败 group={} err={}", projectGroupName, e.getMessage());
            return null;
        }
    }

    // ---- 动物白名单（构建逻辑见 {@link AupAnimalAllowlistCompat}） ----

    // ---- 取值辅助 ----

    private Object valueOf(Map<String, Object> data, String fieldKey) {
        if (data == null || fieldKey == null) {
            return null;
        }
        if (data.containsKey(fieldKey)) {
            return data.get(fieldKey);
        }
        return null;
    }

    private String firstValue(Map<String, Object> data, String... keys) {
        for (String k : keys) {
            Object v = valueOf(data, k);
            if (v != null && StringUtils.hasText(String.valueOf(v))) {
                return String.valueOf(v).trim();
            }
        }
        return null;
    }

    private boolean isBlankValue(Object v) {
        if (v == null) {
            return true;
        }
        if (v instanceof String s) {
            return s.isBlank();
        }
        if (v instanceof List<?> l) {
            return l.isEmpty();
        }
        if (v instanceof Map<?, ?> m) {
            return m.isEmpty();
        }
        return false;
    }

    private boolean isNumeric(Object v) {
        if (v instanceof Number) {
            return true;
        }
        if (v instanceof String s && !s.isBlank()) {
            try {
                Double.parseDouble(s.trim());
                return true;
            } catch (NumberFormatException e) {
                return false;
            }
        }
        return false;
    }

    private List<String> flattenValues(Object v) {
        List<String> out = new ArrayList<>();
        if (v == null) {
            return out;
        }
        if (v instanceof List<?> l) {
            for (Object o : l) {
                if (o != null) {
                    out.add(String.valueOf(o));
                }
            }
        } else {
            out.add(String.valueOf(v));
        }
        return out;
    }

    private boolean equalsValue(Object actual, Object expected) {
        if (actual == null) {
            return expected == null;
        }
        return String.valueOf(actual).equals(String.valueOf(expected));
    }

    private boolean containsExpected(Object actual, Object expected) {
        if (actual instanceof List<?> l) {
            for (Object o : l) {
                if (equalsValue(o, expected)) {
                    return true;
                }
            }
            return false;
        }
        return equalsValue(actual, expected);
    }

    /** 模糊判断某字段（前缀匹配）是否包含任一关键词 */
    private boolean containsAnyValue(Map<String, Object> data, String keyPrefix, String... keywords) {
        for (Map.Entry<String, Object> e : data.entrySet()) {
            if (e.getKey().startsWith(keyPrefix)) {
                String joined = flattenValues(e.getValue()).stream()
                        .reduce((a, b) -> a + "|" + b).orElse("");
                for (String kw : keywords) {
                    if (joined.toLowerCase().contains(kw.toLowerCase())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /** 求和 B6 动物数量（非负、单位「只」），解析失败返回 null（跳过校验）。
     *  块化后（B6.blocks）每个块只统计「所需数量 count」，分级数量 countB/C/D/E 不再累加（避免重复计数）；
     *  旧扁平草稿回退到 B6.count 单键。 */
    private Double sumAnimalCount(Map<String, Object> data) {
        double sum = 0;
        boolean found = false;
        Object blocks = data.get("B6.blocks");
        if (blocks instanceof List<?> bl && !bl.isEmpty()) {
            for (Object block : bl) {
                if (!(block instanceof Map<?, ?> m)) {
                    continue;
                }
                Object c = m.get("count");
                if (c instanceof Number n) {
                    sum += n.doubleValue();
                    found = true;
                } else if (c instanceof String s && isNumeric(s)) {
                    sum += Double.parseDouble(s.trim());
                    found = true;
                }
            }
            return found ? sum : null;
        }
        // 无 B6.blocks：兼容块化前保存的扁平草稿，B6.count 即「所需数量」
        Object flatCount = data.get("B6.count");
        if (flatCount instanceof Number n) {
            return n.doubleValue();
        } else if (flatCount instanceof String s && isNumeric(s)) {
            return Double.parseDouble(s.trim());
        }
        return null;
    }

    // ---- JSON / 名称 / 组装 ----

    private Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String toJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            return "{}";
        }
    }

    /**
     * 解析人员姓名（供本服务留痕/组长名，及 AupReviewService 批量填充逐字段评审人姓名复用）。
     * 统一走 {@link UserDisplayNameService}（personnel 表 staffId / aro_user_id 双键）。
     */
    public String resolveName(String userId) {
        if (!StringUtils.hasText(userId)) {
            return null;
        }
        String name = userDisplayNameService.resolveDisplayName(userId.trim());
        return StringUtils.hasText(name) ? name : userId.trim();
    }

    private AupSnapshotVO toSnapshotVO(AupSnapshot s, boolean withData) {
        AupSnapshotVO vo = new AupSnapshotVO();
        vo.setSnapshotId(s.getId());
        vo.setVersionNo(s.getVersionNo());
        vo.setStage(s.getStage());
        vo.setDraftSource(s.getDraftSource());
        if (withData) {
            vo.setData(s.getData());
        }
        vo.setCreatedAt(s.getCreatedAt());
        vo.setCreatedBy(s.getCreatedBy());
        return vo;
    }

    private void enrichSnapshotCreatedByNames(List<AupSnapshotVO> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (AupSnapshotVO vo : rows) {
            if (vo != null && StringUtils.hasText(vo.getCreatedBy())) {
                ids.add(vo.getCreatedBy().trim());
            }
        }
        if (ids.isEmpty()) {
            return;
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
        for (AupSnapshotVO vo : rows) {
            if (vo == null || !StringUtils.hasText(vo.getCreatedBy())) {
                continue;
            }
            String id = vo.getCreatedBy().trim();
            String n = names.get(id);
            vo.setCreatedByName(StringUtils.hasText(n) ? n : id);
        }
    }

    private AupAttachmentVO toAttachmentVO(AupAttachment att, UploadFileRecord r) {
        AupAttachmentVO vo = new AupAttachmentVO();
        vo.setFileId(att.getFileId());
        vo.setFileName(att.getFileName());
        vo.setUploadedBy(att.getCreatedBy());
        vo.setCreatedAt(att.getCreatedAt());
        if (r != null) {
            vo.setMimeType(r.getMimeType());
            vo.setSize(r.getSizeBytes());
            vo.setUrl(r.getPublicUrl());
        }
        return vo;
    }

    private String buildSummaryJson(AupListItem item, String species) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("项目名称", item.getProjectName());
        if (StringUtils.hasText(species)) {
            m.put("动物品种", species);
        }
        m.put("负责人", item.getPiName());
        m.put("部门", item.getDept());
        return toJson(m);
    }

    /** 批量读取列表页各项的表单数据，抽取「动物品种」供摘要展示（避免逐条 N+1）。 */
    private Map<Long, String> loadSpeciesByAup(List<AupListItem> items) {
        Map<Long, String> out = new LinkedHashMap<>();
        if (items == null || items.isEmpty()) {
            return out;
        }
        StringBuilder in = new StringBuilder();
        List<Long> ids = new ArrayList<>();
        for (AupListItem it : items) {
            if (it.getId() == null) {
                continue;
            }
            if (in.length() > 0) {
                in.append(",");
            }
            in.append("?");
            ids.add(it.getId());
        }
        if (ids.isEmpty()) {
            return out;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT aup_id, data FROM aup_data WHERE aup_id IN (" + in + ")", ids.toArray());
        for (Map<String, Object> row : rows) {
            Object aupIdRaw = row.get("aup_id");
            if (aupIdRaw == null) {
                continue;
            }
            Long aupId = ((Number) aupIdRaw).longValue();
            String data = row.get("data") == null ? null : String.valueOf(row.get("data"));
            String species = extractSpecies(data);
            if (species != null) {
                out.put(aupId, species);
            }
        }
        return out;
    }

    /**
     * 解析每条计划书「应展示的专家轮次」：expertReview 用当前轮；其余阶段（含返修）取最近一次有专家投票的轮次。
     * 这样返修（退回/返修草稿）阶段仍能看到已分配专家及其投票。
     */
    private Map<Long, Integer> resolveExpertRounds(List<AupListItem> items) {
        Map<Long, Integer> rounds = new LinkedHashMap<>();
        List<Long> needLatest = new ArrayList<>();
        for (AupListItem item : items) {
            if (item.getId() == null) {
                continue;
            }
            if (STAGE_EXPERT_REVIEW.equals(item.getCurrentStage())) {
                rounds.put(item.getId(), item.getRoundNo() == null ? 1 : item.getRoundNo());
            } else {
                needLatest.add(item.getId());
            }
        }
        rounds.putAll(loadLatestExpertVoteRounds(needLatest));
        return rounds;
    }

    /** aupId → 最近一次有专家投票的轮次（无专家投票则不返回该 id） */
    private Map<Long, Integer> loadLatestExpertVoteRounds(List<Long> aupIds) {
        Map<Long, Integer> out = new LinkedHashMap<>();
        if (aupIds.isEmpty()) {
            return out;
        }
        StringBuilder ph = new StringBuilder();
        for (int i = 0; i < aupIds.size(); i++) {
            if (i > 0) {
                ph.append(",");
            }
            ph.append("?");
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT aup_id, MAX(round_no) AS r FROM aup_review WHERE role = 'expert' AND aup_id IN (" + ph + ") GROUP BY aup_id",
                aupIds.toArray());
        for (Map<String, Object> row : rows) {
            if (row.get("aup_id") == null || row.get("r") == null) {
                continue;
            }
            out.put(((Number) row.get("aup_id")).longValue(), ((Number) row.get("r")).intValue());
        }
        return out;
    }

    /**
     * 批量填充提交人姓名与当前阶段审核人姓名（避免逐条 N+1）：
     * 先一次性查专家分配与格式审查秘书 actor，再对去重后的 userId 批量 resolveName。
     */
    private void fillNames(List<AupListItem> items, Map<Long, Integer> expertRounds) {
        if (items == null || items.isEmpty()) {
            return;
        }

        // 1) 收集格式审查阶段项（秘书 actor；专家轮次已由 resolveExpertRounds 提供）
        List<Long> formatIds = new ArrayList<>();
        for (AupListItem item : items) {
            if (item.getId() == null) {
                continue;
            }
            if (STAGE_FORMAT_REVIEW.equals(item.getCurrentStage())) {
                formatIds.add(item.getId());
            }
        }

        // 2) 批量查专家分配 reviewer_id 与格式审查秘书 actor
        Map<Long, List<String>> expertReviewers = loadExpertReviewers(expertRounds);
        Map<Long, String> formatActors = loadFormatReviewActors(formatIds);

        // 3) 汇总待解析姓名 userId（提交人 + 专家 + 秘书），去重后批量 resolveName
        Set<String> userIds = new LinkedHashSet<>();
        for (AupListItem item : items) {
            if (StringUtils.hasText(item.getCreatedBy())) {
                userIds.add(item.getCreatedBy());
            }
        }
        for (List<String> ids : expertReviewers.values()) {
            for (String id : ids) {
                if (StringUtils.hasText(id)) {
                    userIds.add(id);
                }
            }
        }
        for (String actor : formatActors.values()) {
            if (StringUtils.hasText(actor)) {
                userIds.add(actor);
            }
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(userIds);

        // 4) 回填
        for (AupListItem item : items) {
            String submitter = names.get(item.getCreatedBy());
            item.setSubmitterName(StringUtils.hasText(submitter) ? submitter : item.getCreatedBy());
            String stage = item.getCurrentStage();
            if (expertRounds.containsKey(item.getId())) {
                // 有专家轮次（正在审查或返修后），审核人显示已分配专家
                item.setReviewerNames(joinReviewerNames(expertReviewers.get(item.getId()), names));
            } else if (STAGE_FORMAT_REVIEW.equals(stage)) {
                String actor = formatActors.get(item.getId());
                item.setReviewerNames(actor == null ? null : names.get(actor));
            } else if (STAGE_PI_REVIEW.equals(stage)) {
                item.setReviewerNames(item.getPiName());
            }
        }
    }

    /** 聚合同意/修改专家姓名（expert 投票，当前轮），供列表「同意人/修改人」一人一行展示 */
    private void fillVoteNames(List<AupListItem> items, Map<Long, Integer> expertRounds) {
        for (AupListItem item : items) {
            List<String> agrees = new ArrayList<>();
            List<String> modifies = new ArrayList<>();
            List<String> disagrees = new ArrayList<>();
            Integer round = expertRounds.get(item.getId());
            if (round != null) {
                List<Map<String, Object>> votes = jdbcTemplate.queryForList(
                        "SELECT reviewer, verdict FROM aup_review WHERE aup_id = ? AND round_no = ? AND role = 'expert'",
                        item.getId(), round);
                for (Map<String, Object> v : votes) {
                    String reviewer = v.get("reviewer") == null ? null : String.valueOf(v.get("reviewer"));
                    String verdict = v.get("verdict") == null ? null : String.valueOf(v.get("verdict"));
                    String name = resolveName(reviewer);
                    if ("agree".equals(verdict)) {
                        agrees.add(name);
                    } else if ("modify".equals(verdict)) {
                        modifies.add(name);
                    } else if ("disagree".equals(verdict)) {
                        disagrees.add(name);
                    }
                }
            }
            item.setAgreeNames(agrees);
            item.setModifyNames(modifies);
            item.setDisagreeNames(disagrees);
        }
    }

    /** 批量查各计划当前轮的专家 reviewer_id（保持分配顺序，供姓名拼接） */
    private Map<Long, List<String>> loadExpertReviewers(Map<Long, Integer> rounds) {
        Map<Long, List<String>> out = new LinkedHashMap<>();
        if (rounds.isEmpty()) {
            return out;
        }
        StringBuilder where = new StringBuilder();
        List<Object> args = new ArrayList<>();
        for (Map.Entry<Long, Integer> e : rounds.entrySet()) {
            if (where.length() > 0) {
                where.append(" OR ");
            }
            where.append("(aup_id = ? AND round_no = ?)");
            args.add(e.getKey());
            args.add(e.getValue());
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT aup_id, reviewer_id FROM aup_review_assignment WHERE " + where
                        + " ORDER BY aup_id, id ASC", args.toArray());
        for (Map<String, Object> row : rows) {
            Object aupIdRaw = row.get("aup_id");
            if (aupIdRaw == null) {
                continue;
            }
            Long aupId = ((Number) aupIdRaw).longValue();
            Object reviewer = row.get("reviewer_id");
            String rid = reviewer == null ? null : String.valueOf(reviewer);
            if (!StringUtils.hasText(rid)) {
                continue;
            }
            out.computeIfAbsent(aupId, k -> new ArrayList<>()).add(rid);
        }
        return out;
    }

    /** 批量查各计划最近一次格式审查动作的 actor（秘书），每计划取 id 最大的一条 */
    private Map<Long, String> loadFormatReviewActors(List<Long> aupIds) {
        Map<Long, String> out = new LinkedHashMap<>();
        if (aupIds.isEmpty()) {
            return out;
        }
        StringBuilder in = new StringBuilder();
        for (Long id : aupIds) {
            if (in.length() > 0) {
                in.append(",");
            }
            in.append("?");
        }
        String sql = "SELECT l.aup_id, l.actor FROM aup_audit_log l "
                + "JOIN (SELECT aup_id, MAX(id) AS max_id FROM aup_audit_log "
                + "WHERE from_stage = 'formatReview' AND aup_id IN (" + in + ") GROUP BY aup_id) m "
                + "ON m.max_id = l.id";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, aupIds.toArray());
        for (Map<String, Object> row : rows) {
            Object aupIdRaw = row.get("aup_id");
            if (aupIdRaw == null) {
                continue;
            }
            Long aupId = ((Number) aupIdRaw).longValue();
            Object actor = row.get("actor");
            String act = actor == null ? null : String.valueOf(actor);
            if (StringUtils.hasText(act)) {
                out.put(aupId, act);
            }
        }
        return out;
    }

    /** 将专家 userId 列表按姓名去重拼接为「张三, 李四」 */
    private String joinReviewerNames(List<String> ids, Map<String, String> names) {
        if (ids == null || ids.isEmpty()) {
            return null;
        }
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        for (String id : ids) {
            String name = names.get(id);
            if (StringUtils.hasText(name)) {
                seen.add(name);
            }
        }
        return seen.isEmpty() ? null : String.join(", ", seen);
    }

    private String extractSpecies(String dataJson) {
        Map<String, Object> m = parseMap(dataJson);
        // B5/B6 均可重复块：取第一个块内 species（B5 优先于 B6），兼容扁平旧键
        Object v = firstNonBlank(
                firstBlockValue(m, "B5.blocks", "species"),
                firstBlockValue(m, "B6.blocks", "species"),
                m.get("B5.species"),
                m.get("B6.species"),
                m.get("B6.line"));
        if (v == null) {
            return null;
        }
        if (v instanceof List<?> l && !l.isEmpty()) {
            v = l.get(0);
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** 取可重复块列表第一个块内的指定子字段值（块空/不存在返回 null） */
    private Object firstBlockValue(Map<String, Object> data, String key, String childKey) {
        if (data.get(key) instanceof List<?> blocks && !blocks.isEmpty()) {
            Object b0 = blocks.get(0);
            if (b0 instanceof Map<?, ?> block) {
                return block.get(childKey);
            }
        }
        return null;
    }

    private Object firstNonBlank(Object... vals) {
        for (Object v : vals) {
            if (v == null) {
                continue;
            }
            if (v instanceof String s && s.isBlank()) {
                continue;
            }
            if (v instanceof List<?> l && l.isEmpty()) {
                continue;
            }
            return v;
        }
        return null;
    }

    private String buildMiniSteps(AupListItem item) {
        String[] keys = {STAGE_DRAFT, STAGE_PI_REVIEW, STAGE_FORMAT_REVIEW, STAGE_EXPERT_REVIEW, STAGE_APPROVED};
        // 返修阶段首步显示从哪里退回（组长审核/格式审查/专家审查/回退）
        String draftLabel = "填写";
        if (STAGE_DRAFT.equals(item.getCurrentStage()) && item.getDraftSource() != null) {
            switch (item.getDraftSource()) {
                case "piReturn": draftLabel = "返修(组长审核)"; break;
                case "formatReturn": draftLabel = "返修(格式审查)"; break;
                case "expertReturn": draftLabel = "返修(专家审查)"; break;
                case "rollback": draftLabel = "返修(回退)"; break;
                default: draftLabel = "填写";
            }
        }
        String[] labels = {draftLabel, "组长", "格式", "专家", "通过"};
        int current = indexOf(keys, item.getCurrentStage());
        // expired 不在 keys 内：审批已全部完成，steps 全 done，terminal 单独表达「已过期」
        if (STAGE_EXPIRED.equals(item.getCurrentStage())) {
            current = keys.length;
        }
        List<Map<String, Object>> steps = new ArrayList<>();
        for (int i = 0; i < keys.length; i++) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("key", keys[i]);
            s.put("label", labels[i]);
            s.put("status", current < 0 || i < current ? "done" : (i == current ? "current" : "pending"));
            steps.add(s);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("steps", steps);
        out.put("terminal", STAGE_TERMINATED.equals(item.getCurrentStage()) || STAGE_EXPIRED.equals(item.getCurrentStage())
                ? item.getCurrentStage() : null);
        return toJson(out);
    }

    private int indexOf(String[] arr, String v) {
        if (v == null) {
            return -1;
        }
        for (int i = 0; i < arr.length; i++) {
            if (arr[i].equals(v)) {
                return i;
            }
        }
        return -1;
    }

    private String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private String safe(String s) {
        return s == null ? "" : s;
    }
}
