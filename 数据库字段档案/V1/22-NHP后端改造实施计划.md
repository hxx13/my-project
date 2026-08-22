# 22-NHP 后端改造实施计划

> 状态：**实施计划（可执行）**。基于《2026-08-21-NHP采集引擎改造-设计计划.md》的 D1–D13 全量收敛结论，落到具体表/列/方法/迁移。
> 执行纪律：**双 SQL 四步走**（Flyway 归档 `common/schema/V*.sql` + bootstrap `src/main/resources/db/bootstrap-nhp-*.sql` + 启动链注册 + Java 适配），禁止直连库、禁止漏注册。
> 定位：**范围不收缩，前瞻性 + 高度可扩展性优先**；低可信度域（D6/D9/D10）先建 DRAFT 骨架，冻结权交校对流。

---

## 0. 现状精确盘点（改造前基线）

### 0.1 代码规模
- 32 entity + 32 mapper + 10 service + 9 controller + 3 util，全部在 `modules/nhp` 包下。
- 迁移：`common/schema/` 13 个 NHP V*.sql（11 个 `nhp_` 前缀 + 2 个 `crf_` 前缀：V20260821008 snapshot、V20260821010 entry_pass）+ `src/main/resources/db/` 10 个 bootstrap-nhp-*.sql + `nhp-field-dict.json`（249 字段源数据）。
- 启动链：`EmbeddedTwinSystemCoreDdlBootstrap` 硬编码执行 bootstrap 脚本列表。

### 0.2 关键表现状（改造要动的）
| 表 | 现状 | 改造要点 |
|---|---|---|
| `crf_subject` | subject_code(唯一)/subject_type/12 身份列(farm_code 自由文本) | 身份列接码表；createSubject 接取号器 |
| `crf_sequence` | 键 `(id_type, center_code, year)` | **泛化 `(id_type, scope_key)`** |
| `crf_id_rule` | id_type/pattern/center_code/active | 加 `derived` 标记；pattern 支持跨引用占位符 |
| `crf_visit` | code(TP-01~TP-12)/seq/repeating/planned_days/early_days/late_days | 加 `event_anchor` 列；TP 码统一无横线 |
| `crf_visit_instance` | subject_id/visit_id/planned_date/actual_date/status | **加 `transplant_id`**（TP 从 tx_date 算） |
| `crf_record` | subject_id/form_id/form_version_id/visit_instance_id(可空)/status/dag_id | **加 `atom_id` + `transplant_id`** |
| `crf_record_value` | EAV，已有 entry_mode/entry_pass/collected_at/source_ref | 基本够用，不改 |
| `crf_form` | code VARCHAR(16)/form_type/version/status | 加 schedule 两列（event_anchor/frequency） |
| `crf_field` | field_code(唯一)/data_type/required/codelist_id/cdisc_*/status | 加 `concept_code`（概念/指标库层） |
| `crf_form_field` | form_id/field_id/role(PK/FK/VALUE/DERIVED)/position | role 已就位，不改结构 |

### 0.3 已确认的现状结论
- `role` 已正确填充（JSON 222 VALUE / 15 PK / 12 FK / 0 DERIVED），seed 已读。缺 DERIVED 应用。
- `visit_instance_id` 已存在于 `crf_record`，无需加。
- timepoint 实测 65 离散值、三种语义混排，需归一化（§2.1）。

---

## 1. 迁移文件规划（新增编号段）

| 编号 | 内容 | 对应章节 |
|---|---|---|
| V20260821025 | timepoint 归一化：crf_visit 加 event_anchor + 建 crf_timepoint_map | §2.1 |
| V20260821026 | 概念/指标库：建 crf_concept + crf_field 加 concept_code | §2.2 |
| V20260821027 | 编码规则：crf_sequence 泛化 scope_key + crf_id_rule 加 derived | §4 |
| V20260821028 | 枢纽实体：建 crf_transplant + crf_crossmatch | §3.1 |
| V20260821029 | 样本实体：建 crf_sample/coc_event/test_order/test_result | §3.2 |
| V20260821030 | 随访实体：建 crf_followup/adverse_event/outcome | §3.3 |
| V20260821031 | 用药实体：建 regimen_library/regimen/medication/drug_level | §3.4 |
| V20260821032 | 麻醉+病理：建 anesthesia/transfusion/pathology(+ihc/if 子表) | §3.5 |
| V20260821033 | 模块+供体+协议+治理：建 heart_module/perfusion/donor_genedit/donor_organ/protocol/public_case/standard_version | §3.6/§3.7 |
| V20260821034 | 调度层：crf_form 加 schedule 两列（event_anchor/frequency）+ crf_record 加 atom_id/transplant_id + crf_visit_instance 加 transplant_id + crf_visit 加 end_days | §6 |
| V20260821035 | 事件规则引擎：建 crf_event_rule + crf_todo（事件→下游待办/事件，v5 评审补）+ crf_form 加 capture_form（采集形态推导） | §6.3 |
| V20260821036 | 校对治理：crf_field/crf_codelist_item 加 verdict + verdict_note（字段/码表四态校对，v7 评审补） | §6.5 |
| V20260821037 | 数据质量中心：建 crf_quality_event（异常值/时点偏差/TAT/CoC 断裂 收口，v8 评审补） | §6.5 |
| V20260821038 | 对象状态机 + 访视编排：crf_subject 加 lifecycle_stage + 建 crf_visit_plan（v5/v8 评审补） | §6.5 |

> 每个 V*.sql 同步产出 bootstrap-nhp-*.sql 并在 `EmbeddedTwinSystemCoreDdlBootstrap` 注册。

---

## 2. P0 数据质量前置

