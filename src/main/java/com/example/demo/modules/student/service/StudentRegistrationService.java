package com.example.demo.modules.student.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.util.QrCodeUtils;
import com.example.demo.modules.aro.dto.AroPersonnel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.auth.service.PasswordPolicyValidator;
import com.example.demo.modules.student.dto.StudentActivateRequest;
import com.example.demo.modules.student.dto.StudentQrVerifyResponse;
import com.example.demo.modules.student.dto.StudentRegisterRequest;
import com.google.zxing.NotFoundException;

import java.io.IOException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class StudentRegistrationService {

    private static final Logger log = LoggerFactory.getLogger(StudentRegistrationService.class);
    private static final Pattern DIGIT_19 = Pattern.compile("\\d{19}");

    private final UserMapper userMapper;
    private final AuthService authService;
    private final PasswordCredentialService passwordCredentialService;
    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentRegistrationService(UserMapper userMapper,
                                      AuthService authService,
                                      PasswordCredentialService passwordCredentialService,
                                      AroPersonnelMapper aroPersonnelMapper) {
        this.userMapper = userMapper;
        this.authService = authService;
        this.passwordCredentialService = passwordCredentialService;
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    /**
     * 解码上传的 QR 码图片，提取 19 位 user_id 并匹配 aro_personnel 表
     */
    public StudentQrVerifyResponse verifyQrAndMatchPersonnel(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return StudentQrVerifyResponse.fail("请上传二维码图片");
        }
        log.warn("收到图片: {} ({}KB)", file.getOriginalFilename(), file.getSize() / 1024);
        try {
            String text = QrCodeUtils.decode(file.getInputStream());
            log.warn("ZXing 解码成功: {}", text);
            String userId = extract19DigitId(text);
            if (userId == null) {
                return StudentQrVerifyResponse.fail("二维码中未找到有效的19位用户ID");
            }
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
            if (personnel == null) {
                return StudentQrVerifyResponse.fail("未找到匹配的人员信息，user_id: " + userId);
            }
            return StudentQrVerifyResponse.success(
                    userId,
                    personnel.getName(),
                    personnel.getDepartmentName(),
                    personnel.getResolvedProjectGroupNames()
            );
        } catch (NotFoundException e) {
            log.warn("ZXing 解码失败 (NotFound)");
            return StudentQrVerifyResponse.fail("二维码解析失败，请确认图片包含有效二维码");
        } catch (IOException e) {
            log.warn("图片读取失败: {}", e.getMessage());
            return StudentQrVerifyResponse.fail("图片读取失败，请确认上传了有效的图片文件");
        } catch (Exception e) {
            log.warn("图片处理异常: {}", e.getMessage());
            return StudentQrVerifyResponse.fail("图片处理失败，请重试");
        }
    }

    private String extract19DigitId(String text) {
        if (!StringUtils.hasText(text)) return null;
        Matcher m = DIGIT_19.matcher(text);
        if (m.find()) return m.group();
        String digits = text.replaceAll("\\D", "");
        return digits.length() == 19 ? digits : null;
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> register(StudentRegisterRequest req) {
        if (req == null || !StringUtils.hasText(req.getUserId())) {
            return Result.fail(400, "用户ID(user_id)不能为空");
        }
        if (!DIGIT_19.matcher(req.getUserId()).matches()) {
            return Result.fail(400, "用户ID(user_id)必须为19位数字");
        }
        if (!StringUtils.hasText(req.getUsername())) {
            return Result.fail(400, "用户名不能为空");
        }
        if (!StringUtils.hasText(req.getPassword())) {
            return Result.fail(400, "密码不能为空");
        }
        String rawPwd = req.getPassword().trim();
        String pwError = PasswordPolicyValidator.validate(rawPwd);
        if (pwError != null) {
            return Result.fail(400, pwError);
        }
        String username = req.getUsername().trim();
        if (username.length() < 3 || username.length() > 64) {
            return Result.fail(400, "用户名长度需在3-64个字符之间");
        }
        if (userMapper.findByUsername(username) != null) {
            return Result.fail(409, "用户名已被占用");
        }
        if (!isPersonnelExists(req.getUserId())) {
            return Result.fail(404, "ARO人员库中不存在该用户ID: " + req.getUserId());
        }
        String aroUserId = req.getUserId();
        User existingUser = userMapper.findById(aroUserId);
        if (existingUser != null) {
            if (StringUtils.hasText(existingUser.getPassword())) {
                return Result.fail(409, "该账号已注册，请直接登录");
            } else {
                return Result.fail(409, "该账号已绑定但未设密码，请前往激活页面设置密码");
            }
        }
        // rawPwd already declared and validated above (trimmed)
        String hash = passwordCredentialService.encodeForStorage(rawPwd);
        String encryptedPlain = passwordCredentialService.encryptPlaintext(rawPwd);
        User user = new User();
        user.setId(aroUserId);
        user.setUsername(username);
        user.setPassword(hash);
        user.setRole(RoleEnum.MEMBER);
        user.setStatus(1);
        user.setPasswordResetRequired(0);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        user.setAccountSource("STUDENT");
        userMapper.insertUser(user);
        userMapper.updatePasswordWithPlainById(aroUserId, hash, encryptedPlain, 0);
        user = userMapper.findById(user.getId());
        if (user == null) return Result.error("注册失败，请稍后重试");
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> activate(StudentActivateRequest req) {
        if (req == null || !StringUtils.hasText(req.getUserId())) {
            return Result.fail(400, "用户ID(user_id)不能为空");
        }
        if (!DIGIT_19.matcher(req.getUserId()).matches()) {
            return Result.fail(400, "用户ID(user_id)必须为19位数字");
        }
        if (!StringUtils.hasText(req.getUsername())) {
            return Result.fail(400, "用户名不能为空");
        }
        if (!StringUtils.hasText(req.getPassword())) {
            return Result.fail(400, "密码不能为空");
        }
        String rawPwd = req.getPassword().trim();
        String pwError = PasswordPolicyValidator.validate(rawPwd);
        if (pwError != null) {
            return Result.fail(400, pwError);
        }
        String username = req.getUsername().trim();
        if (username.length() < 3 || username.length() > 64) {
            return Result.fail(400, "用户名长度需在3-64个字符之间");
        }
        String userId = req.getUserId();
        if (!isPersonnelExists(userId)) {
            return Result.fail(404, "ARO人员库中不存在该用户ID: " + userId);
        }
        User existing = userMapper.findById(userId);
        if (existing == null) {
            return Result.fail(404, "未找到该学生账号，请先通过微信或管理员完成身份绑定");
        }
        if (StringUtils.hasText(existing.getPassword())) {
            return Result.fail(409, "该账号已激活，请直接登录");
        }
        User byUsername = userMapper.findByUsername(username);
        if (byUsername != null && !byUsername.getId().equals(userId)) {
            return Result.fail(400, "用户名已被使用");
        }
        // rawPwd already declared and validated above (trimmed)
        String hash = passwordCredentialService.encodeForStorage(rawPwd);
        String encryptedPlain = passwordCredentialService.encryptPlaintext(rawPwd);
        existing.setUsername(username);
        existing.setPassword(hash);
        existing.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        userMapper.updateUser(existing);
        userMapper.updatePasswordWithPlainById(userId, hash, encryptedPlain, 0);
        User updated = userMapper.findById(userId);
        if (updated == null) return Result.error("激活失败，请稍后重试");
        updated.setRole(authService.normalizeRole(updated.getRole()));
        return authService.generateAuthResult(updated);
    }

    /**
     * 按 19 位 userId 直接查找 ARO 人员库（无需 QR），返回与 verifyQr 相同的结构。
     */
    public StudentQrVerifyResponse verifyByUserId(String userId) {
        if (!StringUtils.hasText(userId)) {
            return StudentQrVerifyResponse.fail("请输入19位人员编号");
        }
        if (!DIGIT_19.matcher(userId.trim()).matches()) {
            return StudentQrVerifyResponse.fail("人员编号必须为19位数字");
        }
        AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId.trim());
        if (personnel == null) {
            return StudentQrVerifyResponse.fail("未找到匹配的人员信息，user_id: " + userId);
        }
        return StudentQrVerifyResponse.success(
                userId.trim(),
                personnel.getName(),
                personnel.getDepartmentName(),
                personnel.getResolvedProjectGroupNames()
        );
    }

    public boolean isPersonnelExists(String userId) {
        if (!StringUtils.hasText(userId)) return false;
        return aroPersonnelMapper.findByUserId(userId) != null;
    }
}
