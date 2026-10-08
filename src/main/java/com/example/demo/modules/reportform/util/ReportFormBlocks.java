package com.example.demo.modules.reportform.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;

/**
 * 填报值的「块」结构 —— 一份记录内可重复多张相同表格。
 *
 * <p>存储形状（唯一真相）：
 * <pre>{"__blocks":[{"id":"b_x","version":3,"values":{"f_a":"1"}}, ...]}</pre>
 *
 * <p>老数据是扁平 {@code {fieldKey:value}}，<b>读路径</b>归一化为单块并使用固定 id
 * {@link #DEFAULT_BLOCK_ID}。固定而非随机：客户端要按 id 回写，随机 id 每次读都变会让 PUT 找不到块。
 * 不写迁移脚本，下次保存自然升格。
 */
public final class ReportFormBlocks {

    public static final String BLOCKS_KEY = "__blocks";

    /** 老扁平数据归一化后的固定块 id —— 必须稳定。 */
    public static final String DEFAULT_BLOCK_ID = "b_default";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ReportFormBlocks() {}

    /** 归一化：任何输入都返回 {@code {"__blocks":[…]}}，至少一块。 */
    public static ObjectNode normalize(String fieldValuesJson) {
        ObjectNode root = MAPPER.createObjectNode();
        ArrayNode out = root.putArray(BLOCKS_KEY);

        JsonNode parsed = readTree(fieldValuesJson);
        if (parsed != null && parsed.isObject() && parsed.path(BLOCKS_KEY).isArray()) {
            int i = 0;
            for (JsonNode b : parsed.path(BLOCKS_KEY)) {
                out.add(sanitizeBlock(b, i++));
            }
        } else {
            out.add(newBlock(DEFAULT_BLOCK_ID,
                    parsed != null && parsed.isObject() ? parsed : MAPPER.createObjectNode(), 0));
        }
        // 契约：至少一块。__blocks 为空数组（脏数据）也补一块，否则导出空白、提交校验形同放开
        if (out.isEmpty()) {
            out.add(newBlock(DEFAULT_BLOCK_ID, MAPPER.createObjectNode(), 0));
        }
        return root;
    }

    /** 按顺序取各块的 values 节点。 */
    public static List<JsonNode> blockValues(JsonNode normalized) {
        List<JsonNode> list = new ArrayList<>();
        for (JsonNode b : normalized.path(BLOCKS_KEY)) {
            list.add(b.path("values"));
        }
        return list;
    }

    public static int blockCount(JsonNode normalized) {
        return normalized.path(BLOCKS_KEY).size();
    }

    /** 单块表单的取值（repeatable=false 的导出/旧接口只认第一块）。 */
    public static JsonNode firstBlockValues(JsonNode normalized) {
        JsonNode blocks = normalized.path(BLOCKS_KEY);
        return blocks.isEmpty() ? MAPPER.createObjectNode() : blocks.get(0).path("values");
    }

    /** 块内没有任何非空值。 */
    public static boolean isBlankValues(JsonNode values) {
        if (values == null || !values.isObject() || values.isEmpty()) return true;
        var it = values.fields();
        while (it.hasNext()) {
            if (!isBlankValue(it.next().getValue())) return false;
        }
        return true;
    }

    public static String toJson(JsonNode node) {
        try {
            return MAPPER.writeValueAsString(node);
        } catch (Exception e) {
            throw new IllegalStateException("块结构序列化失败", e);
        }
    }

    /** 加一块（追加到末尾），返回新的 fieldValuesJson。 */
    public static String addBlock(String fieldValuesJson) {
        return addBlock(fieldValuesJson, newBlockId());
    }

    /** 供测试注入 id —— 正式调用走 {@link #addBlock(String)} 生成随机 id。 */
    static String addBlock(String fieldValuesJson, String newId) {
        ObjectNode root = normalize(fieldValuesJson);
        ((ArrayNode) root.path(BLOCKS_KEY)).add(newBlock(newId, MAPPER.createObjectNode(), 0));
        return toJson(root);
    }

