package com.example.demo.modules.aro.scheduler;

import com.example.demo.modules.aro.client.CasClient;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.token.TokenStore;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 定时检查并续期即将过期的 ARO 个人 Token。
 * 每天凌晨 3 点执行，提前 3 天续期，避免 Token 过期影响业务。
 */
@Component
public class AroTokenRenewalScheduler {

    private static final Logger log = LoggerFactory.getLogger(AroTokenRenewalScheduler.class);

    /** 提前续期阈值：Token 剩余有效期不足此值时触发续期（秒） */
    private static final long RENEW_THRESHOLD_SECONDS = 3 * 24 * 3600; // 3 天

    private final UserAroBindingMapper bindingMapper;
    private final TokenStore tokenStore;
    private final CasClient casClient;

    public AroTokenRenewalScheduler(UserAroBindingMapper bindingMapper,
                                     @Qualifier("cachedTokenStore") TokenStore tokenStore,
                                     CasClient casClient) {
        this.bindingMapper = bindingMapper;
        this.tokenStore = tokenStore;
        this.casClient = casClient;
    }

    @Scheduled(cron = "${app.aro.token-renew-cron:0 7 3 * * ?}")
    public void renewExpiringTokens() {
        log.info("[ARO-renewal] 开始检查 Token 续期...");
        int renewed = 0;
        int failed = 0;
        int skipped = 0;

        List<UserAroBinding> allBindings = bindingMapper.selectAll();
        if (allBindings == null || allBindings.isEmpty()) {
            log.info("[ARO-renewal] 无已绑定用户，跳过");
            return;
        }

        long nowSec = System.currentTimeMillis() / 1000;

        for (UserAroBinding binding : allBindings) {
            String userId = binding.getUserId();
            try {
                CasTokenInfo info = tokenStore.load(userId);
                if (info == null) {
                    skipped++;
                    continue;
                }

                long remaining = info.getExp() - nowSec;
                if (remaining > RENEW_THRESHOLD_SECONDS) {
                    skipped++;
                    continue;
                }

                log.info("[ARO-renewal] 续期 Token: userId={}, account={}, 剩余={}秒",
                        userId, info.getAccount(), remaining);

                CasTokenInfo newToken = casClient.refreshToken(info.getToken());
                if (newToken == null) {
                    // token 续期失败，尝试用存储的凭据重新登录
                    String[] creds = tokenStore.loadCredentials(userId);
                    if (creds != null && creds[0] != null && creds[1] != null) {
                        log.info("[ARO-renewal] token续期失败，尝试凭据登录: userId={}", userId);
                        newToken = casClient.loginWithCredentials(creds[0], creds[1]);
                    }
                }
                if (newToken != null) {
                    tokenStore.save(userId, newToken);
                    renewed++;
                    log.info("[ARO-renewal] 续期成功: userId={}, account={}, 新过期时间={}",
                            userId, newToken.getAccount(), newToken.getExp());
                } else {
                    failed++;
                    log.warn("[ARO-renewal] 续期失败: userId={}, account={}",
                            userId, info.getAccount());
                }
            } catch (Exception e) {
                failed++;
                log.error("[ARO-renewal] 续期异常: userId={}, error={}", userId, e.getMessage());
            }
        }

        log.info("[ARO-renewal] 完成: 续期={}, 失败={}, 跳过={}, 总计={}",
                renewed, failed, skipped, allBindings.size());
    }
}
