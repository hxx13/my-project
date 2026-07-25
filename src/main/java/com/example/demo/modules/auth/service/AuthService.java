package com.example.demo.modules.auth.service;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.AuthData;
import com.example.demo.modules.auth.dto.AuthUserInfo;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class AuthService {

    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final JwtTokenService jwtTokenService;
    private final WechatApiService wechatApiService;

    public AuthService(UserMapper userMapper, UserDisplayNameService userDisplayNameService, JwtTokenService jwtTokenService,
                       WechatApiService wechatApiService) {
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.jwtTokenService = jwtTokenService;
        this.wechatApiService = wechatApiService;
    }

    public Result<AuthData> generateAuthResult(User user) {
        AuthData data = new AuthData();
        data.setToken(jwtTokenService.generateToken(user));
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
        userInfo.setAccountSource(user.getAccountSource());
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
     * 调用微信 jscode2session 换取真实 openId。
     * 未配置 app-id/app-secret 或调用失败时返回 null，调用方自行回退处理。
     */
    public String exchangeJsCodeForOpenId(String jsCode) {
        return wechatApiService.exchangeJsCodeForOpenId(jsCode);
    }

    public RoleEnum normalizeRole(RoleEnum role) {
        return role == null ? RoleEnum.MEMBER : role;
    }

}
