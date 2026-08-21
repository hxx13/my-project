package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfIdRule;
import com.example.demo.modules.nhp.entity.CrfSequence;
import com.example.demo.modules.nhp.mapper.CrfIdRuleMapper;
import com.example.demo.modules.nhp.mapper.CrfSequenceMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/** NHP ID 取号：crf_sequence 原子递增（防并发重号），按 crf_id_rule 格式化编码。 */
@Service
public class NhpIdService {

    private final CrfSequenceMapper sequenceMapper;
    private final CrfIdRuleMapper idRuleMapper;

    public NhpIdService(CrfSequenceMapper sequenceMapper, CrfIdRuleMapper idRuleMapper) {
        this.sequenceMapper = sequenceMapper;
        this.idRuleMapper = idRuleMapper;
    }

    /**
     * 原子取号：确保 (id_type, center_code, year) 序列行存在后，单条 UPDATE 原子 +1。
     * 并发安全——INSERT 冲突忽略，UPDATE 自带行锁。
     */
    @Transactional
    public long next(String idType, String centerCode, Integer year) {
        String center = centerCode == null ? "" : centerCode;
        int y = year != null ? year : LocalDate.now().getYear();
        if (sequenceMapper.findByKey(idType, center, y) == null) {
            CrfSequence seq = new CrfSequence();
            seq.setIdType(idType);
            seq.setCenterCode(center);
            seq.setYear(y);
            seq.setNextValue(0);
            try {
                sequenceMapper.insert(seq);
            } catch (Exception ignored) {
                // 并发下唯一键冲突，另一事务已建行，忽略
            }
        }
        sequenceMapper.increment(idType, center, y);
        CrfSequence cur = sequenceMapper.findByKey(idType, center, y);
        return cur == null ? 1L : cur.getNextValue();
    }

    /** 按 04 编码规则把序号拼成完整 ID（16 类）。pattern 优先，未配置走内置兜底。 */
    public String buildCode(String idType, String centerCode, Integer year, long seq) {
        String center = centerCode == null ? "" : centerCode;
        int y = year != null ? year : LocalDate.now().getYear();
        List<CrfIdRule> rules = idRuleMapper.listByType(idType);
        if (rules != null && !rules.isEmpty()) {
            String pattern = rules.get(0).getPattern();
            if (pattern != null && pattern.contains("{")) {
                return pattern
                        .replace("{center}", center)
                        .replace("{year}", String.valueOf(y % 100))
                        .replace("{seq}", String.valueOf(seq))
                        .replace("{seq:4}", pad(seq, 4))
                        .replace("{seq:3}", pad(seq, 3))
                        .replace("{seq:2}", pad(seq, 2));
            }
        }
        return defaultCode(idType, center, y, seq);
    }

    /** 内置兜底格式：{idType}-{center}{year后两位}-{seq}，如 DON-SH26-0031。 */
    private String defaultCode(String idType, String center, int year, long seq) {
        String type = idType == null ? "ID" : idType.toUpperCase(Locale.ROOT);
        return type + "-" + center + String.valueOf(year % 100) + "-" + pad(seq, 3);
    }

    private String pad(long n, int width) {
        return String.format("%0" + width + "d", n);
    }
}
