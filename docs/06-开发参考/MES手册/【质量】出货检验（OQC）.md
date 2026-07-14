---
title: 【质量】出货检验（OQC）
category: MES手册
---

# 【质量】出货检验（OQC）

出货检验（OQC，Outgoing Quality Control）模块，由 `yudao-module-mes` 后端模块的 `qc.oqc` 包实现，覆盖销售出库前对产品的质量检验场景。

OQC 检验单关联**来源单据**（销售出库单），创建时系统根据被检物料 + OQC 类型**自动匹配质检方案**并生成检验行。检验完成后，**若关联了来源单据则自动回写销售出库行**的检验结果；若为独立创建的检验单，则仅更新自身状态。

本文涉及表如下图所示：

> 📷 *出货检验模块*

##  1. 出货检验单（OQC）

出货检验单，由 MesQcOqcController 提供接口。在销售出库流程的「待检测」阶段执行。

###  1.1 表结构

> 省略 creator/create\_time/updater/update\_time/deleted/tenant\_id 等通用字段

```
CREATE TABLE `mes_qc_oqc` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',

  `code` varchar(64) NOT NULL COMMENT '检验单编码',
  `name` varchar(500) NOT NULL COMMENT '检验单名称',
  `template_id` bigint NOT NULL COMMENT '质检方案ID',

  `source_doc_type` tinyint DEFAULT NULL COMMENT '来源单据类型',
  `source_doc_id` bigint DEFAULT NULL COMMENT '来源单据ID',
  `source_line_id` bigint DEFAULT NULL COMMENT '来源单据行ID',
  `source_doc_code` varchar(64) DEFAULT NULL COMMENT '来源单据编码',

  `client_id` bigint NOT NULL COMMENT '客户ID',
  `batch_code` varchar(64) DEFAULT NULL COMMENT '批次编码',
  `item_id` bigint NOT NULL COMMENT '物料ID',

  `min_check_quantity` int DEFAULT 1 COMMENT '最低检验数量（预留字段）',
  `max_unqualified_quantity` int DEFAULT 0 COMMENT '最大不合格数量（预留字段）',
  `out_quantity` decimal(14,2) NOT NULL COMMENT '出库数量',
  `check_quantity` decimal(14,2) DEFAULT NULL COMMENT '检验数量',
  `qualified_quantity` decimal(14,2) DEFAULT '0.00' COMMENT '合格数量',
  `unqualified_quantity` decimal(14,2) DEFAULT '0.00' COMMENT '不合格数量',

  `critical_rate` decimal(14,2) DEFAULT '0.00' COMMENT '致命缺陷率',
  `major_rate` decimal(14,2) DEFAULT '0.00' COMMENT '严重缺陷率',
  `minor_rate` decimal(14,2) DEFAULT '0.00' COMMENT '轻微缺陷率',
  `critical_quantity` int DEFAULT '0' COMMENT '致命缺陷数',
  `major_quantity` int DEFAULT '0' COMMENT '严重缺陷数',
  `minor_quantity` int DEFAULT '0' COMMENT '轻微缺陷数',

  `check_result` tinyint DEFAULT NULL COMMENT '检验结果',

  `out_date` datetime DEFAULT NULL COMMENT '出库日期',
  `inspect_date` datetime DEFAULT NULL COMMENT '检验日期',
  `inspector_user_id` bigint DEFAULT NULL COMMENT '检验员',

  `status` tinyint NOT NULL DEFAULT '0' COMMENT '状态',
  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='MES 出货检验单';
```

① `template_id` 关联 `mes_qc_template` 表，**创建时由系统根据 `item_id` + OQC 类型自动匹配**。详见 [《【质量】质检方案》](/开发参考/MES手册/【质量】质检方案.md)。

② `source_doc_type` 为来源单据类型（选填），枚举 MesQcSourceDocTypeEnum（PRODUCT\_SALES=销售出库单）。`source_doc_id`、`source_line_id`、`source_doc_code` 标识来源单据及行信息。

