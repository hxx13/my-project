package com.example.demo.modules.aro;

import com.example.demo.modules.aro.exception.AroTokenRequiredException;

import java.util.function.Function;

/**
 * 个人 CAS Token 业务编排客户端。
 * <p>
 * 封装 Token 获取、401 重试等横切关注点，调用方只需传入业务函数即可。
 * <p>
 * R5: execute() 不接收 userId 参数 —— userId 从 AuthContextService 内部获取，
 * 调用方无需关心当前用户是谁。
 */
public interface AroPersonalTokenClient {

    /**
     * 在个人 CAS Token 上下文中执行 ARO API 调用。
     * <p>
     * Token 自动注入，401 自动转换为 AroTokenRequiredException。
     *
     * @param apiCall 接收 Token 字符串并返回业务结果的函数
     * @param <T>     业务返回类型
     * @return 业务结果
     * @throws AroTokenRequiredException 如果 Token 缺失、过期或服务端返回 401
     */
    <T> T execute(Function<String, T> apiCall);
}
