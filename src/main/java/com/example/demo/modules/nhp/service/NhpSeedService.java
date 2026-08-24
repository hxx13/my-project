package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfCodelistItem;
import com.example.demo.modules.nhp.entity.CrfCodelistLink;
import com.example.demo.modules.nhp.entity.CrfCenter;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.entity.CrfFormField;
import com.example.demo.modules.nhp.entity.CrfIdRule;
import com.example.demo.modules.nhp.entity.CrfSection;
import com.example.demo.modules.nhp.entity.CrfStudy;
import com.example.demo.modules.nhp.entity.CrfTemplateField;
import com.example.demo.modules.nhp.entity.CrfTemplateSection;
import com.example.demo.modules.nhp.entity.CrfVisit;
import com.example.demo.modules.nhp.mapper.CrfCodelistItemMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistLinkMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import com.example.demo.modules.nhp.mapper.CrfCenterMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldDictionaryMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.mapper.CrfIdRuleMapper;
import com.example.demo.modules.nhp.mapper.CrfSectionMapper;
import com.example.demo.modules.nhp.mapper.CrfStudyMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateSectionMapper;
import com.example.demo.modules.nhp.mapper.CrfVisitMapper;
import com.example.demo.modules.nhp.util.NhpAtomFormKeys;
import com.example.demo.modules.nhp.util.NhpTemplateSectionLabels;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * NHP 种子数据（幂等）：研究/中心/时点/ID 规则 + 29 码表（04）+ 字典联动 + 249 字段字典
 * + 原子模板（D1~D10）+ 默认组合模板 nhp-crf（钉住原子并快照）。
 * 字段字典数据源为 classpath:db/nhp-field-dict.json（由 03 字段总目录生成）。
 * 所有方法重复执行无副作用（先查后插 / INSERT IGNORE）。
 */
@Service
public class NhpSeedService {

    private static final Logger log = LoggerFactory.getLogger(NhpSeedService.class);
    private static final String FIELD_DICT_RESOURCE = "db/nhp-field-dict.json";
    /** 原子优先种子资源（套→原子→字段，替代 FIELD_DICT_RESOURCE 的字段平铺） */
    private static final String ATOMS_RESOURCE = "db/nhp-atoms.json";
    private static final String DEFAULT_COMPOSITE_KEY = "nhp-crf";
    /** 历史误种：域码写成 DD1 而字段仍为 D1.*；≥2 个 D 的裸域视为猪套脏种子 */
    private static final Pattern BOGUS_DOUBLE_D_ATOM = Pattern.compile("^D{2,}\\d{1,3}$", Pattern.CASE_INSENSITIVE);
    /** 对齐 crf_id_rule.derived=1：派生键不走取号器（ANES/HX/RS） */
    private static final Set<String> DERIVED_ID_TYPES = Set.of("ANES", "HX", "RS");

    private final CrfStudyMapper studyMapper;
    private final CrfCenterMapper centerMapper;
    private final CrfVisitMapper visitMapper;
    private final CrfIdRuleMapper idRuleMapper;
    private final CrfCodelistMapper codelistMapper;
    private final CrfCodelistItemMapper itemMapper;
    private final CrfCodelistLinkMapper linkMapper;
    private final CrfFormMapper formMapper;
    private final CrfSectionMapper sectionMapper;
    private final CrfFieldMapper fieldMapper;
    private final CrfFieldDictionaryMapper fieldDictionaryMapper;
    private final NhpFieldDictionaryService fieldDictionaryService;
    private final CrfFormFieldMapper formFieldMapper;
    private final CrfTemplateSectionMapper templateSectionMapper;
    private final CrfTemplateFieldMapper templateFieldMapper;
    private final NhpTemplateService templateService;
    private final ObjectMapper objectMapper;

    public NhpSeedService(CrfStudyMapper studyMapper, CrfCenterMapper centerMapper,
                          CrfVisitMapper visitMapper, CrfIdRuleMapper idRuleMapper,
                          CrfCodelistMapper codelistMapper, CrfCodelistItemMapper itemMapper,
                          CrfCodelistLinkMapper linkMapper, CrfFormMapper formMapper,
                          CrfSectionMapper sectionMapper, CrfFieldMapper fieldMapper,
                          CrfFieldDictionaryMapper fieldDictionaryMapper,
                          NhpFieldDictionaryService fieldDictionaryService,
                          CrfFormFieldMapper formFieldMapper,
                          CrfTemplateSectionMapper templateSectionMapper,
                          CrfTemplateFieldMapper templateFieldMapper,
                          NhpTemplateService templateService,
                          ObjectMapper objectMapper) {
        this.studyMapper = studyMapper;
        this.centerMapper = centerMapper;
        this.visitMapper = visitMapper;
        this.idRuleMapper = idRuleMapper;
        this.codelistMapper = codelistMapper;
        this.itemMapper = itemMapper;
        this.linkMapper = linkMapper;
        this.formMapper = formMapper;
        this.sectionMapper = sectionMapper;
        this.fieldMapper = fieldMapper;
        this.fieldDictionaryMapper = fieldDictionaryMapper;
        this.fieldDictionaryService = fieldDictionaryService;
        this.formFieldMapper = formFieldMapper;
        this.templateSectionMapper = templateSectionMapper;
        this.templateFieldMapper = templateFieldMapper;
        this.templateService = templateService;
        this.objectMapper = objectMapper;
    }

    /** 全量种子（配置 + 码表 + 联动 + 字段 + 原子模板 + 默认组合）。 */
    @Transactional
    public Map<String, Integer> seedAll() {
        Map<String, Integer> stat = new LinkedHashMap<>();
        stat.put("studies", seedStudies());
        stat.put("centers", seedCenters());
        stat.put("visits", seedVisits());
        stat.put("idRules", seedIdRules());
        stat.put("codelists", seedCodelists());
        stat.put("links", seedLinks());
        stat.put("atoms", seedAtomsFromPriorityJson());
        stat.put("composite", seedCompositeTemplate());
        log.info("[nhp-seed] 完成: {}", stat);
        return stat;
    }

    /* ── 配置表 ── */

    public int seedStudies() {
        if (studyMapper.findByCode("NHP-XENO") != null) return 0;
        CrfStudy s = new CrfStudy();
        s.setCode("NHP-XENO");
        s.setName("NHP 异种移植");
        s.setProtocolVersion("V0.3");
        s.setActive(true);
        studyMapper.insert(s);
        return 1;
    }

    public int seedCenters() {
        int n = 0;
        n += seedCenter("SJ", "交大动物中心共建平台");
        n += seedCenter("SH", "上海SPF共建基地");
        n += seedCenter("RJ", "附属医院RJ");
        n += seedCenter("XH", "附属医院XH");
        n += seedCenter("HS", "附属医院HS");
        return n;
    }

    private int seedCenter(String code, String name) {
        if (centerMapper.findByCode(code) != null) return 0;
        CrfCenter c = new CrfCenter();
        c.setCode(code);
        c.setName(name);
        c.setActive(true);
        centerMapper.insert(c);
        return 1;
    }

    public int seedVisits() {
        // code / name / seq / repeating / plannedDays / eventAnchor（V25）；TP 码无横线（V27）
        String[][] visits = {
                {"TP00", "入组登记", "0", "0", null, "ENROLL"},
                {"TP01", "术前筛查期", "1", "0", "-7", "PRE_TX"},
                {"TP02", "术前基线", "2", "0", "0", "PRE_TX"},
                {"TP03", "术中", "3", "0", "0", "DAY0"},
                {"TP04", "术后早期", "4", "1", "1", "POST_TX"},
                {"TP05", "术后亚急性", "5", "1", "8", "POST_TX"},
                {"TP06", "术后中期", "6", "1", "29", "POST_TX"},
                {"TP07", "术后稳定期", "7", "1", "91", "POST_TX"},
                {"TP08", "长期随访", "8", "1", "181", "POST_TX"},
                {"TP09", "超长期", "9", "1", "366", "POST_TX"},
                {"TP10", "事件触发", "10", "1", null, "EVENT"},
                {"TP11", "终点/剖检", "11", "0", null, "ENDPOINT"},
                {"TP12", "数据锁定", "12", "0", "30", "LOCK"},
        };
        int n = 0;
        for (String[] v : visits) {
            CrfVisit existing = visitMapper.findByCode(v[0]);
            if (existing != null) {
                if (existing.getEventAnchor() == null || existing.getEventAnchor().isBlank()) {
                    visitMapper.updateEventAnchor(existing.getId(), v[5]);
                    n++;
                }
                continue;
            }
            CrfVisit visit = new CrfVisit();
            visit.setCode(v[0]);
            visit.setName(v[1]);
            visit.setSeq(Integer.parseInt(v[2]));
            visit.setRepeating("1".equals(v[3]));
            visit.setPlannedDays(v[4] == null ? null : Integer.parseInt(v[4]));
            visit.setEventAnchor(v[5]);
            visit.setActive(true);
            visitMapper.insert(visit);
            n++;
        }
        return n;
    }