### 2.1 timepoint 归一化（时点本体）—— V20260821025

**产出**：65 原始值 → `(事件锚点 × 频次 × TP码)` 三元组，已归并为 43 个标准组合。

**事件锚点枚举（event_anchor）**：
`ENROLL`(入组) / `PRE_TX`(术前) / `DAY0`(移植当天) / `POST_TX`(术后) / `INTRAOP`(术中) / `ANES`(麻醉) / `PERFUSION`(灌注) / `HARVEST`(供体获取) / `SAMPLE`(取材) / `READOUT`(阅片/报告) / `REGIMEN`(方案) / `STORAGE`(入库) / `EVENT`(事件触发) / `ENDPOINT`(终点) / `LOCK`(锁定) / `ALL`(全程)

**频次枚举（frequency，共 15 个）**：
`ONCE` / `PER_TP`(各时点) / `PER_DOSE`(每次给药) / `Q3H` / `Q1_3H` / `Q15_30MIN` / `HOURLY` / `BIWEEKLY` / `QUARTERLY` / `ANNUAL` / `PER_LAB`(按血检频率) / `PER_PROTOCOL` / `CONTINUOUS`(连续) / `EVENT`(事件触发，可重复) / `PER_EVENT`(每次事件采一条)

**DDL 改动**：
1. `crf_visit` 加列 `event_anchor VARCHAR(32) NULL`（TP 码 → 事件锚点：TP01/02→PRE_TX、TP03→DAY0、TP04-09→POST_TX、TP10→EVENT、TP11→ENDPOINT、TP12→LOCK）。
2. 新建 `crf_timepoint_map`（65 原始值 → 三元组的映射，seed 灌入）：
   ```
   id BIGINT PK / raw_value VARCHAR(64) / event_anchor VARCHAR(32)
   / frequency VARCHAR(32) / tp_code VARCHAR(16) NULL / domain VARCHAR(8)
   / UNIQUE(raw_value, domain)
   ```

**残留处理**：
- `同上`(4 个，D9.05.002-005) → seed 时解析为跟随上一个字段的 timepoint，映射表不存"同上"。
- `0h/结束`(D10.03.012) → 拆为两个事件（PERF_0H + PERF_END），映射表存两条。
- `术前1月每2-3d；术后每2周`(D9.05.001) → 复合值拆为 PRE_TX(BIWEEKLY 术前段) + POST_TX(BIWEEKLY)，标注需 PI 确认。

### 2.2 概念/指标库层 —— V20260821026

**目标**：解决「字段复用 vs field_code 唯一键」冲突。肌酐/凝血/血常规等指标只定义一次概念，多个域的 crf_field 都指向它。

**DDL 改动**：
1. 新建 `crf_concept`：
   ```
   id BIGINT PK / concept_code VARCHAR(64) UNIQUE（如 LOINC 风格：CREAT/PLT/ALT）
   / name_cn VARCHAR(128) / name_en VARCHAR(64) / data_type VARCHAR(32)
   / unit VARCHAR(32) / codelist_id BIGINT NULL / active TINYINT
   ```
2. `crf_field` 加列 `concept_code VARCHAR(64) NULL`（多 crf_field → 1 concept，N:1）。

**复用语义**：D2.02 肌酐、D5.01 肌酐、D10.04 肾功里的肌酐，是三个不同 field_code，但共享同一 `concept_code=CREAT`。连续曲线 = 按 concept_code 聚合跨域字段值。

**seed 改动**：`nhp-field-dict.json` 的字段加 `conceptCode`，seedFields 落 `concept_code`。

### 2.3 DERIVED 补标

**目标**：DERIVED 现在是 0 个，pairing_score 应标 DERIVED 却标 VALUE。

**改动**（纯 seed，不建表）：
1. `nhp-field-dict.json`：`pairing_score`(D3.01.006) 的 role 改 `DERIVED`，desc 保留"平台配对算法输出 V1 规则引擎"。
2. 排查其他"算法输出/计算值"字段（D10.02.006 vasc_resistance"压力/流量自动计算"）一并标 DERIVED。
3. DERIVED 计算引擎结构预留：`crf_field.calc_expression` 已存在（V20260820001），引擎后置，先标字段。

### 2.4 EAV vs 实体表边界判据（设计规范，不建表）

四条判据（写进档案 06，作为逐域建表的执行规则）：
1. **稳定主键 + 被多域引用** → 实体表（subject/transplant/sample/regimen/...）
2. **身份属性（一实体一条）** → 身份列（crf_subject 身份列）
3. **测量序列（时间+指标+值，高频重复）** → EAV + 原子标序列频率（监护/随访/检测结果）
4. **标准/方案（版本化）** → 标准库表 + 实例引用（panel/方案/协议）

**EAV 归属清单（32 字段，明确走 EAV 不建列）**：
| 域 | 字段 | 原子 event_anchor | 频次 |
|---|---|---|---|
| D1.03 病原监测 | 9（surv_batch/surv_date/perv_a/perv_b/perv_c/重组/感染性/指定病原/microbiome） | ALL | QUARTERLY/ANNUAL |
| D2.02 基线 | 10（抗猪抗体/补体/凝血/免疫/肾功/微生物组） | PRE_TX | ONCE |
| D4.03 检测指标 | 6（cfDNA/PERV载量/抗体动态/补体活化/凝血TMA/细胞因子） | POST_TX | PER_TP |
| D5.01.004 graft_function | 细拆为多指标（肌酐/EF/ALT…） | POST_TX | PER_TP |
| D7.02 术中监护 | 6（hr/map/spo2/temp/etco2/深度） | INTRAOP | CONTINUOUS |

