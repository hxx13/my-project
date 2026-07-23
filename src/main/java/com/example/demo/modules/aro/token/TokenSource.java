package com.example.demo.modules.aro.token;

import com.example.demo.modules.aro.exception.AroTokenRequiredException;

/**
 * Token 来源策略抽象。
 * <p>
 * 不同的 TokenSource 实现可以有不同的获取逻辑（如全局共享 token vs 个人绑定 token）。
 */
public interface TokenSource {

    /**
     * 获取当前用户的 ARO Token。
     *
     * @param userId 当前系统用户的 ID
     * @return Token 字符串
     * @throws AroTokenRequiredException 如果 Token 不存在或已过期
     */
    String getToken(String userId);

    /**
     * 检查当前用户的 Token 是否可用（存在且未过期）。
     *
     * @param userId 当前系统用户的 ID
     * @return true 如果 Token 可用
     */
    boolean isAvailable(String userId);
}
