package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoFieldDictionary;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldDictionaryMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 笼位字段字典套 + 域/子模块结构大纲（「新建文件夹」的核心后端）。
 * structure_json 存 {domains:[{code,name,sortOrder,submodules:[{code,name,sortOrder}]}]}。
 */
@Service
public class CageInfoDictionaryService {

    private static final Pattern DOMAIN_CODE = Pattern.compile("^D\\d{1,3}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SUBMODULE_CODE = Pattern.compile("^D\\d{1,3}\\.\\d+$", Pattern.CASE_INSENSITIVE);

    private final CageInfoFieldDictionaryMapper dictionaryMapper;
    private final CageInfoFieldMapper fieldMapper;
    private final ObjectMapper objectMapper;

    public CageInfoDictionaryService(CageInfoFieldDictionaryMapper dictionaryMapper,
                                     CageInfoFieldMapper fieldMapper,
                                     ObjectMapper objectMapper) {
        this.dictionaryMapper = dictionaryMapper;
        this.fieldMapper = fieldMapper;
        this.objectMapper = objectMapper;
    }

    public List<CageInfoFieldDictionary> list() {
        List<CageInfoFieldDictionary> all = dictionaryMapper.selectAllActive();
        for (CageInfoFieldDictionary d : all) {
            d.setFieldCount(fieldMapper.selectAll().size());
        }
        return all;
    }

    public CageInfoFieldDictionary requireByKey(String dictKey) {
        if (dictKey == null || dictKey.isBlank()) {
            throw new TwinBusinessException(400, "dictKey 不能为空");
        }
        CageInfoFieldDictionary d = dictionaryMapper.selectByDictKey(dictKey.trim());
        if (d == null || Boolean.FALSE.equals(d.getActive())) {
            throw new TwinBusinessException(404, "字段字典不存在: " + dictKey);
        }
        return d;
    }

    public Map<String, Object> getStructure(String dictKey) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        StructureRoot root = readStructure(cur);
        mergeFromFields(root);
        return toMap(root);
    }

