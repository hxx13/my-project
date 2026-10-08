package com.example.demo.modules.ai.tool;

import com.example.demo.modules.ai.tool.pack.CageOpReviewToolPack;
import com.example.demo.modules.ai.tool.pack.CageQueryToolPack;
import com.example.demo.modules.ai.tool.pack.CommonToolPack;
import com.example.demo.modules.ai.tool.pack.DoorControlToolPack;
import com.example.demo.modules.ai.tool.pack.StudentReviewToolPack;
import com.example.demo.modules.ai.tool.pack.SuppliesMallToolPack;
import com.example.demo.modules.ai.tool.pack.SuppliesProcessToolPack;
import com.example.demo.modules.ai.tool.pack.TelemetryToolPack;
import com.example.demo.modules.ai.tool.pack.TrainingReviewToolPack;
import com.example.demo.modules.ai.tool.pack.UnfreezeToolPack;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 工具 schema 必须是合法 JSON。
 *
 * <p>这条闸是拿真机代价换来的：schema 写在 Java 文本块里，描述中想写带引号的例子（如 "18:00"）
 * 就得写成 {@code \\"}；少写一层反斜杠在 Java 里完全合法 —— 编得过、既有单测也过，
 * 但**发出去那一刻**才炸（「工具 schema 不是合法 JSON」），整轮对话直接失败，
 * 用户看到的是「联系不上」。工具描述越写越细，这种漏法只会更多。
 */
class AiToolSchemaJsonTest {

    @Test
    @DisplayName("每个工具的 schema 都能被 JSON 解析，且顶层是 object")
    void allToolSchemasAreValidJson() {
        ObjectMapper om = new ObjectMapper();
        // 这些构造都只做赋值，依赖用不上，传 null 即可。
        // **加新包时把新包加进这个列表** —— 这份清单是手写的，漏登记就等于漏守（schema 坏了只会
        // 在真机发出去那一刻才炸）。
        List<AiToolPack> packs = List.of(
                new CommonToolPack(null, null, null),
                new CageQueryToolPack(null),
                new CageOpReviewToolPack(null, null, null),
                new UnfreezeToolPack(null, null, null, null, null),
                new DoorControlToolPack(null, null),
                new StudentReviewToolPack(null, null),
                new SuppliesMallToolPack(null, null),
                new SuppliesProcessToolPack(null, null),
                new TelemetryToolPack(null, null, null),
                new TrainingReviewToolPack(null, null));
        for (AiToolPack pack : packs) {
            for (AiTool tool : pack.tools()) {
                JsonNode root;
                try {
                    root = om.readTree(tool.schemaJson());
                } catch (Exception e) {
                    throw new AssertionError("工具 " + tool.name() + " 的 schema 不是合法 JSON: " + e.getMessage(), e);
                }
                assertEquals("object", root.path("type").asText(),
                        "工具 " + tool.name() + " 的 schema 顶层 type 应是 object");
            }
        }
    }
}