    /** 取某块的 values；块不存在返回 null。 */
    public static JsonNode blockValues(JsonNode normalized, String blockId) {
        for (JsonNode b : normalized.path(BLOCKS_KEY)) {
            if (blockId.equals(b.path("id").asText())) return b.path("values");
        }
        return null;
    }

    /** 取某块的版本号；块不存在返回 -1。 */
    public static int blockVersion(JsonNode normalized, String blockId) {
        for (JsonNode b : normalized.path(BLOCKS_KEY)) {
            if (blockId.equals(b.path("id").asText())) return b.path("version").asInt(0);
        }
        return -1;
    }

    /**
     * 按块回写：块级版本号不符返回 {@link WriteStatus#CONFLICT} 且不改动内容。
     *
     * @param expectedVersion 客户端持有的该块版本号
     */
    public static WriteResult updateBlock(String fieldValuesJson, String blockId,
                                          JsonNode newValues, int expectedVersion) {
        ObjectNode root = normalize(fieldValuesJson);
        for (JsonNode b : root.path(BLOCKS_KEY)) {
            if (!blockId.equals(b.path("id").asText())) continue;
            int current = b.path("version").asInt(0);
            if (current != expectedVersion) {
                return new WriteResult(WriteStatus.CONFLICT, toJson(root));
            }
            ((ObjectNode) b).put("version", current + 1);
            ((ObjectNode) b).set("values",
                    newValues != null && newValues.isObject() ? newValues.deepCopy() : MAPPER.createObjectNode());
            return new WriteResult(WriteStatus.OK, toJson(root));
        }
        return new WriteResult(WriteStatus.NOT_FOUND, toJson(root));
    }

    /** 删块：最后一块不可删（一份记录至少一张表）。 */
    public static WriteResult deleteBlock(String fieldValuesJson, String blockId) {
        ObjectNode root = normalize(fieldValuesJson);
        ArrayNode blocks = (ArrayNode) root.path(BLOCKS_KEY);
        int idx = -1;
        for (int i = 0; i < blocks.size(); i++) {
            if (blockId.equals(blocks.get(i).path("id").asText())) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return new WriteResult(WriteStatus.NOT_FOUND, toJson(root));
        if (blocks.size() <= 1) return new WriteResult(WriteStatus.LAST_BLOCK, toJson(root));
        blocks.remove(idx);
        return new WriteResult(WriteStatus.OK, toJson(root));
    }

    public static String newBlockId() {
        return "b_" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    public enum WriteStatus { OK, NOT_FOUND, CONFLICT, LAST_BLOCK }

    public record WriteResult(WriteStatus status, String json) {}

    // ──────────── 内部 ────────────

    private static boolean isBlankValue(JsonNode v) {
        if (v == null || v.isNull()) return true;
        if (v.isTextual()) {
            String s = v.asText("").trim();
            return s.isEmpty() || "null".equalsIgnoreCase(s);
        }
        if (v.isArray()) return v.isEmpty();
        if (v.isObject()) return v.isEmpty();
        return false;
    }

    private static JsonNode readTree(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            JsonNode node = MAPPER.readTree(json);
            // 历史数据里有「JSON 再被包一层字符串」的存法（ReportFormWordService.parseFieldValues 也防了这一手）。
            // 不解包的话，这些行的值会在所有导出/渲染路径上静默丢失。
            if (node != null && node.isTextual()) {
                String inner = node.asText("");
                return inner.isBlank() ? null : MAPPER.readTree(inner);
            }
            return node;
        } catch (Exception e) {
            return null;
        }
    }

    static ObjectNode sanitizeBlock(JsonNode b, int index) {
        String id = b.path("id").asText("");
        if (id.isBlank()) {
            id = index == 0 ? DEFAULT_BLOCK_ID : DEFAULT_BLOCK_ID + "_" + index;
        }
        JsonNode values = b.path("values");
        return newBlock(id, values.isObject() ? values : MAPPER.createObjectNode(),
                b.path("version").asInt(0));
    }

    static ObjectNode newBlock(String id, JsonNode values, int version) {
        ObjectNode block = MAPPER.createObjectNode();
        block.put("id", id);
        block.put("version", version);
        block.set("values", values == null ? MAPPER.createObjectNode() : values.deepCopy());
        return block;
    }
}
