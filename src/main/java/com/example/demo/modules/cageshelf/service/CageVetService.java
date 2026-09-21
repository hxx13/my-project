package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageVetMessage;
import com.example.demo.modules.cageshelf.mapper.CageVetMessageMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 兽医收件箱：把「通知兽医」的每次触发落成一条可读消息，并承载兽医的「已查看」与「指导意见」。
 *
 * <p>三条口径（用户 2026-09-18 定）：
 * <ol>
 *   <li><b>每次触发一条</b>：不合并成「一个笼位一条」，收件箱形态，能看出哪些是新发的；</li>
 *   <li><b>未读 = 紫色描边</b>：未读只影响网格上的悬浮描边，<b>不动笼位自己的状态底色</b>——
 *       它表达的是「这条看过没」，不是笼位状态；</li>
 *   <li><b>必须点「已查看」才清</b>：进弹窗看一眼不算（没有「已读回执」这种隐式语义），
 *       {@link #markRead} 带 {@code read_at IS NULL} 守卫，重复点不覆盖首次查看时刻。</li>
 * </ol>
 *
 * <p>指导意见**不在这张表**：它写进 cage_info_value 的 {@code vet_advice} / {@code vet_advice_images}
 * （见 {@link CageInfoValueService#setVetAdvice}），于是归档时随表单内容一起归档，
 * 且因为那两个字段 editable=0，详情表单里只读。
 */
@Service
public class CageVetService {

    /** 入口能力码：谁能在笼架页看到兽医入口（默认勾给 VETERINARIAN 身份）。 */
    public static final String CAP_VET_INBOX = "cage.vet.inbox";

    private static final Logger log = LoggerFactory.getLogger(CageVetService.class);

    private final CageVetMessageMapper mapper;
    private final CagePermissionService permissionService;
    private final CageAlertRuleService alertRuleService;
    private final CageInfoValueService infoValueService;

    public CageVetService(CageVetMessageMapper mapper,
                          CagePermissionService permissionService,
                          CageAlertRuleService alertRuleService,
                          CageInfoValueService infoValueService) {
        this.mapper = mapper;
        this.permissionService = permissionService;
        this.alertRuleService = alertRuleService;
        this.infoValueService = infoValueService;
    }

    /**
     * 每次「通知兽医」触发时落一条消息（幂等：alert_id 有唯一键，重复调用不堆行）。
     *
     * <p>**不抛异常**：消息落库失败绝不能把告警/通知链路带崩（与通知服务的旁路同一原则）。
     */
    public void createForAlert(Long alertId, Long animalCageId, String statusCode, LocalDateTime firedAt) {
        if (animalCageId == null || animalCageId == 0L) return;
        try {
            mapper.insertIgnore(alertId, animalCageId,
                    statusCode == null || statusCode.isBlank() ? "HEALTH_ABNORMAL" : statusCode,
                    firedAt == null ? LocalDateTime.now() : firedAt);
        } catch (Exception e) {
            log.warn("[cage-vet] 落兽医消息失败 alertId={} cageId={}: {}", alertId, animalCageId, e.getMessage());
        }
    }

    /** 能否进入兽医收件箱：超管逃生口，或矩阵里勾了 {@code cage.vet.inbox} 的身份。 */
    public boolean canEnter(User user) {
        if (user == null) return false;
        if (user.getRole() != null && user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel()) return true;
        return permissionService.hasCapability(user.getId(), CAP_VET_INBOX);
    }

    /**
     * 收件箱列表：每条消息 = 一个笼位一次触发，带定位（含**映射后**的位号）、课题组与当前指导意见。
     *
     * <p>位号沿用 {@code CageAlertViolationService.mappedPositionLabel}（货架第 1 行在物理最下面，
     * 显示要翻转）—— 与违规文案、前端 displayPosition 同源，别在这里另写一套。
     */
    public List<Map<String, Object>> inbox() {
        List<CageVetMessage> rows = mapper.listMessages(null);
        if (rows.isEmpty()) return List.of();
        List<Long> cageIds = new ArrayList<>(new LinkedHashSet<>(
                rows.stream().map(CageVetMessage::getAnimalCageId).filter(java.util.Objects::nonNull).toList()));
        Map<Long, Map<String, Object>> advice = cageIds.isEmpty() ? Map.of() : infoValueService.vetAdviceByCage(cageIds);

        /*
          「当前实际状态」：与网格 specialStatuses 同一套来源与构造（表单 cage_info_value 是真相源），
          但**只收开启的那些** —— 收件箱右侧要的是这个笼位现在到底什么状态，
          不是一张「需分笼 false / 需特殊饲养 false」的表单字段清单（用户 2026-09-18 明确否掉了那种表达）。
        */
        Map<Long, Map<String, Boolean>> statusFlags = infoValueService.statusFlagsByCage(cageIds);
        Map<Long, List<String>> detailCodes = infoValueService.detailCodesByCage(cageIds);
        Map<String, String> detailLabels = infoValueService.detailItemLabels();
        Map<Long, String> severityCodes = infoValueService.severityByCage(cageIds);
        Map<String, String> severityLabels = infoValueService.itemLabels(CageInfoValueService.HEALTH_SEVERITY_DICT);
        Set<Long> itchCages = infoValueService.itchByCage(cageIds);

        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (CageVetMessage m : rows) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", m.getId());
            e.put("animalCageId", m.getAnimalCageId() == null ? null : String.valueOf(m.getAnimalCageId()));
            e.put("statusCode", m.getStatusCode());
            e.put("statusLabel", alertRuleService.labelOf(m.getStatusCode()));
            e.put("firedAt", m.getFiredAt());
            e.put("readAt", m.getReadAt());
            e.put("read", m.getReadAt() != null);
            e.put("roomId", m.getRoomId() == null ? null : String.valueOf(m.getRoomId()));
            e.put("roomName", m.getRoomName());
            e.put("campusName", m.getCampusName());
            e.put("floorName", m.getFloorName());
            e.put("shelveId", m.getShelveId() == null ? null : String.valueOf(m.getShelveId()));
            e.put("shelveName", m.getShelveName());
            Map<String, Object> posIndex = new LinkedHashMap<>();
            posIndex.put("positionX", m.getPositionX());
            posIndex.put("positionY", m.getPositionY());
            e.put("positionLabel", CageAlertViolationService.mappedPositionLabel(posIndex));
            e.put("projectPiName", m.getProjectPiName());
            e.put("experimenterName", m.getExperimenterName());
            // 基本信息（右侧第一块）：笼位类型 + 笼盒编号 + AUP 注册号
            e.put("cageTypeCode", m.getCageTypeCode());
            e.put("cageBoxCode", m.getCageBoxCode());
            e.put("aupNumber", m.getAupNumber());
            // 当前实际状态（右侧第二块）：只含开启的状态；健康异常另给严重程度 + 瘙痒
            e.put("statuses", statusesOf(m.getAnimalCageId(), statusFlags, detailCodes, detailLabels));
            String sev = severityCodes.get(m.getAnimalCageId());
            e.put("healthSeverity", sev == null ? "" : sev);
            e.put("healthSeverityLabel", sev == null ? "" : severityLabels.getOrDefault(sev, sev));
            e.put("healthItch", itchCages.contains(m.getAnimalCageId()));
            Map<String, Object> adv = advice.get(m.getAnimalCageId());
            e.put("adviceText", adv == null ? "" : adv.get("text"));
            e.put("adviceImages", adv == null ? List.of() : adv.get("images"));
            out.add(e);
        }
        return out;
    }

    /** 单个笼位当前开启的状态（顺序与网格 specialStatuses 一致），没开启的什么都不返回。 */
    private static List<Map<String, String>> statusesOf(Long cageId,
                                                        Map<Long, Map<String, Boolean>> statusFlags,
                                                        Map<Long, List<String>> detailCodes,
                                                        Map<String, String> detailLabels) {
        List<Map<String, String>> statuses = new ArrayList<>();
        Map<String, Boolean> flags = statusFlags.getOrDefault(cageId, Map.of());
        if (Boolean.TRUE.equals(flags.get("needs_division"))) statuses.add(Map.of("code", "NEED_DIVIDE", "label", "需分笼"));
        if (Boolean.TRUE.equals(flags.get("needs_special_feeding"))) statuses.add(Map.of("code", "SPECIAL_FEEDING", "label", "需特殊饲养"));
        if (Boolean.TRUE.equals(flags.get("needs_transfer"))) statuses.add(Map.of("code", "ANIMAL_TRANSFER", "label", "动物转移"));
        if (Boolean.TRUE.equals(flags.get("has_health_abnormality"))) statuses.add(Map.of("code", "HEALTH_ABNORMAL", "label", "健康异常"));
        if (Boolean.TRUE.equals(flags.get("needs_cohabitation"))) statuses.add(Map.of("code", "COHABITATION", "label", "合笼"));
        for (String itemCode : detailCodes.getOrDefault(cageId, List.of())) {
            statuses.add(Map.of(
                    "code", CageStatusIntervalService.DETAIL_STATUS_PREFIX + itemCode,
                    "label", detailLabels.getOrDefault(itemCode, itemCode)));
        }
        return statuses;
    }


    public int unreadCount() {
        return mapper.countUnread();
    }

    /** 网格紫色描边用：这批笼位里有未读消息的。 */
    public Set<Long> unreadCageIds(Collection<Long> cageIds) {
        if (cageIds == null || cageIds.isEmpty()) return Set.of();
        try {
            List<Long> ids = mapper.listCageIdsWithUnread(new ArrayList<>(new LinkedHashSet<>(cageIds)));
            return ids == null ? Set.of() : new LinkedHashSet<>(ids);
        } catch (Exception e) {
            log.warn("[cage-vet] 查未读笼位失败: {}", e.getMessage());
            return Set.of();
        }
    }

    @Transactional
    public int markRead(long id, String vetAccountId) {
        return mapper.markRead(id, vetAccountId);
    }

    /** 一键查看：把所有未读一次清掉（用户要求的「一键查看」）。 */
    @Transactional
    public int markAllRead(String vetAccountId) {
        return mapper.markAllRead(vetAccountId);
    }

    /** 写兽医指导意见（文字 + 图片）：落到表单字段，随表单归档。 */
    @Transactional
    public void saveAdvice(Long animalCageId, String text, Collection<String> imageUrls, String vetAccountId) {
        infoValueService.setVetAdvice(animalCageId, text, imageUrls, vetAccountId);
    }
}
