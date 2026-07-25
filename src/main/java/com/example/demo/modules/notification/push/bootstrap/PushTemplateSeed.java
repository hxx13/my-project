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
        List<NotifySource> sources = sourceMapper.findAll();
        if (sources.isEmpty()) {
            log.info("[Push] 通知源为空，跳过模板种子");
            return;
        }
        for (NotifySource src : sources) {
            for (String ch : List.of("EMAIL", "SERVER_CHAN")) {
                Template t = TEMPLATES.get(src.getSourceCode());
                if (t == null) continue;
                NotifySourceChannel exist = channelMapper.findBySourceAndChannel(src.getId(), ch);
                String content = "EMAIL".equals(ch) ? t.contentEmail : t.contentWechat;
                if (exist != null) {
                    // 已有记录 → 更新模板（保留 enable/quiet/rateLimit 等已有设置）
                    exist.setTitleTpl(t.title);
                    exist.setContentTpl(content);
                    channelMapper.update(exist);
                    log.info("[Push] 更新模板 {}/{} -> {}", src.getSourceCode(), ch, t.title);
                } else {
                    NotifySourceChannel cfg = new NotifySourceChannel();
                    cfg.setSourceId(src.getId());
                    cfg.setChannelCode(ch);
                    cfg.setEnabled(true);
                    cfg.setTitleTpl(t.title);
                    cfg.setContentTpl(content);
                    cfg.setRateLimitSeconds(300);
                    channelMapper.insert(cfg);
                    log.info("[Push] 种子模板 {}/{} -> {}", src.getSourceCode(), ch, t.title);
                }
            }
        }
    }

    private record Template(String title, String contentEmail, String contentWechat) {}

    private static final Map<String, Template> TEMPLATES = new LinkedHashMap<>();
    static {
        TEMPLATES.put("ACTIVATION_SUCCESS", new Template(
                "激活成功 — {doorLabel}",
                "<h3>激活成功</h3><p>门禁 <b>{doorLabel}</b>（{channelCode}）于 {swingTime} 刷卡激活成功。</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 激活成功\n门禁 **{doorLabel}**（{channelCode}）\n时间：{swingTime}\n\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SIGNOUT_COUNTDOWN", new Template(
                "签退倒计时 — {doorLabel}",
                "<h3>签退倒计时</h3><p>{doorLabel} 已启动 <b>{countdownSeconds} 秒</b> 签退倒计时。</p>"
                        + "<p>计划签退时间：{scheduledExitAt}</p><p>触发原因：{triggerReason}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 签退倒计时\n{doorLabel} 已启动 **{countdownSeconds} 秒** 签退倒计时\n计划签退：{scheduledExitAt}\n原因：{triggerReason}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("MATERIAL_REQUESTED", new Template(
                "物资申领 — {applicantName}",
                "<h3>新物资申领</h3><p><b>{applicantName}</b>（{applicantGroup}）提交了物资申领：{summary}</p>"
                        + "<p>单号：{bizId} | 时间：{createdAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新物资申领\n**{applicantName}**（{applicantGroup}）\n{summary}\n单号：{bizId}\n时间：{createdAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("MATERIAL_REVIEWED", new Template(
                "物资申领结果 — {auditResult}",
                "<h3>物资申领{auditResult}</h3><p><b>{applicantName}</b> 的申领单（{bizId}）已<b>{auditResult}</b>。</p>"
                        + "<p>{summary}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 物资申领{auditResult}\n**{applicantName}** 的申领（{bizId}）已**{auditResult}**\n{summary}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SCAN_DELAY_REQUESTED", new Template(
                "延迟免冻结申请 — {subjectName}",
                "<h3>新延迟免冻结申请</h3><p><b>{subjectName}</b>（{subjectGroup}）在 {roomName} 申请 <b>{optionLabel}</b>。</p>"
                        + "<p>申请ID：{requestId}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新延迟免冻结申请\n**{subjectName}**（{subjectGroup}）\n{roomName} · {optionLabel}\n申请编号：{requestId}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SCAN_DELAY_REVIEWED", new Template(
                "延迟免冻结结果 — {auditResult}",
                "<h3>延迟免冻结{auditResult}</h3><p>{roomName} · {optionLabel}：<b>{auditResult}</b></p>"
                        + "{rejectReason}"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 延迟免冻结{auditResult}\n{roomName} · {optionLabel}\n审核结果：{auditResult}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("VIOLATION_CREATED", new Template(
                "违规提醒 — {title}",
                "<h3>{title}</h3><p>来源：{source}</p><p>{summary}</p>"
                        + "<p>门禁状态：{enterLocked}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## {title}\n来源：{source}\n{summary}\n门禁状态：{enterLocked}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SCAN_DELAY_MANUAL", new Template(
                "免冻结授权 — {roomName}",
                "<h3>免冻结已授权</h3><p>房间：{roomName}</p>"
                        + "<p>详情：{optionLabel}</p>"
                        + "<p>操作人：{operatorName}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 免冻结已授权\n房间：{roomName}\n详情：{optionLabel}\n操作人：{operatorName}\n> ARO 系统自动推送"
        ));

        // ========== 采购 ==========
        TEMPLATES.put("PURCHASE_REQUESTED", new Template(
                "采购申请 — {applicantName}",
                "<h3>新采购申请</h3><p><b>{applicantName}</b> 提交了采购申请。</p>"
                        + "<p>地点：{location}</p><p>时间：{createdAt}</p>"
                        + "<p>内容：{content}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新采购申请\n**{applicantName}**\n地点：{location}\n时间：{createdAt}\n内容：{content}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("PURCHASE_COMPLETED", new Template(
                "采购办结 — {location}",
                "<h3>采购已办结</h3><p><b>{applicantName}</b> 的采购申请已处理完毕。</p>"
                        + "<p>{summary}</p><p>处理人：{processorName}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 采购已办结\n**{applicantName}** 的采购申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送"
        ));

        // ========== 报修 ==========
        TEMPLATES.put("REPAIR_REQUESTED", new Template(
                "报修申请 — {applicantName}",
                "<h3>新报修申请</h3><p><b>{applicantName}</b> 提交了报修申请。</p>"
                        + "<p>地点：{location}</p><p>时间：{createdAt}</p>"
                        + "<p>内容：{content}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新报修申请\n**{applicantName}**\n地点：{location}\n时间：{createdAt}\n内容：{content}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("REPAIR_COMPLETED", new Template(
                "报修办结 — {location}",
                "<h3>报修已办结</h3><p><b>{applicantName}</b> 的报修申请已处理完毕。</p>"
                        + "<p>{summary}</p><p>处理人：{processorName}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 报修已办结\n**{applicantName}** 的报修申请已处理完毕\n{summary}\n处理人：{processorName}\n> ARO 系统自动推送"
        ));

        // ========== 物资领用 ==========
        TEMPLATES.put("SUPPLIES_REQUESTED", new Template(
                "物资领用 — {applicantName}",
                "<h3>新物资领用申请</h3><p><b>{applicantName}</b> 提交了物资领用申请。</p>"
                        + "<p>{summary}</p><p>时间：{createdAt}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 新物资领用申请\n**{applicantName}**\n{summary}\n时间：{createdAt}\n> ARO 系统自动推送"
        ));
        TEMPLATES.put("SUPPLIES_COMPLETED", new Template(
                "物资已出库",
                "<h3>物资已出库</h3><p><b>{applicantName}</b>，您的领用物资已出库：</p>"
                        + "<p>{summary}</p>"
                        + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>",
                "## 物资已出库\n**{applicantName}**，您的领用物资已出库：\n{summary}\n> ARO 系统自动推送"
        ));
    }
}
