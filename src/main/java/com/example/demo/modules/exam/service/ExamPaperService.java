package com.example.demo.modules.exam.service;

import com.example.demo.modules.exam.entity.ExamPaper;
import com.example.demo.modules.exam.entity.ExamPaperQuestion;
import com.example.demo.modules.exam.entity.ExamPaperSection;
import com.example.demo.modules.exam.mapper.ExamPaperMapper;
import com.example.demo.modules.exam.mapper.ExamPaperQuestionMapper;
import com.example.demo.modules.exam.mapper.ExamPaperSectionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 试卷（单层 section + field）CRUD。持久化形状对齐 {@code NhpTemplateService}，
 * 但无 subsection / role / dict / atom。
 */
@Service
public class ExamPaperService {

    private final ExamPaperMapper paperMapper;
    private final ExamPaperSectionMapper sectionMapper;
    private final ExamPaperQuestionMapper questionMapper;
    private final ObjectMapper objectMapper;

    public ExamPaperService(ExamPaperMapper paperMapper,
                            ExamPaperSectionMapper sectionMapper,
                            ExamPaperQuestionMapper questionMapper,
                            ObjectMapper objectMapper) {
        this.paperMapper = paperMapper;
        this.sectionMapper = sectionMapper;
        this.questionMapper = questionMapper;
        this.objectMapper = objectMapper;
    }

    public List<Map<String, Object>> list(String keyword) {
        List<ExamPaper> papers = paperMapper.list();
        List<Map<String, Object>> out = new ArrayList<>();
        String k = keyword == null ? null : keyword.trim().toLowerCase();
        for (ExamPaper p : papers) {
            if (k != null && !k.isEmpty()
                    && !contains(p.getCode(), k) && !contains(p.getTitle(), k)) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("code", p.getCode());
            m.put("title", p.getTitle());
            m.put("status", p.getStatus());
            m.put("createdAt", p.getCreatedAt());
            m.put("updatedAt", p.getUpdatedAt());
            out.add(m);
        }
        return out;
    }

    public Map<String, Object> get(Long id) {
        ExamPaper paper = paperMapper.findById(id);
        if (paper == null) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", paper.getId());
        out.put("code", paper.getCode());
        out.put("title", paper.getTitle());
        out.put("status", paper.getStatus());

        List<ExamPaperSection> sections = sectionMapper.listByPaperId(id);
        List<ExamPaperQuestion> questions = questionMapper.listByPaperId(id);
        Map<Long, List<Map<String, Object>>> fieldsBySection = new LinkedHashMap<>();
        for (ExamPaperQuestion q : questions) {
            fieldsBySection.computeIfAbsent(q.getSectionId(), x -> new ArrayList<>()).add(toFieldJson(q));
        }

        List<Map<String, Object>> sectionJson = new ArrayList<>();
        for (ExamPaperSection s : sections) {
            Map<String, Object> sec = new LinkedHashMap<>();
            sec.put("id", s.getId());
            sec.put("code", s.getCode());
            sec.put("label", s.getLabel());
            sec.put("sortOrder", s.getSortOrder());
            sec.put("fields", fieldsBySection.getOrDefault(s.getId(), List.of()));
            sectionJson.add(sec);
        }
        out.put("sections", sectionJson);
        return out;
    }

    @Transactional
    public Map<String, Object> create(String code, String title, String operatorId) {
        ExamPaper p = new ExamPaper();
        p.setCode(code);
        p.setTitle(title);
        p.setStatus("DRAFT");
        p.setCreatedBy(operatorId);
        paperMapper.insert(p);
        return get(p.getId());
    }

    @Transactional
    public Map<String, Object> save(Long id, Map<String, Object> body, String operatorId) {
        ExamPaper paper = paperMapper.findById(id);
        if (paper == null) return null;
        if (body.get("title") != null) {
            paper.setTitle(str(body.get("title")));
        }
        paperMapper.update(paper);

        sectionMapper.deleteByPaperId(id);
        questionMapper.deleteByPaperId(id);

        int secOrder = 0;
        for (Map<String, Object> sec : listOf(body.get("sections"))) {
            ExamPaperSection s = new ExamPaperSection();
            s.setPaperId(id);
            s.setCode(str(sec.get("code")));
            s.setLabel(str(sec.get("label")));
            s.setSortOrder(secOrder++);
            sectionMapper.insert(s);

            int fieldOrder = 0;
            for (Map<String, Object> f : listOf(sec.get("fields"))) {
                ExamPaperQuestion q = new ExamPaperQuestion();
                q.setPaperId(id);
                q.setSectionId(s.getId());
                q.setQuestionKey(str(f.get("questionKey")));
                q.setLabel(str(f.get("label")));
                q.setType(str(f.get("type")));
                q.setRequired(Boolean.TRUE.equals(f.get("required")) ? 1 : 0);
                q.setOptionsJson(toJson(f.get("options")));
                q.setShowWhenJson(toJson(f.get("showWhen")));
                q.setConfigJson(toJson(f.get("config")));
                q.setSortOrder(fieldOrder++);
                questionMapper.insert(q);
            }
        }
        return get(id);
    }

    @Transactional
    public Map<String, Object> publish(Long id) {
        paperMapper.updateStatus(id, "PUBLISHED");
        return get(id);
    }

    @Transactional
    public int delete(Long id) {
        sectionMapper.deleteByPaperId(id);
        questionMapper.deleteByPaperId(id);
        return paperMapper.delete(id);
    }

    private Map<String, Object> toFieldJson(ExamPaperQuestion q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", q.getId());
        m.put("questionKey", q.getQuestionKey());
        m.put("label", q.getLabel());
        m.put("type", q.getType());
        m.put("required", Integer.valueOf(1).equals(q.getRequired()));
        if (q.getOptionsJson() != null) m.put("options", fromJson(q.getOptionsJson()));
        if (q.getShowWhenJson() != null) m.put("showWhen", fromJson(q.getShowWhenJson()));
        m.put("sortOrder", q.getSortOrder());
        if (q.getConfigJson() != null) m.put("config", fromJson(q.getConfigJson()));
        return m;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOf(Object o) {
        if (!(o instanceof List<?> list)) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
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

    private Object fromJson(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return objectMapper.readValue(s, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private boolean contains(String v, String k) {
        return v != null && v.toLowerCase().contains(k);
    }
}
