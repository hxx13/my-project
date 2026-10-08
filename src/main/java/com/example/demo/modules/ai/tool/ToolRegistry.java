package com.example.demo.modules.ai.tool;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工具注册表 —— 白名单。模型只能调用这里登记过的东西。
 *
 * Spring 自动收集全部 {@link AiToolPack} Bean，所以「加一个包」不需要改本类。
 * 排序是刻意的：包与工具都按名字稳定排序，让发给模型的 tools 列表逐轮一致 ——
 * 顺序抖动会让 prompt 缓存前缀失效（见设计文档 §10.2）。
 */
@Component
public class ToolRegistry {

    private static final Logger log = LoggerFactory.getLogger(ToolRegistry.class);

    private final Map<String, AiToolPack> packs = new LinkedHashMap<>();
    private final Map<String, AiTool> tools = new LinkedHashMap<>();

    public ToolRegistry(List<AiToolPack> discovered) {
        List<AiToolPack> sorted = new ArrayList<>(discovered);
        sorted.sort(Comparator.comparing(AiToolPack::packKey));

        for (AiToolPack pack : sorted) {
            String key = pack.packKey();
            if (packs.containsKey(key)) {
                throw new IllegalStateException("工具包标识重复: " + key);
            }
            packs.put(key, pack);

            List<AiTool> packTools = new ArrayList<>(pack.tools());
            packTools.sort(Comparator.comparing(AiTool::name));
            for (AiTool tool : packTools) {
                AiTool previous = tools.putIfAbsent(tool.name(), tool);
                if (previous != null) {
                    throw new IllegalStateException(
                            "工具名重复: " + tool.name() + "（包 " + key + " 与其它包冲突）—— 重名会让模型无法区分，必须改掉");
                }
            }
        }
        log.info("[ai-tool] 已注册 {} 个工具包、{} 个工具: {}",
                packs.size(), tools.size(), tools.keySet());
    }

    public Collection<AiToolPack> packs() {
        return packs.values();
    }

    public AiToolPack pack(String packKey) {
        return packs.get(packKey);
    }

    public AiTool tool(String name) {
        return tools.get(name);
    }

    /** 全部工具，稳定序。 */
    public List<AiTool> allTools() {
        return List.copyOf(tools.values());
    }

    public boolean isEmpty() {
        return tools.isEmpty();
    }
}
