package com.example.demo.modules.aro.token;

import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * TokenStore 装饰器，在底层存储之上增加 Caffeine 本地缓存。
 * <p>
 * 缓存 30 分钟过期，最大 200 条。read-through 模式：load 时缓存未命中则穿透到委托存储。
 */
@Service
public class CachedTokenStore implements TokenStore {

    private static final Logger log = LoggerFactory.getLogger(CachedTokenStore.class);

    private final TokenStore delegate;
    private final Cache<String, CasTokenInfo> cache;

    public CachedTokenStore(@Qualifier("dbTokenStore") TokenStore delegate) {
        this.delegate = delegate;
        this.cache = Caffeine.newBuilder()
                .maximumSize(200)
                .expireAfterWrite(30, TimeUnit.MINUTES)
                .build();
    }

    @Override
    public void save(String userId, CasTokenInfo tokenInfo) {
        delegate.save(userId, tokenInfo);
        if (tokenInfo != null) {
            cache.put(userId, tokenInfo);
        }
        log.debug("[CachedTokenStore] save: userId={}", userId);
    }

    @Override
    public CasTokenInfo load(String userId) {
        // read-through: 缓存命中直接返回，未命中穿透到 DB
        CasTokenInfo cached = cache.getIfPresent(userId);
        if (cached != null) {
            log.debug("[CachedTokenStore] cache hit: userId={}", userId);
            return cached;
        }

        CasTokenInfo fromDb = delegate.load(userId);
        if (fromDb != null) {
            cache.put(userId, fromDb);
            log.debug("[CachedTokenStore] cache miss, loaded from DB: userId={}", userId);
        }
        return fromDb;
    }

    @Override
    public void delete(String userId) {
        delegate.delete(userId);
        cache.invalidate(userId);
        log.debug("[CachedTokenStore] delete: userId={}", userId);
    }

    @Override
    public boolean exists(String userId) {
        if (cache.getIfPresent(userId) != null) {
            return true;
        }
        return delegate.exists(userId);
    }

    @Override
    public void saveCredentials(String userId, String aroAccount, String aroPassword) {
        delegate.saveCredentials(userId, aroAccount, aroPassword);
    }

    @Override
    public String[] loadCredentials(String userId) {
        return delegate.loadCredentials(userId);
    }
}
