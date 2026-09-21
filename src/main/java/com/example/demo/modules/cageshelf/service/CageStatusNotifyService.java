package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 笼位特殊状态的「非违规」提醒：**特殊饲养 / 合笼 / 明细 / 健康异常**持续超时触发告警时，
 * 走推送中心（{@code /console/admin/push-config}）里对应的**信息源**发通知，**不建违规**
 * （剥离点在 {@code CageStatusAlertScheduler.maybeEscalate}）。
 *
 * <p>为什么另起一条而不是复用违规通知：这些状态**不是违规行为**（用户 2026-09-14 定的口径），
 * 违规记录页 / 禁入 / 互动确认那一整套语义对它们都不成立；它们要的只是「到点提醒到人」。
 *
 * <h3>三个源，按 (状态码, 通知对象) 分流</h3>
 * <p>健康异常要**分开通知两个人**（用户 2026-09-17 口径）：兽医、笼位所有者，
 * 两个源各自独立开关/渠道/模板/接收人 —— 这就是「划分开两个通知配置」的落点。
 * 其余非违规状态只有一个默认对象，共用原有的 {@link #SOURCE_SPECIAL_STATUS}。
 *
 * <h3>收件人</h3>
 * <ul>
 *   <li>VET：该笼位所在区域**指定的兽医**（{@link CageRegionVetService}，就近命中 + 同级并集）。
 *       没配 → 退回 push-config 里为该源配的接收人，并打 warn（通知不能凭空消失）。</li>
 *   <li>OWNER / 默认：该笼位**所属人**（活跃认领人优先，没有认领就取表单实验员 —— 与
 *       {@code CageOperationService.isOccupantSelf} 同一套两条腿、同一套解析）；
 *       解析不出来退回课题组成员。</li>
 * </ul>
 * <p>两路都仍并集 push-config 里为该源单独配的接收人（引擎内部合并）。
 *
 * <p>本服务绝不抛异常出去：通知失败只打日志。告警本体已经落库，不能被一条消息拖垮
 * （与 {@code CageAlertViolationService} 的旁路同一原则）。
 */
@Service
public class CageStatusNotifyService {

    /** 特殊饲养 / 合笼 / 特殊饲养明细共用（原有单目标语义）。 */
    public static final String SOURCE_SPECIAL_STATUS = "CAGE_SPECIAL_STATUS";
    /** 健康异常 → 通知兽医。 */
    public static final String SOURCE_HEALTH_VET = "CAGE_HEALTH_VET";
    /** 健康异常 → 通知笼位所有者。 */
    public static final String SOURCE_HEALTH_OWNER = "CAGE_HEALTH_OWNER";

    private static final Logger log = LoggerFactory.getLogger(CageStatusNotifyService.class);
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final PushService pushService;
    private final CageStatusAlertMapper alertMapper;
    private final CageCellIndexMapper cellIndexMapper;
    private final CageCellDetailMapper cellDetailMapper;
    private final AroService aroService;
    private final CageAlertRuleService alertRuleService;
    private final CageOperationService cageOperationService;
    private final CageRegionVetService regionVetService;
    private final CageInfoValueService infoValueService;
    private final CageVetService vetService;

    public CageStatusNotifyService(PushService pushService,
                                   CageStatusAlertMapper alertMapper,
                                   CageCellIndexMapper cellIndexMapper,
                                   CageCellDetailMapper cellDetailMapper,
                                   AroService aroService,
                                   CageAlertRuleService alertRuleService,
                                   CageOperationService cageOperationService,
                                   CageRegionVetService regionVetService,
                                   CageInfoValueService infoValueService,
                                   CageVetService vetService) {
        this.pushService = pushService;
        this.alertMapper = alertMapper;
        this.cellIndexMapper = cellIndexMapper;
        this.cellDetailMapper = cellDetailMapper;
        this.aroService = aroService;
        this.alertRuleService = alertRuleService;
        this.cageOperationService = cageOperationService;
        this.regionVetService = regionVetService;
        this.infoValueService = infoValueService;
        this.vetService = vetService;
    }

    /**
     * 「(状态码, 通知对象) → 用哪个推送源」—— 唯一的源选择点。
     * 只有健康异常分两个源，其余（含特殊饲养明细）都是默认源。
     */
    public static String sourceOf(String statusCode, String notifyTarget) {
        if (!CageStatusIntervalService.STATUS_HEALTH_ABNORMAL.equals(statusCode)) {
            return SOURCE_SPECIAL_STATUS;
        }
        return CageStatusIntervalService.TARGET_VET.equals(CageStatusIntervalService.normalizeTarget(notifyTarget))
                ? SOURCE_HEALTH_VET
                : SOURCE_HEALTH_OWNER;
    }

    /**
     * 告警升级成 ACTIVE 时调用（动作含违规/通知档）。
     *
     * <p>回表读告警行而不是用引擎那条意图：升级（PROMOTE）路径的意图里没有起算时刻，
     * 而通知要报「已持续几天」，只能读行（PENDING 时行就已落库，两种路径都有值）。
     * 顺带也就拿到了 notify_target —— 源的分流读它，不必再往调用方传一遍。
     */
    public void notifyFired(long alertId) {
        try {
            CageStatusAlert alert = alertMapper.selectById(alertId);
            if (alert == null) return;
            publish(alert);
        } catch (Exception e) {
            log.warn("[cage-status-notify] 告警 {} 发通知失败: {}", alertId, e.getMessage());
        }
    }

    private void publish(CageStatusAlert alert) {
        Long cageId = alert.getAnimalCageId();
        if (cageId == null || cageId == 0L) return;

        String source = sourceOf(alert.getStatusCode(), alert.getNotifyTarget());
        /*
          兽医收件箱：每次「通知兽医」触发**形成一条消息**（用户 2026-09-18 口径）。
          放在这里而不是推送之后 —— 收件箱是兽医那条通道的**主**载体：没指定区域兽医、
          或对方没绑渠道时推送发不出去，但消息得留着，等兽医登进来就能看到。
        */
        if (SOURCE_HEALTH_VET.equals(source)) {
            vetService.createForAlert(alert.getId(), cageId, alert.getStatusCode(), alert.getFiredAt());
        }
        Map<String, Object> index = cellIndexMapper.lookupByAnimalCageId(cageId);
        CageCellDetail detail = cellDetailMapper.selectByAnimalCageId(cageId);
        String group = detail == null ? null : detail.getProjectPiName();

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("statusLabel", labelOf(alert.getStatusCode()));
        vars.put("severityLabel", severityLabelOf(cageId, alert.getStatusCode()));
        vars.put("cageLabel", CageAlertViolationService.cageDisplay(index));
        vars.put("roomName", text(index == null ? null : index.get("roomName")));
        vars.put("projectPiName", text(group));
        vars.put("experimenterName", text(detail == null ? null : detail.getExperimenterName()));
        vars.put("persistedDays", String.valueOf(persistedDays(alert)));
        vars.put("thresholdDays", String.valueOf(alert.getThresholdDays() == null ? 0 : alert.getThresholdDays()));
        vars.put("firedAt", alert.getFiredAt() == null ? "" : alert.getFiredAt().format(TIME_FMT));

        pushService.send(source, vars, recipientsOf(source, cageId, group));
    }

    /**
     * 收件人按源分岔。
     *
     * <p>VET 源只发给区域指定的兽医（并集 push-config 配置，由引擎合并）——「通知兽医」与
     * 「通知笼位所有者」是两条独立通道，不互相夹带，否则关掉兽医那条等于没关。
     */
    private Set<String> recipientsOf(String source, Long cageId, String group) {
        if (SOURCE_HEALTH_VET.equals(source)) {
            Set<String> vets = Set.of();
            try {
                vets = regionVetService.resolveVetsForCage(cageId);
            } catch (Exception e) {
                log.warn("[cage-status-notify] 解析笼位 {} 的区域兽医失败: {}", cageId, e.getMessage());
            }
            if (vets.isEmpty()) {
                log.warn("[cage-status-notify] 笼位 {} 所属区域未指定兽医，本次只发 push-config 里为该源配的接收人", cageId);
            }
            return vets;
        }
        return occupantOf(cageId, group);
    }

    /**
     * 笼位**所属人**优先（认领人 → 表单实验员，与「这格是不是你的」同一判据）；
     * 解析不出来才退回课题组成员 —— 宁可发宽一点，也别让通知凭空消失。
     */
    private Set<String> occupantOf(Long cageId, String group) {
        Set<String> occupant = Set.of();
        try {
            occupant = cageOperationService.occupantAccountIds(cageId);
        } catch (Exception e) {
            log.warn("[cage-status-notify] 解析笼位 {} 所属人失败: {}", cageId, e.getMessage());
        }
        if (!occupant.isEmpty()) return occupant;
        return groupMemberIds(group);
    }

    /** 状态中文名：五个固定状态走静态表，特殊饲养明细查码表（与阈值配置/违规文案同一出处）。 */
    private String labelOf(String statusCode) {
        if (statusCode == null || statusCode.isBlank()) return "";
        String label = alertRuleService.labelOf(statusCode);
        return label == null || label.isBlank() ? statusCode : label;
    }

    /**
     * 严重程度文案：只有健康异常有它（挂在父状态下的互斥单选字段），其余状态回空串 ——
     * 模板里 {severityLabel} 空着就是了，不做「未指定」之类的填充。
     */
    private String severityLabelOf(Long cageId, String statusCode) {
        if (!CageStatusIntervalService.STATUS_HEALTH_ABNORMAL.equals(statusCode)) return "";
        try {
            return infoValueService.healthSeverityLabel(cageId);
        } catch (Exception e) {
            log.warn("[cage-status-notify] 读取笼位 {} 的严重程度失败: {}", cageId, e.getMessage());
            return "";
        }
    }

    /**
     * 已持续天数。正常情况下 = 触发时刻 − 起算时刻；两个时刻缺一个（历史行）就退回阈值天数，
     * 宁可少一层精度，也不给用户报一个假的「0 天」。
     */
    private static long persistedDays(CageStatusAlert alert) {
        LocalDateTime started = alert.getStartedAt();
        LocalDateTime fired = alert.getFiredAt();
        if (started == null || fired == null) {
            return alert.getThresholdDays() == null ? 0 : Math.max(0, alert.getThresholdDays());
        }
        return Math.max(0, Duration.between(started, fired).toDays());
    }

    /**
     * 该笼位课题组成员（与违规通知同一口径：按笼位详情的 projectPiName 展开）。
     * 查不到就回空集 —— 此时仍会走「push-config 里配的接收人」那一路，不是不发。
     */
    private Set<String> groupMemberIds(String projectGroupName) {
        if (projectGroupName == null || projectGroupName.isBlank()) return Set.of();
        try {
            List<String> ids = aroService.findUserIdsByProjectGroup(projectGroupName);
            return ids == null ? Set.of() : new LinkedHashSet<>(ids);
        } catch (Exception e) {
            log.warn("[cage-status-notify] 查询课题组成员失败 group={} err={}", projectGroupName, e.getMessage());
            return Collections.emptySet();
        }
    }

    private static String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
