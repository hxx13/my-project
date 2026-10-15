package com.example.demo.modules.avidity.service;

import com.example.demo.modules.avidity.entity.AvidityAlarmEvent;
import com.example.demo.modules.avidity.entity.AvidityAlarmNotified;
import com.example.demo.modules.avidity.entity.AvidityAlarmRule;
import com.example.demo.modules.avidity.entity.AvidityAlarmStat;
import com.example.demo.modules.avidity.entity.AvidityChannel;
import com.example.demo.modules.avidity.mapper.AvidityAlarmNotifiedMapper;
import com.example.demo.modules.avidity.mapper.AvidityAlarmRuleMapper;
import com.example.demo.modules.avidity.mapper.AvidityAlarmStatMapper;
import com.example.demo.modules.avidity.mapper.AvidityChannelMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 安维迪饮水流量报警的判定与推送。
 *
 * <p>两种口径（用户定的「两种都做、可配」，开关存在 avidity_alarm_rule）：
 * <ul>
 *   <li><b>新报警即推</b>：厂平台「当前报警」里每个报警 ID 只推一次；
 *       报警恢复后再犯，厂平台会给一个新 ID，于是会重新推 —— 这正是想要的。</li>
 *   <li><b>当日累计超阈值</b>：某点位当天累计次数首次达到阈值时推一次，同一天同一口径只推一次。</li>
 * </ul>
 *
 * <p>去重靠台账的唯一键 + INSERT IGNORE 原子抢键，抢到才推；推送抛异常就把键退回、下轮重试，
 * 避免「抢了键但没发出去」把这条报警永久漏掉。
 *
 * <p>收件人、渠道、免打扰、模板这些都不在这里 —— 它们归通知配置页，本服务只负责「什么时候该推」。
 */
@Service
public class AvidityAlarmService {

    private static final Logger log = LoggerFactory.getLogger(AvidityAlarmService.class);

    /** 必须在 NotifySourceRegistry 里登记同名源，否则推送会被判为「源不存在」。 */
    public static final String SOURCE_CODE = "AVIDITY_FLOW_ALARM";

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AvidityAlarmRuleMapper ruleMapper;
    private final AvidityAlarmNotifiedMapper ledgerMapper;
    private final AvidityAlarmStatMapper alarmStatMapper;
    private final AvidityChannelMapper channelMapper;
    private final AvidityLiveStateService liveStateService;
    private final AvidityAlarmEventService eventService;
    private final PushService pushService;

    public AvidityAlarmService(AvidityAlarmRuleMapper ruleMapper,
                               AvidityAlarmNotifiedMapper ledgerMapper,
                               AvidityAlarmStatMapper alarmStatMapper,
                               AvidityChannelMapper channelMapper,
                               AvidityLiveStateService liveStateService,
                               AvidityAlarmEventService eventService,
                               PushService pushService) {
        this.ruleMapper = ruleMapper;
        this.ledgerMapper = ledgerMapper;
        this.alarmStatMapper = alarmStatMapper;
        this.channelMapper = channelMapper;
        this.liveStateService = liveStateService;
        this.eventService = eventService;
        this.pushService = pushService;
    }

    public record AlarmRun(int newAlarmPushed, int dailyCountPushed, String message) {
    }

    /** 两种口径的当前配置，供后台页展示。 */
    public List<AvidityAlarmRule> rules() {
        return ruleMapper.selectAll();
    }

    /** 改某个口径的开关与阈值（threshold 传 null 表示不涉及，仅 DAILY_COUNT 有意义）。 */
    public void updateRule(String ruleCode, boolean enabled, Integer thresholdCount) {
        ruleMapper.update(ruleCode, enabled, thresholdCount);
    }

    /** 最近推送留痕，倒序。 */
    public List<AvidityAlarmNotified> notifyLog(int limit) {
        return ledgerMapper.selectRecent(Math.min(Math.max(limit, 1), 200));
    }

