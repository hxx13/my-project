# 19-CDISC 命名对齐设计

> 状态：**设计态（深设计）**。本文件解决 14 复盘的 #7（CDISC CDASH 字段命名）。核心策略：**不重命名 249 字段，而是加一层 CDISC 映射元数据**，让导出层确定性地把 NHP 字段映射到 SDTM 标准变量，降低 IND 申报的数据映射成本。

## 一、背景（来源）

最低标准 §五 原话：

> 「字段命名尽量向 CDISC CDASH 标准靠拢（如用 USUBJID 代替"猴子编号"），这样后续人体临床试验升级 EDC 时，数据映射成本最低。」

## 二、策略：映射而非重命名

| 方案 | 取舍 | 结论 |
|---|---|---|
| 重命名 name_en 对齐 CDISC | 破坏已建的字典、码表引用、连锁关系 | ❌ 不做 |
| **加 CDISC 映射元数据** | name_en 保留，加 cdisc_domain + cdisc_variable 列，导出时按映射生成 SDTM | ✅ 采用 |

## 三、CDISC 标准简注（换对话快速对齐）

- **CDASH**（数据采集标准）：eCRF 字段命名标准（采集层）
- **SDTM**（数据递交标准）：IND/NDA 申报的数据集结构（递交层），分域（domain）

NHP 是**临床前**研究，数据不严格按 SDTM 递交；但「字段命名 + 映射」对齐 CDISC，能让后续人体临床试验的数据迁移成本最低。

## 四、NHP 数据域 → SEND 域映射

> 关键更正：NHP 是临床前研究，对齐标准应为 **SEND**（非临床数据交换标准），不是 SDTM（临床标准）。

| NHP 数据域 | SEND 域 | 说明 |
|---|---|---|
| D2 受体NHP域（个体） | DM（Demographics） | USUBJID/SEX/AGE |
| D2/D7 生命体征 | VS（Vital Signs） | hr/map/temp（生命体征字段在 D7，非 D2） |
| D4 样本与检测（检验） | LB（Laboratory） | 血药浓度/生化（复合文本字段需先原子化，见五） |
| D6 免疫抑制用药 | EX（Exposure） | 药物/剂量/途径（本研究协议干预，非伴随用药 CM） |
| D3 移植手术 | PR（Procedures） | 移植器官=PRLOC 解剖部位，非 PRTRT |
| D5 随访与事件（排斥） | CL（Clinical Observations） | 排斥/感染/血栓（SEND 无 AE 域，用 CL） |
| D5 随访（结局） | DS（Disposition） | 终点/死亡/安乐死 |
| D8 病理诊断 | MI（Microscopic Findings） | 镜下发现/排斥分级（Banff） |
| D1 供体猪域 | 自定义 + RELREC | 供体是**一级实体**，用独立主体 + RELREC 关联受体，非 SUPPQUAL |
| D9/D10 器官模块 | 自定义 | NHP 特异，一级实体 + 纵向序列 |

## 五、关键字段 SEND 映射示例（字段名已对照 03 核实）

| NHP 字段（真实 name_en） | SEND 映射 | 说明 |
|---|---|---|
| recip_id（D2.01.001 受体猴ID） | DM.USUBJID（经 STUDYID+SITEID 派生） | 稳定唯一受试者标识 |
| species（D2.01.003 物种） | DM + SUPPQUAL | NHP 种属无标准取值 |
| sex（D1.01.004 / D2.01.004 性别） | DM.SEX | D2 的 sex 在合并字段 sex/age 内 |
| weight（D2.01.005 体重） | BW.BWORRES（BW 域，非 VS） | |
| hr（D7.02.002 心率） | VS.VSORRES（VSTESTCD=HR） | 生命体征在 D7，非 D2 |
| trough_level（D6.03.003 谷浓度值） | LB.LBORRES（LBTESTCD 由 drug_code 动态派生） | 非固定 FK506 |
| drug_code（D6.02.003 药物编码） | EX.EXTRT | 免疫抑制=暴露域 |
| dose（D6.02.004 单次剂量） | EX.EXDOSE + EXDOSU | 需配单位 |
| route（D6.02.005 给药途径） | EX.EXROUTE | |
| tx_organ（D3.02.002 移植器官） | PR.PRLOC（解剖部位） | |
| rejection_dx（D5.02.004 排斥反应判定） | CL（临床观察） | SEND 无 AE 域 |
| endpoint_type（D5.03.002 终点类型） | DS.DSTERM | |
| rej_grade（D8.02.002 排斥病理分级） | MI.MIORRES（MITESTCD=Banff） | 含 micro_thrombosis/if_result |

