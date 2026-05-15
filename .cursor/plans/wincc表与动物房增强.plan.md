# WinCC 映射表体验 + 动物房监测与归档（含补充）

## 补充一：Web 房间温湿度页 — 去掉悬停「大套间」类原生提示

**需求**：删除鼠标悬停模块时浏览器自动弹出的 `title` 文案（如「大套间（≥3 小间）…」）。

**位置**：[`frontend/src/pages/AnimalRoomTelemetryPage.tsx`](frontend/src/pages/AnimalRoomTelemetryPage.tsx)

- **`HubFloorContent`**：`ch.kind === "chromeSuiteRow"` 时外层 `<div>` 上的 `title={...}`（约 483–489 行：大套间 / 两小间套间等）。
- **`StructuredFloorContent`**：同上结构，`chromeSuiteRow` 容器 `title={...}`（约 550–556 行）。

**做法**：移除上述 `title` 属性即可（不替换为其它 Tooltip 组件，除非产品另行要求）。

**可选（若仍出现多余悬停）**：`SoloBalancedPartition` 外层 `div` 带有 `title={...}`（约 429–433 行，分区标签 · 间数）。若希望**彻底取消**该页布局模块上的原生 tooltip，可一并删除；若需保留「分区+间数」仅作无障碍说明，可改为 `aria-label` 且不在 UI 悬停显示（浏览器对 `aria-label` 的 tooltip 行为因实现而异，通常以去掉 `title` 为主）。

---

## 补充二：归档落库 — 预留升级空间（后续天气 + 深度学习）

**目标**：当前 30 天原始点落库不仅要满足查询/折线，还要为后续「结合每日真实天气变化的趋势学习/深度学习」留扩展面，**尽量少做破坏性迁移**。

**建议在 `telemetry_value_archive`（或等价表）中增加/预留**：

| 字段 | 说明 |
|------|------|
| `schema_version` | 行级或批次级模式版本，便于读侧兼容旧数据 |
| `ingest_batch_id` | 同一轮 WinCC 刷新批次 UUID，便于对齐多变量、多表联接 |
| `sample_at` + `variable_name` | 保持核心查询维度（已有规划） |
| `ext_json` (JSON) | **扩展桶**：未来写入衍生特征、模型版本号、中间统计等，无需立刻定死列 |
| `weather_daily_key` (可空 VARCHAR) | 占位：日后关联「日级天气事实表」的自然键（如 `date+station_id`），先不建外键也可 |
| `weather_snapshot_json` (可空 JSON) | 可选：若日后在入库时即挂载当日天气片段（温湿压），可先冗余存储，便于离线训练与回放 |

**日后独立表（不在首轮必建，仅在计划中注明）**：

- `weather_daily_fact`：`date`、`location_key`、气温/湿度/气压/天气代码、数据源、拉取时间等；与 `weather_daily_key` 或 `ext_json` 引用关联。

**原则**：

- 训练流水线优先读 **`ext_json` + 天气事实表** JOIN，不在业务接口层塞模型逻辑。
- 清理任务仍按 `sample_at` 30 天；扩展 JSON 与主列同生命周期或按需归档到冷存储（后续再定）。

---

## 补充三：小程序与 Web — 数值与单位版式（对齐、间距、一位小数）

**需求**：

1. **横向宽度一致、上下对齐**：数值 + 单位的组合在列表/卡片多行之间应对齐，**不要紧贴容器右侧**（避免「全部挤在右边」）；Web 与小程序视觉规则一致（同一套：先固定数值区宽度或 `tabular-nums` + `min-width`，再跟单位）。
2. **数与单位间距**：数字与 `℃` / `%` / `Pa` 之间留 **数像素** 间隔（如 `gap: 4rpx` / `4px`，或单位 `margin-left`），略分开。
3. **小数位**：展示用数值 **统一保留小数点后 1 位**（如 `23.5`）；非法/非数仍走原有「—」等占位。实现上优先在**展示层**格式化（避免改 WinCC 原始串入库语义），Web 与小程共享同一舍入规则（四舍五入或截断需在实现里二选一并写清）。

**涉及**：

- 小程序：[`aroapp/miniprogram/components/animal-room-telemetry/`](aroapp/miniprogram/components/animal-room-telemetry/)（`art-metric-inline`、`.art-metric-val` 等布局；`parseMetricUnitParts` / 展示前 `formatOneDecimal`）。
- Web：[`AnimalRoomTelemetryPage.tsx`](frontend/src/pages/AnimalRoomTelemetryPage.tsx) 及动物房结构化子组件中渲染 metric 值的区域（`tabular-nums`、`flex`/`gap`、右对齐改为「数值块左对齐或整体居中偏左」按现有卡片栅格微调）。

---

## 与原计划的关系（摘要）

- **A**：WinCC 映射表 IME、稳定排序、保存后排序。
- **B**：动物房 UI（删套间下小字、间距、单位、图标）+ **补充一** 去掉 Web `title` 悬停 + **补充三** 数值/单位版式与一位小数。
- **C**：每测点上下限覆盖全局 + 详情编辑 + 三色。
- **D**：双快照趋势箭头。
- **E**：30 天归档 + 后台「温湿度数据归档」+ series API + **补充二** 表结构预留。

实施顺序仍建议：A → B（含补充一、补充三）→ C → D → E（含补充二 schema）。
