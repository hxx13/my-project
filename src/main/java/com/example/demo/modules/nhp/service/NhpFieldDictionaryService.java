package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.mapper.CrfFieldDictionaryMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.util.CodedIdOrder;
import com.example.demo.modules.nhp.util.NhpAtomFormKeys;
import com.fasterxml.jackson.core.type.TypeReference;
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

/** NHP 字段字典套（猪/猴等）管理 + 域/子模块结构大纲。 */
@Service
public class NhpFieldDictionaryService {

    /** 与 NhpAtomFormKeys 一致：D1 / DD1 / DDD10 均合法且互不相同 */
    private static final Pattern DOMAIN_CODE = Pattern.compile("^D+\\d{1,3}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SUBMODULE_CODE = Pattern.compile("^D+\\d{1,3}\\.\\d+$", Pattern.CASE_INSENSITIVE);
    private static final Pattern FIELD_CODE = Pattern.compile("^(D+\\d{1,3})\\.(\\d+)\\.(\\d+)$", Pattern.CASE_INSENSITIVE);

    private final CrfFieldDictionaryMapper dictionaryMapper;
    private final CrfFieldMapper fieldMapper;
    private final CrfFormMapper formMapper;
    private final ObjectMapper objectMapper;

    public NhpFieldDictionaryService(CrfFieldDictionaryMapper dictionaryMapper, CrfFieldMapper fieldMapper,
                                     CrfFormMapper formMapper, ObjectMapper objectMapper) {
        this.dictionaryMapper = dictionaryMapper;
        this.fieldMapper = fieldMapper;
        this.formMapper = formMapper;
        this.objectMapper = objectMapper;
    }

    public List<CrfFieldDictionary> list() {
        return dictionaryMapper.listActive();
    }

    public CrfFieldDictionary getByKey(String dictKey) {
        if (dictKey == null || dictKey.isBlank()) return null;
        CrfFieldDictionary d = dictionaryMapper.findByDictKey(dictKey.trim());
        if (d == null || Boolean.FALSE.equals(d.getActive())) return null;
        return d;
    }

    public CrfFieldDictionary requireByKey(String dictKey) {
        CrfFieldDictionary d = getByKey(dictKey);
        if (d == null || Boolean.FALSE.equals(d.getActive())) {
            throw new IllegalArgumentException("字段字典不存在: " + dictKey);
        }
        return d;
    }

    /** 默认猪字典；若不存在则取列表第一个。 */
    public CrfFieldDictionary resolveDefault() {
        CrfFieldDictionary pig = dictionaryMapper.findByDictKey("pig");
        if (pig != null && !Boolean.FALSE.equals(pig.getActive())) return pig;
        List<CrfFieldDictionary> all = dictionaryMapper.listActive();
        return all.isEmpty() ? null : all.get(0);
    }

    @Transactional
    public Result<CrfFieldDictionary> create(Map<String, Object> body) {
        String dictKey = str(body == null ? null : body.get("dictKey"));
        String name = str(body == null ? null : body.get("name"));
        String species = str(body == null ? null : body.get("species"));
        String description = str(body == null ? null : body.get("description"));
        if (dictKey == null || dictKey.isBlank()) {
            return Result.fail(400, "dictKey 不能为空（如 monkey / pig-v2）");
        }
        dictKey = dictKey.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", "-");
        if (name == null || name.isBlank()) {
            name = dictKey;
        }
        CrfFieldDictionary existing = dictionaryMapper.findByDictKey(dictKey);
        if (existing != null) {
            if (!Boolean.FALSE.equals(existing.getActive())) {
                return Result.fail(409, "字典键已存在: " + dictKey);
            }
            // 同键软删壳：复活并刷新元数据（不硬删 dict_key，猪套重导入亦可复活）
            existing.setName(name);
            existing.setSpecies(species);
            existing.setDescription(description);
            if (existing.getStructureJson() == null || existing.getStructureJson().isBlank()) {
                existing.setStructureJson("{\"domains\":[]}");
            }
            existing.setStatus("ACTIVE");
            existing.setActive(true);
            dictionaryMapper.reactivate(existing.getId());
            dictionaryMapper.update(existing);
            existing.setFieldCount(fieldMapper.countByDictionary(existing.getId()));
            return Result.success(existing);
        }
        CrfFieldDictionary row = new CrfFieldDictionary();
        row.setDictKey(dictKey);
        row.setName(name);
        row.setSpecies(species);
        row.setDescription(description);
        row.setStructureJson("{\"domains\":[]}");
        row.setVersion(1);
        row.setStatus("ACTIVE");
        row.setActive(true);
        dictionaryMapper.insert(row);
        row.setFieldCount(0);
        return Result.success(row);
    }

    @Transactional
    public Result<CrfFieldDictionary> update(String dictKey, Map<String, Object> body) {
        CrfFieldDictionary cur = dictionaryMapper.findByDictKey(dictKey);
        if (cur == null || Boolean.FALSE.equals(cur.getActive())) {
            return Result.error("字段字典不存在");
        }
        // name / species / description / status：请求体含键则更新；空串可清空种属/说明（显示名不可空）
        if (body != null && body.containsKey("name")) {
            String name = str(body.get("name"));
            if (name == null || name.isBlank()) {
                return Result.fail(400, "显示名不能为空");
            }
            cur.setName(name);
        }
        if (body != null && body.containsKey("species")) {
            cur.setSpecies(str(body.get("species")));
        }
        if (body != null && body.containsKey("description")) {
            cur.setDescription(str(body.get("description")));
        }
        if (body != null && body.containsKey("status")) {
            String status = str(body.get("status"));
            if (status != null) cur.setStatus(status);
        }
        dictionaryMapper.update(cur);
        cur.setFieldCount(fieldMapper.countByDictionary(cur.getId()));
        return Result.success(cur);
    }

    /**
     * 软删数据域套（active=0 / ARCHIVED）。不硬删行，dictKey 仍可被新建复活或猪套重导入复活。
     * 有字段/原子时须 cascade=true；含 FROZEN 字段则拒绝。
     */
    @Transactional
    public Result<Map<String, Object>> delete(String dictKey, boolean cascade) {
        CrfFieldDictionary cur = dictionaryMapper.findByDictKey(dictKey);
        if (cur == null || Boolean.FALSE.equals(cur.getActive())) {
            return Result.error("字段字典不存在");
        }
        String key = cur.getDictKey();
        List<CrfField> fields = fieldMapper.listByDictionary(cur.getId());
        if (fields == null) fields = List.of();
        List<CrfForm> atoms = listActiveAtomsForDict(key);
        int fieldCount = fields.size();
        int atomCount = atoms.size();

        long frozen = fields.stream()
                .filter(f -> "FROZEN".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus()))
                .count();
        if (frozen > 0) {
            return Result.fail(409,
                    "数据域套「" + key + "」下有 " + frozen
                            + " 个已冻结(FROZEN)字段，无法删除。请先处理冻结字段。");
        }
        if ((fieldCount > 0 || atomCount > 0) && !cascade) {
            return Result.fail(409,
                    "数据域套「" + key + "」下仍有 " + fieldCount + " 个字段、"
                            + atomCount + " 个活跃原子模板版本。确认删除请传 cascade=true"
                            + "（将软删这些字段与原子；组合模板请自行清理）。");
        }

        int softDeletedFields = softDeleteAll(fields);
        int softDeletedAtoms = 0;
        for (CrfForm atom : atoms) {
            if (atom.getId() != null) {
                formMapper.softDelete(atom.getId());
                softDeletedAtoms++;
            }
        }
        dictionaryMapper.softDelete(cur.getId());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dictKey", key);
        out.put("softDeleted", true);
        out.put("softDeletedFields", softDeletedFields);
        out.put("softDeletedAtoms", softDeletedAtoms);
        out.put("seedHint", NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(NhpAtomFormKeys.normalizeDictKey(key))
                ? "猪套为系统种子壳：已软删，可用「重导入内置猪字典」或新建同键复活，未硬删。"
                : null);
        return Result.success(out);
    }

