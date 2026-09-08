package com.example.demo.modules.exam.seed;

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
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;

/**
 * 内置试卷种子：启动时把 seed/exam-seed.json 载入 exam_paper* 三张表。
 * 幂等且便宜——以固定 code 前缀（seed-01）做「已播种」判断，已存在即跳过（毫秒级）。
 */
@Component
public class ExamSeedBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ExamSeedBootstrap.class);

    private final ExamPaperMapper paperMapper;
    private final ExamPaperSectionMapper sectionMapper;
    private final ExamPaperQuestionMapper questionMapper;
    private final ObjectMapper objectMapper;

    public ExamSeedBootstrap(ExamPaperMapper paperMapper,
                             ExamPaperSectionMapper sectionMapper,
                             ExamPaperQuestionMapper questionMapper,
                             ObjectMapper objectMapper) {
        this.paperMapper = paperMapper;
        this.sectionMapper = sectionMapper;
        this.questionMapper = questionMapper;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        if (paperMapper.findByCode("seed-01") != null) {
            log.info("[ExamSeed] 内置试卷已存在，跳过播种");
            return;
        }
        ClassPathResource res = new ClassPathResource("seed/exam-seed.json");
        if (!res.exists()) {
            log.warn("[ExamSeed] 未找到 seed/exam-seed.json，跳过播种");
            return;
        }
        JsonNode root;
        try (InputStream in = res.getInputStream()) {
            root = objectMapper.readTree(in);
        }
        JsonNode papers = root.get("papers");
        if (papers == null || !papers.isArray()) {
            log.warn("[ExamSeed] seed/exam-seed.json 无 papers 数组，跳过");
            return;
        }
        int paperCount = 0;
        int questionCount = 0;
        for (JsonNode p : papers) {
            ExamPaper paper = new ExamPaper();
            paper.setCode(p.get("code").asText());
            paper.setTitle(p.get("title").asText());
            paper.setStatus(p.has("status") ? p.get("status").asText() : "PUBLISHED");
            paper.setCreatedBy("SEED");
            paperMapper.insert(paper);
            paperCount++;

            JsonNode sections = p.get("sections");
            if (sections == null || !sections.isArray()) {
                continue;
            }
            for (JsonNode s : sections) {
                ExamPaperSection section = new ExamPaperSection();
                section.setPaperId(paper.getId());
                section.setCode(s.get("code").asText());
                section.setLabel(s.get("label").asText());
                section.setSortOrder(s.get("sortOrder") != null ? s.get("sortOrder").asInt() : 0);
                sectionMapper.insert(section);

                JsonNode questions = s.get("questions");
                if (questions == null || !questions.isArray()) {
                    continue;
                }
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
                    questionCount++;
                }
            }
        }
        log.info("[ExamSeed] 播种完成：试卷 {} 套，题目 {} 道", paperCount, questionCount);
    }
}
