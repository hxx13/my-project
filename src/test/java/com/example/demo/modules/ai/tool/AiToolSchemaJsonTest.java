package com.example.demo.modules.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 工具 schema 必须是合法 JSON。
 *
 * <p>这条闸是拿真机代价换来的：schema 写在 Java 文本块里，描述中想写带引号的例子（如 "18:00"）
 * 就得写成 {@code \\"}；少写一层反斜杠在 Java 里完全合法 —— 编得过、既有单测也过，
 * 但**发出去那一刻**才炸（「工具 schema 不是合法 JSON」），整轮对话直接失败，
 * 用户看到的是「联系不上」。工具描述越写越细，这种漏法只会更多。
 *
 * <p>清单不再手写：**包里有几个包就查几个**。上一版是一份手写的类清单，加新包时忘了登记就等于
 * 漏守 —— 实测正是这么漏掉了条件触发器那个包（它里面真有一处引号没转义，整轮对话全炸）。
 * 手写清单的失效方式是「静默的」，所以改成扫描。
 */
class AiToolSchemaJsonTest {

    private static final String PACKAGE = "com.example.demo.modules.ai.tool.pack";

    @Test
    @DisplayName("每个工具的 schema 都能被 JSON 解析，且顶层是 object")
    void allToolSchemasAreValidJson() throws Exception {
        ObjectMapper om = new ObjectMapper();
        List<AiToolPack> packs = discoverPacks();

        // 扫到 0 个包 = 扫描本身坏了（例如换了打包方式），那时这条闸会**静默变空测**。
        // 与其让它假绿，不如直接报出来。
        assertTrue(packs.size() >= 20,
                "只扫到 " + packs.size() + " 个工具包，扫描逻辑大概坏了 —— 这条闸正在假绿");

        List<String> checked = new ArrayList<>();
        for (AiToolPack pack : packs) {
            for (AiTool tool : pack.tools()) {
                JsonNode root;
                try {
                    root = om.readTree(tool.schemaJson());
                } catch (Exception e) {
                    throw new AssertionError("工具 " + tool.name() + "（包 " + pack.packKey()
                            + "）的 schema 不是合法 JSON: " + e.getMessage(), e);
                }
                assertEquals("object", root.path("type").asText(),
                        "工具 " + tool.name() + " 的 schema 顶层 type 应是 object");
                checked.add(tool.name());
            }
        }
        assertTrue(checked.size() >= 40, "只查到 " + checked.size() + " 个工具，明显偏少");
    }

    /**
     * 把包目录下所有能实例化的 {@link AiToolPack} 扫出来。
     *
     * <p>依赖用不上（构造器只做赋值），一律传 null；但 {@code ObjectMapper} 是**真的会用**的
     * （有的包在 {@code tools()} 里就 dot 它），传 null 会 NPE —— 所以那一类给个真货。
     */
    private static List<AiToolPack> discoverPacks() throws Exception {
        URL dir = AiToolSchemaJsonTest.class.getClassLoader().getResource(PACKAGE.replace('.', '/'));
        if (dir == null || !"file".equals(dir.getProtocol())) {
            throw new IllegalStateException("找不到工具包目录（classes 不是展开目录？）: " + dir);
        }
        File[] files = new File(dir.toURI()).listFiles((d, n) -> n.endsWith("ToolPack.class"));
        if (files == null) {
            throw new IllegalStateException("目录列不出来: " + dir);
        }
        List<AiToolPack> out = new ArrayList<>();
        for (File f : files) {
            String simple = f.getName().substring(0, f.getName().length() - ".class".length());
            if (simple.contains("$")) {
                continue;
            }
            Class<?> c = Class.forName(PACKAGE + "." + simple);
            if (!AiToolPack.class.isAssignableFrom(c) || Modifier.isAbstract(c.getModifiers())) {
                continue;
            }
            Constructor<?> ctor = c.getDeclaredConstructors()[0];
            ctor.setAccessible(true);
            Object[] args = new Object[ctor.getParameterCount()];
            Class<?>[] types = ctor.getParameterTypes();
            for (int i = 0; i < args.length; i++) {
                args[i] = ObjectMapper.class.equals(types[i]) ? new ObjectMapper() : null;
            }
            out.add((AiToolPack) ctor.newInstance(args));
        }
        return out;
    }
}