    /** 每轮同步落库之后调用。两种口径各自按开关跑。 */
    public AlarmRun evaluate() {
        int newPushed = 0;
        int countPushed = 0;
        if (isEnabled(AvidityAlarmRule.NEW_ALARM)) {
            // 兜底扫一遍：断线期间发生的报警，重连后平台会把当前值重推，这里补推
            newPushed = pushLiveAlarms(liveStateService.activeAlarms());
        }
        AvidityAlarmRule countRule = ruleMapper.selectByCode(AvidityAlarmRule.DAILY_COUNT);
        if (countRule != null && Boolean.TRUE.equals(countRule.getEnabled())) {
            countPushed = pushDailyCountOverThreshold(
                    countRule.getThresholdCount() != null ? countRule.getThresholdCount() : 0);
        }
        if (newPushed > 0 || countPushed > 0) {
            log.info("[安维迪报警] 本轮推送 新报警 {} 条、超阈值 {} 条", newPushed, countPushed);
        }
        return new AlarmRun(newPushed, countPushed,
                String.format("新报警 %d 条、超阈值 %d 条", newPushed, countPushed));
    }

    /**
     * 点位刚翻到报警就立刻推 —— 长连接那边一收到值变化就发这个事件，不必等下一轮同步。
     * 和定时扫的那一遍共用同一个台账键，重复扫到也只推一次。
     *
     * <p>`@Async`：推送要写台账、发通知，别把长连接的读循环堵住。
     */
    @Async
    @EventListener
    public void onLiveChange(AvidityLiveStateService.LiveChange change) {
        if (!change.alarming() || !isEnabled(AvidityAlarmRule.NEW_ALARM)) {
            return;   // 恢复不发推送
        }
        pushLiveAlarms(java.util.List.of(
                new AvidityLiveStateService.LiveAlarm(change.deviceId(), change.variable(), change.at())));
    }

    private boolean isEnabled(String ruleCode) {
        AvidityAlarmRule rule = ruleMapper.selectByCode(ruleCode);
        return rule != null && Boolean.TRUE.equals(rule.getEnabled());
    }

    /**
     * 「新报警」＝平面图上那盏灯刚从绿翻红。
     *
     * <p><b>为什么不用报警表</b>：厂平台「当前报警」那张表里会躺着几个月前的未恢复记录
     * （实测二楼两条是 5 月的），也有此刻灯正红却不在表里的 —— 拿它当触发源会既误报又漏报。
     * 灯的颜色直接跟变量当前值走，和画面一致，所以触发源用它。
     *
     * <p>台账键带上平台给的「最后变化时刻」，它就是这一轮报警的编号：同一次报警只推一次，
     * 报警恢复后再犯会换一个新值，于是重新推一次。
     */
    private int pushLiveAlarms(List<AvidityLiveStateService.LiveAlarm> alarms) {
        if (alarms.isEmpty()) {
            return 0;
        }
        Map<Long, String> deviceNames = deviceNames();
        int pushed = 0;
        for (AvidityLiveStateService.LiveAlarm alarm : alarms) {
            // 先把这次报警落进我们自己的台账，再数「第几次」—— 两个监听器并发，
            // 不保证记录先于推送，先补一次才能把当前这条算进去
            eventService.ensureOpen(alarm.deviceId(), alarm.variable(), alarm.at());

            String[] pos = splitAlarmName(alarm.variable());
            String positionLabel = positionLabel(pos);
            String deviceName = deviceNames.getOrDefault(alarm.deviceId(), "");
            String alarmContent = StringUtils.hasText(positionLabel) ? positionLabel + " 流量报警" : "流量报警";
            String summary = (StringUtils.hasText(deviceName) ? deviceName + " " : "") + alarmContent;

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("deviceName", deviceName);
            vars.put("alarmName", nullToEmpty(alarm.variable()));
            vars.put("positionLabel", positionLabel);
            vars.put("alarmContent", alarmContent);
            vars.put("alarmGroup", "");
            vars.put("ruleLabel", "新报警出现");
            vars.put("triggeredAt", triggeredAt(alarm.at()));
            vars.put("todaySeq", String.valueOf(eventService.todaySeq(alarm.deviceId(), alarm.variable())));
            vars.put("totalSeq", String.valueOf(eventService.totalSeq(alarm.deviceId(), alarm.variable())));
            AlarmTable table = buildAlarmTable(alarm.deviceId(), alarm.variable());
            vars.put("alarmRows", table.markdownRows());
            vars.put("alarmRowsHtml", table.htmlRows());
            vars.put("openCount", String.valueOf(table.openCount()));

            String key = "LIVE:" + alarm.deviceId() + ":" + alarm.variable() + ":" + alarm.at();
            if (claim(key, AvidityAlarmRule.NEW_ALARM, deviceName, alarm.variable(), summary, vars)) {
                pushed++;
            }
        }
        return pushed;
    }

