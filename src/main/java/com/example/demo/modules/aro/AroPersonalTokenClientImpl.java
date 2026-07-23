package com.example.demo.modules.aro;

import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.exception.AroTokenRequiredException;
import com.example.demo.modules.aro.token.PersonalTokenSource;
import com.example.demo.modules.aro.token.TokenSource;
import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import java.util.function.Function;

/**
 * 个人 CAS Token 业务编排客户端实现。
 * <p>
 * R5: execute() 不接收 userId 参数，从当前请求上下文中解析当前用户。
 */
@Service
public class AroPersonalTokenClientImpl implements AroPersonalTokenClient {

    private static final Logger log = LoggerFactory.getLogger(AroPersonalTokenClientImpl.class);

    private final TokenSource personalTokenSource;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public AroPersonalTokenClientImpl(PersonalTokenSource personalTokenSource,
                                      AuthContextService authContextService,
                                      HttpServletRequest request) {
        this.personalTokenSource = personalTokenSource;
        this.authContextService = authContextService;
        this.request = request;
    }

    @Override
    public <T> T execute(Function<String, T> apiCall) {
        // R5: 从当前请求上下文获取 userId，不从参数传入
        String userId = resolveCurrentUserId();
        if (userId == null) {
            throw new AroTokenRequiredException("无法解析当前用户身份");
        }

        String token = personalTokenSource.getToken(userId);
        try {
            return apiCall.apply(token);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                log.warn("[AroPersonalTokenClient] ARO 返回 401，Token 已失效: userId={}", userId);
                throw new AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            throw e;
        }
    }

    /**
     * 从当前 HTTP 请求的 Authorization 头解析当前用户 ID。
     */
    private String resolveCurrentUserId() {
        String authHeader = request.getHeader("Authorization");
        User user = authContextService.resolveUserFromBearer(authHeader);
        if (user == null) {
            return null;
        }
        return user.getId();
    }
}