    public int seedIdRules() {
        // idType / pattern / derived(1=派生)
        String[][] rules = {
                {"DON", "DON-{base}{year}-{seq:4}", "0"},
                {"RCP", "RCP-{center}{year}-{seq:3}", "0"},
                {"XM", "XM-{DONOR}-{RECIP}-{seq:2}", "0"},
                {"TX", "TX-{center}{year}-{seq:3}", "0"},
                {"FU", "FU-{TX}-{TP}-{seq:2}", "0"},
                {"AE", "AE-{TX}-{日期}-{seq:2}", "0"},
                {"REG", "REG-{TX}-{seq:2}", "0"},
                {"MED", "MED-{REG}-{seq:4}", "0"},
                {"LVL", "LVL-{TX}-{日期}-{seq:2}", "0"},
                {"ANES", "ANES-{TX}", "1"},
                {"PATH", "PATH-{TX}-{TP}-{seq:2}", "0"},
                {"HX", "HX-{TX}", "1"},
                {"PERF", "PERF-{DON}-{日期}", "0"},
                {"SMP", "SMP-{TX}-{TP}-{样本类型}-{seq:2}", "0"},
                {"TST", "TST-{实验室}{年月}-{seq:4}", "0"},
                {"RS", "RS-{TEST_ID}-{项目码}", "1"},
        };
        int n = 0;
        for (String[] r : rules) {
            List<CrfIdRule> existing = idRuleMapper.listByType(r[0]);
            if (!existing.isEmpty()) {
                CrfIdRule rule = existing.get(0);
                boolean dirty = false;
                if (!r[1].equals(rule.getPattern())) {
                    rule.setPattern(r[1]);
                    dirty = true;
                }
                boolean derived = "1".equals(r[2]);
                if (rule.getDerived() == null || rule.getDerived() != derived) {
                    rule.setDerived(derived);
                    dirty = true;
                }
                if (dirty) {
                    idRuleMapper.updatePatternAndDerived(rule);
                    n++;
                }
                continue;
            }
            CrfIdRule rule = new CrfIdRule();
            rule.setIdType(r[0]);
            rule.setPattern(r[1]);
            rule.setDerived("1".equals(r[2]));
            rule.setActive(true);
            idRuleMapper.insert(rule);
            n++;
        }
        return n;
    }

    /* ── 码表（04 §一）── */

    public int seedCodelists() {
        int n = 0;
        n += seedCodelist("FARM", "养殖基地", "SH=上海SPF共建基地");
        n += seedCodelist("CENTER", "动物/临床中心", "SJ=交大动物中心共建平台", "RJ=附属医院RJ", "XH=附属医院XH", "HS=附属医院HS");
        n += seedCodelist("BREED", "猪品种", "巴马小型猪", "五指山小型猪", "其他");
        n += seedCodelist("EDIT", "编辑组合", "GTKO=GTKO", "GTKO-CMAH-KO=GTKO-CMAH-KO", "GTKO-CMAH-B4GAL-KO=GTKO-CMAH-B4GAL-KO", "多敲+人源转入=多敲+人源转入");
        n += seedCodelist("PATHOGEN", "供体指定病原清单", "PERV-A=PERV-A", "PERV-B=PERV-B", "PERV-C=PERV-C", "PCMV=PCMV", "PCV2=PCV2", "PCV3=PCV3", "PCV4=PCV4", "HEV=HEV", "弓形虫=弓形虫", "布鲁氏菌=布鲁氏菌");
        n += seedCodelist("NHP_PATH", "NHP病原清单", "B病毒", "结核分枝杆菌", "SIV", "SRV", "STLV", "沙门氏菌", "志贺氏菌");
        n += seedCodelist("ORG", "器官", "K=肾", "H=心", "L=肝", "Lu=肺");
        n += seedCodelist("GRADE", "器官功能分级", "A=优（直接放行）", "B=可（有条件放行）", "C=不放行");
        n += seedCodelist("PROC", "术式", "原位替代", "辅助性", "异位", "细胞组织灌注");
        n += seedCodelist("IMMU", "免疫方案", "IND-CD154=IND-CD154", "IND-CD40=IND-CD40", "MTX-TAC-MMF=MTX-TAC-MMF");
        n += seedCodelist("SAMPLE", "样本类型", "EDTA全血", "血清", "血浆", "PBMC", "尿液", "粪便", "组织", "灌洗液");
        n += seedCodelist("ASSAY", "检测项目码", "PERVA=PERVA", "PERVB=PERVB", "PERVC=PERVC", "PERVINF=PERVINF", "PCFDNA=PCFDNA", "ABGAL=ABGAL", "ABNEU=ABNEU", "CDC=CDC", "FLOWXM=FLOWXM", "COAG=COAG", "CYTO=CYTO", "MICROB=MICROB");
        n += seedCodelist("LAB", "受托实验室", "LB01=LB01", "LB02=LB02");
        n += seedCodelist("AE", "事件类型", "超急性排斥", "急性体液排斥", "急性细胞排斥", "感染", "血栓性微血管病", "出血", "其他");
        n += seedCodelist("GRADE_AE", "事件分级", "1=1轻度", "2=2中度", "3=3重度", "4=4危及生命", "5=5死亡");
        n += seedCodelist("ENDPOINT", "终点类型", "计划终点", "人道安乐死", "死亡");
        n += seedCodelist("CAUSE", "终点原因", "排斥", "感染", "TMA", "出血", "手术并发症", "移植物失功", "其他");
        n += seedCodelist("VER", "版本对象", "DICT=DICT字典", "PANEL=PANEL", "CRITERIA=CRITERIA放行标准", "PROTOCOL=PROTOCOL方案");
        n += seedCodelist("DRUG_IS", "免疫抑制药物", "TAC=他克莫司", "MMF=吗替麦考酚酯", "MP=甲泼尼龙", "BAS=巴利昔单抗", "ATG=抗胸腺细胞球蛋白", "RAPA=雷帕霉素", "抗CD154单抗=抗CD154单抗", "抗CD40单抗=抗CD40单抗");
        n += seedCodelist("ROUTE", "给药途径", "PO=口服", "IV=静脉", "IM=肌注", "SC=皮下", "IA=动脉灌注");
        n += seedCodelist("DRUG_ANES", "麻醉药物", "丙泊酚", "七氟烷", "芬太尼类", "肌松药（顺阿曲库铵等）", "α2激动剂");
        n += seedCodelist("DOSE_ADJ", "剂量调整原因", "浓度超标", "浓度不足", "毒性反应", "排斥事件", "感染事件", "肝肾功能变化", "方案变更");
        n += seedCodelist("REJ_GRADE", "排斥病理分级", "0=无排斥", "1=交界性改变", "2=轻度", "3=中度", "4=重度");
        n += seedCodelist("STAIN", "病理检查类型", "HE=HE", "IHC=IHC", "IF=IF", "EM=EM");
        n += seedCodelist("PRESV", "器官保存液", "UW=UW", "HTK=HTK", "其他=其他");
        n += seedCodelist("GRAFT_H", "心脏移植物类型", "全心", "部分心脏含瓣管道", "瓣膜单独");
        n += seedCodelist("ECG_RHY", "心律类型", "窦性", "室性早搏", "室速", "房室传导阻滞", "停搏", "其他");
        n += seedCodelist("PERF", "灌注方式", "NMP=NMP常温机械灌注", "HMP=HMP低温机械灌注", "交叉循环=交叉循环（宿主连接）", "静态冷存=静态冷存");
        n += seedCodelist("LIVER_APP", "肝脏外观评分", "A=均匀红润质软", "B=局部花斑", "C=广泛淤血暗紫质硬（判不合格）");
        n += seedCodelist("SEX", "性别", "雄性", "雌性");
        n += seedCodelist("HE_SEMI", "HE半定量分级");
        n += seedCodelist("RELEASE", "放行结论", "放行", "不放行", "有条件放行");
        n += seedCodelist("PAIR_DECISION", "配对决策", "采用", "备选", "弃用");
        n += seedCodelist("QC_STATUS", "结果复核状态", "已复核", "待复核", "复测");
        n += seedCodelist("PERV_AC_RECOMB", "A/C重组检测", "阴性", "阳性");
        n += seedCodelist("PERV_INFECTIVITY", "PERV体外感染性", "阴性", "阳性", "未测");
        n += seedCodelist("PERV_C_STATUS", "PERV-C 状态", "阴性", "阳性");
        n += seedCodelist("BIOCONTAINMENT_LEVEL", "SPF/DPF 等级", "SPF", "DPF");
        n += seedCodelist("EDIT_VERIFY_STATUS", "编辑验证结果", "通过", "复核中", "失败");
        n += seedCodelist("SPECIES", "物种", "食蟹猴", "恒河猴", "狨猴");
        n += seedCodelist("ELIGIBILITY", "入选结论", "合格", "候补", "剔除");
        n += seedCodelist("CDC_XM_RESULT", "CDC 交叉配型", "阴性", "弱阳", "阳性");
        n += seedCodelist("FLOW_XM_RESULT", "流式交叉配型", "阴性", "弱阳", "阳性");
        n += seedCodelist("ADCC_RESULT", "ADCC 试验", "阴性", "阳性");
        n += seedCodelist("STORAGE_CONDITION", "存储条件", "-80℃", "LN2", "4℃", "RT");
        n += seedCodelist("AE_OUTCOME", "转归", "缓解", "部分缓解", "进展", "死亡");
        n += seedCodelist("NECROPSY_STATUS", "剖检完成状态", "完成", "部分", "未做");
        n += seedCodelist("REGIMEN_PHASE", "方案阶段", "诱导", "维持", "挽救");
        n += seedCodelist("MISSED_FLAG", "漏服/拒服标记", "无", "漏服", "拒服", "呕吐");
        n += seedCodelist("ANES_METHOD", "麻醉方式", "气管插管全麻", "复合麻醉");
        n += seedCodelist("SAMPLING_TYPE", "取材类型", "计划活检", "事件活检", "剖检");
        n += seedCodelist("MICRO_THROMBOSIS", "间质出血/血栓", "无", "局灶", "弥漫");
        n += seedCodelist("JACKET_ADAPT", "适应评估结果", "适应", "不适应移除");
        n += seedCodelist("ANASTOMOSIS", "吻合方式", "端端吻合", "端侧吻合");
        n += seedCodelist("BYPASS", "旁路循环建立", "是", "否");
        n += seedCodelist("PERICARDIAL_EFF", "心包积液", "无", "少量", "中量", "大量");
        n += seedCodelist("CXR_PREEXT", "拔管前胸片", "正常", "胸腔积液", "气胸");
        n += seedCodelist("CD141_IHC", "CD141免疫染色", "阴性", "弱阳", "阳性");
        n += seedCodelist("PLATELET_MORPH", "异常血小板形态", "正常", "异常");
        n += seedCodelist("PERF_CULTURE", "灌注液微生物培养", "阴性", "阳性");
        n += seedCodelist("PERF_ENDPOINT", "灌注终点判定", "计划完成", "功能衰竭", "技术中止");
        return n;
    }