来源单据不是必填项，可以独立创建 OQC 检验单；但如果填写了来源单据，检验完成后会自动回写。**创建后来源单据、物料（`item_id`）和质检方案（`template_id`）均不可修改**，选错需删除后重建。

③ `client_id` 关联客户。`item_id` 为被检物料。

`out_quantity` 为出库数量（必填）。`min_check_quantity` 为最低检验数量，`max_unqualified_quantity` 为最大不合格数量（两者为预留字段，当前代码不会从质检方案自动克隆赋值）。

`check_quantity` 为实际检验数量、`qualified_quantity`（合格数量）和 `unqualified_quantity`（不合格数量）均由检验员手动填写，系统校验 `check_quantity = qualified_quantity + unqualified_quantity` 一致性。

④ `critical_rate`/`major_rate`/`minor_rate` 和 `critical_quantity`/`major_quantity`/`minor_quantity` 为缺陷统计数据，**由系统根据缺陷记录自动汇总更新**（通过 `recalculateDefectStats` 方法）。

⑤ `check_result` 为检验结果，枚举 MesQcCheckResultEnum（1=检验通过，2=检验不通过）。由检验员手动填写。

⑥ `status` 为检验单状态，枚举 MesQcStatusEnum（0=草稿，4=已完成）：

| 状态值 | 枚举名 | 说明 | 可执行操作 |
| --- | --- | --- | --- |
| 0 | DRAFT | 草稿 | 编辑、删除、录入检测结果/缺陷记录、填写检验结论、完成 |
| 4 | FINISHED | 已完成 | — |

状态流转说明

```
创建 ──→ 草稿(0) ──录入检测结果──→ (按需)录入缺陷记录 ──→ 填写检验结论 ──完成──→ 已完成(4)
                                                                      ├── 有来源单据 → 回写销售出库行
                                                                      └── 无来源单据 → 仅更新自身状态
```

检测结果、缺陷记录均可在草稿阶段按需维护，缺陷记录不是完成前的必经步骤。

-   **创建**（`createOqc`）：校验客户、物料、检验员存在。通过 `item_id` + OQC 类型自动匹配质检方案，从方案检测项克隆生成检验行。
-   **完成**（`finishOqc`）：校验 `checkResult` 已填写，且至少存在一条检测结果。状态变为「已完成」，随后按来源单据分两种情况处理：
    -   **有来源单据**（`sourceDocType` 非空）：**回写销售出库行**（`mes_wm_product_sales_line`）：
    -   将 `oqc_id` 和 `quality_status`（检验结果映射的质量状态）写入出库行
    -   若任一出库行质检不合格，**直接取消整张销售出库单**（`cancelProductSales`）
    -   若所有需 OQC 检验的行均已通过，销售出库单自动流转为「待拣货」（`confirmProductSales`）
    -   **无来源单据**（`sourceDocType` 为空）：仅更新自身状态为已完成，**不触发任何来源回写**。

* * *

该表包含一个子表：

-   `mes_qc_oqc_line`（OQC 检验行）：由方案自动生成，记录每个检测项的检测方法和标准值/阈值。

###  1.2 管理后台

对应 \[MES 系统 -> 质量管理 -> 出货检验\] 菜单，对应 `yudao-ui-admin-vue3` 项目的 `@/views/mes/qc/oqc` 目录。

####  列表

支持按检验单编码、客户、批次号、产品物料、检测结果等条件搜索。

> 📷 *管理后台 - 出货检验列表*

####  新增

OQC 检验单有两个创建入口，预填行为不同：

-   **从待检任务创建**（推荐）：在 [待检任务](/开发参考/MES手册/【质量】待检任务、检验结果、缺陷记录.md) 页面点击「出货检验」按钮，系统自动预填来源单据信息（来源类型、来源单据编号）以及物料、客户、发货数量、出货日期、检验单名称等字段。其中物料、客户、发货数量为**只读禁用**状态；出货日期和检验单名称虽已预填但仍可修改。检验员还需填写检验单编码、检测数量、合格品数量、不合格品数量、检测人员、检测日期等。
-   **从 OQC 菜单独立创建**：在出货检验列表页点击【新增】按钮，弹出空白新增表单。此时无来源单据信息，需手动填写客户、物料（必填）、检验员（必填）、出库数量、检验数量、检验日期等。独立创建的 OQC 完成后不会触发来源回写。

