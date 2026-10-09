package com.example.demo.modules.ai.export.service;

import com.example.demo.modules.ai.export.entity.AiExportArtifact;
import com.example.demo.modules.ai.export.mapper.AiExportArtifactMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 对话导出产物（文件跟对话走）。
 *
 * <p>两道卡：**会话归属**（产物挂在谁的会话上）与**产出人**（谁让导的）。两条都过才给。
 * 归属一律来自 JWT 解出来的身份，本类不接受任何调用方传来的所有者字段。
 */
@Service
public class AiExportArtifactService {

    private static final Logger log = LoggerFactory.getLogger(AiExportArtifactService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final AiExportArtifactMapper mapper;

    public AiExportArtifactService(AiExportArtifactMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 落一条产物（**还没有字节**）：模型刚给出一份导出时调用。
     *
     * <p>落库失败**不能中断这一轮** —— 下载按钮已经推出去了，产物只是「留痕」，
     * 记日志即可，调用方按 null 处理（拿不到 id 就不下发 id，前端退化成老路径）。
     */
    public AiExportArtifact record(Long sessionId, Long messageId, String userId, String kind,
                                   String label, String filename, String paramsJson, Long sourceId) {
        if (sessionId == null || userId == null || kind == null) {
            return null;
        }
        try {
            AiExportArtifact row = new AiExportArtifact();
            row.setSessionId(sessionId);
            row.setMessageId(messageId);
            row.setUserId(userId);
            row.setKind(kind);
            row.setLabel(label);
            row.setFilename(filename);
            row.setParamsJson(paramsJson);
            row.setSourceId(sourceId);
            mapper.insert(row);
            return row;
        } catch (RuntimeException e) {
            log.warn("[ai-export] 产物留痕失败（不影响本轮下载按钮）: {}", e.getMessage());
            return null;
        }
    }

    public List<AiExportArtifact> listBySession(Long sessionId) {
        return mapper.selectListBySession(sessionId);
    }

    /** 本会话最近产出的一份（不是最近下载的一份）。 */
    public AiExportArtifact latest(Long sessionId) {
        return mapper.selectLatestBySession(sessionId);
    }

    /**
     * 取一份产物，归属对得上才返回；否则抛。
     *
     * <p>归属 = 产物上的 {@code user_id} 等于 JWT 解出来的身份。会话归属由会话服务另有一道卡
     * （会话本来就是一人的），这里不重复判 —— 但**绝不**接受调用方传来「所有者是谁」。
     *
     * <p>不符一律按「找不到」处理 —— 不区分「不存在」与「不是你的」，
     * 免得把「这个 id 上有一份别人的导出」这件事透出去。
     */
    public AiExportArtifact requireOwned(Long id, String userId) {
        AiExportArtifact row = id == null ? null : mapper.selectById(id);
        if (row == null || userId == null || !userId.equals(row.getUserId())) {
            throw new IllegalStateException("找不到这份导出");
        }
        return row;
    }

    /** 取字节；没归档过返回 null（调用方据此走「用参数重跑」那条路）。 */
    public byte[] contentOf(AiExportArtifact row) {
        if (row == null || row.getContentSize() == null) {
            return null;
        }
        AiExportArtifact holder = mapper.selectContent(row.getId());
        byte[] bytes = holder == null ? null : holder.getContent();
        return bytes == null || bytes.length == 0 ? null : bytes;
    }

    /** 归档：用户真下过之后把那份字节交回来。 */
    public void saveContent(Long id, byte[] content, String contentType) {
        if (id == null || content == null || content.length == 0) {
            return;
        }
        mapper.updateContent(id, content, contentType, content.length);
    }

    /** 参数原样读回（筛选 + 小计层级），给「没字节时重跑」用。 */
    public Map<String, Object> paramsOf(AiExportArtifact row) {
        if (row == null || row.getParamsJson() == null || row.getParamsJson().isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(row.getParamsJson(), new TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("[ai-export] 产物参数解析失败 id={}: {}", row.getId(), e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    /**
     * 元数据 + 是否有字节 + **重跑要用的参数**（给前端/模型看的形态）。
     *
     * <p>参数也要给出去：历史里那张卡片在「没归档过」时要靠它重跑一次导出 ——
     * 只给个 id 的话，翻历史回去就只剩一个点不动的按钮。
     */
    public Map<String, Object> describe(AiExportArtifact row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("exportId", row.getId());
        m.put("kind", row.getKind());
        m.put("label", row.getLabel());
        m.put("filename", row.getFilename());
        m.put("messageId", row.getMessageId());
        m.put("sourceId", row.getSourceId());
        m.put("hasFile", row.getContentSize() != null && row.getContentSize() > 0);
        m.put("params", paramsOf(row));
        m.put("createdAt", row.getCreatedAt() == null ? null : row.getCreatedAt().toString());
        return m;
    }
}
