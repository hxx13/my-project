package com.example.demo.modules.exam.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.exam.entity.ExamPaper;
import com.example.demo.modules.exam.entity.ExamPaperQuestion;
import com.example.demo.modules.exam.entity.ExamSubmission;
import com.example.demo.modules.exam.mapper.ExamPaperMapper;
import com.example.demo.modules.exam.mapper.ExamPaperQuestionMapper;
import com.example.demo.modules.exam.mapper.ExamSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 答卷与自动评分。评分口径：仅 choice 题计分；单题分值取 config.score，未设则等权重（满分 100）；
 * 得分 = Σ(答对题分值)，合格 = 得分 ≥ qualify_score（默认 80）。
 */
@Service
public class ExamSubmissionService {

    private final ExamPaperMapper paperMapper;
    private final ExamPaperQuestionMapper questionMapper;
    private final ExamSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper;

    public ExamSubmissionService(ExamPaperMapper paperMapper,
                                 ExamPaperQuestionMapper questionMapper,
                                 ExamSubmissionMapper submissionMapper,
                                 ObjectMapper objectMapper) {
        this.paperMapper = paperMapper;
        this.questionMapper = questionMapper;
        this.submissionMapper = submissionMapper;
        this.objectMapper = objectMapper;
    }

    /** 提交答卷 → 评分 → 写 exam_submission（重交覆盖）。返回 {totalScore, maxScore, qualifyYn, perQuestion}。 */
    @Transactional
    public Map<String, Object> submit(Long paperId, String personId, Map<String, Object> answers, String filesJson) {
        ExamPaper paper = paperMapper.findById(paperId);
        if (paper == null) throw TwinBusinessException.of(404, "试卷不存在");

        List<ExamPaperQuestion> choiceQs = new ArrayList<>();
        for (ExamPaperQuestion q : questionMapper.listByPaperId(paperId)) {
            if ("choice".equals(q.getType())) choiceQs.add(q);
        }
        int n = choiceQs.size();

        double maxScore = 0;
        for (ExamPaperQuestion q : choiceQs) maxScore += scoreOf(q, n);

        double earned = 0;
        Map<String, Object> scoreMap = new LinkedHashMap<>();
        for (ExamPaperQuestion q : choiceQs) {
            boolean correct = isCorrect(q, answers == null ? null : answers.get(q.getQuestionKey()));
            double sc = scoreOf(q, n);
            if (correct) earned += sc;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("correct", correct);
            item.put("earned", correct ? sc : 0.0);
            scoreMap.put(q.getQuestionKey(), item);
        }

        int qualifyScore = paper.getQualifyScore() != null ? paper.getQualifyScore() : 80;
        boolean qualify = n > 0 && earned >= qualifyScore;

        ExamSubmission s = submissionMapper.findByPaperAndPerson(paperId, personId);
        if (s == null) {
            s = new ExamSubmission();
            s.setPaperId(paperId);
            s.setPersonId(personId);
        }
        s.setAnswersJson(toJson(answers));
        s.setScoreJson(toJson(scoreMap));
        s.setTotalScore(earned);
        s.setQualifyScoreSnapshot(qualifyScore);
        s.setQualifyYn(qualify ? 1 : 0);
        s.setFilesJson(filesJson);
        if (s.getId() == null) submissionMapper.insert(s);
        else submissionMapper.update(s);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalScore", earned);
        out.put("maxScore", maxScore);
        out.put("qualifyScore", qualifyScore);
        out.put("qualifyYn", qualify ? 1 : 0);
        out.put("perQuestion", scoreMap);
        return out;
    }

    /** 某试卷全部答卷（成绩管理 tab） */
    public List<ExamSubmission> listByPaper(Long paperId) {
        return submissionMapper.listByPaperId(paperId);
    }

    /** 全部答卷 */
    public List<ExamSubmission> listAll() {
        return submissionMapper.listAll();
    }

    /** 单份答卷详情（含 answers/score json） */
    public ExamSubmission get(Long id) {
        ExamSubmission s = submissionMapper.findById(id);
        if (s == null) throw TwinBusinessException.of(404, "答卷不存在");
        return s;
    }

    // ── 评分内部工具 ──

    private double scoreOf(ExamPaperQuestion q, int n) {
        Map<String, Object> cfg = parseConfig(q);
        Object sc = cfg.get("score");
        if (sc instanceof Number num) return num.doubleValue();
        return n > 0 ? 100.0 / n : 0.0;
    }

    private boolean isCorrect(ExamPaperQuestion q, Object answerValue) {
        Map<String, Object> cfg = parseConfig(q);
        boolean multiple = "multiple".equals(cfg.get("choiceType"));
        if (multiple) {
            List<String> correct = strList(cfg.get("answers"));
            List<String> given = strList(answerValue);
            correct.sort(String::compareTo);
            given.sort(String::compareTo);
            return !correct.isEmpty() && correct.equals(given);
        }
        Object ans = cfg.get("answer");
        String given = answerValue == null ? null : String.valueOf(answerValue);
        return ans != null && String.valueOf(ans).equals(given);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseConfig(ExamPaperQuestion q) {
        if (q.getConfigJson() == null || q.getConfigJson().isBlank()) return Map.of();
        try {
            Object o = objectMapper.readValue(q.getConfigJson(), Object.class);
            return o instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
        } catch (Exception e) {
            return Map.of();
        }
    }

    private List<String> strList(Object v) {
        if (v == null) return new ArrayList<>();
        List<String> out = new ArrayList<>();
        if (v instanceof List<?> list) {
            for (Object x : list) if (x != null) out.add(String.valueOf(x));
        } else {
            out.add(String.valueOf(v));
        }
        return out;
    }

    private String toJson(Object o) {
        if (o == null) return null;
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }
}
