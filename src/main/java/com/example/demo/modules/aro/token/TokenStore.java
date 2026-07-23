package com.example.demo.modules.aro.token;

import com.example.demo.modules.aro.dto.CasTokenInfo;

/**
 * Token 持久化存储抽象。
 * <p>
 * 实现类负责 AES 加解密以及与数据库交互。
 */
public interface TokenStore {

    /**
     * 保存 token 信息（AES 加密后写入 DB）。
     */
    void save(String userId, CasTokenInfo tokenInfo);

    /**
     * 加载 token 信息（从 DB 读取并 AES 解密）。
     *
     * @return CasTokenInfo，未找到时返回 null
     */
    CasTokenInfo load(String userId);

    /**
     * 删除 token 信息。
     */
    void delete(String userId);

    /**
     * 判断 token 是否存在。
     */
    boolean exists(String userId);
}
