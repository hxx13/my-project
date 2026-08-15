package com.example.demo.modules.aup.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.aup.dto.AupAttachmentVO;
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
    public static final String STAGE_FORMAT_REVIEW = "formatReview";
    public static final String STAGE_EXPERT_REVIEW = "expertReview";
    public static final String STAGE_APPROVED = "approved";
    public static final String STAGE_TERMINATED = "terminated";
    public static final String STAGE_EXPIRED = "expired";

    // 通知源
    private static final String SRC_SUBMITTED = "AUP_SUBMITTED";
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
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AupDemoSeeder aupDemoSeeder;

    /** 签名可信邮箱域（逗号分隔），不硬编码、可配置 */
    @Value("${aup.signature.trusted-domains:@shsmu.edu.cn}")
    private String trustedDomains;

    /** 附件大小上限（字节），默认 20MB */
    @Value("${aup.attachment.max-size:20971520}")
    private long maxAttachmentSize;

    /** 单计划附件数量上限 */
    @Value("${aup.attachment.max-count:10}")
    private int maxAttachmentCount;

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
                      JdbcTemplate jdbcTemplate,
                      ObjectMapper objectMapper,
                      AupDemoSeeder aupDemoSeeder) {
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
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.aupDemoSeeder = aupDemoSeeder;
    }

    // ======================================================================
    // 草稿 / 保存 / 提交
    // ======================================================================

    /** 新建草稿：冻结当前 PUBLISHED 模板版本，初始化 draft/round_no=1/draft_source=first + 空 aup_data */
    @Transactional
    public AupRecord createDraft(User user, String templateVersion) {
        long[] tpl = resolvePublishedTemplate();
        Long templateId = tpl[0];
        String frozenVersion = (templateVersion != null && !templateVersion.isBlank())
                ? templateVersion.trim() : String.valueOf(tpl[1]);

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

    /** 从 aro_personnel 取用户课题组名（学生端按课题组协作查看用） */
    private String resolveProjectGroupName(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            AroPersonnel p = aroPersonnelMapper.findByUserId(userId);
            return p != null ? p.getProjectGroupName() : null;
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
        String cleaned = stripHiddenFields(record.getTemplateId(), aupId, dataJson, user.getId());
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

        // 3. 回填项目冗余字段（组长 = 提交者本人）
        applyProjectMeta(record, cleaned, user);

        // 4. 提交鉴权（组长或管理员）+ 流转 draft→formatReview
        accessPolicy.assertCanSubmit(record, user);
        String role = accessPolicy.resolveOperatorRole(record, user);
        return transition(aupId, STAGE_DRAFT, STAGE_FORMAT_REVIEW, "submit", user.getId(), role, null);
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
        boolean isReturn = STAGE_DRAFT.equals(toStage) && !STAGE_DRAFT.equals(fromStage);
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
            roundNo += 1;
            draftSource = returnSourceOf(fromStage);
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
            snapshotService.createSnapshot(record, toStage, data == null ? null : data.getData(), operatorId);
        }

        // 审计
        audit(aupId, operatorId, operatorRole, act, fromStage, toStage, comment);

        // 通知（与主事务同事务，失败不阻塞）
        notifyForTransition(record, fromStage, toStage, act, operatorId, comment);

        return recordMapper.selectById(aupId);
    }

    private String returnSourceOf(String fromStage) {
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
    public List<AupValidationErrorDTO> validate(Long aupId) {
        AupRecord record = requireRecord(aupId);
        AupData data = dataMapper.selectByAupId(aupId);
        String raw = data == null ? "{}" : data.getData();
        String cleaned = stripHiddenFieldsQuiet(record.getTemplateId(), raw);
        return validateData(record.getTemplateId(), parseMap(cleaned));
    }

    private List<AupValidationErrorDTO> validateData(Long templateId, Map<String, Object> data) {
        List<AupValidationErrorDTO> errors = new ArrayList<>();
        List<FieldDef> fields = loadFieldDefs(templateId);
        for (FieldDef f : fields) {
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
        // B6 目录D → A8 勾 I
        if (containsAnyValue(data, "B6", "目录D", "目录 D", "catalogD", "D")
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
        snapshotService.createSnapshot(record, record.getCurrentStage(),
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
        AupData data = dataMapper.selectByAupId(aupId);
        snapshotService.createSnapshot(record, STAGE_DRAFT, data == null ? null : data.getData(), user.getId());
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
        snapshotService.createSnapshot(fresh, STAGE_DRAFT, copiedData, user.getId());
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
        return out;
    }

    public AupSnapshotVO getSnapshot(Long aupId, Long snapshotId, User user) {
        AupRecord record = requireRecord(aupId);
        accessPolicy.assertViewable(record, user);
        AupSnapshot s = snapshotService.get(aupId, snapshotId);
        if (s == null) {
            throw TwinBusinessException.of(404, "快照不存在");
        }
        return toSnapshotVO(s, true);
    }

    // ======================================================================
    // 查询
    // ======================================================================

    public Map<String, Object> list(User user, int page, int size, String keyword, String registerNo,
                                    String stage, String excludeStage, String projectGroupName,
                                    boolean excludeDraft, String draftSource, Integer roundNo,
                                    String sortBy, String sortDir) {
        String scopeRole = accessPolicy.resolveScopeRole(user);
        String scopeUserId = user.getId();
        String scopeProjectGroup = resolveProjectGroupName(scopeUserId);
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        List<AupListItem> items = recordMapper.selectPage(scopeRole, scopeUserId, scopeProjectGroup, keyword, registerNo,
                stage, excludeStage, projectGroupName, excludeDraft, draftSource, roundNo, sortBy, sortDir, offset, safeSize);
        Map<Long, String> speciesByAup = loadSpeciesByAup(items);
        for (AupListItem item : items) {
            item.setSummaryJson(buildSummaryJson(item, speciesByAup.get(item.getId())));
            item.setMiniSteps(buildMiniSteps(item));
        }
        int total = recordMapper.countPage(scopeRole, scopeUserId, scopeProjectGroup, keyword, registerNo, stage, excludeStage, projectGroupName, excludeDraft, draftSource, roundNo);
        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("items", items);
        return data;
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

    /** 删除草稿状态计划书（申请人本人或管理员），级联清理相关数据。 */
    @Transactional
    public void delete(Long aupId, User user) {
        AupRecord record = requireRecord(aupId);
        if (!STAGE_DRAFT.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "仅草稿状态的计划书可删除");
        }
        if (record.getDraftSource() != null && !"first".equals(record.getDraftSource())) {
            throw TwinBusinessException.of(409, "该计划书已提交过（返修/回退），不可删除");
        }
        boolean admin = accessPolicy.isAdmin(user);
        if (!admin && (user.getId() == null || !user.getId().equals(record.getCreatedBy()))) {
            throw TwinBusinessException.of(403, "仅申请人或管理员可删除");
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
        if ("submit".equals(action)) {
            // 组长提交 draft→formatReview：通知秘书
            source = SRC_SUBMITTED;
            related.addAll(accessPolicy.listSecretaryUserIds());
        } else if (STAGE_DRAFT.equals(toStage)) {
            // 退回 draft（秘书格式退回/专家返修）：通知组长 + 全组
            if (STAGE_FORMAT_REVIEW.equals(fromStage)) {
                source = SRC_FORMAT_RETURNED;
            } else if (STAGE_EXPERT_REVIEW.equals(fromStage)) {
                source = SRC_EXPERT_RETURNED;
            }
            if (source != null) {
                related.addAll(resolveGroupRecipientIds(record));
            }
        } else if (STAGE_FORMAT_REVIEW.equals(toStage)) {
            // 全弃权重分配 expertReview→formatReview：通知秘书
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
        Map<String, String> tableColumnLabels = new LinkedHashMap<>();
    }

    private List<FieldDef> loadFieldDefs(Long templateId) {
        List<FieldDef> out = new ArrayList<>();
        if (templateId == null) {
            return out;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT f.field_key, f.label, f.type, f.required, f.dict_key, f.config, f.show_when "
                        + "FROM form_field f "
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
            f.maxLength = parseMaxLength(str(row.get("config")));
            f.tableColumnLabels = parseTableColumns(str(row.get("config")));
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

    private Set<String> loadDictValues(String dictKey) {
        Set<String> out = new LinkedHashSet<>();
        try {
            List<String> vals = jdbcTemplate.queryForList(
                    "SELECT di.value FROM dict_item di JOIN dict d ON di.dict_id = d.id WHERE d.dict_key = ?",
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
            if (StringUtils.hasText(f.showWhen) && !evaluateShowWhen(f.showWhen, map)) {
                Object v = map.get(f.fieldKey);
                if (v != null && !isBlankValue(v)) {
                    map.remove(f.fieldKey);
                    stripped.add(f.fieldKey);
                }
            }
        }
        return stripped;
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
            if ("neq".equals(op)) {
                return !equalsValue(actual, expected);
            }
            if ("in".equals(op) || "notIn".equals(op)) {
                boolean contains = containsExpected(actual, expected);
                return "in".equals(op) ? contains : !contains;
            }
            if ("contains".equals(op)) {
                return actual != null && String.valueOf(actual).contains(String.valueOf(expected));
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

    private void applyProjectMeta(AupRecord record, String dataJson, User submitter) {
        Map<String, Object> map = parseMap(dataJson);
        String projectName = firstValue(map, "A1.name", "projectName", "A1.项目名称");
        String dept = firstValue(map, "A2.department", "dept", "A2.单位", "A2.dept");
        String projectSource = firstValue(map, "A1.source", "projectSource", "A2.projectSource", "A2.项目来源");
        // 组长 = 提交者本人（Task I-2：不再按课题组名反查，避免取到任意成员导致越权）
        String piUserId = submitter == null ? null : submitter.getId();
        String piName = submitter == null ? null : resolveName(submitter.getId());
        recordMapper.updateProjectMeta(record.getId(), projectName, piUserId, piName, dept, projectSource);
    }

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

    /** 求和 B6 动物数量（非负、单位「只」），解析失败返回 null（跳过校验） */
    private Double sumAnimalCount(Map<String, Object> data) {
        double sum = 0;
        boolean found = false;
        for (Map.Entry<String, Object> e : data.entrySet()) {
            if (!e.getKey().startsWith("B6")) {
                continue;
            }
            Object v = e.getValue();
            if (v instanceof Number n) {
                sum += n.doubleValue();
                found = true;
            } else if (v instanceof String s && isNumeric(s)) {
                sum += Double.parseDouble(s.trim());
                found = true;
            } else if (v instanceof List<?> rows) {
                for (Object row : rows) {
                    if (row instanceof Map<?, ?> m) {
                        for (Object cell : m.values()) {
                            if (cell instanceof Number n) {
                                sum += n.doubleValue();
                                found = true;
                            } else if (cell instanceof String cs && isNumeric(cs)) {
                                sum += Double.parseDouble(cs.trim());
                                found = true;
                            }
                        }
                    }
                }
            }
        }
        return found ? sum : null;
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

    private String resolveName(String userId) {
        if (!StringUtils.hasText(userId)) {
            return null;
        }
        try {
            AroPersonnel p = aroPersonnelMapper.findByUserId(userId);
            if (p != null && StringUtils.hasText(p.getName())) {
                return p.getName();
            }
        } catch (Exception ignored) {
        }
        return userId;
    }

    private AupSnapshotVO toSnapshotVO(AupSnapshot s, boolean withData) {
        AupSnapshotVO vo = new AupSnapshotVO();
        vo.setSnapshotId(s.getId());
        vo.setVersionNo(s.getVersionNo());
        vo.setStage(s.getStage());
        if (withData) {
            vo.setData(s.getData());
        }
        vo.setCreatedAt(s.getCreatedAt());
        vo.setCreatedBy(s.getCreatedBy());
        return vo;
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

    private String extractSpecies(String dataJson) {
        Map<String, Object> m = parseMap(dataJson);
        Object v = firstNonBlank(m.get("B5.species"), m.get("B6.species"), m.get("B6.line"));
        if (v == null) {
            return null;
        }
        if (v instanceof List<?> l && !l.isEmpty()) {
            v = l.get(0);
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
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
        String[] keys = {STAGE_DRAFT, STAGE_FORMAT_REVIEW, STAGE_EXPERT_REVIEW, STAGE_APPROVED};
        // 返修阶段首步显示从哪里退回（格式审查/专家审查/回退）
        String draftLabel = "填写";
        if (STAGE_DRAFT.equals(item.getCurrentStage()) && item.getDraftSource() != null) {
            switch (item.getDraftSource()) {
                case "formatReturn": draftLabel = "返修(格式审查)"; break;
                case "expertReturn": draftLabel = "返修(专家审查)"; break;
                case "rollback": draftLabel = "返修(回退)"; break;
                default: draftLabel = "填写";
            }
        }
        String[] labels = {draftLabel, "格式", "专家", "通过"};
        int current = indexOf(keys, item.getCurrentStage());
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