> 这些字段存 `crf_record_value`（EAV），按 concept_code 关联概念库，原子标注 event_anchor+frequency。

---

## 3. P1 实体层建表（25 张实体表）

> 每张表：先建 DRAFT 骨架（低可信度域 D6/D9/D10 字段挂 status=DRAFT，冻结权交校对流，见活文档 §4l 风险 5）。

### 3.1 枢纽实体 —— V20260821028

**`crf_transplant`**（D3.02；intraop_samples 归 crf_sample 不在此表）：
```
id BIGINT PK / tx_code VARCHAR(32) UNIQUE（TX-{center}{year}-{seq:3}）
/ donor_subject_id BIGINT FK→crf_subject / recipient_subject_id BIGINT FK→crf_subject
/ xm_id BIGINT FK→crf_crossmatch.id（采用的配型）
/ tx_organ VARCHAR(8)（码表 ORG 的 item_code）/ procedure_type VARCHAR(16)（码表 PROC）
/ tx_date DATE（day0 锚点）
/ cold_ischemia_min DECIMAL(10,2) / warm_ischemia_min DECIMAL(10,2) / reperfusion_time TIME
/ induction_regimen VARCHAR(16) / maintenance_regimen VARCHAR(16)（码表 IMMU，引用 D6 方案）
/ parent_tx_id BIGINT NULL 自引用（二次移植，超出 v0.3 字典，前瞻扩展待 D3 增补）
/ status VARCHAR(20) / active TINYINT / created_at / updated_at
```

**`crf_crossmatch`**（D3.01）：
```
id BIGINT PK / xm_code VARCHAR(32) UNIQUE（XM-{DONOR}-{RECIP}-{seq:2}）
/ donor_subject_id BIGINT FK / recipient_subject_id BIGINT FK
/ cdc_xm_result VARCHAR(8) / flow_xm_result VARCHAR(8) / adcc_result VARCHAR(8)
/ pairing_score DECIMAL(6,2)（DERIVED）
/ pairing_decision VARCHAR(16)（采用/备选/弃用）/ decision_rationale TEXT
/ status VARCHAR(20) / active TINYINT / created_at / updated_at
```

### 3.2 样本实体 —— V20260821029

**`crf_sample`**（D4.01）：
```
id BIGINT PK / sample_code VARCHAR(64) UNIQUE（SMP-...）
/ tx_id BIGINT NULL FK→crf_transplant（术后样本）/ donor_subject_id BIGINT NULL / recipient_subject_id BIGINT NULL（术前样本多态归属）
/ sample_type VARCHAR(16)（码表 SAMPLE）/ timepoint_code VARCHAR(16)（TP 码）
/ collect_datetime DATETIME / storage_condition VARCHAR(8) / storage_location VARCHAR(64)
/ status VARCHAR(20) / active TINYINT
```

**`crf_sample_coc_event`**（D4.01.008 交接，1:N）：
```
id BIGINT PK / sample_id BIGINT FK→crf_sample
/ handler VARCHAR(64) / event_time DATETIME / temperature DECIMAL(6,2) / note TEXT
```

**`crf_test_order`**（D4.02）：
```
id BIGINT PK / test_code VARCHAR(32) UNIQUE（TST-...）
/ lab_id VARCHAR(16)（码表 LAB）/ panel_version VARCHAR(16)（引用 §3.7 crf_standard_version）
/ test_items TEXT（ASSAY 码集合）/ tat_hours DECIMAL(6,1) / status VARCHAR(20)
/ sample_id BIGINT FK→crf_sample（补样本→委托单→结果溯源链，Excel 未列但必需）
```

**`crf_test_result`**（D4.03 = RS）：
```
id BIGINT PK / result_code VARCHAR(64) UNIQUE（RS-{TEST_ID}-{项目码}）
/ test_order_id BIGINT FK→crf_test_order / assay_code VARCHAR(16)（码表 ASSAY）
/ concept_code VARCHAR(64)（接概念库，复用指标）/ value 按 EAV 或类型化列
/ qc_status VARCHAR(16)（已复核/待复核/复测，状态机）
```

### 3.3 随访实体 —— V20260821030

**`crf_followup`**（D5.01，1:N 每 TX）：
```
id BIGINT PK / fu_code VARCHAR(48) UNIQUE（FU-{TX}-{TP}-{seq:2}）
/ tx_id BIGINT FK→crf_transplant / timepoint_code VARCHAR(16) / visit_instance_id BIGINT NULL
/ clinical_score DECIMAL(4,1) / regimen_change TEXT（引用 D6，不重复存）
```

**`crf_adverse_event`**（D5.02，1:N 每 TX）：
```
id BIGINT PK / ae_code VARCHAR(48) UNIQUE（AE-{TX}-{日期}-{seq:2}）
/ tx_id BIGINT FK / ae_type VARCHAR(16)（码表 AE）/ ae_grade VARCHAR(8)（码表 GRADE_AE）
/ rejection_ref BIGINT NULL FK→crf_pathology.id（排斥分级权威在 D8，引用不重复存）
/ biopsy_sample_id BIGINT NULL FK→crf_sample / intervention TEXT / ae_outcome VARCHAR(16)
```

**`crf_outcome`**（D5.03，1:1 每 TX，主键=tx_id）：
```
tx_id BIGINT PK FK→crf_transplant / survival_days INT / endpoint_type VARCHAR(16)（码表 ENDPOINT）
/ endpoint_cause VARCHAR(16)（码表 CAUSE）/ necropsy_status VARCHAR(16) / tissue_archive TEXT / lock_date DATE
```

### 3.4 用药实体 —— V20260821031

