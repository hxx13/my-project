package com.example.demo.modules.aro.token;

import com.example.demo.modules.aro.client.CasClient;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.exception.AroTokenRequiredException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 个人 Token 来源：每个用户绑定自己的 CAS 账号，Token 从 TokenStore 获取。
 * <p>
 * R23: 过期判断预留 30 秒时钟偏差余量。
 */
@Service
public class PersonalTokenSource implements TokenSource {

    private static final Logger log = LoggerFactory.getLogger(PersonalTokenSource.class);

    private final TokenStore tokenStore;
    private final CasClient casClient;

    public PersonalTokenSource(CachedTokenStore tokenStore, CasClient casClient) {
        this.tokenStore = tokenStore;
        this.casClient = casClient;
    }

    @Override
    public String getToken(String userId) {
        CasTokenInfo info = tokenStore.load(userId);
        if (info == null) {
            throw new AroTokenRequiredException("未绑定CAS账号，请先在后台绑定");
        }
        // R23: 留 30s 余量防止服务器时钟偏差（与 isAvailable 同方向保守判过期）
        long nowSeconds = System.currentTimeMillis() / 1000;
        if (info.getExp() <= nowSeconds + 30) {
            log.warn("[PersonalTokenSource] Token 已过期: userId={}, exp={}, now={}", userId, info.getExp(), nowSeconds);
            throw new AroTokenRequiredException("CAS Token已过期，请重新登录");
        }
        return info.getToken();
    }

    @Override
    public boolean isAvailable(String userId) {
        CasTokenInfo info = tokenStore.load(userId);
        if (info == null) {
            return false;
        }
        // R23: 留 30s 余量，必须比当前时间晚 30s 以上才算可用
        long nowSeconds = System.currentTimeMillis() / 1000;
        return info.getExp() > nowSeconds + 30;
    }
}
