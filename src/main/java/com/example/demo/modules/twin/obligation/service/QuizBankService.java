package com.example.demo.modules.twin.obligation.service;

import com.example.demo.modules.twin.obligation.disposition.QuizBank;
import com.example.demo.modules.twin.obligation.disposition.QuizGradeSupport;
import com.example.demo.modules.twin.obligation.entity.TwinQuizBank;
import com.example.demo.modules.twin.obligation.entity.TwinQuizQuestion;
import com.example.demo.modules.twin.obligation.mapper.TwinQuizBankMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 答题题库：读库 + 回落内置。
 *
 * <p>回落口径很重要：**只有「查询异常」（表缺失等）才回落内置**；
 * 库里查得到但为空，就按空处理——管理员把题删光了是明确意图，不能把内置题又变出来。
 */
@Service
public class QuizBankService {

    private static final Logger log = LoggerFactory.getLogger(QuizBankService.class);

    /** 选项个数下限，低于它题目没有区分度 */
    private static final int MIN_OPTIONS = 2;

    private final TwinQuizBankMapper mapper;
    private final ObjectMapper objectMapper;

    public QuizBankService(TwinQuizBankMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    // ── 读（抽题/判分） ──

    /** 解析题库题目：库优先；空库＝空；仅查询异常回落内置。 */
    public List<QuizBank.Question> questionsOf(String bankId) {
        String id = StringUtils.hasText(bankId) ? bankId.trim() : QuizBank.DEFAULT_BANK_ID;
        try {
            List<TwinQuizQuestion> rows = mapper.selectEnabledByBank(id);
            if (rows == null) {
                return QuizBank.builtinQuestions();
            }
            return rows.stream().map(this::toQuestion).filter(java.util.Objects::nonNull).toList();
        } catch (Exception e) {
            log.warn("[quiz] 读取题库失败，回落内置 bankId={}: {}", id, e.getMessage());
            return QuizBank.builtinQuestions();
        }
    }

    public List<Map<String, Object>> drawPublic(String bankId, int drawCount) {
        return QuizBank.drawPublic(questionsOf(bankId), drawCount);
    }

    /** 按策略配置判分：config 里读 questionBankId / passCount。 */
    public boolean passed(String configJson, String answerRaw) {
        return QuizGradeSupport.passed(objectMapper, configJson, answerRaw, this::questionsOf);
    }

    /**
     * 按策略配置里的 questionBankId 取题库题目。
     *
     * <p>给「处置详情」按**同一份题目**算分用：抽题与判分都走库，详情若按内置题库算，
     * 两套题目 id 命名空间不同（库是 "1".."5"，内置是 "q1".."q5"），会恒算 0 分。
     */
    public List<QuizBank.Question> questionsForConfig(String configJson) {
        String bankId = QuizBank.DEFAULT_BANK_ID;
        try {
            if (StringUtils.hasText(configJson)) {
                JsonNode cfg = objectMapper.readTree(configJson);
                if (cfg.hasNonNull("questionBankId")) {
                    bankId = cfg.get("questionBankId").asText(QuizBank.DEFAULT_BANK_ID);
                }
            }
        } catch (Exception ignored) {
            /* 配置坏了就按默认库 */
        }
        return questionsOf(bankId);
    }

    // ── 后台管理 ──

    public List<TwinQuizBank> listBanks() {
        return mapper.listBanks();
    }

    /** 题库题目数（含停用题；后台列表用）。 */
    public int questionCount(String bankId) {
        if (!StringUtils.hasText(bankId)) {
            return 0;
        }
        return mapper.countQuestions(bankId.trim());
    }

    public List<TwinQuizQuestion> listQuestions(String bankId) {
        if (!StringUtils.hasText(bankId)) {
            throw new IllegalArgumentException("缺少题库编码");
        }
        return mapper.selectAllByBank(bankId.trim());
    }

    public TwinQuizBank createBank(String bankId, String name) {
        if (!StringUtils.hasText(bankId)) {
            throw new IllegalArgumentException("缺少题库编码");
        }
        String id = bankId.trim();
        if (mapper.selectBank(id) != null) {
            throw new IllegalArgumentException("题库编码已存在：" + id);
        }
        TwinQuizBank row = new TwinQuizBank();
        row.setBankId(id);
        row.setName(StringUtils.hasText(name) ? name.trim() : id);
        row.setEnabled(1);
        mapper.insertBank(row);
        return row;
    }

    public void updateBank(String bankId, String name, Integer enabled) {
        TwinQuizBank existing = mapper.selectBank(bankId);
        if (existing == null) {
            throw new IllegalArgumentException("题库不存在：" + bankId);
        }
        existing.setName(StringUtils.hasText(name) ? name.trim() : existing.getName());
        existing.setEnabled(enabled == null ? existing.getEnabled() : (enabled == 1 ? 1 : 0));
        mapper.updateBank(existing);
    }

    /** 删库连带删题（题目表以 bank_id 关联，无外键）。默认库不允许删。 */
    public void deleteBank(String bankId) {
        if (!StringUtils.hasText(bankId)) {
            throw new IllegalArgumentException("缺少题库编码");
        }
        String id = bankId.trim();
        if (QuizBank.DEFAULT_BANK_ID.equals(id)) {
            throw new IllegalArgumentException("默认题库不可删除");
        }
        for (TwinQuizQuestion q : mapper.selectAllByBank(id)) {
            mapper.deleteQuestion(q.getId());
        }
        mapper.deleteBank(id);
    }

    public TwinQuizQuestion createQuestion(String bankId, String prompt, List<String> options, Integer correctIndex) {
        if (!StringUtils.hasText(bankId)) {
            throw new IllegalArgumentException("缺少题库编码");
        }
        String id = bankId.trim();
        validateQuestion(prompt, options, correctIndex);
        TwinQuizQuestion row = new TwinQuizQuestion();
        row.setBankId(id);
        row.setPrompt(prompt.trim());
        row.setOptionsJson(writeOptions(options));
        row.setCorrectIndex(correctIndex);
        row.setEnabled(1);
        Integer next = mapper.nextSortOrder(id);
        row.setSortOrder(next == null ? 1 : next);
        mapper.insertQuestion(row);
        return row;
    }

    public TwinQuizQuestion updateQuestion(long id, String prompt, List<String> options, Integer correctIndex, Integer enabled) {
        TwinQuizQuestion existing = mapper.selectQuestion(id);
        if (existing == null) {
            throw new IllegalArgumentException("题目不存在：" + id);
        }
        validateQuestion(prompt, options, correctIndex);
        existing.setPrompt(prompt.trim());
        existing.setOptionsJson(writeOptions(options));
        existing.setCorrectIndex(correctIndex);
        existing.setEnabled(enabled == null ? existing.getEnabled() : (enabled == 1 ? 1 : 0));
        mapper.updateQuestion(existing);
        return existing;
    }

    public void deleteQuestion(long id) {
        if (mapper.selectQuestion(id) == null) {
            throw new IllegalArgumentException("题目不存在：" + id);
        }
        mapper.deleteQuestion(id);
    }

    // ── 内部 ──

    private void validateQuestion(String prompt, List<String> options, Integer correctIndex) {
        if (!StringUtils.hasText(prompt)) {
            throw new IllegalArgumentException("题干不能为空");
        }
        if (options == null || options.size() < MIN_OPTIONS) {
            throw new IllegalArgumentException("至少需要 " + MIN_OPTIONS + " 个选项");
        }
        for (String o : options) {
            if (!StringUtils.hasText(o)) {
                throw new IllegalArgumentException("选项不能为空");
            }
        }
        if (correctIndex == null || correctIndex < 0 || correctIndex >= options.size()) {
            throw new IllegalArgumentException("正确答案超出选项范围");
        }
    }

    private String writeOptions(List<String> options) {
        try {
            return objectMapper.writeValueAsString(options);
        } catch (Exception e) {
            throw new IllegalArgumentException("选项序列化失败: " + e.getMessage());
        }
    }

    private QuizBank.Question toQuestion(TwinQuizQuestion row) {
        if (row == null || !StringUtils.hasText(row.getOptionsJson())) {
            return null;
        }
        try {
            List<String> options = objectMapper.readValue(row.getOptionsJson(), new TypeReference<List<String>>() {
            });
            if (options == null || options.isEmpty()) {
                return null;
            }
            int correct = row.getCorrectIndex() == null ? 0 : row.getCorrectIndex();
            if (correct < 0 || correct >= options.size()) {
                log.warn("[quiz] 题目正确答案越界，已忽略 id={} correctIndex={}", row.getId(), correct);
                return null;
            }
            return new QuizBank.Question(String.valueOf(row.getId()), row.getPrompt(), List.copyOf(options), correct);
        } catch (Exception e) {
            log.warn("[quiz] 题目选项解析失败，已忽略 id={}: {}", row.getId(), e.getMessage());
            return null;
        }
    }

    /** 供后台表单回显：把 optionsJson 解析成数组，解析失败给空数组。 */
    public List<String> optionsOf(TwinQuizQuestion row) {
        if (row == null || !StringUtils.hasText(row.getOptionsJson())) {
            return Collections.emptyList();
        }
        try {
            List<String> options = objectMapper.readValue(row.getOptionsJson(), new TypeReference<List<String>>() {
            });
            return options == null ? Collections.emptyList() : new ArrayList<>(options);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}
