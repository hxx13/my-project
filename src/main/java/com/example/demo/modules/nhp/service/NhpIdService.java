package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfIdRule;
import com.example.demo.modules.nhp.entity.CrfSequence;
import com.example.demo.modules.nhp.mapper.CrfIdRuleMapper;
import com.example.demo.modules.nhp.mapper.CrfSequenceMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * NHP ID 取号：crf_sequence 按 (id_type, scope_key) 原子递增；按 crf_id_rule 格式化。
 * 对齐 22 §4 / V20260821027。
 */
@Service
public class NhpIdService {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([^}]+)}");

    private final CrfSequenceMapper sequenceMapper;
    private final CrfIdRuleMapper idRuleMapper;

    public NhpIdService(CrfSequenceMapper sequenceMapper, CrfIdRuleMapper idRuleMapper) {
        this.sequenceMapper = sequenceMapper;
        this.idRuleMapper = idRuleMapper;
    }

    /**
     * 原子取号：按 (id_type, scope_key) 递增。derived 规则不应调用本方法。
     */
    @Transactional
    public long next(String idType, Map<String, Object> ctx) {
        String scopeKey = buildScopeKey(idType, ctx == null ? Map.of() : ctx);
        if (sequenceMapper.findByScope(idType, scopeKey) == null) {
            CrfSequence seq = new CrfSequence();
            seq.setIdType(idType);
            seq.setScopeKey(scopeKey);
            // 兼容旧列：尽量回填 center/year
            seq.setCenterCode(str(ctx, "center", "centerCode", "base", "farm"));
            Integer year = intOf(ctx, "year");
            seq.setYear(year != null ? year : LocalDate.now().getYear());
            seq.setNextValue(0);
            try {
                sequenceMapper.insert(seq);
            } catch (Exception ignored) {
                // 并发下唯一键冲突
            }
        }
        sequenceMapper.incrementByScope(idType, scopeKey);
        CrfSequence cur = sequenceMapper.findByScope(idType, scopeKey);
        return cur == null ? 1L : cur.getNextValue();
    }

    /** 兼容旧签名：center+year → scope_key={center}|{year}。 */
    @Transactional
    public long next(String idType, String centerCode, Integer year) {
        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("center", centerCode == null ? "" : centerCode);
        ctx.put("centerCode", centerCode == null ? "" : centerCode);
        ctx.put("year", year != null ? year : LocalDate.now().getYear());
        return next(idType, ctx);
    }

    /**
     * 按规则拼完整 ID。未解析占位符抛异常（禁止静默返回字面量）。
     * derived 规则不取号，ctx 须自带全部非 seq 占位符。
     */
    public String buildCode(String idType, Map<String, Object> ctx) {
        Map<String, Object> c = ctx == null ? Map.of() : ctx;
        CrfIdRule rule = firstRule(idType);
        boolean derived = rule != null && Boolean.TRUE.equals(rule.getDerived());
        long seq = 0L;
        if (!derived) {
            Object seqObj = c.get("seq");
            if (seqObj instanceof Number n) {
                seq = n.longValue();
            } else {
                seq = next(idType, c);
            }
        }
        String pattern = rule != null && rule.getPattern() != null
                ? rule.getPattern()
                : defaultPattern(idType);
        return applyPattern(pattern, idType, c, seq);
    }

    /** 兼容旧签名。 */
    public String buildCode(String idType, String centerCode, Integer year, long seq) {
        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("center", centerCode == null ? "" : centerCode);
        ctx.put("centerCode", centerCode == null ? "" : centerCode);
        ctx.put("year", year != null ? year : LocalDate.now().getYear());
        ctx.put("seq", seq);
        return buildCode(idType, ctx);
    }

    /**
     * 预览下一编号：读取当前序列下一值并格式化，不递增、不持久化。
     * derived 规则不取号，ctx 须自带全部非 seq 占位符。
     */
    public String previewCode(String idType, Map<String, Object> ctx) {
        Map<String, Object> c = ctx == null ? new LinkedHashMap<>() : new LinkedHashMap<>(ctx);
        CrfIdRule rule = firstRule(idType);
        boolean derived = rule != null && Boolean.TRUE.equals(rule.getDerived());
        long seq = 0L;
        if (!derived) {
            Object seqObj = c.get("seq");
            if (seqObj instanceof Number n) {
                seq = n.longValue();
            } else {
                seq = peekNext(idType, c);
            }
        }
        String pattern = rule != null && rule.getPattern() != null
                ? rule.getPattern()
                : defaultPattern(idType);
        return applyPattern(pattern, idType, c, seq);
    }

    /** 读取下一序号（next_value + 1），无序列行时返回 1；不修改 crf_sequence。 */
    public long peekNext(String idType, Map<String, Object> ctx) {
        String scopeKey = buildScopeKey(idType, ctx == null ? Map.of() : ctx);
        CrfSequence cur = sequenceMapper.findByScope(idType, scopeKey);
        if (cur == null || cur.getNextValue() == null) {
            return 1L;
        }
        return cur.getNextValue().longValue() + 1L;
    }

    /** 各 ID 类型 scope_key 拼法（22 §4.1 / 28 易错点 6）。 */
    public String buildScopeKey(String idType, Map<String, Object> ctx) {
        String type = idType == null ? "" : idType.toUpperCase(Locale.ROOT);
        return switch (type) {
            case "DON" -> join(str(ctx, "base", "farm", "farmCode"), year2(ctx));
            case "RCP", "TX" -> join(str(ctx, "center", "centerCode"), year2(ctx));
            case "AE", "LVL" -> join(str(ctx, "tx", "TX", "txCode"), str(ctx, "date", "日期"));
            case "MED" -> nz(str(ctx, "reg", "REG", "regimenCode"));
            case "SMP" -> join(str(ctx, "tx", "TX", "txCode"),
                    str(ctx, "tp", "TP", "timepoint"),
                    str(ctx, "sampleType", "样本类型"));
            case "PATH", "FU" -> join(str(ctx, "tx", "TX", "txCode"), str(ctx, "tp", "TP", "timepoint"));
            case "REG" -> nz(str(ctx, "tx", "TX", "txCode"));
            case "XM" -> join(str(ctx, "donor", "DONOR", "DON"), str(ctx, "recip", "RECIP", "recipient"));
            case "TST" -> join(str(ctx, "lab", "实验室"), str(ctx, "yearmonth", "年月"));
            case "PERF" -> join(str(ctx, "don", "DON", "DONOR", "donor"), str(ctx, "date", "日期"));
            case "NHP_PROJ" -> nz(year2(ctx));
            default -> join(str(ctx, "center", "centerCode"), year2(ctx));
        };
    }

    private String applyPattern(String pattern, String idType, Map<String, Object> ctx, long seq) {
        Map<String, String> vals = new LinkedHashMap<>();
        vals.put("base", nz(str(ctx, "base", "farm", "farmCode")));
        vals.put("center", nz(str(ctx, "center", "centerCode")));
        vals.put("year", year2(ctx));
        vals.put("seq", String.valueOf(seq));
        vals.put("seq:2", pad(seq, 2));
        vals.put("seq:3", pad(seq, 3));
        vals.put("seq:4", pad(seq, 4));
        vals.put("DONOR", nz(str(ctx, "DONOR", "donor", "DON")));
        vals.put("DON", nz(str(ctx, "DON", "DONOR", "donor", "don")));
        vals.put("RECIP", nz(str(ctx, "RECIP", "recip", "recipient")));
        vals.put("TX", nz(str(ctx, "TX", "tx", "txCode")));
        vals.put("REG", nz(str(ctx, "REG", "reg", "regimenCode")));
        vals.put("TEST_ID", nz(str(ctx, "TEST_ID", "testId", "testCode")));
        vals.put("TP", nz(str(ctx, "TP", "tp", "timepoint")));
        vals.put("日期", nz(str(ctx, "日期", "date")));
        vals.put("年月", nz(str(ctx, "年月", "yearmonth")));
        vals.put("样本类型", nz(str(ctx, "样本类型", "sampleType")));
        vals.put("实验室", nz(str(ctx, "实验室", "lab")));
        vals.put("项目码", nz(str(ctx, "项目码", "assay", "assayCode")));

        Matcher m = PLACEHOLDER.matcher(pattern);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String key = m.group(1);
            if (!vals.containsKey(key)) {
                throw new IllegalArgumentException("未解析的编码占位符 {" + key + "}，idType=" + idType);
            }
            String val = vals.get(key);
            if (val == null || val.isEmpty()) {
                // seq 类允许 0；其余空值视为未提供
                if (!key.startsWith("seq")) {
                    throw new IllegalArgumentException("编码占位符 {" + key + "} 值为空，idType=" + idType);
                }
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(val == null ? "" : val));
        }
        m.appendTail(sb);
        // 二次检查：残留花括号
        if (sb.indexOf("{") >= 0) {
            throw new IllegalArgumentException("编码结果仍含未解析占位符: " + sb + "，idType=" + idType);
        }
        return sb.toString();
    }

    private CrfIdRule firstRule(String idType) {
        List<CrfIdRule> rules = idRuleMapper.listByType(idType);
        return (rules == null || rules.isEmpty()) ? null : rules.get(0);
    }

    private String defaultPattern(String idType) {
        String type = idType == null ? "ID" : idType.toUpperCase(Locale.ROOT);
        return type + "-{center}{year}-{seq:3}";
    }

    private static String year2(Map<String, Object> ctx) {
        Integer y = intOf(ctx, "year");
        int year = y != null ? y : LocalDate.now().getYear();
        return String.valueOf(year % 100);
    }

    private static Integer intOf(Map<String, Object> ctx, String key) {
        Object v = ctx.get(key);
        if (v instanceof Number n) return n.intValue();
        if (v == null) return null;
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String str(Map<String, Object> ctx, String... keys) {
        for (String k : keys) {
            Object v = ctx.get(k);
            if (v == null) continue;
            String s = String.valueOf(v).trim();
            if (!s.isEmpty()) return s;
        }
        return null;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (sb.length() > 0) sb.append('|');
            sb.append(p == null ? "" : p);
        }
        return sb.toString();
    }

    private static String pad(long n, int width) {
        return String.format("%0" + width + "d", n);
    }
}