    private int seedCodelist(String code, String name, String... specs) {
        int created = 0;
        CrfCodelist cl = codelistMapper.findByCode(code);
        if (cl == null) {
            // 曾软删：不强制复活（与 nhp-crf 组合种子策略一致）
            if (codelistMapper.countAnyByCode(code) > 0) {
                log.info("[nhp-seed] 码表 {} 已软删，跳过重建", code);
                return 0;
            }
            cl = new CrfCodelist();
            cl.setCode(code);
            cl.setName(name);
            cl.setVersion(1);
            // 种子基线直接 FROZEN（已发布），便于字段挂接；改项请「新建版本」再校对发布
            cl.setStatus("FROZEN");
            cl.setActive(true);
            codelistMapper.insert(cl);
            created = 1;
        } else if ("ACTIVE".equalsIgnoreCase(cl.getStatus())
                && cl.getVersion() != null && cl.getVersion() == 1
                && codelistMapper.findMaxVersionByCode(code) <= 1) {
            // 仅升级历史 ACTIVE 遗留态为已发布；勿在每次启动把用户正在编辑的 DRAFT v1 强行冻结
            codelistMapper.updateStatus(cl.getId(), "FROZEN");
            cl = codelistMapper.findById(cl.getId());
        }
        int order = 0;
        for (String spec : specs) {
            int eq = spec.indexOf('=');
            String itemCode = eq >= 0 ? spec.substring(0, eq).trim() : spec.trim();
            String itemLabel = eq >= 0 ? spec.substring(eq + 1).trim() : spec.trim();
            if (itemMapper.countByCodelistIdAndItemCode(cl.getId(), itemCode) == 0) {
                CrfCodelistItem item = new CrfCodelistItem();
                item.setCodelistId(cl.getId());
                item.setItemCode(itemCode);
                item.setItemLabel(itemLabel);
                item.setSortOrder(order);
                item.setActive(true);
                itemMapper.insert(item);
            }
            order++;
        }
        return created;
    }

    public int seedLinks() {
        CrfCodelist grade = codelistMapper.findByCode("GRADE");
        CrfCodelist org = codelistMapper.findByCode("ORG");
        if (grade == null || org == null) return 0;
        int n = 0;
        for (CrfCodelistItem organ : itemMapper.listByCodelistId(org.getId())) {
            CrfCodelistLink link = new CrfCodelistLink();
            link.setItemId(organ.getId());
            link.setChildCodelistId(grade.getId());
            link.setSortOrder(0);
            linkMapper.insert(link); // INSERT IGNORE，幂等
            n++;
        }
        return n;
    }

    /* ── 字段字典 + 原子模板呈现层（classpath:db/nhp-field-dict.json）── */