    /** 推送文案里的报警一览：此刻在报的点位 + 各自次数，刚触发的那条标出来。 */
    private record AlarmTable(String markdownRows, String htmlRows, int openCount) {
    }

    /**
     * 凑推送正文里那张表。
     *
     * <p>为什么把**在报的全部**都列上：单看一个点位没法判断严重程度 —— 一台设备某个房间
     * 冒出一片红，和零星一格，处理优先级完全不同。收到的人一眼要能看出「现在一共几格在报」。
     *
     * @param deviceId 这一次刚触发的设备
     * @param variable 这一次刚触发的点位
     */
    private AlarmTable buildAlarmTable(long deviceId, String variable) {
        List<AvidityAlarmEvent> open = eventService.openAlarms(null);
        StringBuilder md = new StringBuilder();
        StringBuilder html = new StringBuilder();
        LocalDateTime now = LocalDateTime.now(ZONE);
        for (AvidityAlarmEvent e : open) {
            boolean isNew = e.getVirtualDeviceId() != null && e.getVirtualDeviceId() == deviceId
                    && variable.equals(e.getAlarmName());
            String label = pointLabel(e);
            String seq = "今日 " + eventService.todaySeq(e.getVirtualDeviceId(), e.getAlarmName())
                    + " 次 / 累计 " + eventService.totalSeq(e.getVirtualDeviceId(), e.getAlarmName()) + " 次";
            String state = isNew ? "新触发" : "已持续 " + elapsedText(e.getStartedAt(), now);
            md.append("| ").append(label).append(" | ").append(seq).append(" | ").append(state).append(" |\n");
            html.append("<tr>")
                    .append(td(label, false))
                    .append(td(seq, false))
                    .append(td(state, isNew))
                    .append("</tr>");
        }
        return new AlarmTable(md.toString(), html.toString(), open.size());
    }

    private static String td(String text, boolean strong) {
        String style = "border:1px solid #e2e8f0;padding:4px 8px;"
                + (strong ? "color:#b91c1c;font-weight:700" : "");
        return "<td style='" + style + "'>" + (text == null ? "" : text) + "</td>";
    }

    /** E11A-B106 第11点位 / 201-C 第3点位 */
    private static String pointLabel(AvidityAlarmEvent e) {
        String place = StringUtils.hasText(e.getRack()) ? e.getRack()
                : (StringUtils.hasText(e.getRoom()) ? e.getRoom() : "");
        return e.getPointNo() == null ? place : place + " 第" + e.getPointNo() + "点位";
    }

    /** 「2 小时 5 分」这种人话时长。 */
    private static String elapsedText(LocalDateTime from, LocalDateTime to) {
        if (from == null) return "—";
        long sec = java.time.Duration.between(from, to).getSeconds();
        if (sec < 60) return sec + " 秒";
        long m = sec / 60;
        if (m < 60) return m + " 分钟";
        return (m / 60) + " 小时 " + (m % 60) + " 分";
    }

    /** 设备 ID → 设备名（通道表里带着），推送文案要用。 */
    private Map<Long, String> deviceNames() {
        Map<Long, String> out = new LinkedHashMap<>();
        for (AvidityChannel channel : channelMapper.selectAll()) {
            if (channel.getVirtualDeviceId() != null && StringUtils.hasText(channel.getDeviceName())) {
                out.putIfAbsent(channel.getVirtualDeviceId(), channel.getDeviceName());
            }
        }
        return out;
    }

    /** 平台给的变化时刻是 UTC（形如 2026-10-15T08:47:28Z），换成北京墙钟再进文案。 */
    private static String triggeredAt(String iso) {
        if (StringUtils.hasText(iso)) {
            try {
                return java.time.Instant.parse(iso).atZone(ZONE).toLocalDateTime().format(STAMP);
            } catch (Exception ignored) {
                // 格式变了就退回本机时刻，不让文案空着
            }
        }
        return LocalDateTime.now(ZONE).format(STAMP);
    }