    private List<CrfForm> listActiveAtomsForDict(String dictKey) {
        List<CrfForm> all = formMapper.listAtoms();
        List<CrfForm> out = new ArrayList<>();
        if (all == null) return out;
        for (CrfForm f : all) {
            if (f != null && NhpAtomFormKeys.matchesDictKey(f.getCode(), dictKey)) {
                out.add(f);
            }
        }
        return out;
    }

    /**
     * 返回字典套结构：持久化大纲 ∪ 现有字段推导的域/子模块（字段树不会丢）。
     */
    public Result<Map<String, Object>> getStructure(String dictKey) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        StructureRoot root = readStructure(cur);
        mergeFromFields(root, cur.getId());
        return Result.success(toMap(root));
    }

    @Transactional
    public Result<Map<String, Object>> addDomain(String dictKey, Map<String, Object> body) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        String code = str(body == null ? null : body.get("code"));
        String name = str(body == null ? null : body.get("name"));
        if (code == null || !DOMAIN_CODE.matcher(code).matches()) {
            return Result.fail(400, "数据域编码须为 Dn 形式（如 D1、DD1）");
        }
        code = code.toUpperCase(Locale.ROOT);
        // 猪套：禁止再写入 DD1 等双 D 空域，折叠为 D1 与字段 D1.* 对齐
        if (NhpAtomFormKeys.DEFAULT_DICT_KEY.equals(NhpAtomFormKeys.normalizeDictKey(dictKey))) {
            String canon = NhpAtomFormKeys.canonicalPigDomainCode(code);
            if (canon == null) {
                return Result.fail(400, "猪套数据域编码须为 D1、D2…D10 形式");
            }
            code = canon;
        }
        if (name == null || name.isBlank()) {
            name = "数据域 " + code;
        }
        StructureRoot root = readStructure(cur);
        if (findDomain(root, code) != null) {
            return Result.fail(409, "数据域已存在: " + code);
        }
        DomainNode d = new DomainNode();
        d.code = code;
        d.name = name;
        d.sortOrder = resolveSortOrder(body == null ? null : body.get("sortOrder"), nextDomainSortOrder(root));
        d.submodules = new ArrayList<>();
        root.domains.add(d);
        persistStructure(cur, root);
        return Result.success(toMap(root));
    }

    /**
     * 更新套内数据域显示名（写入 structure_json.name；编码不可改）。
     * 若域仅由字段推导尚未落库，会先 merge 再持久化。
     */
    @Transactional
    public Result<Map<String, Object>> renameDomain(String dictKey, String domainCode, Map<String, Object> body) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        if (domainCode == null || !DOMAIN_CODE.matcher(domainCode).matches()) {
            return Result.fail(400, "数据域编码须为 Dn 形式（如 D1、DD1）");
        }
        String code = domainCode.toUpperCase(Locale.ROOT);
        String name = str(body == null ? null : body.get("name"));
        if (name == null || name.isBlank()) {
            return Result.fail(400, "显示名不能为空");
        }
        if (name.equalsIgnoreCase(code)) {
            return Result.fail(400, "显示名不能与编码相同，请填写中文名");
        }
        StructureRoot root = readStructure(cur);
        mergeFromFields(root, cur.getId());
        DomainNode domain = findDomain(root, code);
        if (domain == null) {
            return Result.fail(404, "数据域不存在: " + code);
        }
        domain.name = name;
        persistStructure(cur, root);
        return Result.success(toMap(root));
    }

    /**
     * 更新子模块显示名（写入 structure_json；编码不可改）。
     */
    @Transactional
    public Result<Map<String, Object>> renameSubmodule(String dictKey, String submoduleCode, Map<String, Object> body) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        if (submoduleCode == null || !SUBMODULE_CODE.matcher(submoduleCode).matches()) {
            return Result.fail(400, "子模块编码须为 Dn.mm（如 D1.01、DD1.01）");
        }
        String code = submoduleCode.toUpperCase(Locale.ROOT);
        String name = str(body == null ? null : body.get("name"));
        if (name == null || name.isBlank()) {
            return Result.fail(400, "显示名不能为空");
        }
        if (name.equalsIgnoreCase(code)) {
            return Result.fail(400, "显示名不能与编码相同，请填写中文名");
        }
        String domainCode = code.substring(0, code.indexOf('.'));
        StructureRoot root = readStructure(cur);
        mergeFromFields(root, cur.getId());
        DomainNode domain = findDomain(root, domainCode);
        if (domain == null) {
            return Result.fail(404, "数据域不存在: " + domainCode);
        }
        SubNode sub = findSub(domain, code);
        if (sub == null) {
            // 大纲尚无该子模块时补建（仅名字），便于从字段树直接改名
            sub = new SubNode();
            sub.code = code;
            sub.name = name;
            sub.sortOrder = nextSubSortOrder(domain);
            if (domain.submodules == null) domain.submodules = new ArrayList<>();
            domain.submodules.add(sub);
        } else {
            sub.name = name;
        }
        persistStructure(cur, root);
        return Result.success(toMap(root));
    }

    @Transactional
    public Result<Map<String, Object>> addSubmodule(String dictKey, Map<String, Object> body) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        String domainCode = str(body == null ? null : body.get("domainCode"));
        String code = str(body == null ? null : body.get("code"));
        String name = str(body == null ? null : body.get("name"));
        if (domainCode == null || !DOMAIN_CODE.matcher(domainCode).matches()) {
            return Result.fail(400, "domainCode 须为 Dn（如 D1、DD1）");
        }
        domainCode = domainCode.toUpperCase(Locale.ROOT);
        if (code == null || !SUBMODULE_CODE.matcher(code).matches()) {
            return Result.fail(400, "子模块编码须为 Dn.mm（如 D1.01、DD1.01）");
        }
        code = code.toUpperCase(Locale.ROOT);
        if (!code.startsWith(domainCode + ".")) {
            return Result.fail(400, "子模块编码须以 " + domainCode + ". 开头");
        }
        if (name == null || name.isBlank()) {
            name = "子模块 " + code;
        }
        StructureRoot root = readStructure(cur);
        DomainNode domain = findDomain(root, domainCode);
        if (domain == null) {
            return Result.fail(400, "请先创建数据域 " + domainCode);
        }
        if (findSub(domain, code) != null) {
            return Result.fail(409, "子模块已存在: " + code);
        }
        SubNode s = new SubNode();
        s.code = code;
        s.name = name;
        s.sortOrder = resolveSortOrder(body == null ? null : body.get("sortOrder"), nextSubSortOrder(domain));
        domain.submodules.add(s);
        persistStructure(cur, root);
        return Result.success(toMap(root));
    }

    /**
     * 删除套内数据域（像删一级文件夹）。
     * 空域直接移除；若有字段：有 FROZEN 则拒绝；否则须 cascade=true 软删字段后再移除大纲。
     */
    @Transactional
    public Result<Map<String, Object>> deleteDomain(String dictKey, String domainCode, boolean cascade) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        if (domainCode == null || !DOMAIN_CODE.matcher(domainCode).matches()) {
            return Result.fail(400, "数据域编码须为 Dn 形式（如 D1、DD1）");
        }
        String code = domainCode.toUpperCase(Locale.ROOT);
        StructureRoot root = readStructure(cur);
        DomainNode domain = findDomain(root, code);
        List<CrfField> fields = fieldMapper.listByDictionaryAndDomain(cur.getId(), code);
        if (domain == null && (fields == null || fields.isEmpty())) {
            return Result.fail(404, "数据域不存在: " + code);
        }
        Result<?> gate = ensureDeletableFields(fields, cascade, "数据域 " + code);
        if (gate != null) return castStructureFail(gate);

        int softDeleted = softDeleteAll(fields);
        if (domain != null) {
            root.domains.removeIf(d -> code.equalsIgnoreCase(d.code));
            persistStructure(cur, root);
        } else {
            // 仅字段推导出的域：软删后按剩余字段重建大纲
            StructureRoot rebuilt = readStructure(cur);
            // 去掉已不存在字段对应的空壳：先清空再 merge
            rebuilt.domains.removeIf(d -> code.equalsIgnoreCase(d.code));
            mergeFromFields(rebuilt, cur.getId());
            persistStructure(cur, rebuilt);
            root = rebuilt;
        }
        Map<String, Object> out = toMap(root);
        out.put("softDeletedFields", softDeleted);
        return Result.success(out);
    }

    /**
     * 删除子模块（像删二级文件夹）。规则同 deleteDomain。
     */
    @Transactional
    public Result<Map<String, Object>> deleteSubmodule(String dictKey, String submoduleCode, boolean cascade) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        if (submoduleCode == null || !SUBMODULE_CODE.matcher(submoduleCode).matches()) {
            return Result.fail(400, "子模块编码须为 Dn.mm（如 D1.01、DD1.01）");
        }
        String code = submoduleCode.toUpperCase(Locale.ROOT);
        String domainCode = code.substring(0, code.indexOf('.'));
        StructureRoot root = readStructure(cur);
        DomainNode domain = findDomain(root, domainCode);
        SubNode sub = domain != null ? findSub(domain, code) : null;
        // listByDictionaryAndDomain(D1.01) → LIKE 'D1.01.%'
        List<CrfField> fields = fieldMapper.listByDictionaryAndDomain(cur.getId(), code);
        if (sub == null && (fields == null || fields.isEmpty())) {
            return Result.fail(404, "子模块不存在: " + code);
        }
        Result<?> gate = ensureDeletableFields(fields, cascade, "子模块 " + code);
        if (gate != null) return castStructureFail(gate);

        int softDeleted = softDeleteAll(fields);
        if (domain != null) {
            domain.submodules.removeIf(s -> code.equalsIgnoreCase(s.code));
            persistStructure(cur, root);
        }
        Map<String, Object> out = toMap(root);
        out.put("softDeletedFields", softDeleted);
        return Result.success(out);
    }

    /** 不可删时返回 fail Result；可删返回 null。 */
    private Result<?> ensureDeletableFields(List<CrfField> fields, boolean cascade, String label) {
        if (fields == null || fields.isEmpty()) return null;
        long frozen = fields.stream()
                .filter(f -> "FROZEN".equalsIgnoreCase(f.getStatus() == null ? "" : f.getStatus()))
                .count();
        if (frozen > 0) {
            return Result.fail(409, label + " 下有 " + frozen + " 个已冻结(FROZEN)字段，无法删除。请先处理冻结字段。");
        }
        if (!cascade) {
            return Result.fail(409,
                    label + " 下仍有 " + fields.size() + " 个字段。确认删除请传 cascade=true（将软删这些字段）。");
        }
        return null;
    }

    private int softDeleteAll(List<CrfField> fields) {
        if (fields == null || fields.isEmpty()) return 0;
        int n = 0;
        for (CrfField f : fields) {
            if (f.getId() != null) {
                fieldMapper.softDelete(f.getId());
                n++;
            }
        }
        return n;
    }

    @SuppressWarnings("unchecked")
    private static Result<Map<String, Object>> castStructureFail(Result<?> gate) {
        return (Result<Map<String, Object>>) gate;
    }

    /**
     * 显式从另一数据域套克隆域/子模块大纲（仅 structure_json，不复制字段）。
     * 空套不会自动带猪 D1–D10；只有用户主动「从某套克隆」才复制。
     */
    @Transactional
    public Result<Map<String, Object>> cloneStructureFrom(String dictKey, String sourceDictKey) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        if (sourceDictKey == null || sourceDictKey.isBlank()) {
            return Result.fail(400, "sourceDictKey 不能为空");
        }
        if (dictKey.trim().equalsIgnoreCase(sourceDictKey.trim())) {
            return Result.fail(400, "不能从自身克隆");
        }
        CrfFieldDictionary src = requireByKey(sourceDictKey.trim());
        StructureRoot from = readStructure(src);
        // 仅克隆已声明大纲，不 merge 源套字段推导（避免把源套字段树误当成目标套结构）
        if (from.domains == null) from.domains = new ArrayList<>();
        StructureRoot target = readStructure(cur);
        int added = 0;
        for (DomainNode sd : from.domains) {
            if (sd.code == null) continue;
            DomainNode td = findDomain(target, sd.code);
            if (td == null) {
                td = new DomainNode();
                td.code = sd.code;
                td.name = sd.name != null ? sd.name : sd.code;
                td.sortOrder = sd.sortOrder != null ? sd.sortOrder : nextDomainSortOrder(target);
                td.submodules = new ArrayList<>();
                target.domains.add(td);
                added++;
            } else if (td.sortOrder == null && sd.sortOrder != null) {
                td.sortOrder = sd.sortOrder;
            }
            if (sd.submodules == null) continue;
            for (SubNode ss : sd.submodules) {
                if (ss.code == null) continue;
                if (findSub(td, ss.code) != null) continue;
                SubNode neu = new SubNode();
                neu.code = ss.code;
                neu.name = ss.name != null ? ss.name : ss.code;
                neu.sortOrder = ss.sortOrder != null ? ss.sortOrder : nextSubSortOrder(td);
                td.submodules.add(neu);
                added++;
            }
        }
        persistStructure(cur, target);
        Map<String, Object> out = toMap(target);
        out.put("clonedFrom", src.getDictKey());
        out.put("addedNodes", added);
        return Result.success(out);
    }

    /** 复制数据域套（字段文件夹）：新建套 + 复制大纲 + 复制字段（同 field_code，新 dictionary_id，字段落 DRAFT v1）。 */
    @Transactional
    public Result<CrfFieldDictionary> copyDictionary(Map<String, Object> body) {
        String sourceKey = str(body == null ? null : body.get("sourceDictKey"));
        String targetKey = str(body == null ? null : body.get("targetDictKey"));
        String name = str(body == null ? null : body.get("name"));
        if (sourceKey == null || sourceKey.isBlank()) {
            return Result.fail(400, "sourceDictKey 不能为空");
        }
        if (targetKey == null || targetKey.isBlank()) {
            return Result.fail(400, "targetDictKey 不能为空");
        }
        sourceKey = sourceKey.trim();
        targetKey = targetKey.trim();
        if (sourceKey.equalsIgnoreCase(targetKey)) {
            return Result.fail(400, "目标键不能与源相同");
        }
        CrfFieldDictionary src = requireByKey(sourceKey);
        if (dictionaryMapper.findByDictKey(targetKey) != null) {
            return Result.fail(409, "目标数据域套已存在: " + targetKey);
        }
        CrfFieldDictionary neu = new CrfFieldDictionary();
        neu.setDictKey(targetKey);
        neu.setName(name != null ? name : (src.getName() != null ? src.getName() + " 副本" : targetKey));
        neu.setSpecies(src.getSpecies());
        neu.setDescription(src.getDescription());
        neu.setStructureJson(src.getStructureJson());
        neu.setVersion(1);
        neu.setStatus("ACTIVE");
        neu.setActive(true);
        dictionaryMapper.insert(neu);
        int copied = 0;
        List<CrfField> srcFields = fieldMapper.listByDictionary(src.getId());
        if (srcFields != null) {
            for (CrfField f : srcFields) {
                CrfField nf = new CrfField();
                nf.setDictionaryId(neu.getId());
                nf.setFieldCode(f.getFieldCode());
                nf.setNameEn(f.getNameEn());
                nf.setNameCn(f.getNameCn());
                nf.setDataType(f.getDataType());
                nf.setUnit(f.getUnit());
                nf.setRequired(f.getRequired());
                nf.setCodelistId(f.getCodelistId());
                nf.setDescription(f.getDescription());
                nf.setCalcExpression(f.getCalcExpression());
                nf.setCdiscDomain(f.getCdiscDomain());
                nf.setCdiscVariable(f.getCdiscVariable());
                nf.setCdiscTestCode(f.getCdiscTestCode());
                nf.setConceptCode(f.getConceptCode());
                nf.setIdRuleType(f.getIdRuleType());
                nf.setNature(f.getNature());
                nf.setStatus("DRAFT");
                nf.setVersion(1);
                nf.setActive(true);
                fieldMapper.insert(nf);
                copied++;
            }
        }
        return Result.success(neu);
    }

    /** 复制数据域（含其子模块大纲 + 字段）：字段编码前缀替换为目标域码，字段落 DRAFT v1。 */
    @Transactional
    public Result<Map<String, Object>> copyDomain(String dictKey, Map<String, Object> body) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        String sourceCode = str(body == null ? null : body.get("sourceCode"));
        String targetCode = str(body == null ? null : body.get("targetCode"));
        if (sourceCode == null || !DOMAIN_CODE.matcher(sourceCode).matches()) {
            return Result.fail(400, "源域编码须为 Dn 形式（如 D1）");
        }
        if (targetCode == null || !DOMAIN_CODE.matcher(targetCode).matches()) {
            return Result.fail(400, "目标域编码须为 Dn 形式（如 D1）");
        }
        sourceCode = sourceCode.toUpperCase(Locale.ROOT);
        targetCode = targetCode.toUpperCase(Locale.ROOT);
        if (sourceCode.equalsIgnoreCase(targetCode)) {
            return Result.fail(400, "目标域不能与源域相同");
        }
        StructureRoot root = readStructure(cur);
        DomainNode srcDom = findDomain(root, sourceCode);
        List<CrfField> srcFields = fieldMapper.listByDictionaryAndDomain(cur.getId(), sourceCode);
        if (srcDom == null && (srcFields == null || srcFields.isEmpty())) {
            return Result.fail(404, "源数据域不存在: " + sourceCode);
        }
        if (findDomain(root, targetCode) != null) {
            return Result.fail(409, "目标数据域已存在: " + targetCode);
        }
        List<CrfField> targetFields = fieldMapper.listByDictionaryAndDomain(cur.getId(), targetCode);
        if (targetFields != null && !targetFields.isEmpty()) {
            return Result.fail(409, "目标数据域下已有字段: " + targetCode);
        }
        // 复制大纲：域 + 子模块（子模块码前缀替换）
        DomainNode td = new DomainNode();
        td.code = targetCode;
        td.name = srcDom != null && srcDom.name != null ? srcDom.name : ("数据域 " + targetCode);
        td.sortOrder = nextDomainSortOrder(root);
        td.submodules = new ArrayList<>();
        if (srcDom != null && srcDom.submodules != null) {
            for (SubNode ss : srcDom.submodules) {
                SubNode ns = new SubNode();
                ns.code = targetCode + ss.code.substring(ss.code.indexOf('.'));
                ns.name = ss.name;
                ns.sortOrder = ss.sortOrder;
                td.submodules.add(ns);
            }
        }
        root.domains.add(td);
        persistStructure(cur, root);
        final String tc = targetCode;
        int copied = copyFields(cur.getId(), srcFields, code -> tc + code.substring(code.indexOf('.')));
        Map<String, Object> out = toMap(root);
        out.put("copiedFields", copied);
        return Result.success(out);
    }

    /** 复制子模块（含字段）：字段编码前缀替换为目标子模块码，字段落 DRAFT v1。 */
    @Transactional
    public Result<Map<String, Object>> copySubmodule(String dictKey, Map<String, Object> body) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        String sourceCode = str(body == null ? null : body.get("sourceCode"));
        String targetCode = str(body == null ? null : body.get("targetCode"));
        if (sourceCode == null || !SUBMODULE_CODE.matcher(sourceCode).matches()) {
            return Result.fail(400, "源子模块编码须为 Dn.mm（如 D1.01）");
        }
        if (targetCode == null || !SUBMODULE_CODE.matcher(targetCode).matches()) {
            return Result.fail(400, "目标子模块编码须为 Dn.mm（如 D1.01）");
        }
        sourceCode = sourceCode.toUpperCase(Locale.ROOT);
        targetCode = targetCode.toUpperCase(Locale.ROOT);
        if (sourceCode.equalsIgnoreCase(targetCode)) {
            return Result.fail(400, "目标子模块不能与源相同");
        }
        String srcDomain = sourceCode.substring(0, sourceCode.indexOf('.'));
        String tgtDomain = targetCode.substring(0, targetCode.indexOf('.'));
        StructureRoot root = readStructure(cur);
        DomainNode srcDomNode = findDomain(root, srcDomain);
        SubNode srcSub = srcDomNode != null ? findSub(srcDomNode, sourceCode) : null;
        List<CrfField> srcFields = fieldMapper.listByDictionaryAndDomain(cur.getId(), sourceCode);
        if (srcSub == null && (srcFields == null || srcFields.isEmpty())) {
            return Result.fail(404, "源子模块不存在: " + sourceCode);
        }
        DomainNode tgtDomNode = findDomain(root, tgtDomain);
        if (tgtDomNode == null) {
            return Result.fail(400, "目标域不存在: " + tgtDomain);
        }
        if (findSub(tgtDomNode, targetCode) != null) {
            return Result.fail(409, "目标子模块已存在: " + targetCode);
        }
        SubNode ns = new SubNode();
        ns.code = targetCode;
        ns.name = srcSub != null && srcSub.name != null ? srcSub.name : ("子模块 " + targetCode);
        ns.sortOrder = srcSub != null ? srcSub.sortOrder : nextSubSortOrder(tgtDomNode);
        if (tgtDomNode.submodules == null) tgtDomNode.submodules = new ArrayList<>();
        tgtDomNode.submodules.add(ns);
        persistStructure(cur, root);
        final String tc = targetCode;
        int copied = copyFields(cur.getId(), srcFields, code -> tc + code.substring(code.lastIndexOf('.')));
        Map<String, Object> out = toMap(root);
        out.put("copiedFields", copied);
        return Result.success(out);
    }

    /** 复制字段：按 transform 重写 field_code，其余元数据克隆，落 DRAFT v1。 */
    private int copyFields(Long dictionaryId, List<CrfField> source, java.util.function.Function<String, String> codeTransform) {
        if (source == null || source.isEmpty()) return 0;
        int n = 0;
        for (CrfField src : source) {
            CrfField neu = new CrfField();
            neu.setDictionaryId(dictionaryId);
            neu.setFieldCode(codeTransform.apply(src.getFieldCode()));
            neu.setNameEn(src.getNameEn());
            neu.setNameCn(src.getNameCn());
            neu.setDataType(src.getDataType());
            neu.setUnit(src.getUnit());
            neu.setRequired(src.getRequired());
            neu.setCodelistId(src.getCodelistId());
            neu.setDescription(src.getDescription());
            neu.setCalcExpression(src.getCalcExpression());
            neu.setCdiscDomain(src.getCdiscDomain());
            neu.setCdiscVariable(src.getCdiscVariable());
            neu.setCdiscTestCode(src.getCdiscTestCode());
            neu.setConceptCode(src.getConceptCode());
            neu.setIdRuleType(src.getIdRuleType());
            neu.setNature(src.getNature());
            neu.setStatus("DRAFT");
            neu.setVersion(1);
            neu.setActive(true);
            fieldMapper.insert(neu);
            n++;
        }
        return n;
    }

    /**
     * 若字典套已声明至少一个数据域，则新字段编码必须落在已有域·子模块下。
     * 无结构时不拦（兼容仅有字段推导树的存量套）。
     */
    public Result<?> validateFieldBelongsToStructure(Long dictionaryId, String fieldCode) {
        if (dictionaryId == null || fieldCode == null || fieldCode.isBlank()) {
            return Result.success(null);
        }
        CrfFieldDictionary dict = dictionaryMapper.findById(dictionaryId);
        if (dict == null) {
            return Result.success(null);
        }
        StructureRoot root = readStructure(dict);
        if (root.domains == null || root.domains.isEmpty()) {
            return Result.success(null);
        }
        var m = FIELD_CODE.matcher(fieldCode.trim());
        if (!m.matches()) {
            return Result.fail(400, "字段编码须为 Dn.mm.nnn（如 D1.01.001、DD1.01.001），且须落在已建域/子模块下");
        }
        String domain = m.group(1).toUpperCase(Locale.ROOT);
        String sub = (m.group(1) + "." + m.group(2)).toUpperCase(Locale.ROOT);
        DomainNode d = findDomain(root, domain);
        if (d == null) {
            return Result.fail(400, "数据域 " + domain + " 尚未创建，请先「新建数据域」");
        }
        if (d.submodules != null && !d.submodules.isEmpty()) {
            if (findSub(d, sub) == null) {
                return Result.fail(400, "子模块 " + sub + " 尚未创建，请先在 " + domain + " 下「新建子模块」");
            }
        }
        return Result.success(null);
    }

    /**
     * 按该套已有字段推导域/子模块大纲并写回 structure_json（重导入猪字典后对齐大纲）。
     * 以字段为唯一真源：整表替换大纲，避免历史误写的 DD* 空域残留。
     */
    @Transactional
    public Result<Map<String, Object>> rebuildStructureFromFields(String dictKey) {
        CrfFieldDictionary cur = requireByKey(dictKey);
        StructureRoot root = new StructureRoot();
        root.domains = new ArrayList<>();
        mergeFromFields(root, cur.getId());
        persistStructure(cur, root);
        return Result.success(toMap(root));
    }

    private void persistStructure(CrfFieldDictionary cur, StructureRoot root) {
        try {
            cur.setStructureJson(objectMapper.writeValueAsString(toMap(root)));
        } catch (Exception e) {
            throw new IllegalStateException("序列化结构失败", e);
        }
        dictionaryMapper.update(cur);
    }

    private StructureRoot readStructure(CrfFieldDictionary cur) {
        StructureRoot root = new StructureRoot();
        root.domains = new ArrayList<>();
        String raw = cur.getStructureJson();
        if (raw == null || raw.isBlank()) {
            return root;
        }
        try {
            Map<String, Object> map = objectMapper.readValue(raw, new TypeReference<>() {});
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
            // 坏 JSON 视为空结构，避免阻断页面
        }
        return root;
    }

    /** 猪套临床域显示名（与字段总目录 / NhpTemplateService 对齐） */
    private static final Map<String, String> PIG_DOMAIN_LABELS = Map.ofEntries(
            Map.entry("D1", "供体猪域"), Map.entry("D2", "受体NHP域"), Map.entry("D3", "配型与手术域"),
            Map.entry("D4", "样本与检测域"), Map.entry("D5", "随访与事件域"), Map.entry("D6", "免疫抑制用药域"),
            Map.entry("D7", "麻醉术中监护域"), Map.entry("D8", "病理诊断域"), Map.entry("D9", "心脏移植模块"),
            Map.entry("D10", "体外肝灌注模块"), Map.entry("D11", "公共数据层"), Map.entry("D12", "标准与版本域"),
            Map.entry("D13", "用户与权限域"));

    private void mergeFromFields(StructureRoot root, Long dictionaryId) {
        if (dictionaryId == null) return;
        List<CrfField> fields = fieldMapper.listByDictionary(dictionaryId);
        for (CrfField f : fields) {
            if (f.getFieldCode() == null) continue;
            var m = FIELD_CODE.matcher(f.getFieldCode().trim());
            if (!m.matches()) continue;
            String domain = m.group(1).toUpperCase(Locale.ROOT);
            String sub = (m.group(1) + "." + m.group(2)).toUpperCase(Locale.ROOT);
            DomainNode d = findDomain(root, domain);
            if (d == null) {
                d = new DomainNode();
                d.code = domain;
                String canon = NhpAtomFormKeys.canonicalPigDomainCode(domain);
                String lookup = canon != null ? canon : domain;
                d.name = PIG_DOMAIN_LABELS.getOrDefault(lookup, domain);
                d.sortOrder = nextDomainSortOrder(root);
                d.submodules = new ArrayList<>();
                root.domains.add(d);
            } else if (d.name == null || d.name.isBlank() || d.name.equalsIgnoreCase(d.code)) {
                String canon = NhpAtomFormKeys.canonicalPigDomainCode(domain);
                String lookup = canon != null ? canon : domain;
                String zh = PIG_DOMAIN_LABELS.get(lookup);
                if (zh != null) d.name = zh;
            }
            if (findSub(d, sub) == null) {
                SubNode s = new SubNode();
                s.code = sub;
                s.name = sub;
                s.sortOrder = nextSubSortOrder(d);
                d.submodules.add(s);
            }
        }
    }

    private static DomainNode findDomain(StructureRoot root, String code) {
        if (root.domains == null) return null;
        for (DomainNode d : root.domains) {
            if (code.equalsIgnoreCase(d.code)) return d;
        }
        return null;
    }

    private static SubNode findSub(DomainNode d, String code) {
        if (d.submodules == null) return null;
        for (SubNode s : d.submodules) {
            if (code.equalsIgnoreCase(s.code)) return s;
        }
        return null;
    }

    /**
     * 展示序：优先 sortOrder；缺省时用编码数值序作稳定兜底（编码仍是表码，不是「第 N 步」）。
     */
    private static void sortStructure(StructureRoot root) {
        if (root == null || root.domains == null) return;
        ensureDomainSortOrders(root);
        root.domains.sort(domainDisplayOrder());
        for (DomainNode d : root.domains) {
            if (d.submodules == null) continue;
            ensureSubSortOrders(d);
            d.submodules.sort(subDisplayOrder());
        }
    }

    private static Comparator<DomainNode> domainDisplayOrder() {
        return Comparator
                .comparingInt((DomainNode d) -> d.sortOrder != null ? d.sortOrder : Integer.MAX_VALUE)
                .thenComparing(d -> d.code == null ? "" : d.code, CodedIdOrder.COMPARATOR);
    }

    private static Comparator<SubNode> subDisplayOrder() {
        return Comparator
                .comparingInt((SubNode s) -> s.sortOrder != null ? s.sortOrder : Integer.MAX_VALUE)
                .thenComparing(s -> s.code == null ? "" : s.code, CodedIdOrder.COMPARATOR);
    }

    private static void ensureDomainSortOrders(StructureRoot root) {
        if (root.domains == null) return;
        int max = -10;
        for (DomainNode d : root.domains) {
            if (d.sortOrder != null) max = Math.max(max, d.sortOrder);
        }
        for (DomainNode d : root.domains) {
            if (d.sortOrder == null) {
                max += 10;
                d.sortOrder = max;
            }
        }
    }

    private static void ensureSubSortOrders(DomainNode d) {
        if (d.submodules == null) return;
        int max = -10;
        for (SubNode s : d.submodules) {
            if (s.sortOrder != null) max = Math.max(max, s.sortOrder);
        }
        for (SubNode s : d.submodules) {
            if (s.sortOrder == null) {
                max += 10;
                s.sortOrder = max;
            }
        }
    }

    private static int nextDomainSortOrder(StructureRoot root) {
        int max = -10;
        if (root.domains != null) {
            for (DomainNode d : root.domains) {
                if (d.sortOrder != null) max = Math.max(max, d.sortOrder);
            }
        }
        return max + 10;
    }

    private static int nextSubSortOrder(DomainNode d) {
        int max = -10;
        if (d.submodules != null) {
            for (SubNode s : d.submodules) {
                if (s.sortOrder != null) max = Math.max(max, s.sortOrder);
            }
        }
        return max + 10;
    }

    private static Integer resolveSortOrder(Object raw, int fallback) {
        Integer n = intOrNull(raw);
        return n != null ? n : fallback;
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

    private Map<String, Object> toMap(StructureRoot root) {
        sortStructure(root);
        List<Map<String, Object>> domains = new ArrayList<>();
        for (DomainNode d : root.domains) {
            Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("code", d.code);
            dm.put("name", d.name);
            if (d.sortOrder != null) dm.put("sortOrder", d.sortOrder);
            List<Map<String, Object>> subs = new ArrayList<>();
            if (d.submodules != null) {
                for (SubNode s : d.submodules) {
                    Map<String, Object> sm = new LinkedHashMap<>();
                    sm.put("code", s.code);
                    sm.put("name", s.name);
                    if (s.sortOrder != null) sm.put("sortOrder", s.sortOrder);
                    subs.add(sm);
                }
            }
            dm.put("submodules", subs);
            domains.add(dm);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domains", domains);
        return out;
    }

    private static String upper(String s) {
        return s == null ? null : s.toUpperCase(Locale.ROOT);
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    private static final class StructureRoot {
        List<DomainNode> domains;
    }

    private static final class DomainNode {
        String code;
        String name;
        /** 展示序（独立于域编码；编码是表码/id） */
        Integer sortOrder;
        List<SubNode> submodules;
    }

    private static final class SubNode {
        String code;
        String name;
        Integer sortOrder;
    }
}