    @Transactional
    public Map<String, Object> addDomain(String dictKey, Map<String, Object> body) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        String code = str(body == null ? null : body.get("code"));
        String name = str(body == null ? null : body.get("name"));
        if (code == null || !DOMAIN_CODE.matcher(code).matches()) {
            throw new TwinBusinessException(400, "数据域编码须为 Dn 形式（如 D1）");
        }
        code = code.toUpperCase(Locale.ROOT);
        if (name == null || name.isBlank()) {
            name = "数据域 " + code;
        }
        StructureRoot root = readStructure(cur);
        if (findDomain(root, code) != null) {
            throw new TwinBusinessException(409, "数据域已存在: " + code);
        }
        DomainNode d = new DomainNode();
        d.code = code;
        d.name = name;
        d.sortOrder = nextDomainSortOrder(root);
        d.submodules = new ArrayList<>();
        root.domains.add(d);
        persistStructure(cur, root);
        return toMap(root);
    }

    @Transactional
    public Map<String, Object> renameDomain(String dictKey, String domainCode, Map<String, Object> body) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        String code = upper(domainCode);
        if (code == null || !DOMAIN_CODE.matcher(code).matches()) {
            throw new TwinBusinessException(400, "数据域编码须为 Dn 形式");
        }
        String name = str(body == null ? null : body.get("name"));
        if (name == null || name.isBlank()) {
            throw new TwinBusinessException(400, "显示名不能为空");
        }
        StructureRoot root = readStructure(cur);
        mergeFromFields(root);
        DomainNode domain = findDomain(root, code);
        if (domain == null) {
            throw new TwinBusinessException(404, "数据域不存在: " + code);
        }
        domain.name = name;
        persistStructure(cur, root);
        return toMap(root);
    }

    @Transactional
    public Map<String, Object> addSubmodule(String dictKey, Map<String, Object> body) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        String domainCode = upper(str(body == null ? null : body.get("domainCode")));
        String code = upper(str(body == null ? null : body.get("code")));
        String name = str(body == null ? null : body.get("name"));
        if (domainCode == null || !DOMAIN_CODE.matcher(domainCode).matches()) {
            throw new TwinBusinessException(400, "domainCode 须为 Dn 形式");
        }
        if (code == null || !SUBMODULE_CODE.matcher(code).matches()) {
            throw new TwinBusinessException(400, "子模块编码须为 Dn.mm 形式");
        }
        if (!code.startsWith(domainCode + ".")) {
            throw new TwinBusinessException(400, "子模块编码须以 " + domainCode + ". 开头");
        }
        if (name == null || name.isBlank()) {
            name = "子模块 " + code;
        }
        StructureRoot root = readStructure(cur);
        DomainNode domain = findDomain(root, domainCode);
        if (domain == null) {
            throw new TwinBusinessException(400, "请先创建数据域 " + domainCode);
        }
        if (findSub(domain, code) != null) {
            throw new TwinBusinessException(409, "子模块已存在: " + code);
        }
        SubNode s = new SubNode();
        s.code = code;
        s.name = name;
        s.sortOrder = nextSubSortOrder(domain);
        domain.submodules.add(s);
        persistStructure(cur, root);
        return toMap(root);
    }

    @Transactional
    public Map<String, Object> renameSubmodule(String dictKey, String submoduleCode, Map<String, Object> body) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        String code = upper(submoduleCode);
        if (code == null || !SUBMODULE_CODE.matcher(code).matches()) {
            throw new TwinBusinessException(400, "子模块编码须为 Dn.mm 形式");
        }
        String name = str(body == null ? null : body.get("name"));
        if (name == null || name.isBlank()) {
            throw new TwinBusinessException(400, "显示名不能为空");
        }
        String domainCode = code.substring(0, code.indexOf('.'));
        StructureRoot root = readStructure(cur);
        mergeFromFields(root);
        DomainNode domain = findDomain(root, domainCode);
        SubNode sub = domain != null ? findSub(domain, code) : null;
        if (sub == null) {
            // 大纲尚无该子模块时补建
            if (domain == null) {
                throw new TwinBusinessException(404, "数据域不存在: " + domainCode);
            }
            sub = new SubNode();
            sub.code = code;
            sub.name = name;
            sub.sortOrder = nextSubSortOrder(domain);
            domain.submodules.add(sub);
        } else {
            sub.name = name;
        }
        persistStructure(cur, root);
        return toMap(root);
    }

    @Transactional
    public Map<String, Object> deleteDomain(String dictKey, String domainCode, boolean cascade) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        String code = upper(domainCode);
        StructureRoot root = readStructure(cur);
        DomainNode domain = findDomain(root, code);
        List<CageInfoField> fields = fieldsInDomain(code);
        if (domain == null && fields.isEmpty()) {
            throw new TwinBusinessException(404, "数据域不存在: " + code);
        }
        if (!fields.isEmpty()) {
            long frozen = fields.stream().filter(f -> "FROZEN".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus())).count();
            if (frozen > 0) {
                throw new TwinBusinessException(409, "数据域 " + code + " 下有 " + frozen + " 个已冻结字段，无法删除");
            }
            if (!cascade) {
                throw new TwinBusinessException(409, "数据域 " + code + " 下仍有 " + fields.size() + " 个字段，确认删除请传 cascade=true");
            }
            for (CageInfoField f : fields) {
                fieldMapper.deleteById(f.getId());
            }
        }
        if (domain != null) {
            root.domains.removeIf(d -> code.equalsIgnoreCase(d.code));
            persistStructure(cur, root);
        }
        return toMap(root);
    }

    @Transactional
    public Map<String, Object> deleteSubmodule(String dictKey, String submoduleCode, boolean cascade) {
        CageInfoFieldDictionary cur = requireByKey(dictKey);
        String code = upper(submoduleCode);
        String domainCode = code.substring(0, code.indexOf('.'));
        StructureRoot root = readStructure(cur);
        DomainNode domain = findDomain(root, domainCode);
        SubNode sub = domain != null ? findSub(domain, code) : null;
        List<CageInfoField> fields = fieldsInSubmodule(code);
        if (sub == null && fields.isEmpty()) {
            throw new TwinBusinessException(404, "子模块不存在: " + code);
        }
        if (!fields.isEmpty()) {
            long frozen = fields.stream().filter(f -> "FROZEN".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus())).count();
            if (frozen > 0) {
                throw new TwinBusinessException(409, "子模块 " + code + " 下有 " + frozen + " 个已冻结字段，无法删除");
            }
            if (!cascade) {
                throw new TwinBusinessException(409, "子模块 " + code + " 下仍有 " + fields.size() + " 个字段，确认删除请传 cascade=true");
            }
            for (CageInfoField f : fields) {
                fieldMapper.deleteById(f.getId());
            }
        }
        if (domain != null) {
            domain.submodules.removeIf(s -> code.equalsIgnoreCase(s.code));
            persistStructure(cur, root);
        }
        return toMap(root);
    }

    // ── 结构读写 ──

    private List<CageInfoField> fieldsInDomain(String domainCode) {
        List<CageInfoField> out = new ArrayList<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (domainCode.equalsIgnoreCase(f.getDomainCode())) {
                out.add(f);
            }
        }
        return out;
    }

    private List<CageInfoField> fieldsInSubmodule(String submoduleCode) {
        List<CageInfoField> out = new ArrayList<>();
        for (CageInfoField f : fieldMapper.selectAll()) {
            if (submoduleCode.equalsIgnoreCase(f.getSubmoduleCode())) {
                out.add(f);
            }
        }
        return out;
    }

    private void persistStructure(CageInfoFieldDictionary cur, StructureRoot root) {
        try {
            cur.setStructureJson(objectMapper.writeValueAsString(toMap(root)));
        } catch (Exception e) {
            throw new IllegalStateException("序列化结构失败", e);
        }
        dictionaryMapper.update(cur);
    }

    private StructureRoot readStructure(CageInfoFieldDictionary cur) {
        StructureRoot root = new StructureRoot();
        root.domains = new ArrayList<>();
        String raw = cur.getStructureJson();
        if (raw == null || raw.isBlank()) {
            return root;
        }
        try {
            Map<String, Object> map = objectMapper.readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<>() {});
            Object domains = map.get("domains");
            if (domains instanceof List<?> list) {
                for (Object o : list) {
                    if (!(o instanceof Map<?, ?> dm)) continue;
                    DomainNode d = new DomainNode();
                    d.code = upper(str(dm.get("code")));
                    d.name = str(dm.get("name"));
                    d.sortOrder = intOrNull(dm.get("sortOrder"));
                    if (d.code == null) continue;
                    if (d.name == null) d.name = d.code;
                    d.submodules = new ArrayList<>();
                    Object subs = dm.get("submodules");
                    if (subs instanceof List<?> sl) {
                        for (Object so : sl) {
                            if (!(so instanceof Map<?, ?> sm)) continue;
                            SubNode s = new SubNode();
                            s.code = upper(str(sm.get("code")));
                            s.name = str(sm.get("name"));
                            s.sortOrder = intOrNull(sm.get("sortOrder"));
                            if (s.code == null) continue;
                            if (s.name == null) s.name = s.code;
                            d.submodules.add(s);
                        }
                    }
                    root.domains.add(d);
                }
            }
        } catch (Exception ignored) {
            // 坏 JSON 视为空结构
        }
        return root;
    }

    /** 把字段的 domain_code 推导为大纲（结构为空时补域）。 */
    private void mergeFromFields(StructureRoot root) {
        for (CageInfoField f : fieldMapper.selectAll()) {
            String domain = f.getDomainCode();
            if (domain == null || domain.isBlank()) continue;
            domain = domain.toUpperCase(Locale.ROOT);
            if (!DOMAIN_CODE.matcher(domain).matches()) continue;
            DomainNode d = findDomain(root, domain);
            if (d == null) {
                d = new DomainNode();
                d.code = domain;
                d.name = domain;
                d.sortOrder = nextDomainSortOrder(root);
                d.submodules = new ArrayList<>();
                root.domains.add(d);
            }
            String sub = f.getSubmoduleCode();
            if (sub != null && !sub.isBlank() && findSub(d, sub) == null) {
                SubNode s = new SubNode();
                s.code = sub;
                s.name = sub;
                s.sortOrder = nextSubSortOrder(d);
                d.submodules.add(s);
            }
        }
    }

    private static DomainNode findDomain(StructureRoot root, String code) {
        for (DomainNode d : root.domains) {
            if (code.equalsIgnoreCase(d.code)) return d;
        }
        return null;
    }

    private static SubNode findSub(DomainNode d, String code) {
        for (SubNode s : d.submodules) {
            if (code.equalsIgnoreCase(s.code)) return s;
        }
        return null;
    }

    private void sortStructure(StructureRoot root) {
        root.domains.sort(Comparator
            .comparingInt((DomainNode d) -> d.sortOrder != null ? d.sortOrder : Integer.MAX_VALUE)
            .thenComparing(d -> d.code == null ? "" : d.code));
        for (DomainNode d : root.domains) {
            d.submodules.sort(Comparator
                .comparingInt((SubNode s) -> s.sortOrder != null ? s.sortOrder : Integer.MAX_VALUE)
                .thenComparing(s -> s.code == null ? "" : s.code));
        }
    }

    private Map<String, Object> toMap(StructureRoot root) {
        sortStructure(root);
        List<Map<String, Object>> domains = new ArrayList<>();
        for (DomainNode d : root.domains) {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("code", d.code);
            dm.put("name", d.name);
            if (d.sortOrder != null) dm.put("sortOrder", d.sortOrder);
            List<Map<String, Object>> subs = new ArrayList<>();
            for (SubNode s : d.submodules) {
                Map<String, Object> sm = new LinkedHashMap<>();
                sm.put("code", s.code);
                sm.put("name", s.name);
                if (s.sortOrder != null) sm.put("sortOrder", s.sortOrder);
                subs.add(sm);
            }
            dm.put("submodules", subs);
            domains.add(dm);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domains", domains);
        return out;
    }

    private static int nextDomainSortOrder(StructureRoot root) {
        int max = -10;
        for (DomainNode d : root.domains) {
            if (d.sortOrder != null) max = Math.max(max, d.sortOrder);
        }
        return max + 10;
    }

    private static int nextSubSortOrder(DomainNode d) {
        int max = -10;
        for (SubNode s : d.submodules) {
            if (s.sortOrder != null) max = Math.max(max, s.sortOrder);
        }
        return max + 10;
    }

    private static String upper(String s) {
        return s == null ? null : s.toUpperCase(Locale.ROOT);
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOrNull(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static final class StructureRoot {
        List<DomainNode> domains = new ArrayList<>();
    }

    private static final class DomainNode {
        String code;
        String name;
        Integer sortOrder;
        List<SubNode> submodules = new ArrayList<>();
    }

    private static final class SubNode {
        String code;
        String name;
        Integer sortOrder;
    }
}