**`crf_regimen_library`**（D6.01 方案库，版本化）：
```
id BIGINT PK / immu_code VARCHAR(16)（码表 IMMU）/ version INT / dose_rule TEXT / target_range TEXT
/ active TINYINT / UNIQUE(immu_code, version)
```

**`crf_regimen`**（D6.01 方案实例）：
```
id BIGINT PK / regimen_code VARCHAR(48) UNIQUE（REG-{TX}-{seq:2}）
/ tx_id BIGINT FK→crf_transplant / immu_code VARCHAR(16) / immu_version INT（与 immu_code 复合引用方案库版本）
/ regimen_phase VARCHAR(16)（诱导/维持/挽救）/ regimen_start DATE / change_reason VARCHAR(16)（码表 DOSE_ADJ）
```

**`crf_medication`**（D6.02 给药，1:N 每方案，D7 麻醉用药共用）：
```
id BIGINT PK / med_code VARCHAR(48) UNIQUE（MED-{REG}-{seq:4}）
/ regimen_id BIGINT NULL FK→crf_regimen / anesthesia_id BIGINT NULL FK→crf_anesthesia（用途二选一）
/ drug_code VARCHAR(16)（码表 DRUG_IS 或 DRUG_ANES）/ dose_value DECIMAL(12,3) / dose_unit VARCHAR(8)
/ route VARCHAR(8)（码表 ROUTE）/ dose_time DATETIME / missed_flag VARCHAR(8)
```

**`crf_drug_level`**（D6.03 血药浓度，可能并入 test_result）：
```
id BIGINT PK / level_code VARCHAR(48) UNIQUE（LVL-{TX}-{日期}-{seq:2}）
/ regimen_id BIGINT FK→crf_regimen（浓度归属方案，Excel target_range 挂方案库）/ tx_id BIGINT NULL FK（冗余便于按例查）
/ drug_code VARCHAR(16) / trough_level DECIMAL(12,3) / target_range VARCHAR(32) / adj_event TEXT
```
> 待决：LVL 是否并入 `crf_test_result`（见 §5.3）。

### 3.5 麻醉 + 病理 —— V20260821032

**`crf_anesthesia`**（D7.01+D7.03，1:1 每 TX）：
```
id BIGINT PK / anes_code VARCHAR(32) UNIQUE（ANES-{TX}）
/ tx_id BIGINT FK→crf_transplant / anes_method VARCHAR(32) / depth_monitor VARCHAR(16)
/ ebl DECIMAL(10,2)（估计失血量 mL）/ fluid_total DECIMAL(10,2)（输液总量 mL）
/ urine_output DECIMAL(10,2)（术中尿量，肾移植例必填）
```
> D7.03.005 perfusion_param 引用 D10 不重复存。
**`crf_transfusion`**（D7.03 输血成分 1:N，替代"成分:mL"文本）：
```
id BIGINT PK / anesthesia_id BIGINT FK→crf_anesthesia / component VARCHAR(16) / volume_ml DECIMAL(10,2)
```

**`crf_pathology`**（D8.01 取材，1:N 每 TX，剖检逐器官）：
```
id BIGINT PK / path_code VARCHAR(48) UNIQUE（PATH-{TX}-{TP}-{seq:2}）
/ tx_id BIGINT FK→crf_transplant / sample_id BIGINT FK→crf_sample（CoC 绑定）
/ sampling_type VARCHAR(16)（计划/事件/剖检）/ organ_code VARCHAR(8)（码表 ORG，判别列）
/ timepoint_code VARCHAR(16) / he_findings TEXT / rej_grade VARCHAR(8)（码表 REJ_GRADE，排斥权威）
/ micro_thrombosis VARCHAR(8) / em_result TEXT / path_dx TEXT / report_date DATE
```
（IHC/IF 拆 1:N 子表，不压 JSON：）

**`crf_pathology_ihc`**（D8.03.001，1:N 每取材）：
```
id BIGINT PK / pathology_id BIGINT FK→crf_pathology / marker_code VARCHAR(16)（CD3/CD20/CD68）
/ panel_version VARCHAR(16)（panel 版本留痕）/ result VARCHAR(16)（阴性/弱阳/阳性）
```
**`crf_pathology_if`**（D8.03.002，1:N）：
```
id BIGINT PK / pathology_id BIGINT FK→crf_pathology / marker_code VARCHAR(16)（C3d/C4d/C5b-9/IgG/IgM）
/ deposit VARCHAR(32)（沉积结果）
```

### 3.6 模块 + 供体 + 协议 —— V20260821033

**`crf_heart_module`**（D9，1:1 每 TX）：
```
id BIGINT PK / heart_code VARCHAR(32) UNIQUE（HX-{TX}）/ tx_id BIGINT FK→crf_transplant
/ graft_type VARCHAR(16)（码表 GRAFT_H）/ ... D9 其余字段（DRAFT 骨架，待心脏 PI 校对）
```
**`crf_perfusion`**（D10，独立事件，不挂 TX）：
```
id BIGINT PK / perf_code VARCHAR(48) UNIQUE（PERF-{DON}-{日期}）
/ donor_subject_id BIGINT FK→crf_subject / recipient_subject_id BIGINT NULL FK→crf_subject（条件）
/ perf_mode VARCHAR(16)（码表 PERF）/ perfusate TEXT / perf_start DATETIME / perf_duration DECIMAL(8,2)
/ liver_cold_ischemia DECIMAL(8,2) / ... D10 其余字段（DRAFT 骨架）
```
**`crf_donor_genedit`**（D1.02，1:1 每供体）：
```
id BIGINT PK / donor_subject_id BIGINT FK→crf_subject / edit_combo_code VARCHAR(32)（码表 EDIT）
/ ko_loci TEXT / ki_loci TEXT / edit_verify_status VARCHAR(16) / offtarget_result VARCHAR(64)
/ transgene_copy_num INT / generation INT
```
**`crf_donor_organ`**（D1.04，1:N 每供体每器官）：
```
id BIGINT PK / donor_subject_id BIGINT FK→crf_subject / organ_code VARCHAR(8)（码表 ORG）
/ donor_weight DECIMAL(10,3) / organ_histology_baseline VARCHAR(64) / organ_function_grade VARCHAR(8)（码表 GRADE）
/ release_decision VARCHAR(16) / release_criteria_ver VARCHAR(16)（FK→D12 CRITERIA 版本）
```
**`crf_protocol`**（D9/D10 协议层，版本化）：
```
id BIGINT PK / protocol_code VARCHAR(32) / version INT / title VARCHAR(128) / source_doc VARCHAR(128)
/ active TINYINT / UNIQUE(protocol_code, version)
```

