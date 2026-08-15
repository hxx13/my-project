package com.example.demo.modules.aup.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aup.dto.AupRecordView;
import com.example.demo.modules.aup.dto.ExpertCandidate;
import com.example.demo.modules.aup.dto.FormatReviewRequest;
import com.example.demo.modules.aup.dto.PiReviewRequest;
import com.example.demo.modules.aup.dto.ReviewItemsResponse;
import com.example.demo.modules.aup.dto.ReviewItemsSummary;
import com.example.demo.modules.aup.dto.ReviewProgressResponse;
import com.example.demo.modules.aup.dto.ReviewTodoItem;
import com.example.demo.modules.aup.dto.ReviewVoteRequest;
import com.example.demo.modules.aup.dto.ReviewerConfigRequest;
import com.example.demo.modules.aup.dto.ReviewerConfigResponse;
import com.example.demo.modules.aup.dto.VoteAggregate;
import com.example.demo.modules.aup.entity.AupReview;
import com.example.demo.modules.aup.entity.AupReviewAssignment;
import com.example.demo.modules.aup.entity.AupReviewItem;
import com.example.demo.modules.aup.mapper.AupReviewAssignmentMapper;
import com.example.demo.modules.aup.mapper.AupReviewItemMapper;
import com.example.demo.modules.aup.mapper.AupReviewMapper;
import com.example.demo.modules.aup.mapper.AupReviewerMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * AUP 审批链路：格式审查（分配专家）/ 专家投票（逐字段 + 全员同意结算）/ 终止。
 * 主记录 current_stage 变更一律委托 {@link AupService#transition}（接缝），本服务不直接改 stage。
 */
@Service
public class AupReviewService {

    // 阶段
    private static final String STAGE_PI_REVIEW = "piReview";
    private static final String STAGE_FORMAT_REVIEW = "formatReview";
    private static final String STAGE_EXPERT_REVIEW = "expertReview";
    private static final String STAGE_DRAFT = "draft";
    private static final String STAGE_APPROVED = "approved";
    private static final String STAGE_TERMINATED = "terminated";

    // 整体 verdict
    private static final String V_AGREE = "agree";
    private static final String V_DISAGREE = "disagree";
    private static final String V_MODIFY = "modify";
    private static final String V_RECUSE = "recuse";
    private static final String V_ABSTAIN = "abstain";

    // 逐字段 verdict
    private static final String IV_COMPLIANT = "compliant";
    private static final String IV_NON_COMPLIANT = "nonCompliant";
    private static final String IV_SUGGEST = "suggest";

    // 分配状态
    private static final String AS_PENDING = "pending";
    private static final String AS_VOTED = "voted";
    private static final String AS_RECUSED = "recused";

    // 名册角色
    private static final String R_SECRETARY = "secretary";
    private static final String R_EXPERT = "expert";

    private static final Set<String> ITEM_VERDICTS = Set.of(IV_COMPLIANT, IV_NON_COMPLIANT, IV_SUGGEST);
    private static final Set<String> REVIEW_FORMS = Set.of("member", "meeting");

    private final AupReviewMapper reviewMapper;
    private final AupReviewAssignmentMapper assignmentMapper;
    private final AupReviewItemMapper reviewItemMapper;
    private final AupReviewerMapper reviewerMapper;
    private final AupService aupService;
    private final NotificationService notificationService;
    private final PersonIdentityService personIdentityService;
    private final AupAccessPolicy accessPolicy;

    @Value("${aup.identity.secretary-code:SECRETARY}")
    private String secretaryCode;

    @Value("${aup.identity.expert-code:EXPERT}")
    private String expertCode;

    public AupReviewService(AupReviewMapper reviewMapper,
                            AupReviewAssignmentMapper assignmentMapper,
                            AupReviewItemMapper reviewItemMapper,
                            AupReviewerMapper reviewerMapper,
                            AupService aupService,
                            NotificationService notificationService,
                            PersonIdentityService personIdentityService,
                            AupAccessPolicy accessPolicy) {
        this.reviewMapper = reviewMapper;
        this.assignmentMapper = assignmentMapper;
        this.reviewItemMapper = reviewItemMapper;
        this.reviewerMapper = reviewerMapper;
        this.aupService = aupService;
        this.notificationService = notificationService;
        this.personIdentityService = personIdentityService;
        this.accessPolicy = accessPolicy;
    }

    // ===================== 鉴权辅助（供 Controller 调用） =====================

    public boolean isAdmin(User u) {
        return u != null && u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
    }

    public boolean isSecretary(String userId) {
        return StringUtils.hasText(userId) && reviewerMapper.countByUserIdRole(userId, R_SECRETARY) > 0;
    }

    /** 组长（PI）：走身份标识 GROUP_LEADER，语义与 AupAccessPolicy.isPi 一致 */
    public boolean isPi(User user) {
        return accessPolicy.isPi(user);
    }

    public boolean isExpert(String userId) {
        return StringUtils.hasText(userId) && reviewerMapper.countByUserIdRole(userId, R_EXPERT) > 0;
    }

    // ===================== 待办 =====================

    public Map<String, Object> todo(User user, String role, int page, int size) {
        List<ReviewTodoItem> all;
        switch (role == null ? "" : role.trim().toLowerCase()) {
            case "secretary" -> all = reviewMapper.selectSecretaryTodo();
            case "expert" -> all = reviewMapper.selectExpertTodo(user.getId());
            case "pi" -> all = isAdmin(user) ? reviewMapper.selectPiTodoAll() : reviewMapper.selectPiTodo(user.getId());
            default -> throw TwinBusinessException.of(400, "未知的角色分片: " + role);
        }
        int total = all.size();
        int p = Math.max(1, page);
        int s = Math.min(100, Math.max(1, size));
        int from = Math.min((p - 1) * s, total);
        int to = Math.min(from + s, total);
        Map<String, Object> out = new HashMap<>();
        out.put("total", total);
        out.put("items", all.subList(from, to));
        return out;
    }

    // ===================== 组长审核 =====================

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> piReview(User user, long aupId, PiReviewRequest req) {
        if (req == null || !StringUtils.hasText(req.getAction())) {
            throw TwinBusinessException.of(400, "缺少 action");
        }
        String action = req.getAction().trim().toLowerCase();
        if (!"approve".equals(action) && !"return".equals(action)) {
            throw TwinBusinessException.of(400, "action 仅支持 approve/return");
        }
        if (!isAdmin(user) && !accessPolicy.isPi(user)) {
            throw TwinBusinessException.of(403, "仅组长或管理员可执行组长审核");
        }
        AupRecordView record = requireRecord(aupId);
        if (!STAGE_PI_REVIEW.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "当前阶段非组长审核，无法操作");
        }
        String comment = req.getComment();
        if ("approve".equals(action)) {
            aupService.transition(aupId, STAGE_PI_REVIEW, STAGE_FORMAT_REVIEW, "approve",
                    user.getId(), "PI", comment);
            return stageResult(aupId, STAGE_FORMAT_REVIEW);
        }
        if (!StringUtils.hasText(comment)) {
            throw TwinBusinessException.of(400, "退回必须填写意见");
        }
        aupService.transition(aupId, STAGE_PI_REVIEW, STAGE_DRAFT, "return",
                user.getId(), "PI", comment);
        return stageResult(aupId, STAGE_DRAFT);
    }

    // ===================== 格式审查（分配专家） =====================

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> formatReview(User user, long aupId, FormatReviewRequest req) {
        if (req == null) {
            throw TwinBusinessException.of(400, "缺少请求体");
        }
        AupRecordView record = requireRecord(aupId);
        if (!STAGE_FORMAT_REVIEW.equals(record.getCurrentStage())) {
            throw TwinBusinessException.of(409, "当前阶段非格式审查，无法操作");
        }
        String comment = req.getComment();
        int roundNo = roundOf(record);
        List<FormatReviewRequest.Item> items = req.getItems() == null ? List.of() : req.getItems();

        // 有格式建议 → 返修
        if (!items.isEmpty()) {
            persistSecretaryItems(user, aupId, roundNo, comment, items);
            aupService.transition(aupId, STAGE_FORMAT_REVIEW, STAGE_DRAFT, "return", user.getId(), "secretary", comment);
            return stageResult(aupId, STAGE_DRAFT);
        }

        // 无格式建议 → 通过并分配专家
        String reviewForm = req.getReviewForm();
        if (!REVIEW_FORMS.contains(reviewForm)) {
            throw TwinBusinessException.of(400, "reviewForm 仅支持 member/meeting");
        }
        List<String> expertIds = normalizeIds(req.getExpertIds());
        if (expertIds.isEmpty()) {
            // 默认沿用上一轮专家（秘书可改选）
            expertIds = assignmentMapper.selectReviewerIdsByAupRound(aupId, roundNo - 1);
            if (expertIds.isEmpty()) {
                throw TwinBusinessException.of(400, "格式通过必须至少选择 1 名专家");
            }
        }
        for (String eid : expertIds) {
            if (!accessPolicy.isExpert(eid)) {
                throw TwinBusinessException.of(400, "所选人员不是合法专家: " + eid);
            }
        }
        reviewMapper.updateReviewForm(aupId, reviewForm);
        List<AupReviewAssignment> assigns = new ArrayList<>(expertIds.size());
        for (String eid : expertIds) {
            AupReviewAssignment a = new AupReviewAssignment();
            a.setAupId(aupId);
            a.setRoundNo(roundNo);
            a.setReviewerId(eid);
            a.setStatus(AS_PENDING);
            a.setAssignedBy(user.getId());
            assigns.add(a);
        }
        assignmentMapper.insertBatch(assigns);
        aupService.transition(aupId, STAGE_FORMAT_REVIEW, STAGE_EXPERT_REVIEW, "approve", user.getId(), "secretary", comment);
        notifyAssignedExperts(record, expertIds);
        return stageResult(aupId, STAGE_EXPERT_REVIEW);
    }

    /**
     * 秘书格式建议落库：aup_review_item.review_id 非空，故先写一条 role=secretary 的 aup_review
     * （verdict=modify），逐字段意见以其 id 关联，reviewerRole=secretary、verdict=suggest（格式建议）。
     */
    private void persistSecretaryItems(User user, long aupId, int roundNo, String comment,
                                       List<FormatReviewRequest.Item> items) {
        AupReview review = new AupReview();
        review.setAupId(aupId);
        review.setRoundNo(roundNo);
        review.setReviewer(user.getId());
        review.setRole(R_SECRETARY);
        review.setVerdict(V_MODIFY);
        review.setComment(comment);
        reviewMapper.insert(review);

        List<AupReviewItem> rows = new ArrayList<>(items.size());
        for (FormatReviewRequest.Item it : items) {
            if (it == null) {
                continue;
            }
            if (!StringUtils.hasText(it.getFieldKey())) {
                throw TwinBusinessException.of(400, "格式建议缺少 fieldKey");
            }
            AupReviewItem ri = new AupReviewItem();
            ri.setReviewId(review.getId());
            ri.setAupId(aupId);
            ri.setRoundNo(roundNo);
            ri.setFieldKey(it.getFieldKey());
            ri.setSectionKey(it.getSectionKey());
            ri.setFieldLabel(it.getFieldLabel());
            ri.setVerdict(IV_SUGGEST);
            ri.setReason(it.getReason());
            ri.setSuggestion(it.getSuggestion());
            ri.setReviewer(user.getId());
            ri.setReviewerRole(R_SECRETARY);
            rows.add(ri);
        }
        if (!rows.isEmpty()) {
            reviewItemMapper.insertBatch(rows);
        }
    }

    // ===================== 专家投票（逐字段 + 全员同意结算） =====================

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> submitVote(User user, long aupId, ReviewVoteRequest req) {
        if (req == null) {
            throw TwinBusinessException.of(400, "缺少请求体");
        }
        String verdict = resolveVerdict(req);
        // 结算临界区：锁定主记录，避免并发重复结算
        AupRecordView rec = reviewMapper.selectRecordForUpdate(aupId);
        if (rec == null) {
            throw TwinBusinessException.of(404, "计划书不存在");
        }
        if (!STAGE_EXPERT_REVIEW.equals(rec.getCurrentStage())) {
            throw TwinBusinessException.of(409, "当前阶段非专家审查，无法投票");
        }
        int roundNo = rec.getRoundNo() == null ? 1 : rec.getRoundNo();

        AupReviewAssignment assign = assignmentMapper.selectByAupRoundReviewer(aupId, roundNo, user.getId());
        if (assign == null) {
            throw TwinBusinessException.of(403, "您未被分配为该计划的审查专家");
        }
        if (AS_RECUSED.equals(assign.getStatus())) {
            throw TwinBusinessException.of(409, "您已回避，无法投票");
        }
        if (reviewMapper.selectByAupReviewerRound(aupId, user.getId(), roundNo) != null) {
            throw TwinBusinessException.of(409, "您已投过票，请勿重复提交");
        }

        List<ReviewVoteRequest.VoteItem> items = req.getItems() == null ? List.of() : req.getItems();
        validateItems(verdict, items, rec.getTemplateId());

        AupReview review = new AupReview();
        review.setAupId(aupId);
        review.setRoundNo(roundNo);
        review.setReviewer(user.getId());
        review.setRole(R_EXPERT);
        review.setVerdict(verdict);
        review.setComment(req.getComment());
        reviewMapper.insert(review);

        if (!items.isEmpty()) {
            List<AupReviewItem> rows = new ArrayList<>(items.size());
            for (ReviewVoteRequest.VoteItem it : items) {
                if (it == null) {
                    continue;
                }
                AupReviewItem ri = new AupReviewItem();
                ri.setReviewId(review.getId());
                ri.setAupId(aupId);
                ri.setRoundNo(roundNo);
                ri.setFieldKey(it.getFieldKey());
                ri.setSectionKey(it.getSectionKey());
                ri.setFieldLabel(it.getFieldLabel());
                ri.setVerdict(it.getVerdict().trim().toLowerCase());
                ri.setReason(it.getReason());
                ri.setSuggestion(it.getSuggestion());
                ri.setReviewer(user.getId());
                ri.setReviewerRole("expert");
                rows.add(ri);
            }
            if (!rows.isEmpty()) {
                reviewItemMapper.insertBatch(rows);
            }
        }

        assignmentMapper.updateStatus(aupId, roundNo, user.getId(),
                V_RECUSE.equals(verdict) ? AS_RECUSED : AS_VOTED);

        String newStage = settle(aupId, roundNo, user.getId());
        return stageResult(aupId, newStage);
    }

    // ===================== 进度 / 逐字段意见 =====================

    public ReviewProgressResponse progress(User user, long aupId, Integer roundNoParam) {
        AupRecordView record = requireRecord(aupId);
        assertCanViewReview(user, record);
        int roundNo = roundNoParam != null ? roundNoParam : defaultReviewRound(record);
        VoteAggregate agg = reviewMapper.aggregateVotes(aupId, roundNo);

        int agree = nz(agg.getAgreeCount());
        int modify = nz(agg.getModifyCount());
        int disagree = nz(agg.getDisagreeCount());
        int abstain = nz(agg.getAbstainCount());

        ReviewProgressResponse resp = new ReviewProgressResponse();
        resp.setAssignCount(nz(agg.getAssignCount()));
        resp.setRecusedCount(nz(agg.getRecusedCount()));
        resp.setVotedCount(agree + modify + disagree + abstain);
        Map<String, Integer> byVerdict = new LinkedHashMap<>();
        byVerdict.put(V_AGREE, agree);
        byVerdict.put(V_MODIFY, modify);
        byVerdict.put(V_DISAGREE, disagree);
        byVerdict.put(V_ABSTAIN, abstain);
        resp.setByVerdict(byVerdict);
        resp.setUnvoted(assignmentMapper.selectPendingReviewerIds(aupId, roundNo));
        resp.setVotes(reviewMapper.selectVotesByAupRound(aupId, roundNo));
        return resp;
    }

    public ReviewItemsResponse reviewItems(User user, long aupId, Integer roundNoParam, String fieldKey) {
        AupRecordView record = requireRecord(aupId);
        assertCanViewReview(user, record);

        List<AupReviewItem> items;
        if (roundNoParam != null && roundNoParam == 0) {
            // roundNoParam == 0 约定为「取全部轮次」：不按 round_no 过滤，供状态总览按轮展示
            items = reviewMapper.selectByAup(aupId);
        } else {
            int roundNo = roundNoParam != null ? roundNoParam : defaultReviewRound(record);
            items = StringUtils.hasText(fieldKey)
                    ? reviewItemMapper.selectByAupRoundFieldKey(aupId, roundNo, fieldKey.trim())
                    : reviewItemMapper.selectByAupRound(aupId, roundNo);
        }

        Set<String> reviewedFields = new LinkedHashSet<>();
        Set<String> nonCompliantFields = new LinkedHashSet<>();
        Set<String> suggestFields = new LinkedHashSet<>();
        for (AupReviewItem it : items) {
            if (it.getFieldKey() == null) {
                continue;
            }
            reviewedFields.add(it.getFieldKey());
            if (IV_NON_COMPLIANT.equals(it.getVerdict())) {
                nonCompliantFields.add(it.getFieldKey());
            } else if (IV_SUGGEST.equals(it.getVerdict())) {
                suggestFields.add(it.getFieldKey());
            }
        }
        ReviewItemsSummary summary = new ReviewItemsSummary();
        summary.setReviewedCount(reviewedFields.size());
        summary.setNonCompliantCount(nonCompliantFields.size());
        summary.setSuggestCount(suggestFields.size());
        summary.setTotalFields(record.getTemplateId() != null
                ? reviewMapper.countTemplateFields(record.getTemplateId()) : 0);

        ReviewItemsResponse resp = new ReviewItemsResponse();
        resp.setSummary(summary);
        resp.setItems(items);
        return resp;
    }

    // ===================== 专家候选 / 名册配置 =====================

    public List<ExpertCandidate> listExperts() {
        return toCandidates(tagUserIds(expertCode));
    }

    public ReviewerConfigResponse reviewerConfig() {
        ReviewerConfigResponse resp = new ReviewerConfigResponse();
        resp.setFormatReviewers(toCandidates(tagUserIds(secretaryCode)));
        resp.setExpertCandidates(toCandidates(tagUserIds(expertCode)));
        return resp;
    }

    /** 秘书/专家身份已统一在人员页身份字典维护，AUP 侧不再写 aup_reviewer。 */
    public void updateReviewerConfig(ReviewerConfigRequest req) {
        throw TwinBusinessException.of(400, "身份请在人员页身份标识维护");
    }

    // ===================== 内部 =====================

    private AupRecordView requireRecord(long aupId) {
        AupRecordView record = reviewMapper.selectRecordBasic(aupId);
        if (record == null) {
            throw TwinBusinessException.of(404, "计划书不存在");
        }
        return record;
    }

    private void assertCanViewReview(User user, AupRecordView record) {
        if (isAdmin(user)) {
            return;
        }
        if (isSecretary(user.getId())) {
            return;
        }
        if (user.getId() != null && (user.getId().equals(record.getCreatedBy())
                || user.getId().equals(record.getPiUserId()))) {
            return;
        }
        if (assignmentMapper.selectByAupRoundReviewer(record.getId(), roundOf(record), user.getId()) != null) {
            return;
        }
        throw TwinBusinessException.of(403, "无权查看该计划的评审");
    }

    /** 全员同意结算：任一 disagree/modify 退回 draft；有效票齐且全 agree 置 approved；否则等待。 */
    private String settle(long aupId, int roundNo, String operatorId) {
        VoteAggregate agg = reviewMapper.aggregateVotes(aupId, roundNo);
        int assign = nz(agg.getAssignCount());
        int recused = nz(agg.getRecusedCount());
        int abstained = nz(agg.getAbstainCount());
        int agree = nz(agg.getAgreeCount());
        int disagree = nz(agg.getDisagreeCount());
        int modify = nz(agg.getModifyCount());
        int effective = assign - recused - abstained; // 应投 = 分配数 - 回避数 - 弃权数

        if (disagree > 0) {
            aupService.transition(aupId, STAGE_EXPERT_REVIEW, STAGE_TERMINATED, "disapprove",
                    operatorId, "expert", "专家评审不合格，计划书已终止");
            return STAGE_TERMINATED;
        }
        if (modify > 0) {
            aupService.transition(aupId, STAGE_EXPERT_REVIEW, STAGE_DRAFT, "return",
                    operatorId, "expert", "专家评审建议修改，退回返修");
            return STAGE_DRAFT;
        }
        if (effective == 0) {
            aupService.transition(aupId, STAGE_EXPERT_REVIEW, STAGE_FORMAT_REVIEW, "reassign",
                    operatorId, "expert", "全员弃权或回避，退回重新分配专家");
            return STAGE_FORMAT_REVIEW;
        }
        if (effective > 0 && agree == effective) {
            aupService.transition(aupId, STAGE_EXPERT_REVIEW, STAGE_APPROVED, "approve",
                    operatorId, "expert", "全体专家一致同意");
            return STAGE_APPROVED;
        }
        return STAGE_EXPERT_REVIEW; // 票未齐，等待余票
    }

    /**
     * 三态推导整体 verdict：abstain/recuse 显式直用（不推导、不要求 items）；
     * 否则由 items 逐字段推导 —— 任一 nonCompliant → disagree，否则任一 suggest → modify，否则 agree。
     */
    private String resolveVerdict(ReviewVoteRequest req) {
        String verdict = req.getVerdict() == null ? null : req.getVerdict().trim().toLowerCase();
        if (StringUtils.hasText(verdict)) {
            if (V_RECUSE.equals(verdict) || V_ABSTAIN.equals(verdict)) {
                return verdict;
            }
            throw TwinBusinessException.of(400, "verdict 仅支持 abstain/recuse，正常评审请通过 items 逐字段推导");
        }
        List<ReviewVoteRequest.VoteItem> items = req.getItems() == null ? List.of() : req.getItems();
        boolean hasSuggest = false;
        for (ReviewVoteRequest.VoteItem it : items) {
            if (it == null || !StringUtils.hasText(it.getVerdict())) {
                continue;
            }
            String iv = it.getVerdict().trim().toLowerCase();
            if (IV_NON_COMPLIANT.equals(iv)) {
                return V_DISAGREE;
            }
            if (IV_SUGGEST.equals(iv)) {
                hasSuggest = true;
            }
        }
        return hasSuggest ? V_MODIFY : V_AGREE;
    }

    private void validateItems(String verdict, List<ReviewVoteRequest.VoteItem> items, Long templateId) {
        Set<String> validKeys = new HashSet<>();
        if (templateId != null) {
            List<String> keys = reviewMapper.selectFieldKeysByTemplate(templateId);
            if (keys != null) {
                validKeys.addAll(keys);
            }
        }
        for (ReviewVoteRequest.VoteItem it : items) {
            if (it == null) {
                continue;
            }
            if (!StringUtils.hasText(it.getFieldKey())) {
                throw TwinBusinessException.of(400, "评审项缺少 fieldKey");
            }
            if (!StringUtils.hasText(it.getVerdict())) {
                throw TwinBusinessException.of(400, "评审项缺少 verdict");
            }
            String iv = it.getVerdict().trim().toLowerCase();
            if (!ITEM_VERDICTS.contains(iv)) {
                throw TwinBusinessException.of(400, "评审项 verdict 非法: " + it.getVerdict());
            }
            if (IV_NON_COMPLIANT.equals(iv) && !StringUtils.hasText(it.getReason())) {
                throw TwinBusinessException.of(400, "不合规字段必须填写原因");
            }
            if (!validKeys.isEmpty() && !validKeys.contains(it.getFieldKey())) {
                throw TwinBusinessException.of(400, "字段不属于该计划模板版本: " + it.getFieldKey());
            }
        }
    }

    private void notifyAssignedExperts(AupRecordView record, List<String> expertIds) {
        try {
            PublishNotificationEvent ev = new PublishNotificationEvent();
            ev.setEventType("AUP_ASSIGNED");
            ev.setBizType("AUP");
            ev.setBizId(String.valueOf(record.getId()));
            ev.setRelatedUserIds(new LinkedHashSet<>(expertIds));
            Map<String, String> vars = new HashMap<>();
            vars.put("registerNo", record.getRegisterNo() == null ? "" : record.getRegisterNo());
            vars.put("projectName", record.getProjectName() == null ? "" : record.getProjectName());
            ev.setVariables(vars);
            notificationService.publish(ev);
        } catch (Exception ignored) {
            // 通知失败只落待重发记录，不阻塞主流程
        }
    }

    /** STAFF 视角下命中指定身份 code 的 userId（保持身份标识返回顺序）。 */
    private List<String> tagUserIds(String tagCode) {
        if (!StringUtils.hasText(tagCode)) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (Map.Entry<String, List<IdentityTagVO>> entry
                : personIdentityService.listByScope(PersonIdentityService.SCOPE_STAFF, null).entrySet()) {
            if (hasTag(entry.getValue(), tagCode)) {
                result.add(entry.getKey());
            }
        }
        return result;
    }

    /** 标签列表是否命中目标 code（null 安全，语义与 AupAccessPolicy 一致）。 */
    private boolean hasTag(List<IdentityTagVO> tags, String target) {
        if (tags == null || target == null) {
            return false;
        }
        for (IdentityTagVO tag : tags) {
            if (tag != null && Objects.equals(tag.getCode(), target)) {
                return true;
            }
        }
        return false;
    }

    /** userId 列表 → ExpertCandidate：补 name/dept；无人员档案时 name 回退为 userId。 */
    private List<ExpertCandidate> toCandidates(List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        Map<String, ExpertCandidate> byId = new LinkedHashMap<>();
        for (ExpertCandidate c : reviewerMapper.selectCandidatesByUserIds(userIds)) {
            if (c != null && c.getUserId() != null) {
                byId.put(c.getUserId(), c);
            }
        }
        List<ExpertCandidate> out = new ArrayList<>(userIds.size());
        for (String uid : userIds) {
            ExpertCandidate c = byId.get(uid);
            if (c == null) {
                c = new ExpertCandidate();
                c.setUserId(uid);
                c.setName(uid);
            }
            out.add(c);
        }
        return out;
    }

    private List<String> normalizeIds(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String id : ids) {
            if (StringUtils.hasText(id)) {
                set.add(id.trim());
            }
        }
        return new ArrayList<>(set);
    }

    private static int roundOf(AupRecordView record) {
        return record.getRoundNo() == null ? 1 : record.getRoundNo();
    }

    /**
     * 默认轮次：记录处于返修草稿（formatReturn/expertReturn）时回查上一轮（产生这批意见的那一轮），
     * 否则用当前轮。显式传 roundNo 的调用走调用方，不经过这里。
     */
    private static int defaultReviewRound(AupRecordView record) {
        int current = roundOf(record);
        if (STAGE_DRAFT.equals(record.getCurrentStage())) {
            String ds = record.getDraftSource();
            if ("formatReturn".equals(ds) || "expertReturn".equals(ds)) {
                return Math.max(1, current - 1);
            }
        }
        return current;
    }

    private static int nz(Long v) {
        return v == null ? 0 : v.intValue();
    }

    private static Map<String, Object> stageResult(long aupId, String stage) {
        Map<String, Object> out = new HashMap<>();
        out.put("id", aupId);
        out.put("currentStage", stage);
        return out;
    }
}
