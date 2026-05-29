package com.example.demo.modules.student.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.student.dto.StudentQrVerifyResponse;
import com.example.demo.modules.student.dto.StudentRegisterRequest;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class StudentRegistrationService {

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
        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                return StudentQrVerifyResponse.fail("无法解析图片，请上传有效的二维码图片");
            }
            BufferedImageLuminanceSource source = new BufferedImageLuminanceSource(image);
            HybridBinarizer binarizer = new HybridBinarizer(source);
            BinaryBitmap bitmap = new BinaryBitmap(binarizer);
            com.google.zxing.Result zxingResult = new MultiFormatReader().decode(bitmap);
            String text = zxingResult.getText();
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
            return StudentQrVerifyResponse.fail("二维码解析失败，请确认图片包含有效二维码");
        } catch (IOException e) {
            return StudentQrVerifyResponse.fail("图片读取失败，请确认上传了有效的图片文件");
        } catch (Exception e) {
            return StudentQrVerifyResponse.fail("图片处理失败，请重试");
        }
    }

    /**
     * 从文本中提取 19 位数字 ID：先正则 \d{19}，失败则取纯数字看是否恰好 19 位
     */
    private String extract19DigitId(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        Matcher m = DIGIT_19.matcher(text);
        if (m.find()) {
            return m.group();
        }
        String digits = text.replaceAll("\\D", "");
        if (digits.length() == 19) {
            return digits;
        }
        return null;
    }

    /**
     * 学生注册（免邀请码，以 user_id 绑定为验证），角色设为学生
     */
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
        if (req.getPassword().length() < 6) {
            return Result.fail(400, "密码长度不能少于6位");
        }

        String username = req.getUsername().trim();
        if (username.length() < 3 || username.length() > 64) {
            return Result.fail(400, "用户名长度需在3-64个字符之间");
        }
        if (userMapper.findByUsername(username) != null) {
            return Result.fail(409, "用户名已被占用");
        }

        // 二次验证 user_id 在 aro_personnel 中存在
        if (!isPersonnelExists(req.getUserId())) {
            return Result.fail(404, "ARO人员库中不存在该用户ID: " + req.getUserId());
        }

        User user = new User();
        user.setId("STU_" + UUID.randomUUID().toString().replace("-", ""));
        user.setUsername(username);
        user.setPassword(passwordCredentialService.encodeForStorage(req.getPassword()));
        user.setRole(RoleEnum.STUDENT);
        user.setStatus(1);
        user.setPasswordResetRequired(0);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);

        userMapper.insertUser(user);
        user = userMapper.findById(user.getId());
        if (user == null) {
            return Result.error("注册失败，请稍后重试");
        }
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }

    /**
     * 检查 ARO 人员是否存在
     */
    public boolean isPersonnelExists(String userId) {
        if (!StringUtils.hasText(userId)) {
            return false;
        }
        return aroPersonnelMapper.findByUserId(userId) != null;
    }
}
