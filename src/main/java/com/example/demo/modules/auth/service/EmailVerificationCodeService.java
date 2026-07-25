package com.example.demo.modules.auth.service;

import com.example.demo.modules.auth.entity.VerificationCode;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.VerificationCodeMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
public class EmailVerificationCodeService {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationCodeService.class);
    private static final int CODE_EXPIRE_MINUTES = 5;
    private static final int COOLDOWN_SECONDS = 60;
    private static final int MAX_FAIL_COUNT = 3;
    private static final int HOURLY_LIMIT = 5;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final SecureRandom RNG = new SecureRandom();

    private final VerificationCodeMapper verificationCodeMapper;
    private final UserMapper userMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final JavaMailSender mailSender;

    @Value("${spring.mail.properties.mail.from:}")
    private String fromAddress;

    public EmailVerificationCodeService(VerificationCodeMapper verificationCodeMapper,
                                         UserMapper userMapper,
                                         AroPersonnelMapper aroPersonnelMapper,
                                         JavaMailSender mailSender) {
        this.verificationCodeMapper = verificationCodeMapper;
        this.userMapper = userMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.mailSender = mailSender;
    }

    /** Send verification code. Caller must externally synchronize to prevent concurrent bypass of rate limit. */
    public SendResult sendCode(String email, String scene) {
        if (email == null || !email.matches("^[\\w-.]+@[\\w-]+(\\.[\\w-]+)+$")) {
            return SendResult.fail("邮箱格式不正确");
        }
        if (!"BIND_EMAIL".equals(scene) && !"FORGOT_PASSWORD".equals(scene)) {
            return SendResult.fail("非法场景");
        }

        // Cooldown check (caller has synchronized)
        String cooldownSince = LocalDateTime.now().minusSeconds(COOLDOWN_SECONDS).format(FMT);
        if (verificationCodeMapper.countRecent(email, scene, cooldownSince) > 0) {
            return SendResult.fail("发送过于频繁，请 " + COOLDOWN_SECONDS + " 秒后再试");
        }

        // Hourly rate limit
        String hourlySince = LocalDateTime.now().minusHours(1).format(FMT);
        if (verificationCodeMapper.countHourly(email, scene, hourlySince) >= HOURLY_LIMIT) {
            return SendResult.fail("发送次数已达上限，请稍后再试");
        }

        // Forgot password: email must be bound
        if ("FORGOT_PASSWORD".equals(scene)) {
            boolean bound = isEmailBound(email);
            if (!bound) {
                log.info("Forgot-password attempt for unbound email: {}", email);
                // Timing side-channel mitigation: random delay before returning
                try { Thread.sleep(200 + RNG.nextInt(300)); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                return SendResult.ok("如果该邮箱已绑定，验证码已发送", COOLDOWN_SECONDS);
            }
        }

        // Generate 6-digit code (SecureRandom)
        String code = String.format("%06d", RNG.nextInt(1000000));

        // Write to DB
        VerificationCode vc = new VerificationCode();
        vc.setEmail(email);
        vc.setCode(code);
        vc.setScene(scene);
        vc.setExpiresAt(LocalDateTime.now().plusMinutes(CODE_EXPIRE_MINUTES).format(FMT));
        verificationCodeMapper.insert(vc);

        // Send email (fallback: log to console)
        String subject;
        String bodyTemplate;
        if ("BIND_EMAIL".equals(scene)) {
            subject = "【ARO系统】邮箱绑定验证码";
            bodyTemplate = buildBindEmailBody(code);
        } else {
            subject = "【ARO系统】密码重置验证码";
            bodyTemplate = buildForgotPasswordBody(code);
        }

        boolean sent = sendEmail(email, subject, bodyTemplate);
        if (!sent) {
            log.warn("SMTP send failed for {} scene={} — check MAIL_HOST configuration", email, scene);
        }
        return SendResult.ok("验证码已发送", COOLDOWN_SECONDS);
    }

    /** Verify code for binding */
    public VerifyResult verifyForBinding(String email, String code) {
        return doVerify(email, "BIND_EMAIL", code);
    }

    /** Verify code for forgot password. On success, returns resetToken + stores userId in record. */
    public VerifyResult verifyForForgotPassword(String email, String code) {
        VerifyResult result = doVerify(email, "FORGOT_PASSWORD", code);
        if (result.isSuccess()) {
            VerificationCode vc = result.getRecord();
            String resetToken = UUID.randomUUID().toString().replace("-", "");
            String userId = resolveUserIdByEmail(email);
            verificationCodeMapper.setResetTokenAndUserId(vc.getId(), resetToken,
                    userId != null ? userId : "");
            return VerifyResult.successWithResetToken(resetToken);
        }
        return result;
    }

    /** Verify resetToken validity (does NOT consume the token) */
    public VerifyTokenResult verifyToken(String resetToken) {
        VerificationCode vc = verificationCodeMapper.findByResetToken(resetToken);
        if (vc == null) {
            return VerifyTokenResult.fail("重置链接已失效，请重新验证");
        }
        return VerifyTokenResult.ok(vc.getEmail(), vc.getId());
    }

    /** Consume token after successful password reset + invalidate all codes for this email */
    public void consumeResetToken(Long recordId, String email) {
        verificationCodeMapper.markUsed(recordId, 2);
        verificationCodeMapper.invalidateAllForEmail(email, "FORGOT_PASSWORD");
    }

    /** Mark binding verification code as used */
    public void markBindingUsed(Long id) {
        verificationCodeMapper.markUsed(id, 1);
    }

    // ───────────── private helpers ─────────────

    private VerifyResult doVerify(String email, String scene, String code) {
        if (email == null || !email.matches("^[\\w-.]+@[\\w-]+(\\.[\\w-]+)+$")
                || code == null || code.length() != 6) {
            return VerifyResult.fail("验证码错误"); // Unified message
        }
        VerificationCode vc = verificationCodeMapper.findLatestValid(email, scene);
        if (vc == null) {
            return VerifyResult.fail("验证码错误"); // Unified message, don't reveal "not found"
        }
        if (!vc.getCode().equals(code)) {
            verificationCodeMapper.incrementFailCount(vc.getId());
            int newCount = (vc.getFailCount() != null ? vc.getFailCount() : 0) + 1;
            if (newCount >= MAX_FAIL_COUNT) {
                verificationCodeMapper.markUsed(vc.getId(), 1);
                return VerifyResult.fail("验证码错误次数过多，已作废，请重新获取");
            }
            return VerifyResult.fail("验证码错误");
        }
        verificationCodeMapper.markUsed(vc.getId(), 1);
        VerifyResult r = VerifyResult.success();
        r.setRecord(vc);
        return r;
    }

    private boolean isEmailBound(String email) {
        if (userMapper.findByContactEmail(email) != null) return true;
        String userId = aroPersonnelMapper.findUserIdByContactEmail(email);
        return userId != null;
    }

    private String resolveUserIdByEmail(String email) {
        User user = userMapper.findByContactEmail(email);
        if (user != null) return user.getId();
        return aroPersonnelMapper.findUserIdByContactEmail(email);
    }

    private String buildBindEmailBody(String code) {
        return "<html><body style='font-family:Arial,sans-serif;padding:20px'>"
                + "<h2 style='color:#333'>邮箱绑定验证</h2>"
                + "<p>您好！</p>"
                + "<p>您正在绑定邮箱到 ARO 系统账号。验证码如下：</p>"
                + "<div style='font-size:28px;font-weight:bold;letter-spacing:8px;color:#d97706;padding:16px 0'>"
                + code + "</div>"
                + "<p style='color:#666'>验证码 " + CODE_EXPIRE_MINUTES + " 分钟内有效，请勿泄露给他人。</p>"
                + "<p style='color:#666'>如非本人操作，请忽略此邮件。</p>"
                + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>"
                + "</body></html>";
    }

    private String buildForgotPasswordBody(String code) {
        return "<html><body style='font-family:Arial,sans-serif;padding:20px'>"
                + "<h2 style='color:#333'>密码重置验证</h2>"
                + "<p>您好！</p>"
                + "<p>您正在通过邮箱验证重置 ARO 系统登录密码。验证码如下：</p>"
                + "<div style='font-size:28px;font-weight:bold;letter-spacing:8px;color:#d97706;padding:16px 0'>"
                + code + "</div>"
                + "<p style='color:#666'>验证码 " + CODE_EXPIRE_MINUTES + " 分钟内有效，请勿泄露给他人。</p>"
                + "<p style='color:#666'>如非本人操作，请忽略此邮件。</p>"
                + "<hr><p style='color:#999;font-size:12px'>此邮件由 ARO 系统自动发送。</p>"
                + "</body></html>";
    }

    private boolean sendEmail(String to, String subject, String html) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            if (fromAddress != null && !fromAddress.isEmpty()) {
                helper.setFrom(fromAddress);
            }
            helper.setText(html, true);
            mailSender.send(mime);
            log.info("Verification code sent to {}", to);
            return true;
        } catch (Exception e) {
            log.error("Failed to send verification code to {}: {}", to, e.getMessage());
            return false;
        }
    }

    // ───────────── result types ─────────────

    public static class SendResult {
        private final boolean success;
        private final String message;
        private final Integer cooldownSeconds;
        private SendResult(boolean s, String m, Integer c) { this.success = s; this.message = m; this.cooldownSeconds = c; }
        public static SendResult ok(String m, int c) { return new SendResult(true, m, c); }
        public static SendResult fail(String m) { return new SendResult(false, m, null); }
        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public Integer getCooldownSeconds() { return cooldownSeconds; }
    }

    public static class VerifyResult {
        private final boolean success;
        private final String message;
        private String resetToken;
        private VerificationCode record;
        private VerifyResult(boolean s, String m) { this.success = s; this.message = m; }
        public static VerifyResult success() { return new VerifyResult(true, "验证通过"); }
        public static VerifyResult successWithResetToken(String t) { VerifyResult r = new VerifyResult(true, "验证通过"); r.resetToken = t; return r; }
        public static VerifyResult fail(String m) { return new VerifyResult(false, m); }
        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getResetToken() { return resetToken; }
        public VerificationCode getRecord() { return record; }
        public void setRecord(VerificationCode r) { this.record = r; }
    }

    public static class VerifyTokenResult {
        private final boolean success;
        private final String message;
        private String email;
        private Long recordId;
        private VerifyTokenResult(boolean s, String m) { this.success = s; this.message = m; }
        public static VerifyTokenResult ok(String e, Long id) { VerifyTokenResult r = new VerifyTokenResult(true, "ok"); r.email = e; r.recordId = id; return r; }
        public static VerifyTokenResult fail(String m) { return new VerifyTokenResult(false, m); }
        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getEmail() { return email; }
        public Long getRecordId() { return recordId; }
    }
}
