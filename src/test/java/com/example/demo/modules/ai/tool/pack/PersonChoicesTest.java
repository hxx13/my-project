package com.example.demo.modules.ai.tool.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 人员候选 → 可点选项。钉住的是**值必须是能唯一定位的东西**这条规则：
 * 值会作为下一条用户消息发回去，拿姓名当值在重名时原地打转。
 */
class PersonChoicesTest {

    private static Map<String, Object> row(String name, String job, String dept) {
        return Map.of("name", name, "jobNumber", job, "department", dept);
    }

    @Test
    @DisplayName("值用工号；标签带上姓名·工号·科室")
    void valueIsJobNumber() {
        List<Map<String, Object>> choices =
                PersonChoices.of(List.of(row("郑本风", "YF0034", "基础医学院")));

        assertEquals(1, choices.size());
        assertEquals("YF0034", choices.get(0).get("value"));
        assertEquals("郑本风 · YF0034 · 基础医学院", choices.get(0).get("label"));
    }

    @Test
    @DisplayName("没有工号才退回姓名；两样都没有的整条丢掉")
    void fallsBackToNameAndSkipsBlanks() {
        List<Map<String, Object>> choices = PersonChoices.of(List.of(
                row("张三", "", ""),
                row("", "", "")));

        assertEquals(1, choices.size());
        assertEquals("张三", choices.get(0).get("value"));
        assertEquals("张三", choices.get(0).get("label"));
    }

    @Test
    @DisplayName("选项是合法 JSON 能序列化的形状（label/value 两个键）")
    void shapeIsLabelValue() throws Exception {
        List<Map<String, Object>> choices = PersonChoices.of(List.of(row("李四", "A1", "某系")));
        String json = new ObjectMapper().writeValueAsString(choices);
        assertTrue(json.contains("\"label\""), json);
        assertTrue(json.contains("\"value\""), json);
    }
}