    public int seedFields() {
        List<Map<String, Object>> domains = loadFieldDict();
        if (domains == null) return 0;
        CrfStudy study = studyMapper.findByCode("NHP-XENO");
        Long studyId = study == null ? null : study.getId();
        int fields = 0;
        for (Map<String, Object> domain : domains) {
            // 域码以字段编码首段为准，避免 JSON 误写 DD1 却种出空壳原子
            String dcode = resolvePigDomainCode(domain);
            if (dcode == null) continue;
            String dname = str(domain.get("name"));
            String jsonCode = str(domain.get("code"));
            if (dname == null || dname.isBlank()
                    || (jsonCode != null && dname.equalsIgnoreCase(jsonCode))
                    || dname.equalsIgnoreCase(dcode)) {
                String canon = NhpAtomFormKeys.canonicalPigDomainCode(dcode);
                dname = pigDomainLabel(canon != null ? canon : dcode);
            }
            CrfForm form = formMapper.findByCode(dcode);
            if (form == null) {
                if (formMapper.countAnyByCode(dcode) > 0) {
                    log.info("[nhp-seed] 原子 {} 已软删，跳过重建", dcode);
                    continue;
                }
                form = new CrfForm();
                form.setStudyId(studyId);
                form.setCode(dcode);
                form.setName(dname);
                form.setFormType(("D9".equals(dcode) || "D10".equals(dcode)) ? "MODULE" : "DOMAIN");
                form.setVersion(1);
                form.setStatus("DRAFT");
                form.setDescription(NhpTemplateService.ORIGIN_SEED + "系统种子·猪套数据域原子（非业务阶段；非全局骨架）");
                form.setActive(true);
                formMapper.insert(form);
            } else if (!"DOMAIN".equals(form.getFormType()) && !"MODULE".equals(form.getFormType())) {
                // 纠正：D* 必须是原子模板
                form.setFormType(("D9".equals(dcode) || "D10".equals(dcode)) ? "MODULE" : "DOMAIN");
                if (form.getDescription() == null || form.getDescription().isBlank()) {
                    form.setDescription(NhpTemplateService.ORIGIN_SEED + "系统种子·猪套数据域原子（非业务阶段；非全局骨架）");
                }
                formMapper.update(form);
            } else if (form.getDescription() == null || form.getDescription().isBlank()) {
                form.setDescription(NhpTemplateService.ORIGIN_SEED + "系统种子·猪套数据域原子（非业务阶段；非全局骨架）");
                formMapper.update(form);
            }
            for (Map<String, Object> section : list(domain.get("sections"))) {
                for (Map<String, Object> f : list(section.get("fields"))) {
                    String fieldCode = str(f.get("fieldCode"));
                    CrfField field = fieldMapper.findByFieldCode(fieldCode);
                    if (field == null) {
                        field = new CrfField();
                        CrfFieldDictionary pig = fieldDictionaryMapper.findByDictKey("pig");
                        if (pig != null) field.setDictionaryId(pig.getId());
                        field.setFieldCode(fieldCode);
                        field.setNameEn(str(f.get("nameEn")));
                        field.setNameCn(str(f.get("nameCn")));
                        field.setDataType(str(f.get("dataType")));
                        field.setUnit(str(f.get("unit")));
                        field.setRequired(str(f.get("required")));
                        field.setCodelistId(resolveCodelist(resolveCodelistCode(
                                str(f.get("codelist")), str(f.get("codelistPending")), str(f.get("nameEn")), str(f.get("nameCn")))));
                        field.setDescription(str(f.get("desc")));
                        field.setConceptCode(str(f.get("conceptCode")));
                        field.setIdRuleType(pkIdRuleTypeFromSeed(f));
                        field.setNature(str(f.get("nature")));
                        // 种子字段视为已校对基线，直接 FROZEN，便于从字典生成原子；新建字段仍走 DRAFT→校对
                        field.setStatus("FROZEN");
                        field.setVersion(1);
                        field.setActive(true);
                        fieldMapper.insert(field);
                        fieldMapper.updateFreeze(field.getId(), "FROZEN", java.time.LocalDateTime.now(), "seed");
                        fields++;
                    } else {
                        // 回填 concept_code / id_rule / nature，保持与字典一致
                        boolean dirty = false;
                        String conceptCode = str(f.get("conceptCode"));
                        if (conceptCode != null && (field.getConceptCode() == null || field.getConceptCode().isBlank())) {
                            fieldMapper.updateConceptCode(field.getId(), conceptCode);
                        }
                        if (!eq(pkIdRuleTypeFromSeed(f), field.getIdRuleType())) {
                            field.setIdRuleType(pkIdRuleTypeFromSeed(f));
                            dirty = true;
                        }
                        if (!eq(str(f.get("nature")), field.getNature())) {
                            field.setNature(str(f.get("nature")));
                            dirty = true;
                        }
                        if (dirty) fieldMapper.update(field);
                    }
                    // 表单-字段引用（幂等）
                    final Long fieldId = field.getId();
                    String role = resolveSeedFieldRole(f);
                    if (formFieldMapper.listByFormId(form.getId()).stream().noneMatch(ff -> fieldId.equals(ff.getFieldId()))) {
                        CrfFormField ff = new CrfFormField();
                        ff.setFormId(form.getId());
                        ff.setFieldId(fieldId);
                        ff.setRole(role);
                        ff.setFkTarget(str(f.get("fkTarget")));
                        ff.setPosition(intOf(f.get("pos")));
                        formFieldMapper.insert(ff);
                    } else {
                        backfillFormFieldRole(form.getId(), fieldId, role);
                    }
                }
            }
        }
        return fields;
    }

    /** 为每个原子（D*）灌呈现层；不创建组合模板。 */
    public int seedTemplate() {
        List<Map<String, Object>> domains = loadFieldDict();
        if (domains == null) return 0;
        int fields = 0;
        for (Map<String, Object> domain : domains) {
            String dcode = resolvePigDomainCode(domain);
            if (dcode == null) continue;
            String dname = str(domain.get("name"));
            String jsonCode = str(domain.get("code"));
            if (dname == null || dname.isBlank()
                    || (jsonCode != null && dname.equalsIgnoreCase(jsonCode))
                    || dname.equalsIgnoreCase(dcode)) {
                String canon = NhpAtomFormKeys.canonicalPigDomainCode(dcode);
                dname = pigDomainLabel(canon != null ? canon : dcode);
            }
            CrfForm form = formMapper.findByCode(dcode);
            if (form == null) continue;
            // 已有模板则跳过
            if (!templateSectionMapper.listByFormId(form.getId()).isEmpty()) continue;
            CrfTemplateSection sec = new CrfTemplateSection();
            sec.setFormId(form.getId());
            sec.setCode(dcode);
            sec.setLabel(NhpTemplateSectionLabels.resolve(dcode, dname));
            sec.setSortOrder(0);
            sec.setSubdivisible(true);
            templateSectionMapper.insert(sec);
            for (Map<String, Object> section : list(domain.get("sections"))) {
                String scode = str(section.get("code"));
                String sectionCode = scode;
                // 章节码随字段域对齐（历史 DD1.01 → D1.01）
                String fieldDomain = null;
                for (Map<String, Object> f : list(section.get("fields"))) {
                    fieldDomain = NhpAtomFormKeys.domainOfFieldCode(str(f.get("fieldCode")));
                    if (fieldDomain != null) break;
                }
                if (fieldDomain != null && scode != null && scode.toUpperCase(Locale.ROOT).startsWith("D")) {
                    int dot = scode.indexOf('.');
                    sectionCode = fieldDomain + (dot >= 0 ? scode.substring(scode.indexOf('.')) : "");
                }
                CrfTemplateSection sub = new CrfTemplateSection();
                sub.setFormId(form.getId());
                sub.setParentId(sec.getId());
                String finalSubCode = sectionCode == null ? dcode : sectionCode.toUpperCase(Locale.ROOT);
                sub.setCode(finalSubCode);
                String subLabel = str(section.get("name"));
                if (subLabel == null || subLabel.isBlank()
                        || (scode != null && subLabel.equalsIgnoreCase(scode))
                        || subLabel.equalsIgnoreCase(finalSubCode)) {
                    // 字典 JSON 小节常无中文名：label 与 code 同值即可，填写侧只显示一次编码
                    subLabel = finalSubCode;
                }
                sub.setLabel(NhpTemplateSectionLabels.resolve(finalSubCode, subLabel));
                sub.setSortOrder(0);
                sub.setSubdivisible(false);
                templateSectionMapper.insert(sub);
                int order = 0;
                for (Map<String, Object> f : list(section.get("fields"))) {
                    CrfTemplateField tf = new CrfTemplateField();
                    tf.setFormId(form.getId());
                    tf.setSectionId(sub.getId());
                    tf.setFieldKey(str(f.get("fieldCode")));
                    tf.setDataType(str(f.get("dataType")));
                    tf.setLabel(str(f.get("nameCn")));
                    tf.setDescription(str(f.get("desc")));
                    tf.setType(defaultType(str(f.get("dataType"))));
                    tf.setDictKey(str(f.get("codelist")));
                    tf.setRole(resolveSeedFieldRole(f));
                    tf.setRoleMeta(roleMetaForSeedField(f));
                    tf.setRequired("YES".equals(str(f.get("required"))));
                    tf.setSortOrder(order++);
                    String unit = str(f.get("unit"));
                    if (unit != null) tf.setConfig("{\"unit\":\"" + unit + "\"}");
                    templateFieldMapper.insert(tf);
                    fields++;
                }
            }
        }
        return fields;
    }