### 3.7 治理实体 —— V20260821033

**`crf_public_case`**（D11 已发表案例，导入层，非 CRF 采集）：
```
id BIGINT PK / pubcase_code VARCHAR(32) UNIQUE（PUBCASE-...）
/ source_ref VARCHAR(128)（文献 DOI/PMID）/ species VARCHAR(64) / organ VARCHAR(8)
/ summary TEXT / import_batch_id BIGINT NULL FK→crf_import_batch / active TINYINT
```

**`crf_standard_version`**（D12 统一标准库版本实体，消除 panel_version/release_criteria_ver 悬空 FK）：
```
id BIGINT PK / standard_code VARCHAR(32)（PANEL/CRITERIA/PROTOCOL/DICT 之一，码表 VER）
/ object_ref VARCHAR(64)（具体对象，如 panel 编码或协议码）/ version INT / version_note TEXT
/ active TINYINT / UNIQUE(standard_code, object_ref, version)
```
（`crf_test_order.panel_version`、`crf_donor_organ.release_criteria_ver` 改 FK→本表的 `object_ref`；`crf_protocol`/`crf_regimen_library` 的 version 亦引用本表）

> **D13 用户与权限域**：沿用既有 RoleEnum + capability 权限体系（`crf_form_role` 等），非 CRF 数据，本计划不建表。

---

## 4. P2 编码规则改造

### 4.1 crf_sequence 泛化 scope_key —— V20260821027

**现状**：键 `(id_type, center_code, year)`，只覆盖「机构+年」作用域。

**改动**：
1. `crf_sequence` 加列 `scope_key VARCHAR(128) NOT NULL DEFAULT ''`。
2. 唯一键改为 `(id_type, scope_key)`。
3. 迁移：旧数据 `scope_key = center_code + '|' + year` 回填。
4. `NhpIdService.next(idType, scopeKey)` 签名：`(idType, centerCode, year)` → `(idType, Map<String,Object> ctx)`，scope_key 由 ctx 拼出。

**scope_key 拼法**（各 ID 类型）：
| ID | scope_key |
|---|---|
| DON | `{base}\|{year}` |
| RCP/TX | `{center}\|{year}` |
| AE/LVL | `{tx}\|{date}` |
| MED | `{reg}` |
| SMP | `{tx}\|{tp}\|{sampleType}` |
| PATH/FU | `{tx}\|{tp}` |
| REG | `{tx}` |
| XM | `{donor}\|{recip}` |
| TST | `{lab}\|{yearmonth}` |
| PERF | `{don}\|{date}`（或标 derived，见 §4.2） |

> 注：旧回填 `scope_key = center_code + '|' + year` 仅对 DON/RCP/TX 成立；其余类型旧 buildCode 从未生成合法码，回填无需处理。

### 4.2 crf_id_rule 加 derived + 跨引用 —— V20260821027

1. `crf_id_rule` 加列 `derived TINYINT NOT NULL DEFAULT 0`（ANES/HX/RS = 1 派生键不走取号器；PERF 待 PI 确认「一日一次」后归 derived 或补 seq）。
2. pattern 占位符全集（格式标注）：`{base}`(FARM 基地码) / `{center}`(CENTER 中心码) / `{year}`(YY) / `{seq}` / `{seq:N}` / `{DONOR}`/`{DON}`(供体码) / `{RECIP}`(受体码) / `{TX}` / `{REG}` / `{TEST_ID}` / `{TP}`(时点码，统一替代 `{时点}`) / `{日期}`(YYMMDD) / `{年月}`(YYMM) / `{样本类型}` / `{实验室}` / `{项目码}`。
   注：DON 用「基地」FARM 码表、RCP/TX 用「中心」CENTER 码表，二者分码表，勿拍平成 center。
3. `NhpIdService.buildCode(idType, ctx)`：支持全部占位符，未解析的占位符**抛异常**（不再静默返回字面量）。

### 4.3 createSubject 接取号器

**现状**：`NhpRecordService.createSubject` L72-79 手填 subjectCode。

**改动**：
1. subjectCode 改为可选；未填时按 subject_type 调 `NhpIdService`（DON→DON 规则、RECIPIENT→RCP 规则）自动取号回填。
2. 保留唯一键 `uk_crf_subject_code` 兜底。

### 4.4 编码规则字典修正（seed 重灌）

| 项 | 改动 |
|---|---|
| FU | `FU-{TX}-{时点}` → `FU-{TX}-{TP}-{seq:2}` |
| XM | `XM-{DONOR}-{RECIP}` → `XM-{DONOR}-{RECIP}-{seq:2}` |
| TP 码 | 统一无横线 `TP01`~`TP12`（crf_visit.code 存量迁移 TP-01→TP01） |
| PERF/ORG | 回 PI 确认（一日一次约束、ORG 位数） |