    /** 当天累计次数首次越过阈值的点位，各推一次。 */
    private int pushDailyCountOverThreshold(int threshold) {
        if (threshold <= 0) {
            return 0;
        }
        LocalDate today = LocalDate.now(ZONE);
        List<AvidityAlarmStat> stats = alarmStatMapper.selectByDate(today, null);
        int pushed = 0;
        for (AvidityAlarmStat stat : stats) {
            if (stat.getAlarmCount() == null || stat.getAlarmCount() < threshold) {
                continue;
            }
            String[] pos = splitAlarmName(stat.getAlarmName());
            String summary = String.format("%s %s 当日累计 %d 次（阈值 %d）",
                    nullToEmpty(stat.getDeviceName()), nullToEmpty(stat.getAlarmContent()),
                    stat.getAlarmCount(), threshold);

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("deviceName", nullToEmpty(stat.getDeviceName()));
            vars.put("alarmName", nullToEmpty(stat.getAlarmName()));
            vars.put("positionLabel", positionLabel(pos));
            vars.put("alarmContent", nullToEmpty(stat.getAlarmContent()));
            vars.put("alarmCount", String.valueOf(stat.getAlarmCount()));
            vars.put("thresholdCount", String.valueOf(threshold));
            vars.put("ruleLabel", "当日累计超阈值");
            vars.put("statDate", today.toString());
            // 这两个数我们自己也记着（报警事件台账），两个口径的模板都带得上
            vars.put("todaySeq", String.valueOf(
                    eventService.todaySeq(stat.getVirtualDeviceId(), stat.getAlarmName())));
            vars.put("totalSeq", String.valueOf(
                    eventService.totalSeq(stat.getVirtualDeviceId(), stat.getAlarmName())));
            // 在报的一览：发这条的时候还有哪些点位红着，一起给他
            AlarmTable table = buildAlarmTable(stat.getVirtualDeviceId(), stat.getAlarmName());
            vars.put("alarmRows", table.markdownRows());
            vars.put("alarmRowsHtml", table.htmlRows());
            vars.put("openCount", String.valueOf(table.openCount()));

            String key = "COUNT:" + today + ":" + stat.getVirtualDeviceId() + ":" + stat.getAlarmName();
            if (claim(key, AvidityAlarmRule.DAILY_COUNT, stat.getDeviceName(), stat.getAlarmName(), summary, vars)) {
                pushed++;
            }
        }
        return pushed;
    }

    /** 原子抢去重键；抢到再推。推送失败把键退回，下轮重试。 */
    private boolean claim(String key, String ruleCode, String deviceName, String alarmName,
                          String summary, Map<String, String> vars) {
        AvidityAlarmNotified row = new AvidityAlarmNotified();
        row.setNotifyKey(key);
        row.setRuleCode(ruleCode);
        row.setDeviceName(deviceName);
        row.setAlarmName(alarmName);
        row.setMessage(summary);
        row.setNotifiedAt(LocalDateTime.now(ZONE));
        if (ledgerMapper.insertIgnore(row) == 0) {
            return false;   // 已经推过了
        }
        try {
            pushService.send(SOURCE_CODE, vars);
            return true;
        } catch (Exception e) {
            ledgerMapper.deleteByKey(key);
            log.warn("[安维迪报警] 推送失败，已退回去重键待下轮重试 key={} · {}", key, e.getMessage());
            return false;
        }
    }

    /** RM205_A_SLV_13 → ["205-A", "13"]；B1 的 RM_A_B105_SLV_1 → ["A-B105", "1"]。 */
    static String[] splitAlarmName(String alarmName) {
        if (!StringUtils.hasText(alarmName)) {
            return new String[]{"", ""};
        }
        String head = alarmName;
        String point = "";
        int i = alarmName.indexOf("_SLV_");
        if (i >= 0) {
            head = alarmName.substring(0, i);
            point = alarmName.substring(i + "_SLV_".length());
        }
        if (head.startsWith("RM")) {
            head = head.substring(2);
        }
        head = head.replaceAll("^_+", "").replace('_', '-');
        return new String[]{head, point};
    }

    static String positionLabel(String[] pos) {
        if (!StringUtils.hasText(pos[0])) {
            return StringUtils.hasText(pos[1]) ? "第" + pos[1] + "点位" : "";
        }
        return StringUtils.hasText(pos[1]) ? pos[0] + " 第" + pos[1] + "点位" : pos[0];
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