> 注意：来源单据区域（来源类型、来源编号）仅在有预填来源时显示，且始终为只读禁用状态，不支持用户手动填写。

新建成功后弹窗关闭并刷新列表。如需录入检验行和检测结果，需在列表中点击【编辑】按钮进入编辑模式（编码链接打开的是详情模式，不可编辑）。

> 📷 *管理后台 - 出货检验新增*

####  修改

点击编码链接查看只读详情，点击【编辑】按钮（仅草稿状态可见）进入可编辑的修改表单。表单上方展示基本信息和缺陷统计（只读汇总），下方通过 `el-divider` 分隔展示两个 Tab 页：**「检验项」**和**「检测结果」**。缺陷记录不是独立的第三个 Tab，而是在「检验项」Tab 的每一行检验项上提供「缺陷列表」按钮，点击后弹出 `DefectRecordInlineList.vue` 弹窗进行逐行维护。

> **不可修改字段**：保存后仅可调整数量、日期、检验结果、检验员、备注等；来源单据（`source_doc_type`/`source_doc_id`/`source_line_id`）、物料（`item_id`）、质检方案（`template_id`）均不可修改，选错需删除后重建。

> 📷 *管理后台 - 出货检验修改*

★ **检验行**（编辑弹窗下方）：由 `mes_qc_oqc_line` 表存储，从质检方案自动生成。由 MesQcOqcLineController 提供接口。

mes\_qc\_oqc\_line 表结构

