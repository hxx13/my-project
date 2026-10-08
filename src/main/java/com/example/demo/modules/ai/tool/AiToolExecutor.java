package com.example.demo.modules.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 工具执行体。走进程内 Service 调用，不走 HTTP 自调。
 *
 * 权限与范围判定由编排层在调用本方法**之前**完成，执行体本身不再重复判角色。
 */
@FunctionalInterface
public interface AiToolExecutor {
    Object execute(AiToolContext context, JsonNode arguments) throws Exception;
}
