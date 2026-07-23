package com.example.demo.modules.auth.controller;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "身份模拟", description = "超级管理员模拟学生视角接口")
public class AuthImpersonationController {

    private static final Logger log = LoggerFactory.getLogger(AuthImpersonationController.class);

    private final AuthContextService authContextService;
    private final JwtTokenService jwtTokenService;
    private final UserAroBindingMapper userAroBindingMapper;
    private final UserMapper userMapper;

    public AuthImpersonationController(AuthContextService authContextService,
                                        JwtTokenService jwtTokenService,
                                        UserAroBindingMapper userAroBindingMapper,
                                        UserMapper userMapper) {
        this.authContextService = authContextService;
        this.jwtTokenService = jwtTokenService;
        this.userAroBindingMapper = userAroBindingMapper;
        this.userMapper = userMapper;
    }

    @PostMapping("/impersonate")
    @Operation(summary = "切换为学生视角", description = "超级管理员根据已绑定的 ARO 人员生成学生身份 JWT，前端替换 Token 后即可以学生身份访问所有接口")
    public Result<Map<String, Object>> impersonate(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或Token无效");
        }

        UserAroBinding binding = userAroBindingMapper.selectByUserId(user.getId());
        if (binding == null) {
            return Result.error("请先绑定 ARO 人员");
        }

        String aroUserId = binding.getAroUserId();

        // 确保 ARO 人员在 sys_user 中存在记录（兜底：处理旧绑定没有自动创建的场景）
        User aroUser = userMapper.findById(aroUserId);
        if (aroUser == null) {
            aroUser = new User();
            aroUser.setId(aroUserId);
            aroUser.setUsername(aroUserId);
            aroUser.setRole(RoleEnum.MEMBER);
            aroUser.setStatus(1);
            aroUser.setAuthProfile("ARO_BOUND");
            userMapper.insertUser(aroUser);
            log.info("[模拟] 兜底创建 sys_user 记录: {}", aroUserId);
        }

        String impersonationToken = jwtTokenService.generateImpersonationToken(user, aroUserId);
        log.info("[模拟] 用户 {} 切换为学生视角，ARO userId={}", user.getId(), aroUserId);

        return Result.success(Map.of(
                "token", impersonationToken,
                "aroUserId", binding.getAroUserId()
        ));
    }
}
