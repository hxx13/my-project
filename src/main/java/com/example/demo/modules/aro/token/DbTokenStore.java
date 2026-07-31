package com.example.demo.modules.aro.token;

import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.service.AesEncryptionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * 基于数据库的 TokenStore 实现。
 * <p>
 * Token 和 TGC 在写入数据库前经过 AES-256-GCM 加密。
 */
@Service("dbTokenStore")
public class DbTokenStore implements TokenStore {

    private static final Logger log = LoggerFactory.getLogger(DbTokenStore.class);

    private final UserAroBindingMapper userAroBindingMapper;
    private final AesEncryptionService aesEncryptionService;

    public DbTokenStore(UserAroBindingMapper userAroBindingMapper,
                        AesEncryptionService aesEncryptionService) {
        this.userAroBindingMapper = userAroBindingMapper;
        this.aesEncryptionService = aesEncryptionService;
    }

    @Override
    public void save(String userId, CasTokenInfo tokenInfo) {
        if (userId == null || tokenInfo == null) {
            return;
        }

        String encryptedToken = aesEncryptionService.encrypt(tokenInfo.getToken());
        Long exp = tokenInfo.getExp() > 0 ? tokenInfo.getExp() : null;

        userAroBindingMapper.upsertCasBinding(
                userId,
                tokenInfo.getAroUserId(),
                encryptedToken,
                exp,
                tokenInfo.getAccount(),
                null
        );

        log.info("[TokenStore] 已保存 CAS token: userId={}, aroUserId={}", userId, tokenInfo.getAroUserId());
    }

    @Override
    public CasTokenInfo load(String userId) {
        if (userId == null) {
            return null;
        }

        UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
        if (binding == null || binding.getCasToken() == null) {
            return null;
        }

        try {
            String decryptedToken = aesEncryptionService.decrypt(binding.getCasToken());
            if (decryptedToken == null) {
                return null;
            }

            CasTokenInfo info = new CasTokenInfo();
            info.setToken(decryptedToken);
            info.setAroUserId(binding.getAroUserId());
            info.setAccount(binding.getCasAccount());
            info.setExp(binding.getCasTokenExp() != null ? binding.getCasTokenExp() : 0);
            return info;
        } catch (Exception e) {
            log.error("[TokenStore] 解密 token 失败: userId={}", userId, e);
            return null;
        }
    }

    @Override
    public void delete(String userId) {
        if (userId == null) {
            return;
        }
        userAroBindingMapper.clearCasCredentials(userId);
        log.info("[TokenStore] 已清除 CAS 凭证: userId={}", userId);
    }

    @Override
    public boolean exists(String userId) {
        if (userId == null) {
            return false;
        }
        UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
        return binding != null && binding.getCasToken() != null;
    }

    @Override
    public void saveCredentials(String userId, String aroAccount, String aroPassword) {
        if (userId == null) return;
        String encrypted = aesEncryptionService.encrypt(aroPassword);
        userAroBindingMapper.updateCasCredentials(userId, aroAccount, encrypted);
        log.info("[TokenStore] 已保存 ARO 凭据: userId={}, account={}", userId, aroAccount);
    }

    @Override
    public String[] loadCredentials(String userId) {
        if (userId == null) return null;
        UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
        if (binding == null || binding.getAroPassword() == null) return null;
        try {
            String decrypted = aesEncryptionService.decrypt(binding.getAroPassword());
            return new String[]{binding.getCasAccount(), decrypted};
        } catch (Exception e) {
            log.error("[TokenStore] 解密凭据失败: userId={}", userId, e);
            return null;
        }
    }
}
