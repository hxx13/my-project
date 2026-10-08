package com.example.demo.modules.reportform.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ReportFormBlocksTest {

    private static final ObjectMapper M = new ObjectMapper();

    @Test
    void 老扁平数据_归一化为单块且id固定() {
        ObjectNode root = ReportFormBlocks.normalize("{\"f_a\":\"1\",\"f_b\":\"\"}");
        assertEquals(1, ReportFormBlocks.blockCount(root));
        JsonNode block = root.path("__blocks").get(0);
        assertEquals("b_default", block.path("id").asText());
        assertEquals(0, block.path("version").asInt());
        assertEquals("1", block.path("values").path("f_a").asText());
    }

    @Test
    void 同一份老数据_两次归一化结果一致() {
        String a = ReportFormBlocks.toJson(ReportFormBlocks.normalize("{\"f_a\":\"1\"}"));
        String b = ReportFormBlocks.toJson(ReportFormBlocks.normalize("{\"f_a\":\"1\"}"));
        assertEquals(a, b);
    }

    @Test
    void 空输入_归一化为一空块() {
        ObjectNode root = ReportFormBlocks.normalize("");
        assertEquals(1, ReportFormBlocks.blockCount(root));
        assertTrue(ReportFormBlocks.isBlankValues(ReportFormBlocks.blockValues(root).get(0)));
    }

    @Test
    void 已是块结构_原样保留id与版本() {
        ObjectNode root = ReportFormBlocks.normalize(
                "{\"__blocks\":[{\"id\":\"b_x\",\"version\":7,\"values\":{\"f_a\":\"v\"}}]}");
        JsonNode block = root.path("__blocks").get(0);
        assertEquals("b_x", block.path("id").asText());
        assertEquals(7, block.path("version").asInt());
        assertEquals("v", block.path("values").path("f_a").asText());
    }

    @Test
    void 块缺id_按序号补默认id() {
        ObjectNode root = ReportFormBlocks.normalize(
                "{\"__blocks\":[{\"values\":{}},{\"values\":{}}]}");
        assertEquals("b_default", root.path("__blocks").get(0).path("id").asText());
        assertEquals("b_default_1", root.path("__blocks").get(1).path("id").asText());
    }

    @Test
    void 空块判定_空白与空数组算空_显式false不算空() throws Exception {
        assertTrue(ReportFormBlocks.isBlankValues(M.readTree("{\"f_a\":\"\",\"f_b\":\"  \"}")));
        assertTrue(ReportFormBlocks.isBlankValues(M.readTree("{\"f_a\":\"null\",\"f_b\":[]}")));
        assertTrue(ReportFormBlocks.isBlankValues(M.readTree("{}")));
        assertFalse(ReportFormBlocks.isBlankValues(M.readTree("{\"f_a\":\"x\"}")));
        assertFalse(ReportFormBlocks.isBlankValues(M.readTree("{\"f_a\":0}")));
        assertFalse(ReportFormBlocks.isBlankValues(M.readTree("{\"f_a\":false}")));
    }

    @Test
    void 首块取值_供单块消费方使用() {
        ObjectNode root = ReportFormBlocks.normalize("{\"f_a\":\"1\"}");
        assertEquals("1", ReportFormBlocks.firstBlockValues(root).path("f_a").asText());
    }

    @Test
    void 字符串包裹的JSON_解包一层() {
        // 历史数据里有「JSON 再被包一层字符串」的存法，不解包会在所有导出路径上静默丢值
        ObjectNode root = ReportFormBlocks.normalize("\"{\\\"f_a\\\":\\\"1\\\"}\"");
        assertEquals(1, ReportFormBlocks.blockCount(root));
        assertEquals("1", ReportFormBlocks.firstBlockValues(root).path("f_a").asText());
    }

    @Test
    void 空块数组_补一块以满足至少一块的契约() {
        ObjectNode root = ReportFormBlocks.normalize("{\"__blocks\":[]}");
        assertEquals(1, ReportFormBlocks.blockCount(root));
        assertTrue(ReportFormBlocks.isBlankValues(ReportFormBlocks.firstBlockValues(root)));
    }

    @Test
    void 加块_追加到末尾且不动原块() {
        String json = ReportFormBlocks.addBlock("{\"f_a\":\"1\"}", "b_new");
        ObjectNode root = ReportFormBlocks.normalize(json);
        assertEquals(2, ReportFormBlocks.blockCount(root));
        JsonNode first = root.path("__blocks").get(0);
        assertEquals("b_default", first.path("id").asText());
        assertEquals("1", first.path("values").path("f_a").asText());
        JsonNode second = root.path("__blocks").get(1);
        assertEquals("b_new", second.path("id").asText());
        assertTrue(ReportFormBlocks.isBlankValues(second.path("values")));
    }

    @Test
    void 按块保存_只改目标块且版本加一() throws Exception {
        String base = ReportFormBlocks.addBlock("{\"f_a\":\"1\"}", "b_2");
        var r = ReportFormBlocks.updateBlock(base, "b_2", M.readTree("{\"f_b\":\"2\"}"), 0);
        assertEquals(ReportFormBlocks.WriteStatus.OK, r.status());
        ObjectNode root = ReportFormBlocks.normalize(r.json());
        assertEquals(0, root.path("__blocks").get(0).path("version").asInt());
        assertEquals("1", root.path("__blocks").get(0).path("values").path("f_a").asText());
        assertEquals(1, root.path("__blocks").get(1).path("version").asInt());
        assertEquals("2", root.path("__blocks").get(1).path("values").path("f_b").asText());
    }

    @Test
    void 按块保存_版本不符返回冲突且不落值() throws Exception {
        String base = ReportFormBlocks.addBlock("{\"f_a\":\"1\"}", "b_2");
        var r = ReportFormBlocks.updateBlock(base, "b_2", M.readTree("{\"f_b\":\"X\"}"), 99);
        assertEquals(ReportFormBlocks.WriteStatus.CONFLICT, r.status());
        assertTrue(ReportFormBlocks.isBlankValues(
                ReportFormBlocks.blockValues(ReportFormBlocks.normalize(r.json()), "b_2")));
    }

    @Test
    void 按块保存_块不存在返回未找到() throws Exception {
        var r = ReportFormBlocks.updateBlock("{\"f_a\":\"1\"}", "b_nope", M.readTree("{}"), 0);
        assertEquals(ReportFormBlocks.WriteStatus.NOT_FOUND, r.status());
    }

    @Test
    void 删块_保留其余块且id不变() {
        String base = ReportFormBlocks.addBlock(ReportFormBlocks.addBlock("{\"f_a\":\"1\"}", "b_2"), "b_3");
        var r = ReportFormBlocks.deleteBlock(base, "b_2");
        assertEquals(ReportFormBlocks.WriteStatus.OK, r.status());
        ObjectNode root = ReportFormBlocks.normalize(r.json());
        assertEquals(2, ReportFormBlocks.blockCount(root));
        assertEquals("b_default", root.path("__blocks").get(0).path("id").asText());
        assertEquals("b_3", root.path("__blocks").get(1).path("id").asText());
    }

    @Test
    void 删块_最后一块被拒绝() {
        var r = ReportFormBlocks.deleteBlock("{\"f_a\":\"1\"}", "b_default");
        assertEquals(ReportFormBlocks.WriteStatus.LAST_BLOCK, r.status());
        assertEquals(1, ReportFormBlocks.blockCount(ReportFormBlocks.normalize(r.json())));
    }

    @Test
    void 取单块取值与版本() throws Exception {
        String base = ReportFormBlocks.addBlock("{\"f_a\":\"1\"}", "b_2");
        var r = ReportFormBlocks.updateBlock(base, "b_2", M.readTree("{\"f_b\":\"2\"}"), 0);
        ObjectNode root = ReportFormBlocks.normalize(r.json());
        assertEquals("2", ReportFormBlocks.blockValues(root, "b_2").path("f_b").asText());
        assertEquals(1, ReportFormBlocks.blockVersion(root, "b_2"));
        assertNull(ReportFormBlocks.blockValues(root, "b_nope"));
    }
}