---

## 5. P3 跨域去重

### 5.1 字段复用落地（概念库）
- D2.02 基线、D5.01 随访、D10.04 受体监测 里的肌酐/凝血/血常规/心肌标志物 → 共享 `concept_code`（§2.2 概念库）。
- graft_function（D5.01.004）细拆为独立指标字段，各挂 concept。

### 5.2 剂量调整去重
- 权威在 D6（`crf_regimen.change_reason`），D5.01.006 regimen_change 改为引用，不重复存。

### 5.3 LVL 并入 RS（待定）
- 倾向：`crf_drug_level` 并入 `crf_test_result`（血药浓度本质是检验+TDM 谷峰语义），`crf_test_result` 加 TDM 标记列。
- 若保留独立表，则明确 LVL 与 RS 的引用关系（LVL 是一次特殊 TST 的结果）。

### 5.4 给药实体统一
- `crf_medication` 用 `regimen_id`/`anesthesia_id` 二选一表达用途，麻醉用药与免疫用药共用一张给药表（码表仍分开 DRUG_IS/DRUG_ANES）。

### 5.5 排斥分级权威
- `crf_adverse_event.rejection_ref` 指向 `crf_pathology.id`，D5 不重复存排斥分级。

---

## 6. 原子重切 + 调度层

### 6.1 原子 code 扩展 —— V20260821034

**现状**：原子 code = 域码（D1），子模块只做呈现层 section。

**改动**：`crf_form` 加 schedule 两列（repeat 由 frequency 表达，不单设 repeat_flag）：
- `event_anchor VARCHAR(32)`（来自 timepoint 归一化）
- `frequency VARCHAR(32)`（频次；ONCE=一次性，其余频次=重复）

原子切分规则（见活文档 §4b 精修）：**子模块 × 重复频率**。原子 code 保持「域.子模块」短码，schedule 用两列表达节奏（不塞进 code，避免 VARCHAR(16) 溢出）。

**采集形态推导（v5 评审补）**：`crf_form` 加列 `capture_form VARCHAR(16)`（SERIES/LEDGER/PANEL），**推导而非人工选**，避免前后端各算一套：

| capture_form | 推导规则 | 原子示例 |
|---|---|---|
| `SERIES`（序列网格） | frequency ∈ {CONTINUOUS, Q15_30MIN, Q3H, Q1_3H, HOURLY} 或 在 §2.4 EAV 序列清单 | D7.02 监护序列 |
| `LEDGER`（台账） | 1:N 子实体 + 自动编号 + 判别列 | 样本 / 给药 / AE / 取材 / 输血 |
| `PANEL`（事件面板） | 其余（ONCE 低频单例） | 手术 / 配型 / 送检 / 麻醉 |

seed 时按规则计算落库；配置页展示为「推导结果」，允许覆盖但记 `crf_dict_change_log`（entity=capture_form）。

### 6.2 调度层

1. `crf_visit` 加 `end_days INT NULL`（重复时点右边界，如 TP07=91~180d；无此列 BIWEEKLY 无法算「各几条」）。
2. `crf_visit_instance` 加 `transplant_id BIGINT NULL FK→crf_transplant`（TP 从 tx_date 算；供体/术前/灌注 instance 为 NULL）。
3. `crf_record` 加 `atom_id BIGINT NULL FK→crf_form.id`（版本无关的逻辑原子标识，区别于 form_id+form_version_id 血缘）+ `transplant_id BIGINT NULL`。
4. 新增 `NhpVisitService`（访视展开引擎）：
   - `expandVisitPlan(subjectId, transplantId, eventAnchor)` → 按组合模板 + schedule 展开 `crf_visit_instance`。**支持非移植锚点**（HARVEST/PERFUSION/ENROLL），供体/灌注侧传 eventAnchor 而非 transplantId。
   - 以 `tx_date` 为 day0、`planned_days` 算计划日期；`early_days`/`late_days` 落容忍窗；`end_days` 算重复次数上限。
   - 事件触发类（frequency=EVENT/PER_EVENT）不预展开，事件发生时即时创建。

### 6.3 事件规则引擎 —— V20260821035（v5 评审补）

**缺口**：§6.2 的 VisitService 只回答「这个时点该做什么」（schedule 展开），回答不了「事件入库后驱动下游什么」（跨实体下游）。v5 前端画了 5 条驱动链，后端需承载——这是 v5 逼出的缺口。

**设计**：配置驱动的 `crf_event_rule`（源事件类型 + 触发时机 → 下游动作），动作四种：

| action | 语义 | v5 驱动链示例 |
|---|---|---|
| `EXPAND_SCHEDULE` | 调 VisitService.expandVisitPlan 展开 schedule | 手术完成 → 展开术后随访 |
| `GENERATE_TODO` | 写一条 `crf_todo` | 采血 → 送检待办 · 给药 → 谷浓度待办 · AE → 活检待办 |
| `CREATE_EVENT` | 创建下游事件 / 访视实例（event 触发类） | AE → TP10 事件加采 |
| `ADVANCE_STATE` | 推进源实体状态机 | 配型通过 → 手术排期 |

