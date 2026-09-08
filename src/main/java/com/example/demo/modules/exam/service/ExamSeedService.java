package com.example.demo.modules.exam.service;

import com.example.demo.modules.exam.entity.ExamPaper;
import com.example.demo.modules.exam.entity.ExamPaperQuestion;
import com.example.demo.modules.exam.entity.ExamPaperSection;
import com.example.demo.modules.exam.mapper.ExamPaperMapper;
import com.example.demo.modules.exam.mapper.ExamPaperQuestionMapper;
import com.example.demo.modules.exam.mapper.ExamPaperSectionMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 内置试卷种子：从 seed/exam-seed.json 读取，支持「列出 + 选择性导入」。
 * 不自动全量播种，由管理端「导入种子试卷」按需触发。
 */
@Service
public class ExamSeedService {

    private static final Logger log = LoggerFactory.getLogger(ExamSeedService.class);

    private final ExamPaperMapper paperMapper;
    private final ExamPaperSectionMapper sectionMapper;
    private final ExamPaperQuestionMapper questionMapper;
    private final ObjectMapper objectMapper;

    private volatile JsonNode seedRoot;

    public ExamSeedService(ExamPaperMapper paperMapper,
                           ExamPaperSectionMapper sectionMapper,
                           ExamPaperQuestionMapper questionMapper,
                           ObjectMapper objectMapper) {
        this.paperMapper = paperMapper;
        this.sectionMapper = sectionMapper;
        this.questionMapper = questionMapper;
        this.objectMapper = objectMapper;
    }

    /** 列出所有种子试卷，含是否已导入 */
    public List<Map<String, Object>> listSeeds() {
        JsonNode papers = loadSeeds();
        List<Map<String, Object>> out = new ArrayList<>();
        if (papers == null) return out;
        for (JsonNode p : papers) {
            String code = p.get("code").asText();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", code);
            row.put("title", p.get("title").asText());
            row.put("questionCount", countQuestions(p));
            row.put("imported", paperMapper.findByCode(code) != null);
            out.add(row);
        }
        return out;
    }

    /** 选择性导入指定 code 的种子试卷，跳过已导入的；返回本次导入数量 */
    @Transactional
    public int importSeeds(List<String> codes) {
        JsonNode papers = loadSeeds();
        if (papers == null) return 0;
        Set<String> want = new HashSet<>(codes == null ? List.of() : codes);
        int imported = 0;
        for (JsonNode p : papers) {
            String code = p.get("code").asText();
            if (!want.contains(code)) continue;
            if (paperMapper.findByCode(code) != null) continue;
            importOne(p);
            imported++;
        }
        log.info("[ExamSeed] 选择性导入完成：本次 {} 套", imported);
        return imported;
    }

    private void importOne(JsonNode p) {
        ExamPaper paper = new ExamPaper();
        paper.setCode(p.get("code").asText());
        paper.setTitle(p.get("title").asText());
        paper.setStatus(p.has("status") ? p.get("status").asText() : "PUBLISHED");
        paper.setCreatedBy("SEED");
        paperMapper.insert(paper);

        JsonNode sections = p.get("sections");
        if (sections == null || !sections.isArray()) return;
        for (JsonNode s : sections) {
            ExamPaperSection section = new ExamPaperSection();
            section.setPaperId(paper.getId());
            section.setCode(s.get("code").asText());
            section.setLabel(s.get("label").asText());
            section.setSortOrder(s.get("sortOrder") != null ? s.get("sortOrder").asInt() : 0);
            sectionMapper.insert(section);

            JsonNode questions = s.get("questions");
            if (questions == null || !questions.isArray()) continue;
            for (JsonNode q : questions) {
                ExamPaperQuestion qu = new ExamPaperQuestion();
                qu.setPaperId(paper.getId());
                qu.setSectionId(section.getId());
                qu.setQuestionKey(q.get("questionKey").asText());
                qu.setLabel(q.get("label").asText());
                qu.setType(q.has("type") ? q.get("type").asText() : "choice");
                qu.setRequired(q.has("required") && q.get("required").asBoolean(false) ? 1 : 0);
                qu.setOptionsJson(q.has("options") ? q.get("options").toString() : null);
                qu.setConfigJson(q.has("config") ? q.get("config").toString() : null);
                qu.setShowWhenJson(q.has("showWhen") ? q.get("showWhen").toString() : null);
                qu.setSortOrder(q.get("sortOrder") != null ? q.get("sortOrder").asInt() : 0);
                questionMapper.insert(qu);
            }
        }
    }

    private int countQuestions(JsonNode p) {
        int n = 0;
        JsonNode sections = p.get("sections");
        if (sections != null && sections.isArray()) {
            for (JsonNode s : sections) {
                JsonNode qs = s.get("questions");
                if (qs != null && qs.isArray()) n += qs.size();
            }
        }
        return n;
    }

    private JsonNode loadSeeds() {
        if (seedRoot != null) return seedRoot.get("papers");
        synchronized (this) {
            if (seedRoot != null) return seedRoot.get("papers");
            try {
                ClassPathResource res = new ClassPathResource("seed/exam-seed.json");
                if (!res.exists()) {
                    log.warn("[ExamSeed] 未找到 seed/exam-seed.json");
                    seedRoot = objectMapper.createObjectNode();
                    return seedRoot.get("papers");
                }
                try (InputStream in = res.getInputStream()) {
                    seedRoot = objectMapper.readTree(in);
                }
            } catch (Exception e) {
                log.error("[ExamSeed] 读取 seed/exam-seed.json 失败: {}", e.getMessage());
                seedRoot = objectMapper.createObjectNode();
            }
            return seedRoot.get("papers");
        }
    }
}
