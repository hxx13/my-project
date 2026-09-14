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
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 笼位特殊状态的「非违规」提醒：**特殊饲养 / 合笼**（以及特殊饲养明细）持续超时触发告警时，
 * 走推送中心（{@code /console/admin/push-config}）里的**统一源** {@link #SOURCE_CODE} 发通知，
 * **不建违规**（剥离点在 {@code CageStatusAlertScheduler}）。
 *
 * <p>为什么另起一条而不是复用违规通知：这两个状态**不是违规行为**（用户 2026-09-14 定的口径），
 * 违规记录页 / 禁入 / 互动确认那一整套语义对它们都不成立；它们要的只是「到点提醒到人」。
 *
 * <p>收件人 = 该笼位**所属人**（占用者）：活跃认领人优先，没有认领就取表单实验员 —— 与
 * {@code CageOperationService.isOccupantSelf}（「这格是不是你的」）同一套两条腿、同一套解析，
 * 判成是你的笼位，通知就发给你。所属人解析不出来（没认领 + 实验员没进统一人员表）时**退回课题组成员**，
 * 别让通知凭空消失。此外仍并集 push-config 里为这个源单独配的接收人（引擎内部合并）。
 *
 * <p>本服务绝不抛异常出去：通知失败只打日志。告警本体已经落库，不能被一条消息拖垮
 * （与 {@code CageAlertViolationService} 的旁路同一原则）。
 */
@Service
public class CageStatusNotifyService {

    /** 统一通知源 code —— 特殊饲养 / 合笼 / 特殊饲养明细共用这一个源，模板与收件人都在 push-config 里改。 */
    public static final String SOURCE_CODE = "CAGE_SPECIAL_STATUS";

    private static final Logger log = LoggerFactory.getLogger(CageStatusNotifyService.class);
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final PushService pushService;
    private final CageStatusAlertMapper alertMapper;
    private final CageCellIndexMapper cellIndexMapper;
    private final CageCellDetailMapper cellDetailMapper;
    private final AroService aroService;
    private final CageAlertRuleService alertRuleService;
    private final CageOperationService cageOperationService;

    public CageStatusNotifyService(PushService pushService,
                                   CageStatusAlertMapper alertMapper,
                                   CageCellIndexMapper cellIndexMapper,
                                   CageCellDetailMapper cellDetailMapper,
                                   AroService aroService,
                                   CageAlertRuleService alertRuleService,
                                   CageOperationService cageOperationService) {
        this.pushService = pushService;
        this.alertMapper = alertMapper;
        this.cellIndexMapper = cellIndexMapper;
        this.cellDetailMapper = cellDetailMapper;
        this.aroService = aroService;
        this.alertRuleService = alertRuleService;
        this.cageOperationService = cageOperationService;
    }

    /**
     * 告警升级成 ACTIVE 时调用（动作含违规/通知档）。
     *
     * <p>回表读告警行而不是用引擎那条意图：升级（PROMOTE）路径的意图里没有起算时刻，
     * 而通知要报「已持续几天」，只能读行（PENDING 时行就已落库，两种路径都有值）。
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

        Map<String, Object> index = cellIndexMapper.lookupByAnimalCageId(cageId);
        CageCellDetail detail = cellDetailMapper.selectByAnimalCageId(cageId);
        String group = detail == null ? null : detail.getProjectPiName();

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("statusLabel", labelOf(alert.getStatusCode()));
        vars.put("cageLabel", CageAlertViolationService.cageDisplay(index));
        vars.put("roomName", text(index == null ? null : index.get("roomName")));
        vars.put("projectPiName", text(group));
        vars.put("experimenterName", text(detail == null ? null : detail.getExperimenterName()));
        vars.put("persistedDays", String.valueOf(persistedDays(alert)));
        vars.put("thresholdDays", String.valueOf(alert.getThresholdDays() == null ? 0 : alert.getThresholdDays()));
        vars.put("firedAt", alert.getFiredAt() == null ? "" : alert.getFiredAt().format(TIME_FMT));

        pushService.send(SOURCE_CODE, vars, recipientsOf(cageId, group));
    }

    /**
     * 收件人：**该笼位所属人**优先（认领人 → 表单实验员，与「这格是不是你的」同一判据）；
     * 解析不出来才退回课题组成员 —— 宁可发宽一点，也别让通知凭空消失。
     */
    private Set<String> recipientsOf(Long cageId, String group) {
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
            return ids == null ? Set.of() : new java.util.LinkedHashSet<>(ids);
        } catch (Exception e) {
            log.warn("[cage-status-notify] 查询课题组成员失败 group={} err={}", projectGroupName, e.getMessage());
            return Collections.emptySet();
        }
    }

    private static String text(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
