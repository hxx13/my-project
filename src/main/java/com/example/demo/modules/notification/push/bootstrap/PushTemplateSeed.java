package com.example.demo.modules.notification.push.bootstrap;

import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import com.example.demo.modules.notification.push.config.NotifySourceChannelMapper;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 为每个通知源预置默认渠道模板（标题+内容+默认变量提示）。
 * 仅在 notify_source_channel 无记录时幂等写入。
 */
@Component
@Order(3)
public class PushTemplateSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PushTemplateSeed.class);
    private final NotifySourceMapper sourceMapper;
    private final NotifySourceChannelMapper channelMapper;

    public PushTemplateSeed(NotifySourceMapper sourceMapper, NotifySourceChannelMapper channelMapper) {
        this.sourceMapper = sourceMapper;
        this.channelMapper = channelMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<NotifySource> sources;
        try {
            sources = sourceMapper.findAll();
        } catch (Exception e) {
            log.error("[Push] 模板种子：查询通知源失败 — {}", e.getMessage());
            return;
        }
        if (sources.isEmpty()) {
            log.info("[Push] 通知源为空，跳过模板种子");
            return;
        }
        int created = 0, updated = 0, errors = 0;
        for (NotifySource src : sources) {
            for (String ch : List.of("EMAIL", "SERVER_CHAN", "WXPUSHER")) {
                try {
                Template t = TEMPLATES.get(src.getSourceCode());
                // 无预定义模板 → 创建渠道行但留空模板，用户后续在 UI 中自行编辑
                String title = t != null ? t.title : "";
                String content = t != null
                        ? ("EMAIL".equals(ch) ? t.contentEmail
                                : "WXPUSHER".equals(ch) ? t.contentWxpusher() : t.contentWechat())
                        : "";
                NotifySourceChannel exist = channelMapper.findBySourceAndChannel(src.getId(), ch);
                if (exist != null) {
                    // 已有记录 → 仅当预定义模板存在时更新模板（保留 enable/quiet 等已有设置）
                    if (t != null) {
                        exist.setTitleTpl(title);
                        exist.setContentTpl(content);
                    }
                    if ("SWIPE_FAILURE_ALERT".equals(src.getSourceCode())) exist.setRateLimitSeconds(0);
                    channelMapper.update(exist);
                    updated++;
                } else {
                    NotifySourceChannel cfg = new NotifySourceChannel();
                    cfg.setSourceId(src.getId());
                    cfg.setChannelCode(ch);
                    cfg.setEnabled(t != null);  // 有预定义模板才默认启用，否则由用户自行开启
                    cfg.setTitleTpl(title);
                    cfg.setContentTpl(content);
                    cfg.setRateLimitSeconds("SWIPE_FAILURE_ALERT".equals(src.getSourceCode()) ? 0 : 300);
                    cfg.setDigestMode("INSTANT");
                    channelMapper.insert(cfg);
                    created++;
                }
                } catch (Exception e) {
                    errors++;
                    log.error("[Push] 模板种子失败 {}/{}: {}", src.getSourceCode(), ch, e.getMessage());
                }
            }
        }
        log.info("[Push] 模板种子完成 — 新建 {} / 更新 {} / 失败 {}", created, updated, errors);
    }

    private record Template(String title, String contentEmail, String contentWechat, String contentWxpusher) {
        Template(String title, String contentEmail, String contentWechat) {
            this(title, contentEmail, contentWechat, contentWechat);
        }
    }

    private static final Map<String, Template> TEMPLATES = new LinkedHashMap<>();
    static {
        TEMPLATES.put("ACTIVATION_SUCCESS", new Template(
                "激活成功 — {doorLabel}",
                "<h3>激活成功</h3><p>门禁 <b>{doorLabel}</b> 于 {swingTime} 刷卡激活成功。</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 激活成功\n门禁 **{doorLabel}**\n时间：{swingTime}\n\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SIGNOUT_COUNTDOWN", new Template(
                "签退倒计时 — {doorLabel}",
                "<h3>签退倒计时</h3><p><b>{doorLabel}</b> 已启动 <b>{countdownSeconds} 秒</b> 签退倒计时。</p>"
                        + "<p>计划签退时间：{scheduledExitAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 签退倒计时\n**{doorLabel}** 已启动 **{countdownSeconds} 秒** 签退倒计时\n计划签退：{scheduledExitAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("MATERIAL_REQUESTED", new Template(
                "物资申领 — {applicantName}",
                "<h3>新物资申领</h3><p><b>{applicantName}</b>（{applicantGroup}）提交了物资申领：</p>"
                        + "<p>{summary}</p>"
                        + "<p style='color:#666;font-size:12px'>提交时间：{createdAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新物资申领\n**{applicantName}**（{applicantGroup}）\n\n{summary}\n\n提交时间：{createdAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("MATERIAL_REVIEWED", new Template(
                "物资申领结果 — {auditResult}",
                "<h3>物资申领{auditResult}</h3><p><b>{applicantName}</b>，你的物资申领已<b>{auditResult}</b>。</p>"
                        + "<p>{summary}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 物资申领{auditResult}\n**{applicantName}**，你的物资申领已**{auditResult}**\n{summary}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SCAN_DELAY_REQUESTED", new Template(
                "延迟免冻结申请 — {subjectName}",
                "<h3>新延迟免冻结申请</h3><p><b>{subjectName}</b>（{subjectGroup}）在 <b>{roomName}</b> 申请 <b>{optionLabel}</b>。</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新延迟免冻结申请\n**{subjectName}**（{subjectGroup}）\n{roomName} · {optionLabel}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SCAN_DELAY_REVIEWED", new Template(
                "延迟免冻结结果 — {auditResult}",
                "<h3>延迟免冻结{auditResult}</h3><p><b>{roomName}</b> · {optionLabel}：<b>{auditResult}</b></p>"
                        + "{rejectReason}"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 延迟免冻结{auditResult}\n**{roomName}** · {optionLabel}\n审核结果：**{auditResult}**\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("VIOLATION_CREATED", new Template(
                "违规提醒 — {title}",
                "<h3>{title}</h3><p>来源：{source}</p><p>{summary}</p>"
                        + "<p>门禁限制：{enterLocked}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## {title}\n来源：{source}\n{summary}\n门禁限制：{enterLocked}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SCAN_DELAY_MANUAL", new Template(
                "免冻结授权 — {roomName}",
                "<h3>免冻结已授权</h3><p>房间：<b>{roomName}</b></p>"
                        + "<p>详情：{optionLabel}</p>"
                        + "<p>操作人：{operatorName}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 免冻结已授权\n房间：**{roomName}**\n详情：{optionLabel}\n操作人：{operatorName}\n> ARO 系统自动推送"
        ));

        // ========== 采购 ==========
        TEMPLATES.put("PURCHASE_REQUESTED", new Template(
                "采购申请 — {applicantName}",
                "<h3>新采购申请</h3><p><b>{applicantName}</b> 提交了采购申请。</p>"
                        + "<p>采购地点：{location}</p>"
                        + "<p>采购内容：{content}</p>"
                        + "<p style='color:#666;font-size:12px'>提交时间：{createdAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新采购申请\n**{applicantName}**\n采购地点：{location}\n采购内容：{content}\n提交时间：{createdAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("PURCHASE_COMPLETED", new Template(
                "采购办结 — {location}",
                "<h3>采购已办结</h3><p><b>{applicantName}</b>，你在 <b>{location}</b> 的采购申请已处理完毕。</p>"
                        + "<p>{summary}</p><p>处理人：{processorName}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 采购已办结\n**{applicantName}**，你在 **{location}** 的采购申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送"
        ));

        // ========== 报修 ==========
        TEMPLATES.put("REPAIR_REQUESTED", new Template(
                "报修申请 — {applicantName}",
                "<h3>新报修申请</h3><p><b>{applicantName}</b> 提交了报修申请。</p>"
                        + "<p>报修地点：{location}</p>"
                        + "<p>报修内容：{content}</p>"
                        + "<p style='color:#666;font-size:12px'>提交时间：{createdAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新报修申请\n**{applicantName}**\n报修地点：{location}\n报修内容：{content}\n提交时间：{createdAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("REPAIR_COMPLETED", new Template(
                "报修办结 — {location}",
                "<h3>报修已办结</h3><p><b>{applicantName}</b>，你在 <b>{location}</b> 的报修申请已处理完毕。</p>"
                        + "<p>{summary}</p><p>处理人：{processorName}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 报修已办结\n**{applicantName}**，你在 **{location}** 的报修申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送"
        ));

        // ========== 物资领用 ==========
        TEMPLATES.put("SUPPLIES_REQUESTED", new Template(
                "物资领用 — {applicantName}",
                "<h3>新物资领用申请</h3><p><b>{applicantName}</b> 提交了物资领用申请：</p>"
                        + "<p>{summary}</p>"
                        + "<p style='color:#666;font-size:12px'>提交时间：{createdAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新物资领用申请\n**{applicantName}**\n\n{summary}\n\n提交时间：{createdAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("DIGEST_TEST", new Template(
                "聚合通知测试",
                "<h3>聚合通知测试</h3><p>{content}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送（测试）。</p>",
                "## {title}\n{content}\n\n> ARO 系统自动推送（测试）"
        ));
        TEMPLATES.put("SUPPLIES_COMPLETED", new Template(
                "物资已出库",
                "<h3>物资已出库</h3><p><b>{applicantName}</b>，你的领用物资已出库：</p>"
                        + "<p>{summary}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 物资已出库\n**{applicantName}**，你的领用物资已出库：\n{summary}\n> ARO 系统自动推送"
        ));

        // ========== 动物房环境遥测 ==========
        TEMPLATES.put("TELEMETRY_ALARM", new Template(
                "⚠ {floorCode} {roomName} {metricKind}{alarmDirection}",
                "<div style='border-left:4px solid #dc2626;padding-left:14px;margin:8px 0'>"
                        + "<p style='font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px'>{floorCode} · {roomName}</p>"
                        + "<p style='font-size:17px;font-weight:700;color:#dc2626;margin:0 0 4px'>{metricKind} {alarmDirection}</p>"
                        + "<p style='font-size:14px;color:#475569;margin:0 0 2px'>当前 <b style='color:#dc2626'>{currentValue}</b> / 阈值 {limitValue}</p>"
                        + "<p style='font-size:12px;color:#94a3b8;margin:8px 0 0'>{sentAt}</p></div>"
                        + "<hr><p style='color:#cbd5e1;font-size:11px'>ARO 动物房环境监测</p>",
                "## ⚠️ ARO 环境报警\n\n"
                        + "📍 {floorCode} {roomName}\n\n"
                        + "🌡️ {metricKind}{alarmDirection}：**{currentValue}** / 阈值 {limitValue}\n\n"
                        + "🕐 {sentAt}\n\n"
                        + "> ARO 系统自动推送",
                "## ⚠️ ARO 环境报警\n"
                        + "📍 {floorCode} {roomName}\n"
                        + "🌡️ {metricKind}{alarmDirection}：**{currentValue}** / 阈值 {limitValue}\n"
                        + "🕐 {sentAt}\n"
                        + "> ARO 系统自动推送"
        ));
        TEMPLATES.put("TELEMETRY_RECOVERY", new Template(
                "✓ {floorCode} {roomName} {metricKind}已恢复",
                "<div style='border-left:4px solid #16a34a;padding-left:14px;margin:8px 0'>"
                        + "<p style='font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px'>{floorCode} · {roomName}</p>"
                        + "<p style='font-size:17px;font-weight:700;color:#16a34a;margin:0 0 4px'>{metricKind} 已恢复正常</p>"
                        + "<p style='font-size:14px;color:#475569;margin:0 0 2px'>当前 {currentValue}</p>"
                        + "<p style='font-size:12px;color:#94a3b8;margin:8px 0 0'>{recoveryAt}</p></div>"
                        + "<hr><p style='color:#cbd5e1;font-size:11px'>ARO 动物房环境监测</p>",
                "## ✅ ARO 环境恢复\n\n"
                        + "📍 **{floorCode} {roomName}**\n\n"
                        + "🌡️ {metricKind}已恢复正常：**{currentValue}**\n\n"
                        + "🕐 {recoveryAt}\n\n"
                        + "> ARO 系统自动推送",
                "## ✅ ARO 环境恢复\n"
                        + "📍 **{floorCode} {roomName}**\n"
                        + "🌡️ {metricKind}已恢复正常：**{currentValue}**\n"
                        + "🕐 {recoveryAt}\n"
                        + "> ARO 系统自动推送"
        ));

        // ========== 刷卡失败告警 ==========
        TEMPLATES.put("SWIPE_FAILURE_ALERT", new Template(
                "⚠ 刷卡告警 — {channelName}",
                "<div style='border-left:4px solid #f59e0b;padding-left:14px;margin:8px 0'>"
                        + "<p style='font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px'>{channelName} · {personName}</p>"
                        + "<p style='font-size:17px;font-weight:700;color:#d97706;margin:0 0 4px'>{windowMin}分钟内 {count}/{threshold} 次{openTypeLabel} {enterOrExitLabel}</p>"
                        + "<p style='font-size:13px;color:#475569;margin:0 0 2px'>电话：{phone}</p>"
                        + "<p style='font-size:12px;color:#94a3b8;margin:8px 0 0'>{swingTime}</p></div>"
                        + "<hr><p style='color:#cbd5e1;font-size:11px'>ARO 门禁监测</p>",
                "⚠️ ARO 刷卡告警\n\n"
                        + "🚪 {channelName}\n\n"
                        + "👤 {personName}\n\n"
                        + "📞 {phone}\n\n"
                        + "📊 {windowMin}分钟内 {count}/{threshold} 次{openTypeLabel} {enterOrExitLabel}\n\n"
                        + "🕐 {swingTime}\n\n"
                        + "> ARO 系统自动推送",
                "⚠️ ARO 刷卡告警\n"
                        + "🚪 {channelName}\n"
                        + "👤 {personName}\n"
                        + "📞 {phone}\n"
                        + "📊 {windowMin}分钟内 {count}/{threshold} 次{openTypeLabel} {enterOrExitLabel}\n"
                        + "🕐 {swingTime}\n"
                        + "> ARO 系统自动推送"
        ));

        // ========== 培训审批待审核 ==========
        TEMPLATES.put("ARO_TRAINING_PENDING", new Template(
                "培训审批 — {sessionTitle}",
                "<h3>培训审批待审核</h3><p>培训 <b>{sessionTitle}</b> 有新学员待审批：</p>"
                        + "<p><b>{traineeName}</b>（{jobNumber} / {projectGroup}）</p>"
                        + "<hr><p style='color:#999;font-size:12px'>ARO 培训审批系统</p>",
                "## 培训审批待审核\n培训 **{sessionTitle}** 有新学员待审批\n\n"
                        + "👤 {traineeName}\n"
                        + "🔢 {jobNumber}\n"
                        + "🏫 {projectGroup}\n\n"
                        + "> ARO 培训审批系统",
                "## 培训审批待审核\n培训 **{sessionTitle}** 有新学员待审批\n"
                        + "👤 {traineeName}\n"
                        + "🔢 {jobNumber}\n"
                        + "🏫 {projectGroup}\n"
                        + "> ARO 培训审批系统"
        ));

        // ========== 人员进出通知 ==========
        TEMPLATES.put("ACCESS_ENTER", new Template(
                "人员进入 — {personName}",
                "<div style='border-left:4px solid #16a34a;padding-left:14px;margin:8px 0'>"
                        + "<p style='font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px'>{roomName} · {doorLabel}</p>"
                        + "<p style='font-size:17px;font-weight:700;color:#16a34a;margin:0 0 4px'>{personName} 进入</p>"
                        + "<p style='font-size:13px;color:#475569;margin:0 0 2px'>部门：{department}</p>"
                        + "<p style='font-size:12px;color:#94a3b8;margin:8px 0 0'>{enterTime}</p></div>"
                        + "<hr><p style='color:#cbd5e1;font-size:11px'>ARO 门禁监测</p>",
                "## 🟢 人员进入\n\n"
                        + "📍 **{roomName}** · {doorLabel}\n\n"
                        + "👤 {personName} 进入\n\n"
                        + "🏫 {department}\n\n"
                        + "🕐 {enterTime}\n\n"
                        + "> ARO 系统自动推送",
                "## 🟢 人员进入\n"
                        + "📍 **{roomName}** · {doorLabel}\n"
                        + "👤 {personName} 进入\n"
                        + "🏫 {department}\n"
                        + "🕐 {enterTime}\n"
                        + "> ARO 系统自动推送"
        ));
        TEMPLATES.put("ACCESS_EXIT", new Template(
                "人员离开 — {personName}",
                "<div style='border-left:4px solid #f59e0b;padding-left:14px;margin:8px 0'>"
                        + "<p style='font-size:15px;font-weight:700;color:#1e293b;margin:0 0 6px'>{roomName} · {doorLabel}</p>"
                        + "<p style='font-size:17px;font-weight:700;color:#d97706;margin:0 0 4px'>{personName} 离开</p>"
                        + "<p style='font-size:13px;color:#475569;margin:0 0 2px'>部门：{department}</p>"
                        + "<p style='font-size:12px;color:#94a3b8;margin:8px 0 0'>{exitTime}</p></div>"
                        + "<hr><p style='color:#cbd5e1;font-size:11px'>ARO 门禁监测</p>",
                "## 🟡 人员离开\n\n"
                        + "📍 **{roomName}** · {doorLabel}\n\n"
                        + "👤 {personName} 离开\n\n"
                        + "🏫 {department}\n\n"
                        + "🕐 {exitTime}\n\n"
                        + "> ARO 系统自动推送",
                "## 🟡 人员离开\n"
                        + "📍 **{roomName}** · {doorLabel}\n"
                        + "👤 {personName} 离开\n"
                        + "🏫 {department}\n"
                        + "🕐 {exitTime}\n"
                        + "> ARO 系统自动推送"
        ));
    }
}