    /** 原子优先种子：读 nhp-atoms.json（套→原子→字段），导套/原子/字段（替代按域组装的旧路线）。 */
    public int seedAtomsFromPriorityJson() {
        List<Map<String, Object>> suites = loadPriorityJson();
        if (suites == null || suites.isEmpty()) return 0;
        CrfStudy study = studyMapper.findByCode("NHP-XENO");
        Long studyId = study == null ? null : study.getId();
        int atomCount = 0;
        for (Map<String, Object> suite : suites) {
            String dictKey = str(suite.get("dictKey"));
            if (dictKey == null) continue;
            CrfFieldDictionary dict = fieldDictionaryMapper.findByDictKey(dictKey);
            if (dict == null) {
                dict = new CrfFieldDictionary();
                dict.setDictKey(dictKey);
                dict.setName(str(suite.get("name")));
                dict.setSpecies(str(suite.get("species")));
                dict.setStatus("ACTIVE");
                dict.setVersion(1);
                dict.setActive(true);
                fieldDictionaryMapper.insert(dict);
            }
            Long dictId = dict.getId();
            for (Map<String, Object> atom : list(suite.get("atoms"))) {
                String code = str(atom.get("code"));
                if (code == null) continue;
                CrfForm form = formMapper.findByCode(code);
                if (form == null) {
                    form = new CrfForm();
                    form.setStudyId(studyId);
                    form.setCode(code);
                    form.setName(str(atom.get("name")));
                    form.setFormType("MODULE");
                    form.setVersion(1);
                    form.setStatus("DRAFT");
                    form.setActive(true);
                    formMapper.insert(form);
                }
                form.setCaptureForm(str(atom.get("captureForm")));
                form.setEventAnchor(str(atom.get("eventAnchor")));
                form.setFrequency(str(atom.get("frequency")));
                // 表单宿主划分：按原子语义码显式指定（供体域→DONOR，其余默认受体 RECIPIENT）
                form.setHostType(hostTypeForAtom(code));
                if (form.getDescription() == null || form.getDescription().isBlank()) {
                    form.setDescription(NhpTemplateService.ORIGIN_SEED + "原子优先·" + (str(atom.get("folder")) == null ? code : str(atom.get("folder"))));
                }
                formMapper.update(form);
                for (Map<String, Object> f : list(atom.get("fields"))) {
                    String fieldCode = str(f.get("fieldCode"));
                    if (fieldCode == null) continue;
                    CrfField field = fieldMapper.findByFieldCodeInDict(dictId, fieldCode);
                    if (field == null) {
                        field = new CrfField();
                        field.setDictionaryId(dictId);
                        field.setFieldCode(fieldCode);
                        field.setNameEn(str(f.get("nameEn")));
                        field.setNameCn(str(f.get("nameCn")));
                        field.setDataType(str(f.get("dataType")));
                        field.setUnit(str(f.get("unit")));
                        field.setRequired(str(f.get("required")));
                        field.setCodelistId(resolveCodelist(resolveCodelistCode(
                                str(f.get("codelist")), str(f.get("codelistPending")), str(f.get("nameEn")), str(f.get("nameCn")))));
                        String desc = str(f.get("desc"));
                        String pending = str(f.get("codelistPending"));
                        if (pending != null && !pending.isBlank()) {
                            desc = (desc == null || desc.isBlank() ? "" : desc + " ") + "【内联枚举待提升码表：" + pending + "】";
                        }
                        field.setDescription(desc);
                        field.setConceptCode(str(f.get("conceptCode")));
                        field.setIdRuleType(pkIdRuleTypeFromSeed(f));
                        field.setNature(str(f.get("nature")));
                        field.setStatus("FROZEN");
                        field.setVersion(1);
                        field.setActive(true);
                        fieldMapper.insert(field);
                        fieldMapper.updateFreeze(field.getId(), "FROZEN", java.time.LocalDateTime.now(), "seed");
                    } else {
                        boolean dirty = false;
                        // 全量回填（字典权威），避免新旧 JSON 漂移时新值不生效
                        if (!eq(str(f.get("nameEn")), field.getNameEn())) { field.setNameEn(str(f.get("nameEn"))); dirty = true; }
                        if (!eq(str(f.get("nameCn")), field.getNameCn())) { field.setNameCn(str(f.get("nameCn"))); dirty = true; }
                        if (!eq(str(f.get("dataType")), field.getDataType())) { field.setDataType(str(f.get("dataType"))); dirty = true; }
                        if (!eq(str(f.get("unit")), field.getUnit())) { field.setUnit(str(f.get("unit"))); dirty = true; }
                        if (!eq(str(f.get("required")), field.getRequired())) { field.setRequired(str(f.get("required"))); dirty = true; }
                        Long codelistId = resolveCodelist(resolveCodelistCode(
                                str(f.get("codelist")), str(f.get("codelistPending")), str(f.get("nameEn")), str(f.get("nameCn"))));
                        if (!eq(codelistId, field.getCodelistId())) { field.setCodelistId(codelistId); dirty = true; }
                        if (!eq(pkIdRuleTypeFromSeed(f), field.getIdRuleType())) { field.setIdRuleType(pkIdRuleTypeFromSeed(f)); dirty = true; }
                        if (!eq(str(f.get("nature")), field.getNature())) { field.setNature(str(f.get("nature"))); dirty = true; }
                        if (!eq(str(f.get("conceptCode")), field.getConceptCode())) { field.setConceptCode(str(f.get("conceptCode"))); dirty = true; }
                        if (dirty) fieldMapper.update(field);
                    }
                    final Long fieldId = field.getId();
                    String role = resolveSeedFieldRole(f);
                    if (formFieldMapper.listByFormId(form.getId()).stream().noneMatch(ff -> fieldId.equals(ff.getFieldId()))) {
                        CrfFormField ff = new CrfFormField();
                        ff.setFormId(form.getId());
                        ff.setFieldId(fieldId);
                        ff.setRole(role);
                        ff.setFkTarget(str(f.get("fkTarget")));
                        ff.setPosition(intOf(f.get("pos")));
                        formFieldMapper.insert(ff);
                    } else {
                        backfillFormFieldRole(form.getId(), fieldId, role);
                    }
                }
                syncAtomTemplateFromJson(form, code, str(atom.get("name")), list(atom.get("fields")));
                atomCount++;
            }
        }
        return atomCount;
    }

