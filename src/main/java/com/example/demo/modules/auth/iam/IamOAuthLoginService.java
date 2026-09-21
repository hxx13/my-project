package com.example.demo.modules.auth.iam;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.AuthData;
import com.example.demo.modules.auth.dto.OAuthLoginRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAuthBinding;
import com.example.demo.modules.auth.mapper.UserAuthBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * IAM OAuth 登录：换票 → uid 绑定 / 工号唯一匹配 → 签发与密码登录同形 JWT 响应。
 * 不复用 CAS loginCas 主干。
 */
@Service
public class IamOAuthLoginService {

    private static final Logger log = LoggerFactory.getLogger(IamOAuthLoginService.class);

    private final IamOAuthProperties properties;
    private final IamOAuthClient iamOAuthClient;
    private final UserAuthBindingMapper userAuthBindingMapper;
    private final PersonnelMapper personnelMapper;
    private final UserMapper userMapper;
    private final AuthService authService;
    private final boolean registrationOpen;

    public IamOAuthLoginService(IamOAuthProperties properties,
                                IamOAuthClient iamOAuthClient,
                                UserAuthBindingMapper userAuthBindingMapper,
                                PersonnelMapper personnelMapper,
                                UserMapper userMapper,
                                AuthService authService,
                                @Value("${app.registration.open:false}") boolean registrationOpen) {
        this.properties = properties;
        this.iamOAuthClient = iamOAuthClient;
        this.userAuthBindingMapper = userAuthBindingMapper;
        this.personnelMapper = personnelMapper;
        this.userMapper = userMapper;
        this.authService = authService;
        this.registrationOpen = registrationOpen;
    }

    public Result<AuthData> login(OAuthLoginRequest request) {
        if (request == null || !StringUtils.hasText(request.getCode())
                || !StringUtils.hasText(request.getRedirectUri())) {
            return fail(IamOAuthErrorCodes.OAUTH_FAILED, "参数不完整");
        }
        if (!redirectUriMatches(request.getRedirectUri())) {
            return fail(IamOAuthErrorCodes.INVALID_REDIRECT_URI, "redirectUri 与系统配置不一致");
        }

        final IamOAuthUserInfo iamUser;
        try {
            IamOAuthTokenResponse token = iamOAuthClient.exchangeCodeForToken(request.getCode().trim());
            iamUser = iamOAuthClient.fetchUserInfo(token.getAccessToken());
            if (!StringUtils.hasText(iamUser.getIdpUid()) && StringUtils.hasText(token.getIdToken())) {
                String fromJwt = iamOAuthClient.extractUidFromIdToken(token.getIdToken());
                if (StringUtils.hasText(fromJwt)) {
                    iamUser.setIdpUid(fromJwt.trim());
                }
            }
        } catch (IamOAuthException ex) {
            log.warn("[IAM-OAuth] protocol failure: {}", ex.getMessage());
            return fail(IamOAuthErrorCodes.OAUTH_FAILED, ex.getMessage());
        } catch (Exception ex) {
            log.error("[IAM-OAuth] unexpected failure", ex);
            return fail(IamOAuthErrorCodes.OAUTH_FAILED, "统一认证登录失败，请稍后重试");
        }

        if (!StringUtils.hasText(iamUser.getIdpUid()) || !StringUtils.hasText(iamUser.getJobNumber())) {
            return fail(IamOAuthErrorCodes.OAUTH_FAILED, "IAM 用户信息不完整（缺少 uid 或工号）");
        }

        UserAuthBinding binding = userAuthBindingMapper.findActiveByIdpUid(iamUser.getIdpUid());
        if (binding != null && StringUtils.hasText(binding.getUserId())) {
            return loginExistingUser(binding.getUserId(), iamUser, false);
        }

        return firstLoginBind(iamUser);
    }

