package com.example.demo.modules.notification.push.channel;

import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.PushConstants;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class EmailPushChannel implements PushChannel {

    private static final Logger log = LoggerFactory.getLogger(EmailPushChannel.class);
    private final JavaMailSender mailSender;
    private final NotificationSettingsMapper settingsMapper;

    @Value("${spring.mail.properties.mail.from:}")
    private String fromAddress;

    public EmailPushChannel(JavaMailSender mailSender, NotificationSettingsMapper settingsMapper) {
        this.mailSender = mailSender;
        this.settingsMapper = settingsMapper;
    }

    @Override
    public String getCode() { return PushConstants.CHANNEL_EMAIL; }

    @Override
    public String getDisplayName() { return "邮件通知"; }

    @Override
    public boolean isEnabled() {
        return ChannelConfigHelper.getBool(settingsMapper, PushConstants.CONFIG_MODULE,
                PushConstants.CHANNEL_EMAIL + ".enabled", true);
    }

    @Override
    public PushResult send(String target, String title, String content) {
        if (!StringUtils.hasText(target)) {
            return PushResult.fail("INVALID_TARGET", "邮箱地址为空");
        }
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setTo(target);
            helper.setSubject(title);
            if (StringUtils.hasText(fromAddress)) {
                helper.setFrom(fromAddress);
            }
            String html = "<html><body>" + (content != null ? content.replace("\n", "<br>") : "")
                    + "</body></html>";
            helper.setText(html, true);
            mailSender.send(mime);
            log.info("[EmailPush] sent to {}: {}", target, title);
            return PushResult.ok("EMAIL_" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("[EmailPush] failed to {}: {}", target, e.getMessage());
            return PushResult.fail("SEND_ERROR", e.getMessage());
        }
    }
}