> **复合文本字段警告**：血肌酐/血常规/生化无原子字段，藏在 `renal_baseline`（D2.02.008）/`recip_cbc`（D10.04.002）/`recip_renal`（D10.04.006）等复合文本里。要映射到 LB 需先做原子化改造（拆成原子检验字段或 EAV 检测结果表），否则 LB 映射只是纸面。

## 六、实现：crf_field 增加映射列

| crf_field 新增列 | 类型 | 说明 |
|---|---|---|
| cdisc_domain | VARCHAR(8) NULL | SDTM 域，如 DM/VS/LB/CM/EX/AE/DS/MI/SUPPQUAL |
| cdisc_variable | VARCHAR(8) NULL | SDTM 变量，如 USUBJID/VSTESTCD/LBTESTCD/CMTRT |
| cdisc_test_code | VARCHAR(40) NULL | 检验/生命体征的 test code，如 CREAT/WEIGHT/FK506 |

> 三列均 NULL 默认；只对「有 SDTM 对应」的字段填，NHP 特异字段留空（导出时归 SUPPQUAL 或自定义）。

## 七、导出层 + USUBJID 传播（按映射生成 SEND）

### 7.1 导出
- 导出时遍历 crf_field，按 `cdisc_domain + cdisc_variable` 分组，生成 SEND 域数据集。
- 有映射的字段 → 直接映射到标准域；无映射的 → 归 SUPPQUAL（key=USUBJID + QNAM=原字段名）。
- 这是「确定性映射」，不是导出后人工重命名。

### 7.2 USUBJID 传播与主体建模（关键，此前漏）

- **主体划分**：受体猴 = USUBJID（DM 主体）；供体猪 = 独立主体（单独 DM 记录或自定义域），用 RELREC（记录关系）关联受体猴；D10 同时挂 donor_id + recip_id 的记录，归属受体侧（主体=USUBJID），供体信息经关联引用。
- **传播路径**：D3-D9 各记录的外键是 `tx_id`，不直接带 recip_id。导出生成任何域数据集时，须经 `tx_id → crf_record → crf_subject(recip_id)` 两跳 join 回填 USUBJID。
- **跨中心唯一**：USUBJID 由 STUDYID + SITEID（中心码 SJ/SH/RJ/XH/HS）+ recip_id 派生，保证跨中心全局唯一。
- **落库建议**：为省导出时 join，可给 `crf_record` 冗余一列 `subject_code`（或 USUBJID），随创建写入；但权威 USUBJID 仍在导出层派生。

## 八、待确认

- [ ] 映射元数据（cdisc_domain/variable/test_code）是「一期就建」还是「临床阶段再补」？（Word 建议「预留」，但一期建好映射成本最低）
- [ ] 供体猪域（D1）是否也建 SUPPQUAL 映射，还是完全 NHP 自定义、不碰 CDISC？
- [ ] 是否需要一个「CDISC 码表」维护 test code（CREAT/WEIGHT/FK506…）的标准取值？

## 九、对底层代码架构的影响

- 映射是**元数据**（crf_field 三列），导出是**纯函数**（按映射生成 SDTM），放在 `export/` 层（承接 13 分层）。
- 不在字段字典层、不在表单模板层，独立一个「导出/映射」层，为 IND 申报预留标准接口。