    private Result<AuthData> firstLoginBind(IamOAuthUserInfo iamUser) {
        String jobNumber = iamUser.getJobNumber().trim();
        List<Personnel> matches = personnelMapper.findByJobNumber(jobNumber);
        if (matches == null || matches.isEmpty()) {
            // 不自动建号：由注册流程承接（那里有总开关）。这里只负责把人引导过去，
            // 并把 idpUid / 工号带上 —— 注册成功后要写进 user_auth_binding，
            // 否则下次统一认证登录还是匹配不上，会陷入循环。
            if (registrationOpen) {
                return failWith(
                        IamOAuthErrorCodes.REGISTRATION_REQUIRED,
                        "人员库中暂无你的记录，请先完成注册",
                        Map.of("idpUid", iamUser.getIdpUid(), "jobNumber", iamUser.getJobNumber()));
            }
            return fail(IamOAuthErrorCodes.PERSON_NOT_FOUND,
                    "未在人员库中找到工号匹配记录（" + jobNumber + "）。请联系管理员录入人员库后再试。");
        }

        if (matches.size() > 1) {
            return fail(IamOAuthErrorCodes.PERSON_AMBIGUOUS,
                    "工号 " + jobNumber + " 在人员库存在多条记录，无法唯一匹配。请联系管理员处理。");
        }

        String userId = resolveAccountId(matches.get(0));
        if (!StringUtils.hasText(userId)) {
            return fail(IamOAuthErrorCodes.ACCOUNT_NOT_PROVISIONED,
                    "人员库有记录（工号 " + jobNumber + "），但系统账号尚未开通。请联系管理员开通。");
        }
        User user = userMapper.findById(userId);
        if (user == null) {
            return fail(IamOAuthErrorCodes.ACCOUNT_NOT_PROVISIONED,
                    "人员库有记录（工号 " + jobNumber + "），但系统账号尚未开通。请联系管理员开通。");
        }

        bind(iamUser, userId);
        return loginExistingUser(userId, iamUser, true);
    }

    private void bind(IamOAuthUserInfo iamUser, String userId) {
        UserAuthBinding existing = userAuthBindingMapper.findActiveByIdpUid(iamUser.getIdpUid());
        if (existing != null) {
            return;
        }
        UserAuthBinding row = new UserAuthBinding();
        row.setUserId(userId);
        row.setIdpUid(iamUser.getIdpUid());
        row.setIdpUserName(iamUser.getUserName());
        try {
            userAuthBindingMapper.insert(row);
            log.info("[IAM-OAuth] bound idpUid={} → userId={} jobNumber={}",
                    iamUser.getIdpUid(), userId, iamUser.getJobNumber());
        } catch (org.springframework.dao.DuplicateKeyException ex) {
            log.info("[IAM-OAuth] bind race on idpUid={}, reuse existing", iamUser.getIdpUid());
        }
    }

    private Result<AuthData> loginExistingUser(String userId, IamOAuthUserInfo iamUser, boolean freshlyBound) {
        User user = userMapper.findById(userId);
        if (user == null) {
            return fail(IamOAuthErrorCodes.ACCOUNT_NOT_PROVISIONED,
                    "绑定账号不存在，请联系管理员");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return fail(IamOAuthErrorCodes.ACCOUNT_DISABLED, "账号已被禁用，请联系管理员");
        }
        userMapper.updateAuthProfileById(user.getId(), AuthProfileConstants.IAM_OAUTH);
        user.setAuthProfile(AuthProfileConstants.IAM_OAUTH);
        user.setRole(authService.normalizeRole(user.getRole()));
        log.info("[IAM-OAuth] login ok userId={} idpUid={} freshlyBound={}",
                userId, iamUser.getIdpUid(), freshlyBound);
        return authService.generateAuthResult(user);
    }

    private boolean redirectUriMatches(String redirectUri) {
        String expected = normalizeUri(properties.getRedirectUri());
        String actual = normalizeUri(redirectUri);
        return expected.equalsIgnoreCase(actual);
    }

    private static String normalizeUri(String uri) {
        if (uri == null) {
            return "";
        }
        String t = uri.trim();
        // 配置与回调均允许尾斜杠有无；去掉 hash 片段
        int hash = t.indexOf('#');
        if (hash >= 0) {
            t = t.substring(0, hash);
        }
        while (t.endsWith("/") && t.length() > "https://x".length()) {
            // 保留 scheme://host/ 的单一尾斜杠语义：统一去掉尾斜杠再比
            t = t.substring(0, t.length() - 1);
        }
        return t.toLowerCase(Locale.ROOT);
    }

    /** 单个人 → 登录账号 id:staff_id 优先,回落 aro_user_id;都空返回 null。 */
    static String resolveAccountId(Personnel p) {
        if (p == null) {
            return null;
        }
        if (StringUtils.hasText(p.getStaffId())) {
            return p.getStaffId().trim();
        }
        if (StringUtils.hasText(p.getAroUserId())) {
            return p.getAroUserId().trim();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Result<AuthData> fail(String errorCode, String message) {
        Result<Object> raw = Result.fail(403, message);
        raw.setData(Map.of("errorCode", errorCode));
        return (Result<AuthData>) (Result<?>) raw;
    }

    /** 同 {@link #fail}，但额外携带引导字段（如 idpUid / jobNumber）。 */
    @SuppressWarnings("unchecked")
    private static Result<AuthData> failWith(String errorCode, String message, Map<String, String> extra) {
        Result<Object> raw = Result.fail(403, message);
        Map<String, String> data = new HashMap<>();
        data.put("errorCode", errorCode);
        if (extra != null) {
            data.putAll(extra);
        }
        raw.setData(data);
        return (Result<AuthData>) (Result<?>) raw;
    }
}