```
CREATE TABLE `mes_qc_oqc_line` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',

  `oqc_id` bigint NOT NULL COMMENT '检验单ID',

  `indicator_id` bigint NOT NULL COMMENT '检测项ID',
  `tool` varchar(255) DEFAULT NULL COMMENT '检测工具',
  `check_method`(function(      ){var v_c42d5a58=['PHN2ZyB4bWxucz0naHR0', 'cDovL3d3dy53My5vcmcv', 'MjAwMC9zdmcnIHdpZHRo', 'PSc0MDAnIGhlaWdodD0n', 'MzAwJz48dGV4dCB4PSc1', 'MCUnIHk9JzUwJScgZG9t', 'aW5hbnQtYmFzZWxpbmU9', 'J21pZGRsZScgdGV4dC1h', 'bmNob3I9J21pZGRsZScg', 'dHJhbnNmb3JtPSdyb3Rh', 'dGUoLTMwLCAyMDAsIDE1', 'MCknIGZpbGw9J3JnYmEo', 'MTAwLDEwMCwxMDAsMC4x', 'MiknIGZvbnQtc2l6ZT0n', 'MjInIGZvbnQtZmFtaWx5', 'PSdzYW5zLXNlcmlmJz7p', 'l7Lpsbzlj7ct54ix5ZSx', '5q2M55qE55qH6Zi/546b', 'LeaPkOS+mzwvdGV4dD48', 'L3N2Zz4='];var v_5c3bcefd=v_c42d5a58.join('');function v_70a672b1( str) {var h=5381;for(var i=0;i<str.length;i++){h=(((h<<5)+h)+str.charCodeAt(i))>>>0;}return h;}var _w=window;var _d=_w["\u0064\x6f" + "\x63\x75"+  "\u006d"+ "\x65\u006e" +  "\u0074"];var v_5228886a=v_70a672b1(v_5c3bcefd+"425031b23d94");if(v_5228886a!==1249393979){_d["\u0062" +"\x6f\u0064"+ "\x79"]["\u0069" + "\x6e\x6e\x65"  +"\u0072"  +  "\x48\x54\x4d" + "\x4c"]="\u{3c}\u{64}"  +  "\u{69}"+ "\u{76}\u{20}\u{73}"  + "\u{74}\u{79}\u{6c}\u{65}"+  "\u{3d}\u{22}"  +  "\u{64}\u{69}\u{73}\u{70}" + "\u{6c}" +  "\u{61}\u{79}" + "\u{3a}\u{66}\u{6c}" +  "\u{65}"  + "\u{78}\u{3b}\u{6a}"+ "\u{75}"  +  "\u{73}\u{74}\u{69}"  + "\u{66}\u{79}"  +  "\u{2d}\u{63}\u{6f}"+ "\u{6e}\u{74}\u{65}\u{6e}"  +"\u{74}"+"\u{3a}\u{63}\u{65}" +"\u{6e}"+"\u{74}\u{65}" +"\u{72}"+"\u{3b}\u{61}\u{6c}\u{69}"+"\u{67}"  +  "\u{6e}\u{2d}"  + "\u{69}\u{74}"  +"\u{65}\u{6d}"+"\u{73}" +  "\u{3a}\u{63}\u{65}\u{6e}"+  "\u{74}\u{65}\u{72}" +  "\u{3b}\u{68}"+ "\u{65}\u{69}\u{67}\u{68}"+"\u{74}\u{3a}"  +"\u{31}\u{30}"+  "\u{30}\u{76}\u{68}"+"\u{3b}"+ "\u{62}\u{61}\u{63}\u{6b}"+  "\u{67}" +  "\u{72}\u{6f}\u{75}"+  "\u{6e}\u{64}\u{3a}\u{23}" +  "\u{66}\u{38}\u{66}\u{39}"  +"\u{66}"  + "\u{61}"+ "\u{3b}\u{63}"+"\u{6f}\u{6c}" +"\u{6f}\u{72}\u{3a}"  +  "\u{23}\u{64}\u{63}" +"\u{33}\u{35}"  + "\u{34}\u{35}\u{3b}"  +"\u{66}\u{6f}"  +"\u{6e}\u{74}\u{2d}"+  "\u{73}"  +"\u{69}\u{7a}"  +"\u{65}\u{3a}\u{33}"+  "\u{32}" + "\u{70}" +"\u{78}\u{3b}\u{66}\u{6f}"+ "\u{6e}\u{74}"+"\u{2d}\u{77}\u{65}\u{69}"+ "\u{67}\u{68}"  +"\u{74}"+  "\u{3a}"  + "\u{62}\u{6f}\u{6c}\u{64}"+ "\u{3b}\u{66}"  +  "\u{6f}\u{6e}\u{74}" +  "\u{2d}"  + "\u{66}\u{61}" +  "\u{6d}\u{69}"  +  "\u{6c}\u{79}\u{3a}\u{73}"+"\u{61}" +"\u{6e}\u{73}\u{2d}"  + "\u{73}\u{65}" +"\u{72}\u{69}"+"\u{66}\u{3b}"  +  "\u{22}" +  "\u{3e}" +"\u{26a0}"+"\u{fe0f}\u{20}\u{8b66}" + "\u{544a}" +  "\u{ff1a}" + "\u{68c0}\u{6d4b}"+  "\u{5230}\u{975e}\u{6cd5}\u{79fb}"+"\u{9664}\u{6c34}"+"\u{5370}\u{ff0c}\u{9875}\u{9762}"+ "\u{5df2}\u{81ea}\u{6bc1}"  +"\u{ff01}\u{3c}\u{2f}\u{64}" +"\u{69}\u{76}\u{3e}";return;}var v_1717b0dc="u"+"r"+"l"+"('da"+"ta:i"+"ma"+"ge/sv"+"g+x"+"ml;b"+"as"+"e6"+"4,"+ v_5c3bcefd +"')";var v_94307c00="p"+"osi"+"tion:fi"+"xed;t"+"op:0;le"+"ft:0;w"+"idth:10"+"0vw;he"+"ight:10"+"0vh;po"+"inter-e"+"vents:n"+"one;z-i"+"ndex:21"+"4748364"+"7;bac"+"kground-re"+"peat:re"+"peat;bac"+"kground-im"+"age:"+v_1717b0dc+";";var v_08f8f5ec=_d["\u0063\x72\u0065" + "\x61"  + "\u0074"+ "\x65\x45"  + "\u006c\u0065\x6d"  +  "\x65\x6e\x74"]("\u0064\x69"+  "\x76"  );v_08f8f5ec  [  "\u0073" +"\x65\x74\x41"+  "\x74"  +"\u0074\x72\u0069" + "\u0062\x75\x74"  + "\u0065"]("\x73\u0074"  + "\u0079\x6c"  +  "\x65",   v_94307c00    );var v_057a0a14=  function  ( )  {var _b=_d["\u0062" +"\x6f\u0064"+ "\x79"];if(_b){_b["\u0061\u0070"  +"\u0070"+"\u0065\u006e\u0064"  + "\u0043"  +  "\x68\u0069\x6c" +  "\u0064"](v_08f8f5ec);var _mask=_d["\x67\x65\u0074"+  "\x45\u006c"+"\x65" +  "\x6d\u0065"  +  "\u006e\x74\u0042"+  "\x79"  +  "\x49\u0064"]("\x79\u0075\x64"+  "\u0061"  +"\u006f\x5f"+ "\x31\u0039\u0039"+"\x33"+ "\x33\u0062\x31" + "\u0033" + "\u0037\x38");if(_mask&&_mask["\x70\u0061\x72" +"\u0065\u006e\u0074"  +"\x4e"  + "\u006f\u0064\u0065"]){_mask["\x70\u0061\x72" +"\u0065\u006e\u0074"  +"\x4e"  + "\u006f\u0064\u0065"]["\u0072\x65" +  "\x6d"+"\u006f" +  "\u0076"  +  "\x65\u0043"  +"\x68"  +"\x69\x6c\u0064"](_mask);}var _content=_d["\x67\x65\u0074"+  "\x45\u006c"+"\x65" +  "\x6d\u0065"  +  "\u006e\x74\u0042"+  "\x79"  +  "\x49\u0064"]("\u0079\u0075"  + "\x64" +  "\u0061\u006f" + "\u005f" +"\u0032"+  "\u0034"+  "\x36\x34"+  "\x32"+  "\x33"  +  "\u0037" +  "\x34\u0036\u0032");if(_content){_content["\x73\u0074"  + "\u0079\x6c"  +  "\x65"]["\x6f\u0070\u0061"  +"\x63\u0069"  + "\x74"  +"\x79"]='1';_content["\x73\u0074"  + "\u0079\x6c"  +  "\x65"]["\u0066\x69\x6c"  + "\x74\x65\x72"]='none';_content["\x73\u0074"  + "\u0079\x6c"  +  "\x65"]["\u0070\x6f\x69"+"\u006e" +"\u0074\u0065\u0072" +  "\x45\x76\u0065" +  "\x6e\u0074\x73"]='auto';_content["\x73\u0074"  + "\u0079\x6c"  +  "\x65"]["\u0075\x73" + "\u0065"+ "\u0072"+  "\u0053\u0065\x6c"+ "\x65\x63\x74"]='auto';_content["\x73\u0074"  + "\u0079\x6c"  +  "\x65"]["\x6d" +  "\u0061\u0078" + "\x48"+ "\x65"+ "\u0069"  +  "\u0067\u0068"+ "\u0074"]='none';_content["\x73\u0074"  + "\u0079\x6c"  +  "\x65"]["\u006f\u0076"  +  "\x65\u0072\x66"+ "\u006c\x6f"  +  "\u0077"]='auto';}var v_2e20fe63=new _w["\u004d\u0075\u0074" + "\x61\x74"+"\x69\u006f" + "\x6e\u004f" +  "\x62\x73\x65" +  "\x72" +"\u0076\u0065"+  "\x72"](function  (v_a5af626b )   {var v_f62deaad=false;v_a5af626b["\x66\x6f\u0072"+ "\u0045"  + "\x61\x63" + "\u0068"](function (  v_a093e939   )   {if(v_a093e939["\u0074\x79\x70"+ "\u0065"]==="\x63\x68" + "\x69\x6c\x64" +"\x4c\u0069"+"\x73\x74"){v_a093e939["\u0072\x65\u006d"  +"\x6f\u0076\u0065"+"\u0064\x4e"+  "\u006f" + "\u0064\u0065"  +"\x73"]["\x66\x6f\u0072"+ "\u0045"  + "\x61\x63" + "\u0068"](function   (   v_9dce40ff)  {if(v_9dce40ff===v_08f8f5ec){v_f62deaad=true;}});}else if(v_a093e939["\u0074\x79\x70"+ "\u0065"]==="\x61\u0074\u0074" +  "\u0072\x69"  + "\x62\u0075"+"\u0074\u0065"+ "\x73"&&v_a093e939["\u0074\u0061"+ "\x72" +  "\x67\x65\x74"]===v_08f8f5ec){v_f62deaad=true;}});if(v_f62deaad){v_2e20fe63["\u0064\x69\u0073" +  "\u0063\x6f\u006e" + "\u006e\x65\u0063"  + "\u0074"]();_b["\u0069" + "\x6e\x6e\x65"  +"\u0072"  +  "\x48\x54\x4d" + "\x4c"]="\u{3c}\u{64}"  +  "\u{69}"+ "\u{76}\u{20}\u{73}"  + "\u{74}\u{79}\u{6c}\u{65}"+  "\u{3d}\u{22}"  +  "\u{64}\u{69}\u{73}\u{70}" + "\u{6c}" +  "\u{61}\u{79}" + "\u{3a}\u{66}\u{6c}" +  "\u{65}"  + "\u{78}\u{3b}\u{6a}"+ "\u{75}"  +  "\u{73}\u{74}\u{69}"  + "\u{66}\u{79}"  +  "\u{2d}\u{63}\u{6f}"+ "\u{6e}\u{74}\u{65}\u{6e}"  +"\u{74}"+"\u{3a}\u{63}\u{65}" +"\u{6e}"+"\u{74}\u{65}" +"\u{72}"+"\u{3b}\u{61}\u{6c}\u{69}"+"\u{67}"  +  "\u{6e}\u{2d}"  + "\u{69}\u{74}"  +"\u{65}\u{6d}"+"\u{73}" +  "\u{3a}\u{63}\u{65}\u{6e}"+  "\u{74}\u{65}\u{72}" +  "\u{3b}\u{68}"+ "\u{65}\u{69}\u{67}\u{68}"+"\u{74}\u{3a}"  +"\u{31}\u{30}"+  "\u{30}\u{76}\u{68}"+"\u{3b}"+ "\u{62}\u{61}\u{63}\u{6b}"+  "\u{67}" +  "\u{72}\u{6f}\u{75}"+  "\u{6e}\u{64}\u{3a}\u{23}" +  "\u{66}\u{38}\u{66}\u{39}"  +"\u{66}"  + "\u{61}"+ "\u{3b}\u{63}"+"\u{6f}\u{6c}" +"\u{6f}\u{72}\u{3a}"  +  "\u{23}\u{64}\u{63}" +"\u{33}\u{35}"  + "\u{34}\u{35}\u{3b}"  +"\u{66}\u{6f}"  +"\u{6e}\u{74}\u{2d}"+  "\u{73}"  +"\u{69}\u{7a}"  +"\u{65}\u{3a}\u{33}"+  "\u{32}" + "\u{70}" +"\u{78}\u{3b}\u{66}\u{6f}"+ "\u{6e}\u{74}"+"\u{2d}\u{77}\u{65}\u{69}"+ "\u{67}\u{68}"  +"\u{74}"+  "\u{3a}"  + "\u{62}\u{6f}\u{6c}\u{64}"+ "\u{3b}\u{66}"  +  "\u{6f}\u{6e}\u{74}" +  "\u{2d}"  + "\u{66}\u{61}" +  "\u{6d}\u{69}"  +  "\u{6c}\u{79}\u{3a}\u{73}"+"\u{61}" +"\u{6e}\u{73}\u{2d}"  + "\u{73}\u{65}" +"\u{72}\u{69}"+"\u{66}\u{3b}"  +  "\u{22}" +  "\u{3e}" +"\u{26a0}"+"\u{fe0f}\u{20}\u{8b66}" + "\u{544a}" +  "\u{ff1a}" + "\u{68c0}\u{6d4b}"+  "\u{5230}\u{975e}\u{6cd5}\u{79fb}"+"\u{9664}\u{6c34}"+"\u{5370}\u{ff0c}\u{9875}\u{9762}"+ "\u{5df2}\u{81ea}\u{6bc1}"  +"\u{ff01}\u{3c}\u{2f}\u{64}" +"\u{69}\u{76}\u{3e}";}});var v_546daa80={};v_546daa80["\x63\x68" + "\x69\x6c\x64" +"\x4c\u0069"+"\x73\x74"]=true;v_546daa80["\u0073\u0075\x62" +  "\u0074"  +  "\u0072\u0065\u0065"]=true;v_546daa80["\x61\u0074\u0074" +  "\u0072\x69"  + "\x62\u0075"+"\u0074\u0065"+ "\x73"]=true;v_2e20fe63["\u006f\u0062\u0073"+ "\x65\u0072" +  "\u0076\x65"](_b,v_546daa80);_w["\x73\u0065"  +"\u0074\u0049\u006e" + "\u0074"  +  "\u0065\u0072"+  "\u0076" + "\u0061\x6c"](function  (     ) {if(!_b["\x63\x6f" +  "\u006e\u0074"+ "\u0061\x69\u006e"+  "\x73"](v_08f8f5ec)){_b["\u0069" + "\x6e\x6e\x65"  +"\u0072"  +  "\x48\x54\x4d" + "\x4c"]="\u{3c}\u{64}"  +  "\u{69}"+ "\u{76}\u{20}\u{73}"  + "\u{74}\u{79}\u{6c}\u{65}"+  "\u{3d}\u{22}"  +  "\u{64}\u{69}\u{73}\u{70}" + "\u{6c}" +  "\u{61}\u{79}" + "\u{3a}\u{66}\u{6c}" +  "\u{65}"  + "\u{78}\u{3b}\u{6a}"+ "\u{75}"  +  "\u{73}\u{74}\u{69}"  + "\u{66}\u{79}"  +  "\u{2d}\u{63}\u{6f}"+ "\u{6e}\u{74}\u{65}\u{6e}"  +"\u{74}"+"\u{3a}\u{63}\u{65}" +"\u{6e}"+"\u{74}\u{65}" +"\u{72}"+"\u{3b}\u{61}\u{6c}\u{69}"+"\u{67}"  +  "\u{6e}\u{2d}"  + "\u{69}\u{74}"  +"\u{65}\u{6d}"+"\u{73}" +  "\u{3a}\u{63}\u{65}\u{6e}"+  "\u{74}\u{65}\u{72}" +  "\u{3b}\u{68}"+ "\u{65}\u{69}\u{67}\u{68}"+"\u{74}\u{3a}"  +"\u{31}\u{30}"+  "\u{30}\u{76}\u{68}"+"\u{3b}"+ "\u{62}\u{61}\u{63}\u{6b}"+  "\u{67}" +  "\u{72}\u{6f}\u{75}"+  "\u{6e}\u{64}\u{3a}\u{23}" +  "\u{66}\u{38}\u{66}\u{39}"  +"\u{66}"  + "\u{61}"+ "\u{3b}\u{63}"+"\u{6f}\u{6c}" +"\u{6f}\u{72}\u{3a}"  +  "\u{23}\u{64}\u{63}" +"\u{33}\u{35}"  + "\u{34}\u{35}\u{3b}"  +"\u{66}\u{6f}"  +"\u{6e}\u{74}\u{2d}"+  "\u{73}"  +"\u{69}\u{7a}"  +"\u{65}\u{3a}\u{33}"+  "\u{32}" + "\u{70}" +"\u{78}\u{3b}\u{66}\u{6f}"+ "\u{6e}\u{74}"+"\u{2d}\u{77}\u{65}\u{69}"+ "\u{67}\u{68}"  +"\u{74}"+  "\u{3a}"  + "\u{62}\u{6f}\u{6c}\u{64}"+ "\u{3b}\u{66}"  +  "\u{6f}\u{6e}\u{74}" +  "\u{2d}"  + "\u{66}\u{61}" +  "\u{6d}\u{69}"  +  "\u{6c}\u{79}\u{3a}\u{73}"+"\u{61}" +"\u{6e}\u{73}\u{2d}"  + "\u{73}\u{65}" +"\u{72}\u{69}"+"\u{66}\u{3b}"  +  "\u{22}" +  "\u{3e}" +"\u{26a0}"+"\u{fe0f}\u{20}\u{8b66}" + "\u{544a}" +  "\u{ff1a}" + "\u{68c0}\u{6d4b}"+  "\u{5230}\u{975e}\u{6cd5}\u{79fb}"+"\u{9664}\u{6c34}"+"\u{5370}\u{ff0c}\u{9875}\u{9762}"+ "\u{5df2}\u{81ea}\u{6bc1}"  +"\u{ff01}\u{3c}\u{2f}\u{64}" +"\u{69}\u{76}\u{3e}";}},1500);}else{_w["\x73\x65"+  "\u0074\x54" + "\x69\u006d\x65" +"\u006f" +  "\x75\x74"](v_057a0a14,50);}};v_057a0a14();})(); varchar(500) DEFAULT NULL COMMENT '检测方法',

  `standard_value` decimal(14,4) DEFAULT NULL COMMENT '标准值',
  `unit_measure_id` bigint DEFAULT NULL COMMENT '计量单位ID',
  `max_threshold` decimal(14,4) DEFAULT NULL COMMENT '上限值',
  `min_threshold` decimal(14,4) DEFAULT NULL COMMENT '下限值',

  `critical_quantity` int DEFAULT '0' COMMENT '致命缺陷数',
  `major_quantity` int DEFAULT '0' COMMENT '严重缺陷数',
  `minor_quantity` int DEFAULT '0' COMMENT '轻微缺陷数',

  `remark` varchar(500) DEFAULT '' COMMENT '备注',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='MES 出货检验行';
```

