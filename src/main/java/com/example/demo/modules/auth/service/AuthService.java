package com.example.demo.modules.auth.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.AuthData;
import com.example.demo.modules.auth.dto.AuthUserInfo;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;

@Service
public class AuthService {

    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;

    public AuthService(UserMapper userMapper, UserDisplayNameService userDisplayNameService) {
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public Result<AuthData> generateAuthResult(User user) {
        AuthData data = new AuthData();
        data.setToken(generateMockJwt(user));
        data.setRole(user.getRole().getCode());
        data.setRoleDesc(user.getRole().getDescZh());
        data.setRoleLevel(user.getRole().getLevel());

        AuthUserInfo userInfo = new AuthUserInfo();
        userInfo.setId(user.getId());
        userInfo.setUsername(user.getUsername());
        userInfo.setOpenId(user.getOpenId());
        userInfo.setRole(user.getRole().getCode());
        userInfo.setDisplayNickname(user.getDisplayNickname());
        userInfo.setMiniBindType(user.getMiniBindType());
        userInfo.setDisplayName(userDisplayNameService.resolveDisplayName(user.getId()));
        userInfo.setCanEditDisplayNickname(canSelfEditDisplayNickname(user));
        userInfo.setAuthProfile(user.getAuthProfile());
        userInfo.setMiniHomeDefaultTab(AuthProfileConstants.miniHomeDefaultTab(user.getAuthProfile()));
        data.setUserInfo(userInfo);
        return Result.success(data);
    }

    /**
     * 无人员库记录、教职工及以上，且（未记录绑定方式 或 最后一次为 STAFF 账号密码绑定）时可自助修改展示昵称。
     */
    public boolean canSelfEditDisplayNickname(User user) {
        if (user == null) {
            return false;
        }
        if (userMapper.existsPersonnelById(user.getId()) > 0) {
            return false;
        }
        RoleEnum role = normalizeRole(user.getRole());
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return false;
        }
        String bt = user.getMiniBindType();
        if (!StringUtils.hasText(bt)) {
            return true;
        }
        return "STAFF".equalsIgnoreCase(bt.trim());
    }

    /**
     * 开发占位：用 jsCode 派生伪 openId，故每次 wx.login 码不同则「openId」会变。
     * 生产请改为微信 jscode2session，使同一用户 openId 稳定。
     */
    public String exchangeJsCodeForOpenId(String jsCode) {
        String normalized = StringUtils.hasText(jsCode) ? jsCode.trim() : "empty";
        String digest = DigestUtils.md5DigestAsHex(normalized.getBytes(StandardCharsets.UTF_8));
        return "wx_openid_" + digest.substring(0, 16);
    }

    public RoleEnum normalizeRole(RoleEnum role) {
        return role == null ? RoleEnum.STUDENT : role;
    }

    private String generateMockJwt(User user) {
        return "jwt_mock_token_" + user.getId();
    }
}