    /**
     * 仅重同步原子模板题目 dictKey/type（不 upsert 字典字段）。字典/码表 JSON 修正后用于回填 crf_template_field。
     */
    public int resyncAtomTemplatesFromPriorityJson() {
        List<Map<String, Object>> suites = loadPriorityJson();
        if (suites == null) return 0;
        int n = 0;
        for (Map<String, Object> suite : suites) {
            for (Map<String, Object> atom : list(suite.get("atoms"))) {
                String code = str(atom.get("code"));
                if (code == null) continue;
                CrfForm form = formMapper.findByCode(code);
                if (form == null) continue;
                syncAtomTemplateFromJson(form, code, str(atom.get("name")), list(atom.get("fields")));
                n++;
            }
        }
        return n;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> loadPriorityJson() {
        try {
            ClassPathResource res = new ClassPathResource(ATOMS_RESOURCE);
            if (!res.exists()) {
                log.warn("[nhp-seed] 原子优先资源缺失: {}", ATOMS_RESOURCE);
                return null;
            }
            String json = new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});
            Object suites = root.get("suites");
            if (!(suites instanceof List<?> list)) return null;
            return (List<Map<String, Object>>) list;
        } catch (Exception e) {
            log.warn("[nhp-seed] 读取原子优先资源失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 默认组合模板 nhp-crf：钉住全部原子并快照；若不存在则生成并发布，便于采集通路开箱可用。
     * 已有活跃行：只纠正 form_type/显示名/种子标记（解决误入「套内数据域原子」），不覆盖结构。
     * 若仅有软删历史：不强制复活，避免删了又被种子拉回。
     */
    public int seedCompositeTemplate() {
        CrfForm existing = formMapper.findByCode(DEFAULT_COMPOSITE_KEY);
        if (existing != null) {
            boolean dirty = false;
            if (!"TEMPLATE".equals(existing.getFormType())) {
                existing.setFormType("TEMPLATE");
                dirty = true;
            }
            if (existing.getName() == null || "NHP 异种移植 CRF".equals(existing.getName())
                    || (existing.getName() != null && existing.getName().contains("原子"))) {
                existing.setName("NHP 异种移植 CRF（组合模板）");
                dirty = true;
            }
            if (existing.getDescription() == null || existing.getDescription().isBlank()
                    || !existing.getDescription().contains(NhpTemplateService.ORIGIN_SEED)) {
                existing.setDescription(NhpTemplateService.ORIGIN_SEED + "系统种子·组合模板（钉住多数据域原子，非单一业务阶段）");
                dirty = true;
            }
            if (dirty) {
                formMapper.update(existing);
            }
            // 已有活跃组合：有结构则跳过生成；无结构再补钉（仍保持 TEMPLATE）
            if (!templateSectionMapper.listByFormId(existing.getId()).isEmpty()) {
                // 若全版本均无已发布版且当前为草稿，自动发布一次，避免开填侧「看不到已发布表」
                boolean anyPub = false;
                for (CrfForm v : formMapper.listByCode(DEFAULT_COMPOSITE_KEY)) {
                    String st = v.getStatus() == null ? "" : v.getStatus().toUpperCase();
                    if ("FROZEN".equals(st) || "PUBLISHED".equals(st)) {
                        anyPub = true;
                        break;
                    }
                }
                if (!anyPub) {
                    String st = existing.getStatus() == null ? "" : existing.getStatus().toUpperCase();
                    if ("DRAFT".equals(st) || "FREEZING".equals(st)) {
                        templateService.publish(DEFAULT_COMPOSITE_KEY, null);
                        return 1;
                    }
                }
                return dirty ? 1 : 0;
            }
            var gen = templateService.generate(DEFAULT_COMPOSITE_KEY, "NHP 异种移植 CRF（组合模板）");
            if (gen == null || !Boolean.TRUE.equals(gen.getSuccess())) {
                log.warn("[nhp-seed] 默认组合模板补结构失败: {}", gen == null ? "null" : gen.getMessage());
                return dirty ? 1 : 0;
            }
            CrfForm created = formMapper.findByCode(DEFAULT_COMPOSITE_KEY);
            if (created != null) {
                created.setFormType("TEMPLATE");
                created.setDescription(NhpTemplateService.ORIGIN_SEED + "系统种子·组合模板（钉住多数据域原子，非单一业务阶段）");
                created.setName("NHP 异种移植 CRF（组合模板）");
                formMapper.update(created);
                String st = created.getStatus() == null ? "" : created.getStatus().toUpperCase();
                if (!"FROZEN".equals(st) && !"PUBLISHED".equals(st)) {
                    templateService.publish(DEFAULT_COMPOSITE_KEY, null);
                }
            }
            return 1;
        }
        // 无活跃行：若曾软删过则不再自动复活
        if (formMapper.countAnyByCode(DEFAULT_COMPOSITE_KEY) > 0) {
            log.info("[nhp-seed] {} 已软删，跳过重建（避免删后被种子强行拉回）", DEFAULT_COMPOSITE_KEY);
            return 0;
        }
        var gen = templateService.generate(DEFAULT_COMPOSITE_KEY, "NHP 异种移植 CRF（组合模板）");
        if (gen == null || !Boolean.TRUE.equals(gen.getSuccess())) {
            log.warn("[nhp-seed] 默认组合模板生成失败: {}", gen == null ? "null" : gen.getMessage());
            return 0;
        }
        CrfForm created = formMapper.findByCode(DEFAULT_COMPOSITE_KEY);
        if (created != null) {
            created.setFormType("TEMPLATE");
            created.setDescription(NhpTemplateService.ORIGIN_SEED + "系统种子·组合模板（钉住多数据域原子，非单一业务阶段）");
            created.setName("NHP 异种移植 CRF（组合模板）");
            formMapper.update(created);
        }
        templateService.publish(DEFAULT_COMPOSITE_KEY, null);
        return 1;
    }

    /* ── 工具 ── */

    private Long resolveCodelist(String code) {
        if (code == null) return null;
        CrfCodelist cl = codelistMapper.findByCode(code);
        return cl == null ? null : cl.getId();
    }

    /**
     * 字段有码表 code 直接返回；否则若有 codelistPending（内联枚举待提升），
     * 自动建码表 + 条目（code 由字段英文名生成），并返回 code。幂等。
     * 码表显示名优先用 nameCn，避免题目编辑器下拉只显示英文。
     */
    private String resolveCodelistCode(String code, String pending, String nameEn, String nameCn) {
        if (code != null && !code.isBlank()) return code;
        if (pending == null || pending.isBlank()) return null;
        String clCode = nameEn == null ? null : nameEn.trim().toUpperCase().replaceAll("[^A-Z0-9]+", "_");
        if (clCode == null || clCode.isBlank()) return null;
        String displayName = nameCn != null && !nameCn.isBlank()
                ? nameCn.trim()
                : (nameEn != null && !nameEn.isBlank() ? nameEn.trim() : clCode);
        CrfCodelist cl = codelistMapper.findByCode(clCode);
        if (cl == null) {
            cl = new CrfCodelist();
            cl.setCode(clCode);
            cl.setName(displayName);
            cl.setVersion(1);
            cl.setStatus("FROZEN");
            cl.setActive(true);
            codelistMapper.insert(cl);
            int order = 0;
            for (String raw : pending.split("/")) {
                String it = raw.trim();
                if (it.isEmpty()) continue;
                if (itemMapper.countByCodelistIdAndItemCode(cl.getId(), it) == 0) {
                    CrfCodelistItem ci = new CrfCodelistItem();
                    ci.setCodelistId(cl.getId());
                    ci.setItemCode(it);
                    ci.setItemLabel(it);
                    ci.setSortOrder(order);
                    ci.setActive(true);
                    itemMapper.insert(ci);
                }
                order++;
            }
        } else {
            maybeBackfillCodelistName(clCode, displayName, nameEn);
        }
        return clCode;
    }

    /** 内联枚举自动建表时曾用 nameEn 作显示名；种子重跑时用 nameCn 回填。 */
    private void maybeBackfillCodelistName(String code, String displayName, String nameEn) {
        if (code == null || displayName == null || displayName.isBlank()) return;
        if (!containsCjk(displayName)) return;
        CrfCodelist cl = codelistMapper.findByCode(code);
        if (cl == null) return;
        String current = cl.getName();
        if (current != null && current.equals(displayName)) return;
        boolean looksEnglish = current == null || current.isBlank()
                || current.equalsIgnoreCase(code)
                || (nameEn != null && current.equalsIgnoreCase(nameEn.trim()))
                || !containsCjk(current);
        if (looksEnglish) {
            codelistMapper.updateMetaByCode(code, displayName, cl.getFolder());
        }
    }

    private static boolean containsCjk(String text) {
        if (text == null) return false;
        for (int i = 0; i < text.length(); i++) {
            if (Character.UnicodeScript.of(text.charAt(i)) == Character.UnicodeScript.HAN) {
                return true;
            }
        }
        return false;
    }

    /**
     * 原子模板呈现层与 nhp-atoms.json 对齐：补缺失题目、回填 dictKey/type（已有结构不整表覆盖）。
     */
    private void syncAtomTemplateFromJson(CrfForm form, String atomCode, String atomName,
                                        List<Map<String, Object>> atomFields) {
        List<CrfTemplateSection> sections = templateSectionMapper.listByFormId(form.getId());
        CrfTemplateSection root;
        if (sections.isEmpty()) {
            root = new CrfTemplateSection();
            root.setFormId(form.getId());
            root.setCode(atomCode);
            root.setLabel(NhpTemplateSectionLabels.resolve(atomCode, atomName, form.getName()));
            root.setSortOrder(0);
            root.setSubdivisible(true);
            templateSectionMapper.insert(root);
        } else {
            root = sections.stream()
                    .filter(s -> s.getParentId() == null)
                    .findFirst()
                    .orElse(sections.get(0));
        }
        List<CrfTemplateField> existing = templateFieldMapper.listByFormId(form.getId());
        Map<String, CrfTemplateField> byKey = new LinkedHashMap<>();
        for (CrfTemplateField tf : existing) {
            if (tf.getFieldKey() != null) byKey.put(tf.getFieldKey(), tf);
        }
        int order = existing.stream()
                .map(CrfTemplateField::getSortOrder)
                .filter(Objects::nonNull)
                .max(Integer::compareTo)
                .orElse(-1);
        for (Map<String, Object> f : atomFields) {
            String fieldCode = str(f.get("fieldCode"));
            if (fieldCode == null) continue;
            String clCode = resolveCodelistCode(
                    str(f.get("codelist")), str(f.get("codelistPending")), str(f.get("nameEn")), str(f.get("nameCn")));
            String fieldType = typeFor(str(f.get("dataType")), clCode);
            CrfTemplateField tf = byKey.get(fieldCode);
            String role = resolveSeedFieldRole(f);
            String roleMeta = roleMetaForSeedField(f);
            if (tf == null) {
                tf = new CrfTemplateField();
                tf.setFormId(form.getId());
                tf.setSectionId(root.getId());
                tf.setFieldKey(fieldCode);
                tf.setDataType(str(f.get("dataType")));
                tf.setLabel(str(f.get("nameCn")));
                tf.setDescription(str(f.get("desc")));
                tf.setType(fieldType);
                tf.setDictKey(clCode);
                tf.setRole(role);
                tf.setRoleMeta(roleMeta);
                tf.setRequired("YES".equals(str(f.get("required"))));
                tf.setSortOrder(++order);
                String unit = str(f.get("unit"));
                if (unit != null) tf.setConfig("{\"unit\":\"" + unit + "\"}");
                templateFieldMapper.insert(tf);
            } else {
                if (!eq(tf.getRole(), role) || !eq(tf.getRoleMeta(), roleMeta)) {
                    templateFieldMapper.updateRoleMeta(tf.getId(), role, roleMeta);
                }
                // 回填 dictKey/type：空 dictKey 与显式码表均纠正（幂等）
                boolean dictKeyBlank = tf.getDictKey() == null || tf.getDictKey().isBlank();
                boolean needDictKey = clCode != null && !clCode.isBlank()
                        && (dictKeyBlank || !eq(tf.getDictKey(), clCode));
                boolean needType = !eq(tf.getType(), fieldType);
                if (needDictKey || needType) {
                    templateFieldMapper.updateDictKeyAndType(tf.getId(), clCode, fieldType);
                }
            }
        }
    }

    /** 题型：带码表 → 下拉/多选；否则按 dataType 兜底。 */
    private String typeFor(String dataType, String codelistCode) {
        if (codelistCode != null && !codelistCode.isBlank()) {
            return "ENUM_MULTI".equals(dataType) ? "checkbox" : "select";
        }
        return defaultType(dataType);
    }

    /** PK 字段的 roleMeta：pkRule=DON/RCP…；非 PK 返回 null。 */
    private String pkRuleMeta(String idRule) {
        if (idRule == null || idRule.isBlank()) return null;
        String type = idRule.trim().toUpperCase(Locale.ROOT);
        if (DERIVED_ID_TYPES.contains(type)) return null;
        return "{\"pkRule\":\"" + type + "\"}";
    }

    /** 原子宿主划分（表单划分）：供体域→DONOR，其余（受体档案 + 术后围绕受体的表单）默认 RECIPIENT。 */
    private String hostTypeForAtom(String code) {
        if (code == null) return null;
        String c = code.toLowerCase();
        if (c.startsWith("donor") || c.startsWith("pathogen") || "organ_release".equals(c)) {
            return "DONOR";
        }
        // 灌注是供体器官侧；perfusion_recipient/perfusion_endpoint 是受体侧
        if (c.startsWith("perfusion") && !c.endsWith("recipient") && !c.endsWith("endpoint")) {
            return "DONOR";
        }
        return "RECIPIENT";
    }

    /** DERIVED 字段 roleMeta：derivedSource=pattern 或算法说明。 */
    private String derivedRuleMeta(String derivedSource) {
        if (derivedSource == null || derivedSource.isBlank()) return null;
        return "{\"derivedSource\":\"" + derivedSource.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}";
    }

    /** 种子字段 → 模板 roleMeta（PK 写 pkRule；DERIVED 写 derivedSource）。 */
    private String roleMetaForSeedField(Map<String, Object> f) {
        String role = resolveSeedFieldRole(f);
        if ("PK".equals(role)) return pkRuleMeta(str(f.get("idRule")));
        if ("DERIVED".equals(role)) return derivedRuleMeta(str(f.get("derivedSource")));
        return null;
    }

    /** crf_field.id_rule_type 仅 PK 取号类写入；派生键（ANES/HX/RS）不写。 */
    private String pkIdRuleTypeFromSeed(Map<String, Object> f) {
        if (!"PK".equals(resolveSeedFieldRole(f))) return null;
        String idRule = str(f.get("idRule"));
        if (idRule == null || idRule.isBlank()) return null;
        String type = idRule.trim().toUpperCase(Locale.ROOT);
        return DERIVED_ID_TYPES.contains(type) ? null : type;
    }

    /** 种子 JSON 角色：显式 role 优先；有 idRule 则兜底 PK（避免历史 VALUE 采码漂移）。 */
    private String resolveSeedFieldRole(Map<String, Object> f) {
        String role = str(f.get("role"));
        if (role != null && !role.isBlank()) return role;
        String idRule = str(f.get("idRule"));
        if (idRule != null && !idRule.isBlank()) return "PK";
        return "VALUE";
    }

    /** 存量 form_field 角色与种子 JSON 对齐（重播种子时纠偏 VALUE→PK 等）。 */
    private void backfillFormFieldRole(Long formId, Long fieldId, String role) {
        if (formId == null || fieldId == null || role == null) return;
        formFieldMapper.listByFormId(formId).stream()
                .filter(ff -> fieldId.equals(ff.getFieldId()))
                .filter(ff -> !eq(ff.getRole(), role))
                .forEach(ff -> formFieldMapper.updateRole(ff.getId(), role));
    }

    private String defaultType(String dataType) {
        if (dataType == null) return "text";
        return switch (dataType) {
            case "TEXT" -> "textarea";
            case "INTEGER", "DECIMAL" -> "number";
            case "DATE", "DATETIME" -> "date";
            case "ENUM" -> "select";
            case "ENUM_MULTI" -> "checkbox";
            case "BOOLEAN" -> "checkbox";
            case "FILE" -> "file";
            default -> "text";
        };
    }

    /**
     * Re-import built-in pig field dictionary only.
     * Ensures pig shell exists, upserts/revives pig fields from seed JSON,
     * freezes seed field codes (DRAFT/PENDING → FROZEN) so「从字典生成」可用,
     * rebuilds structure_json, and soft-deletes bogus DD* seed atoms (no matching fields).
     * Does not touch monkey suite or force-recreate D1–D10 templates.
     * 重导入内置猪字典：补齐/复活/冻结种子字段、重建大纲、清理误种 DD* 空原子。
     */
    @Transactional
    public Map<String, Object> reimportPigDictionary() {
        Map<String, Object> stat = new LinkedHashMap<>();
        CrfFieldDictionary pig = ensureDictionaryShell(
                "pig", "猪异种移植字段字典", "猪",
                "默认字典：供体猪/受体 NHP 异种移植 CRF 字段（D1–D13）");
        ensureDictionaryShell(
                "monkey", "猴字段字典", "猴",
                "受体/猴相关字段字典壳；与猪字典隔离，可独立维护");
        stat.put("pigDictionaryId", pig.getId());
        int inserted = 0;
        int revived = 0;
        int updated = 0;
        int frozen = 0;
        int skipped = 0;
        List<Map<String, Object>> domains = loadFieldDict();
        if (domains != null) {
            for (Map<String, Object> domain : domains) {
                for (Map<String, Object> section : list(domain.get("sections"))) {
                    for (Map<String, Object> f : list(section.get("fields"))) {
                        String fieldCode = str(f.get("fieldCode"));
                        if (fieldCode == null) continue;
                        CrfField existing = fieldMapper.findAnyByFieldCodeInDict(pig.getId(), fieldCode);
                        if (existing == null) {
                            CrfField field = new CrfField();
                            field.setDictionaryId(pig.getId());
                            field.setFieldCode(fieldCode);
                            applySeedFieldMeta(field, f);
                            field.setStatus("FROZEN");
                            field.setVersion(1);
                            field.setActive(true);
                            fieldMapper.insert(field);
                            fieldMapper.updateFreeze(field.getId(), "FROZEN", java.time.LocalDateTime.now(), "seed-reimport");
                            inserted++;
                            frozen++;
                        } else if (!Boolean.TRUE.equals(existing.getActive())) {
                            applySeedFieldMeta(existing, f);
                            existing.setStatus("FROZEN");
                            existing.setActive(true);
                            fieldMapper.reactivateAndUpdate(existing);
                            fieldMapper.updateFreeze(existing.getId(), "FROZEN", java.time.LocalDateTime.now(), "seed-reimport");
                            revived++;
                            frozen++;
                        } else {
                            String st = existing.getStatus() == null ? "" : existing.getStatus().toUpperCase();
                            boolean needFreeze = !"FROZEN".equals(st) && !"PUBLISHED".equals(st);
                            boolean metaChanged = seedMetaDiffers(existing, f);
                            if (needFreeze || metaChanged) {
                                applySeedFieldMeta(existing, f);
                                if (needFreeze) {
                                    existing.setStatus("FROZEN");
                                }
                                // reactivateAndUpdate 可写回 active+meta；已活跃行同样可用
                                fieldMapper.reactivateAndUpdate(existing);
                                if (needFreeze) {
                                    fieldMapper.updateFreeze(existing.getId(), "FROZEN",
                                            java.time.LocalDateTime.now(), "seed-reimport");
                                    frozen++;
                                }
                                updated++;
                            } else {
                                skipped++;
                            }
                        }
                    }
                }
            }
        }
        stat.put("fieldsInserted", inserted);
        stat.put("fieldsRevived", revived);
        stat.put("fieldsUpdated", updated);
        stat.put("fieldsFrozen", frozen);
        stat.put("fieldsSkipped", skipped);
        var rebuilt = fieldDictionaryService.rebuildStructureFromFields("pig");
        stat.put("structureRebuilt", Boolean.TRUE.equals(rebuilt.getSuccess()));
        int bogusAtomsRemoved = softDeleteBogusDoubleDSeedAtoms();
        stat.put("bogusDoubleDAtomsRemoved", bogusAtomsRemoved);
        // 字段重导入 ≠ 原子恢复：检测有 FROZEN 字段却无活跃原子的域，并补生成（可复活软删的 D1）
        var ensure = templateService.ensureMissingAtomsFromDict("pig", true);
        if (Boolean.TRUE.equals(ensure.getSuccess()) && ensure.getData() != null) {
            @SuppressWarnings("unchecked")
            List<String> missing = (List<String>) ensure.getData().get("missingAtomDomains");
            @SuppressWarnings("unchecked")
            List<String> regenerated = (List<String>) ensure.getData().get("atomsRegenerated");
            @SuppressWarnings("unchecked")
            List<Map<String, String>> failed = (List<Map<String, String>>) ensure.getData().get("atomsFailed");
            stat.put("missingAtomDomains", missing != null ? missing : List.of());
            stat.put("atomsRegenerated", regenerated != null ? regenerated : List.of());
            stat.put("atomsFailed", failed != null ? failed : List.of());
            stat.put("atomsMissingDetected", missing != null ? missing.size() : 0);
            stat.put("atomsRegeneratedCount", regenerated != null ? regenerated.size() : 0);
        } else {
            stat.put("missingAtomDomains", List.of());
            stat.put("atomsRegenerated", List.of());
            stat.put("atomsFailed", List.of());
            stat.put("atomsEnsureError", ensure.getMessage());
        }
        stat.put("atomTemplatesResynced", resyncAtomTemplatesFromPriorityJson());
        log.info("[nhp-seed] reimport pig dictionary: {}", stat);
        return stat;
    }

    /**
     * Soft-delete historically mis-seeded pig atoms with double-D codes (DD1..).
     * Field codes are D1.*; those bogus atoms have no matching fields for generateFromDict.
     * Skip when pinned by a composite or referenced by fill instances.
     */
    private int softDeleteBogusDoubleDSeedAtoms() {
        int removed = 0;
        List<CrfForm> atoms = formMapper.listAtoms();
        if (atoms == null) return 0;
        for (CrfForm atom : atoms) {
            if (atom == null || atom.getCode() == null) continue;
            String code = atom.getCode().trim();
            if (!NhpAtomFormKeys.isBogusDoubleDBareAtom(code)) continue;
            // 仅猪套裸码；猴套 monkey__DD1 若用户自建则保留
            if (!NhpAtomFormKeys.matchesDictKey(code, NhpAtomFormKeys.DEFAULT_DICT_KEY)) continue;
            var r = templateService.deleteVersion(atom.getId());
            if (Boolean.TRUE.equals(r.getSuccess())) {
                removed++;
                log.info("[nhp-seed] soft-deleted bogus double-D atom {}@v{}", code, atom.getVersion());
            } else {
                log.warn("[nhp-seed] skip bogus atom {}: {}", code, r.getMessage());
            }
        }
        return removed;
    }

    /**
     * Resolve pig domain code from the first field code segment (D1.01.001 -> D1).
     * Avoids seeding empty DD1 atoms when JSON domain code was wrongly double-prefixed.
     */
    private String resolvePigDomainCode(Map<String, Object> domain) {
        for (Map<String, Object> section : list(domain.get("sections"))) {
            for (Map<String, Object> f : list(section.get("fields"))) {
                String fromField = NhpAtomFormKeys.domainOfFieldCode(str(f.get("fieldCode")));
                if (fromField != null) return fromField;
            }
        }
        String raw = str(domain.get("code"));
        if (raw == null) return null;
        String upper = raw.toUpperCase(Locale.ROOT);
        // No fields: still collapse DDn -> Dn so we never re-seed dirty atoms
        if (BOGUS_DOUBLE_D_ATOM.matcher(upper).matches()) {
            var m = Pattern.compile("^D+(\\d{1,3})$", Pattern.CASE_INSENSITIVE).matcher(upper);
            if (m.matches()) return "D" + m.group(1);
        }
        return upper;
    }

    /** 与 NhpTemplateService.DOMAIN_LABELS 对齐；缺省退回编码本身 */
    private static String pigDomainLabel(String domainCode) {
        if (domainCode == null || domainCode.isBlank()) return domainCode;
        return switch (domainCode.toUpperCase(Locale.ROOT)) {
            case "D1" -> "供体猪域";
            case "D2" -> "受体NHP域";
            case "D3" -> "配型与手术域";
            case "D4" -> "样本与检测域";
            case "D5" -> "随访与事件域";
            case "D6" -> "免疫抑制用药域";
            case "D7" -> "麻醉术中监护域";
            case "D8" -> "病理诊断域";
            case "D9" -> "心脏移植模块";
            case "D10" -> "体外肝灌注模块";
            case "D11" -> "公共数据层";
            case "D12" -> "标准与版本域";
            case "D13" -> "用户与权限域";
            default -> domainCode;
        };
    }

    private void applySeedFieldMeta(CrfField field, Map<String, Object> f) {
        field.setNameEn(str(f.get("nameEn")));
        field.setNameCn(str(f.get("nameCn")));
        field.setDataType(str(f.get("dataType")));
        field.setUnit(str(f.get("unit")));
        field.setRequired(str(f.get("required")));
        field.setCodelistId(resolveCodelist(resolveCodelistCode(
                str(f.get("codelist")), str(f.get("codelistPending")), str(f.get("nameEn")), str(f.get("nameCn")))));
        field.setDescription(str(f.get("desc")));
        field.setConceptCode(str(f.get("conceptCode")));
        field.setIdRuleType(pkIdRuleTypeFromSeed(f));
        field.setNature(str(f.get("nature")));
    }

    private boolean seedMetaDiffers(CrfField existing, Map<String, Object> f) {
        Long expectedCodelist = resolveCodelist(resolveCodelistCode(
                str(f.get("codelist")), str(f.get("codelistPending")), str(f.get("nameEn")), str(f.get("nameCn"))));
        return !eq(existing.getNameEn(), str(f.get("nameEn")))
                || !eq(existing.getNameCn(), str(f.get("nameCn")))
                || !eq(existing.getDataType(), str(f.get("dataType")))
                || !eq(existing.getUnit(), str(f.get("unit")))
                || !eq(existing.getRequired(), str(f.get("required")))
                || !eq(existing.getDescription(), str(f.get("desc")))
                || !eq(existing.getConceptCode(), str(f.get("conceptCode")))
                || !eq(existing.getIdRuleType(), pkIdRuleTypeFromSeed(f))
                || !eq(existing.getNature(), str(f.get("nature")))
                || !Objects.equals(existing.getCodelistId(), expectedCodelist);
    }

    private static boolean eq(Long a, Long b) {
        return Objects.equals(a, b);
    }

    private static boolean eq(String a, String b) {
        String x = a == null || a.isBlank() ? null : a.trim();
        String y = b == null || b.isBlank() ? null : b.trim();
        return x == null ? y == null : x.equals(y);
    }

    private CrfFieldDictionary ensureDictionaryShell(String dictKey, String name, String species, String description) {
        CrfFieldDictionary row = fieldDictionaryMapper.findByDictKey(dictKey);
        if (row == null) {
            row = new CrfFieldDictionary();
            row.setDictKey(dictKey);
            row.setName(name);
            row.setSpecies(species);
            row.setDescription(description);
            row.setStructureJson("{\"domains\":[]}");
            row.setVersion(1);
            row.setStatus("ACTIVE");
            row.setActive(true);
            fieldDictionaryMapper.insert(row);
            return row;
        }
        if (!Boolean.TRUE.equals(row.getActive())) {
            fieldDictionaryMapper.reactivate(row.getId());
            row.setActive(true);
            row.setStatus("ACTIVE");
        }
        return row;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> loadFieldDict() {
        try {
            ClassPathResource res = new ClassPathResource(FIELD_DICT_RESOURCE);
            if (!res.exists()) {
                log.warn("[nhp-seed] 字段字典资源缺失: {}", FIELD_DICT_RESOURCE);
                return null;
            }
            String json = new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});
            Object domains = root.get("domains");
            if (!(domains instanceof List<?> list)) return null;
            return (List<Map<String, Object>>) list;
        } catch (Exception e) {
            log.warn("[nhp-seed] 读取字段字典失败: {}", e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> list(Object o) {
        if (!(o instanceof List<?> l)) return List.of();
        return (List<Map<String, Object>>) l;
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private int intOf(Object v) {
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return 0; }
    }

    /** null 安全的相等比较（String/Long/Integer 通用） */
    private boolean eq(Object a, Object b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return String.valueOf(a).equals(String.valueOf(b));
    }
}