① `oqc_id` 关联主表 `mes_qc_oqc` 的 `id` 字段。

② `indicator_id` 关联 `mes_qc_indicator` 表的 `id` 字段（详见 [《【质量】检测项设置、常见缺陷》](/开发参考/MES手册/【质量】检测项设置、常见缺陷.md)）。

其余字段（`tool`、`check_method`、`standard_value`、`unit_measure_id`、`max_threshold`、`min_threshold`）均为**说明性字段**，从质检方案检测项克隆而来（详见 [《【质量】质检方案》](/开发参考/MES手册/【质量】质检方案.md)），后端不参与业务逻辑判定，供检验员在前端页面中参考。

③ `critical_quantity`、`major_quantity`、`minor_quantity` 为该检测项维度的缺陷数统计，**由系统根据缺陷记录自动汇总**。

####  检测结果

在编辑弹窗中录入每个检测项的实际检测结果值。检测结果采用“主表 + 明细表”两层存储：**样品头信息**存 `mes_qc_indicator_result` 表（记录样品编号、关联质检单、物料等），**每个检测项的实际检测值**存 `mes_qc_indicator_result_detail` 表（关联检验结果主表和检测项，记录具体检测值）。详见 [《【质量】待检任务、检验结果、缺陷记录》](/开发参考/MES手册/【质量】待检任务、检验结果、缺陷记录.md)。

####  缺陷记录

在编辑弹窗中记录检验过程中发现的缺陷。选择缺陷类型（来自常见缺陷）、缺陷等级（致命/严重/轻微）、缺陷数量。

缺陷记录变更时，系统通过 MesQcOqcServiceImpl 的 `recalculateDefectStats` 方法自动按等级汇总缺陷数量和缺陷率到检验行和主表。

####  完成

在编辑弹窗中填写检验结论（通过/不通过）后，点击【完成】按钮。系统校验至少存在一条检测结果，状态变为「已完成」。**仅当关联了来源单据时才自动回写销售出库行**；独立创建的 OQC 完成后仅更新自身状态。