**DDL**：
1. `crf_event_rule`（规则定义，配置侧维护，同 `crf_id_rule`/`crf_validation_rule` 一类）：
   ```
   id BIGINT PK / source_atom VARCHAR(16)（源事件类型=原子 code，如 SMP/MED/TX/AE/XM）
   / trigger_on VARCHAR(20)（CREATED 入库 / STATUS_CHANGED 状态变更）
   / trigger_cond VARCHAR(32) NULL（STATUS_CHANGED 的目标状态，如 pairing_decision=APPROVED）
   / action VARCHAR(20)（EXPAND_SCHEDULE / GENERATE_TODO / CREATE_EVENT / ADVANCE_STATE）
   / action_spec JSON（参数：schedule_anchor / todo_type / event_atom / target_state）
   / sort_order INT / active TINYINT
   ```
2. `crf_todo`（待办，materialized，前端「今日待办」统一读它）：
   ```
   id BIGINT PK / subject_id BIGINT FK→crf_subject / transplant_id BIGINT NULL
   / todo_type VARCHAR(32) / source VARCHAR(20)（SCHEDULE 调度展开 / EVENT_RULE 事件驱动）
   / source_ref VARCHAR(64)（visit_instance_id 或 事件 id）
   / due_date DATE / status VARCHAR(20)（OPEN / DONE / CANCELLED；OVERDUE 派生不落库）
   / active TINYINT
   ```

**执行器**：`NhpEventEngine.onEvent(atomCode, entityId, payload)` —— 事件入库 / 状态变更时调用，查 `crf_event_rule` 匹配源原子 + 触发条件，逐条执行 action。VisitService 的 `expandVisitPlan` 降级为 `EXPAND_SCHEDULE` 动作的一个实现。

**待办双源统一**：schedule 待办由 VisitService 展开时写 `crf_todo`（source=SCHEDULE），事件待办由规则引擎写（source=EVENT_RULE）。前端「今日待办 + 逾期判定」统一读 `crf_todo`，逾期（due_date < now 且未 DONE）查询时派生，不落库。

**边界**：`crf_event_rule` 只承载「跨实体的下游驱动」；字段级校验仍在 `crf_validation_rule`，字段级 DERIVED 计算仍在 `crf_field.calc_expression`，互不越界。

### 6.4 读侧查询（v3/v4/v7/v8 评审补，无迁移，API 设计）

> EAV 的必然代价：值散在 `crf_record_value`，前端画「纵向序列 / 趋势曲线 / 待办聚合」需要专门的聚合查询。以下 4 个接口落到 `NhpQueryService`/`NhpTodoService`/`NhpQualityService`。

| 接口 | 用途 | 前端来源 |
|---|---|---|
| `listSeries(subjectId, conceptCode, from, to)` | 按 `concept_code` 聚合跨域字段值成纵向序列（肌酐在 D2.02/D5.01/D10.04 三个 field_code 聚成一条曲线） | v3 纵向网格 + v4 趋势曲线 |
| `listTodoBySubject(subjectId)` | 按 subject 聚合 `crf_todo` + 计算逾期（due_date<now 且未 DONE） | v3 对象卡片「待办 3 · 1 超时」 |
| `listVersions(entityType, code)` | 跨字典/码表/panel/方案四类对象的版本历史聚合 | v8 版本管理中心 |
| `compareImport(batchId)` | EDC 值 vs 纸版/Excel 源值的 diff（导入一致性核查） | v8 双轨导入 |

> 关键：`listSeries` 是「测量序列走 EAV」决策的配套读接口，没有它趋势曲线画不出来——必须与概念库（§2.2）同步落地，不能后置。

### 6.5 治理侧（v7/v8 评审补）—— V20260821036/37/38

#### ① 校对 verdict 维度 —— V20260821036（字段审核页命根子，三处发现但计划漏了）

**缺口**：`crf_field.status` 是生命周期态（DRAFT/PENDING_REVIEW/FROZEN/RETIRED），缺「校对意见」维度。Excel 校对总览的 verdict 四态（确认/需修改/建议删除/有疑问）无处落库——v7 设计稿自标、本计划早先在校对总览 sheet 也发现过，但漏补。

**DDL**：
1. `crf_field` 加 `verdict VARCHAR(16) NULL`（CONFIRM/MODIFY/DELETE/QUESTION）+ `verdict_note TEXT NULL`（PI 校对意见）。
2. `crf_codelist_item` 加 `verdict VARCHAR(16) NULL` + `verdict_note TEXT NULL`（item 级，码表审核页用）。

**校对工作流 6 阶段落法**（不扩状态机）：v8 画的「第一轮→汇总→第二轮商议→复审→三签署→冻结」全部落在 `PENDING_REVIEW` 状态内——
- 「第一轮校对」= PI 逐字段写 verdict + verdict_note；
- 「平台DM汇总」= 按 verdict 聚合「需修改/建议删除/有疑问」清单；
- 「第二轮商议」= `crf_field` 加 `review_round INT DEFAULT 1`（逐条处理后 +1）；
- 「三签署」= 复用签名机制（字段级校对签署 ≠ 记录级 `crf_signature`，新增 `crf_field_sign` 或复用扩展）；
- 「冻结」= verdict 全 CONFIRM → FROZEN。

#### ② 数据质量中心 —— V20260821037（Excel 治理合规 sheet 落地）

**缺口**：Excel「数据质量：双人复核/异常值复测/TAT监控/时点偏差自动标记/质控指标进入平台月报」+ v8 数据质量中心，后端零承载。

**DDL**：`crf_quality_event`（四类质量事件收口队列）：
```
id BIGINT PK / event_type VARCHAR(20)（OUTLIER 异常值 / DEVIATION 时点偏差 / TAT_OVERDUE TAT超时 / COC_BROKEN CoC断裂）
/ subject_id BIGINT NULL FK→crf_subject / ref_type VARCHAR(20)（record/sample/test_order/coc）
/ ref_id BIGINT / trigger_rule VARCHAR(128)（触发规则描述）
/ status VARCHAR(20)（OPEN/REVIEWED/CLOSED）/ reviewer VARCHAR(64) NULL / created_at
```

**4 类检测器**（服务逻辑，不建表）：
| 检测器 | 触发 | 依赖 |
|---|---|---|
| 异常值 OUTLIER | 值超 `crf_reference_range` | 参考范围表（已有） |
| 时点偏差 DEVIATION | collect_datetime vs 计划时点 | DERIVED 偏差（后置引擎） |
| TAT 超时 | test_order 超 `tat_hours` 未回传 | crf_test_order |
| CoC 断裂 | test_order 无 result 回传 | crf_sample_coc_event + test_result |

**质控月报聚合**：`NhpQualityService.monthlyReport()` → 双人复核完成率/异常值复测闭环/TAT 达标率/时点偏差率/CoC 未闭环 五个 KPI。

#### ③ 对象状态机 + 访视编排 —— V20260821038

**DDL**：
1. `crf_subject` 加 `lifecycle_stage VARCHAR(20)`（SCREENING 预筛 / MATCHING 配型中 / POST_TX 移植后 / ENDPOINT 终点）—— 支撑 v5「时间线视图随状态切换」，前端据此决定显示「术前筛选」还是「术后 TP 时间线」。
2. `crf_visit_plan`（访视编排：一个访视时点 = 哪些原子的清单，v4「访视是容器」落地）：
```
id BIGINT PK / visit_id BIGINT FK→crf_visit（TP 定义）/ atom_id BIGINT FK→crf_form（原子）
/ required TINYINT DEFAULT 1（该访视必做）/ sort_order INT
```
（VisitService 展开 visit_instance 时读此表列清单；区别于 `crf_composite_atom` 的组合呈现，这是访视维度的编排。）

**lifecycle_stage 推进**：由 `crf_event_rule` 的 ADVANCE_STATE 动作驱动（配型通过 → MATCHING→POST_TX 边界由手术完成触发），非手填。

---

## 7. 实施顺序 + 验收标准

### 顺序（依赖驱动，每步可独立验收）
1. **P0 数据质量**（V20260821025~26 + DERIVED seed）：timepoint 归一化 + 概念库 + DERIVED 补标。验收：65 值归并完成、concept_code 落库、pairing_score 标 DERIVED。
2. **P2 编码规则**（V20260821027）：scope_key 泛化 + derived + buildCode 收 ctx + createSubject 接取号器 + 字典修正。验收：16 类 ID 能正确生成、未解析占位抛异常、subject 自动取号。
3. **P1 实体层**（V20260821028~33）：按依赖顺序建表（枢纽 → 样本 → 随访 → 用药 → 麻醉病理 → 模块/供体/协议/治理）。验收：表建成 + 启动链注册 + Java 实体/mapper 落地。
4. **调度层**（V20260821034）：原子 schedule + visit_instance 挂 tx + VisitService。验收：访视计划能展开、record 绑定 atom+transplant。
5. **事件规则引擎**（V20260821035）：crf_event_rule + crf_todo + capture_form 推导。验收：采血→送检待办、手术→展开随访、AE→加采 等 5 条链可配置触发。
6. **治理侧**（V20260821036~38）：verdict 维度 + 数据质量中心 + 对象状态机 + 访视编排。验收：字段/码表四态校对可落库、四类质量事件可检测收口、对象状态随生命周期切换、访视清单可展开。
7. **P3 跨域去重**：字段复用 + 去重 + 给药统一 + 排斥权威。验收：概念库引用生效、无重复存储。

### 执行纪律（防错位）
- 每个 V*.sql 同步产出 bootstrap-nhp-*.sql，并注册 `EmbeddedTwinSystemCoreDdlBootstrap`。
- 每张新表同步 Java entity + mapper（annotation），service 按需新增。
- 低可信度域（D6/D9/D10）表先建 DRAFT 骨架，字段 status=DRAFT 不进 FROZEN。
- 每步完成后跑 `tsc -b --noEmit`（前端）或编译（后端）验证，不假绿。

---

## 8. 与既有档案关系
- 本文是 21（信息架构）→ 设计计划 → 代码 之间的**实施桥**，把结论落到表/列/方法/迁移编号。
- 05/06 的元数据/数据层设计、18 的后端建表设计，以本文为准（本文基于 D1–D13 全量分析，纠正 05/06/18 的旧 29 表设计的粒度问题）。
- 编码规则 04 的 16 类 ID 修正、timepoint 归一化，以本文 §2/§4 为准。

## 9. 明确后置的引擎（本计划不建，结构预留）
- **跨域引用求值引擎**（条件必填读别域 / FK / 互证）：本计划只建 FK 列（rejection_ref/biopsy_sample_id/panel_version 等），运行时求值引擎后置，结构已预留。
- **DERIVED 计算引擎**：`crf_field.calc_expression` 已存在，先补标 DERIVED 字段，计算引擎后置；时点偏差（DEVIATION）检测依赖此引擎，后置时偏差标记暂缺。
- **事件规则引擎**：已由 §6.3 承接（crf_event_rule + crf_todo，V20260821035），不再后置。
- **读侧聚合查询**：已由 §6.4 承接（listSeries/listTodoBySubject/listVersions/compareImport），**须随概念库（§2.2）同步落地，不后置**——否则趋势曲线画不出。
- **批量连录接口**（v4 序列批量 + 时间戳自动递增）：接口级，`NhpRecordService` 加 `upsertSeries(recordId, rows)`，后置。
- **中心编码列**：D2 的 center_id 已由 `crf_subject.center_id` 承接（V20260820002 已建列），非缺口，无需新增列。
