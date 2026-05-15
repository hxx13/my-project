import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchCapabilityPolicies,
  fetchConfigDefinitions,
  fetchNotificationRules,
  fetchNotificationTemplates,
  fetchSettingsModules,
  fetchSystemConfigs,
  patchCapabilityPolicy,
  updateNotificationRule,
  updateNotificationTemplate,
  updateSystemConfig,
  type CapabilityPolicyRecord,
  type SettingDefinitionRecord,
  type NotifyRuleRecord,
  type NotifyTemplateRecord,
  type SystemConfigRecord,
} from "@/api/domains/notification.api";

export default function AdminSettingsPage() {
  const [searchParams] = useSearchParams();
  const [modules, setModules] = useState<Array<{ key: string; label: string }>>([]);
  const [rules, setRules] = useState<NotifyRuleRecord[]>([]);
  const [templates, setTemplates] = useState<NotifyTemplateRecord[]>([]);
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [configDefs, setConfigDefs] = useState<SettingDefinitionRecord[]>([]);
  const [activeModule, setActiveModule] = useState("notification");
  const [configKeyword, setConfigKeyword] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [supplyPushConfigs, setSupplyPushConfigs] = useState<SystemConfigRecord[]>([]);
  const [supplyPushDefs, setSupplyPushDefs] = useState<SettingDefinitionRecord[]>([]);
  const [showSupplySensitive, setShowSupplySensitive] = useState<Record<string, boolean>>({});
  const [capabilityPolicies, setCapabilityPolicies] = useState<CapabilityPolicyRecord[]>([]);
  const ruleRef = useRef<HTMLElement | null>(null);
  const templateRef = useRef<HTMLElement | null>(null);
  const supplyPushRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<HTMLElement | null>(null);

  const loadData = async () => {
    try {
      const modules = await fetchSettingsModules();
      setModules(modules);
      if (activeModule === "notification") {
        const r = await fetchNotificationRules();
        setRules(r);
        setTemplates([]);
        setConfigs([]);
        setConfigDefs([]);
        setSupplyPushConfigs([]);
        setSupplyPushDefs([]);
        setCapabilityPolicies([]);
      } else if (activeModule === "capability") {
        const cp = await fetchCapabilityPolicies();
        setCapabilityPolicies(cp);
        setRules([]);
        setTemplates([]);
        setConfigs([]);
        setConfigDefs([]);
        setSupplyPushConfigs([]);
        setSupplyPushDefs([]);
      } else if (activeModule === "template") {
        const [t, sc, sd] = await Promise.all([
          fetchNotificationTemplates(),
          fetchSystemConfigs("supplies"),
          fetchConfigDefinitions("supplies"),
        ]);
        setRules([]);
        setTemplates(t);
        setSupplyPushConfigs(sc);
        setSupplyPushDefs(sd);
        setConfigs([]);
        setConfigDefs([]);
        setCapabilityPolicies([]);
      } else {
        const [c, d] = await Promise.all([fetchSystemConfigs(activeModule), fetchConfigDefinitions(activeModule)]);
        setRules([]);
        setTemplates([]);
        setSupplyPushConfigs([]);
        setSupplyPushDefs([]);
        setCapabilityPolicies([]);
        setConfigs(c);
        setConfigDefs(d);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载设置失败");
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeModule]);

  useEffect(() => {
    const m = (searchParams.get("module") || "").trim();
    if (!m || modules.length === 0) return;
    if (modules.some((x) => x.key === m)) setActiveModule(m);
  }, [searchParams, modules]);

  const bizTypeZh = (bizType: string) => {
    if (bizType === "REPAIR") return "报修";
    if (bizType === "PURCHASE") return "采购";
    if (bizType === "SUPPLIES_CLAIM") return "物资领用";
    if (bizType === "SUPPLIES_ADMIN") return "物资后台";
    return bizType;
  };

  const eventTypeZh = (eventType: string) => {
    if (eventType === "CREATED") return "创建";
    if (eventType === "STARTED") return "接单";
    if (eventType === "COMPLETED") return "完成";
    if (eventType === "WITHDRAWN") return "撤回";
    if (eventType === "DELETED") return "删除";
    if (eventType === "RESTORED") return "恢复";
    return eventType;
  };

  const templateKeyZh = (templateKey: string) => {
    if (templateKey.startsWith("REPAIR_")) return `报修-${templateKey.replace("REPAIR_", "")}`;
    if (templateKey.startsWith("PURCHASE_")) return `采购-${templateKey.replace("PURCHASE_", "")}`;
    if (templateKey.startsWith("SUPPLIES_")) return `物资-${templateKey.replace("SUPPLIES_", "")}`;
    return templateKey;
  };

  const recipientModeZh = (mode: string) => {
    if (mode === "RELATED") return "仅关联人";
    if (mode === "ROLE") return "仅角色广播";
    if (mode === "HYBRID") return "混合策略";
    return mode;
  };

  const configDefMap = new Map(configDefs.map((d) => [d.configKey, d]));
  const filteredConfigs = configs.filter((cfg) => {
    const key = configKeyword.trim().toLowerCase();
    if (!key) return true;
    const def = configDefMap.get(cfg.configKey);
    return (
      cfg.configKey.toLowerCase().includes(key) ||
      (def?.labelZh || "").toLowerCase().includes(key) ||
      (def?.description || "").toLowerCase().includes(key)
    );
  });

  const validateByType = (value: string, type?: string) => {
    if (!type) return true;
    if (type.toUpperCase() === "BOOLEAN") return value === "true" || value === "false";
    if (type.toUpperCase() === "NUMBER") return !Number.isNaN(Number(value));
    return true;
  };

  /** 主页公告等长文：用多行输入保留换行与空格，避免单行框无法排版 */
  const isMultilineConfigKey = (configKey: string) =>
    configKey === "dashboard.codex.notice_body" ||
    configKey === "dashboard.codex.return_rules" ||
    configKey === "dashboard.codex.discipline_body" ||
    configKey === "telemetry.facility.rules_json";

  const isColorConfigKey = (configKey: string) => configKey.toLowerCase().includes("color");
  const colorPalette = ["#0f172a", "#334155", "#475569", "#64748b", "#94a3b8", "#e2e8f0", "#ffffff", "#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  const normalizeHexColor = (raw?: string) => {
    const v = (raw || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#334155";
  };

  const scrollToSection = (target: "rules" | "templates" | "configs") => {
    const map = {
      rules: ruleRef.current,
      templates: templateRef.current,
      configs: configRef.current,
    };
    map[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">系统设置中心</h2>

      <section className="rounded border bg-white p-4">
        <h3 className="mb-3 font-medium">配置模块</h3>
        <div className="flex flex-wrap gap-2 items-center">
          {modules.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveModule(item.key)}
              className={`rounded px-3 py-1 text-sm ${activeModule === item.key ? "bg-blue-600 text-white" : "bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {activeModule === "notification" && (
      <section ref={ruleRef} className="rounded border bg-white p-4">
        <h3 className="mb-3 font-medium">通知规则模块</h3>
        {rules.length === 0 ? (
          <div className="text-sm text-slate-500">当前模块暂无通知规则。</div>
        ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-2 gap-2 rounded border p-2 text-sm md:grid-cols-6 md:items-center">
              <div>
                <div className="font-medium">{bizTypeZh(rule.bizType)} · {eventTypeZh(rule.eventType)}</div>
                <div className="text-xs text-slate-500">{rule.bizType}.{rule.eventType}</div>
              </div>
              <select
                value={rule.enabled === 1 ? "1" : "0"}
                onChange={(e) => setRules((prev) => prev.map((x) => (x.id === rule.id ? { ...x, enabled: Number(e.target.value) } : x)))}
                className="rounded border px-2 py-1"
              >
                <option value="1">启用</option>
                <option value="0">停用</option>
              </select>
              <select value={rule.recipientMode} onChange={(e) => setRules((prev) => prev.map((x) => x.id === rule.id ? { ...x, recipientMode: e.target.value } : x))} className="rounded border px-2 py-1">
                <option value="HYBRID">混合策略 (HYBRID)</option>
                <option value="RELATED">仅关联人 (RELATED)</option>
                <option value="ROLE">仅角色广播 (ROLE)</option>
              </select>
              <input value={rule.minRoleLevel} type="number" onChange={(e) => setRules((prev) => prev.map((x) => x.id === rule.id ? { ...x, minRoleLevel: Number(e.target.value) } : x))} className="rounded border px-2 py-1" />
              <input value={rule.templateKey} onChange={(e) => setRules((prev) => prev.map((x) => x.id === rule.id ? { ...x, templateKey: e.target.value } : x))} className="rounded border px-2 py-1" />
              <button
                className="rounded bg-blue-600 px-2 py-1 text-white"
                onClick={async () => {
                  await updateNotificationRule(rule.id, rule);
                  toast.success("规则已更新");
                }}
              >
                保存
              </button>
            </div>
          ))}
        </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          物资领用（SUPPLIES_CLAIM）与采购/报修共用本列表；模板与接收人请在「通知模板」模块中编辑 SUPPLIES_* 模板，并在同页底部「物资领用推送」维护额外接收人用户 ID。
        </p>
      </section>
      )}

      {activeModule === "capability" && (
        <section className="rounded border bg-white p-4">
          <h3 className="mb-3 font-medium">业务能力策略</h3>
          <p className="mb-3 text-xs text-slate-600">
            Role 等级与小程序一致：1 学生 · 2 职工 · 3 高级 · 4 管理 · 5 超管 · 6 平台所有者。保存后递增策略版本并刷新服务端缓存。
          </p>
          {capabilityPolicies.length === 0 ? (
            <div className="text-sm text-slate-500">暂无策略数据。</div>
          ) : (
            <div className="space-y-3">
              {capabilityPolicies.map((row) => (
                <div key={row.bizDomain} className="rounded border p-3 text-sm space-y-2">
                  <div className="font-medium">
                    {bizTypeZh(row.bizDomain)} <span className="text-xs text-slate-500">({row.bizDomain})</span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-4 md:items-center">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">提交最低等级</span>
                      <input
                        type="number"
                        className="rounded border px-2 py-1"
                        value={row.minRoleSubmit}
                        onChange={(e) =>
                          setCapabilityPolicies((prev) =>
                            prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, minRoleSubmit: Number(e.target.value) } : x)),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">处理最低等级</span>
                      <input
                        type="number"
                        className="rounded border px-2 py-1"
                        value={row.minRoleProcess}
                        onChange={(e) =>
                          setCapabilityPolicies((prev) =>
                            prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, minRoleProcess: Number(e.target.value) } : x)),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">全库待办阈值</span>
                      <input
                        type="number"
                        className="rounded border px-2 py-1"
                        value={row.minRoleViewAllPending}
                        onChange={(e) =>
                          setCapabilityPolicies((prev) =>
                            prev.map((x) =>
                              x.bizDomain === row.bizDomain ? { ...x, minRoleViewAllPending: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">申请人列表模式</span>
                      <select
                        className="rounded border px-2 py-1"
                        value={row.applicantListMode}
                        onChange={(e) =>
                          setCapabilityPolicies((prev) =>
                            prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, applicantListMode: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="VISIBLE_POOL">VISIBLE_POOL（可见池）</option>
                        <option value="ONLY_MINE">ONLY_MINE（仅本人）</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <label className="flex items-center gap-2 text-xs">
                      <span>启用</span>
                      <select
                        value={row.enabled === 1 ? "1" : "0"}
                        onChange={(e) =>
                          setCapabilityPolicies((prev) =>
                            prev.map((x) => (x.bizDomain === row.bizDomain ? { ...x, enabled: Number(e.target.value) } : x)),
                          )
                        }
                        className="rounded border px-2 py-1"
                      >
                        <option value="1">是</option>
                        <option value="0">否</option>
                      </select>
                    </label>
                    <span className="text-xs text-slate-500">版本 {row.policyVersion}</span>
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-3 py-1 text-white text-xs"
                      onClick={async () => {
                        const cur = capabilityPolicies.find((x) => x.bizDomain === row.bizDomain);
                        if (!cur) return;
                        await patchCapabilityPolicy(cur.bizDomain, {
                          minRoleSubmit: cur.minRoleSubmit,
                          minRoleProcess: cur.minRoleProcess,
                          minRoleViewAllPending: cur.minRoleViewAllPending,
                          applicantListMode: cur.applicantListMode,
                          enabled: cur.enabled,
                          extensionJson: cur.extensionJson ?? undefined,
                        });
                        toast.success("策略已保存");
                        void loadData();
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeModule === "template" && (
      <section ref={templateRef} className="rounded border bg-white p-4">
        <h3 className="mb-3 font-medium">通知模板模块</h3>
        {templates.length === 0 ? (
          <div className="text-sm text-slate-500">当前模块暂无通知模板。</div>
        ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="space-y-2 rounded border p-2 text-sm">
              <div className="font-medium">{templateKeyZh(tpl.templateKey)}</div>
              <div className="text-xs text-slate-500">{tpl.templateKey}</div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>启用</span>
                <select
                  value={tpl.enabled === 1 ? "1" : "0"}
                  onChange={(e) => setTemplates((prev) => prev.map((x) => (x.id === tpl.id ? { ...x, enabled: Number(e.target.value) } : x)))}
                  className="rounded border px-2 py-1"
                >
                  <option value="1">是</option>
                  <option value="0">否</option>
                </select>
              </div>
              <input value={tpl.titleTpl} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === tpl.id ? { ...x, titleTpl: e.target.value } : x))} className="w-full rounded border px-2 py-1" />
              <textarea value={tpl.contentTpl} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === tpl.id ? { ...x, contentTpl: e.target.value } : x))} className="w-full rounded border px-2 py-1" />
              <p className="text-xs text-slate-500">领用单模板可用变量：{"{orderId}"}、{"{bizId}"}、{"{applicantName}"}、{"{summary}"} 等。</p>
              <button className="rounded bg-blue-600 px-2 py-1 text-white" onClick={async () => {
                await updateNotificationTemplate(tpl.id, tpl);
                toast.success("模板已更新");
              }}>保存模板</button>
            </div>
          ))}
        </div>
        )}

        <div ref={supplyPushRef} className="mt-6 rounded border border-blue-100 bg-slate-50 p-4">
          <h4 className="mb-2 font-medium text-slate-800">物资领用推送</h4>
          <p className="mb-3 text-xs text-slate-600">
            除下单人外，额外接收站内通知的 <code className="rounded bg-white px-1">sys_user.id</code>；多个用英文逗号分隔。仅存在且未禁用的用户会收到通知。
          </p>
          {supplyPushConfigs.length === 0 ? (
            <div className="text-sm text-slate-500">暂无 supplies 模块配置（请确认已执行数据库初始化含 <code className="text-xs">sys_system_config_def</code> supplies 条目）。</div>
          ) : (
            <div className="space-y-2">
              {supplyPushConfigs.map((cfg) => {
                const def = supplyPushDefs.find((d) => d.configKey === cfg.configKey);
                return (
                  <div key={cfg.id} className="grid grid-cols-1 gap-2 rounded border bg-white p-2 text-sm md:grid-cols-3 md:items-center">
                    <div>
                      <div className="font-medium">{def?.labelZh || cfg.configKey}</div>
                      <div className="text-xs text-slate-500">{def?.description || cfg.remark || ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type={def?.isSensitive && !showSupplySensitive[cfg.configKey] ? "password" : "text"}
                        value={cfg.configValue || ""}
                        onChange={(e) =>
                          setSupplyPushConfigs((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: e.target.value } : x)))
                        }
                        className="w-full rounded border px-2 py-1"
                      />
                      {def?.isSensitive ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => setShowSupplySensitive((prev) => ({ ...prev, [cfg.configKey]: !prev[cfg.configKey] }))}
                        >
                          {showSupplySensitive[cfg.configKey] ? "隐藏" : "查看"}
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-2 py-1 text-white"
                      onClick={async () => {
                        if (!validateByType(cfg.configValue || "", def?.valueType)) {
                          toast.error(`配置值类型不正确，应为 ${def?.valueType || "STRING"}`);
                          return;
                        }
                        await updateSystemConfig(cfg.id, cfg);
                        toast.success("已保存");
                      }}
                    >
                      保存
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      )}

      {(activeModule !== "notification" && activeModule !== "template") && (
      <section ref={configRef} className="rounded border bg-white p-4">
        <h3 className="mb-3 font-medium">配置项（定义驱动）</h3>
        <div className="mb-3">
          <input
            value={configKeyword}
            onChange={(e) => setConfigKeyword(e.target.value)}
            placeholder="搜索配置键/中文名/说明"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        {filteredConfigs.length === 0 ? (
          <div className="text-sm text-slate-500">当前模块暂无配置项，请切换上方模块查看。</div>
        ) : (
        <div className="space-y-2">
          {filteredConfigs.map((cfg) => (
            <div
              key={cfg.id}
              className={`grid grid-cols-1 gap-2 rounded border p-2 text-sm md:grid-cols-3 ${isMultilineConfigKey(cfg.configKey) ? "md:items-start" : "md:items-center"}`}
            >
              <div>
                <div className="font-medium">{configDefMap.get(cfg.configKey)?.labelZh || cfg.configKey}</div>
                <div className="text-xs text-slate-500">{cfg.configKey}</div>
                <div className="text-xs text-slate-500">{configDefMap.get(cfg.configKey)?.description || cfg.remark || "暂无说明"}</div>
                <div className="text-xs text-slate-500">默认值: {configDefMap.get(cfg.configKey)?.defaultValue || "-"}</div>
                {configDefMap.get(cfg.configKey)?.requiresRestart ? (
                  <div className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                    修改后需重启服务生效
                  </div>
                ) : null}
              </div>
              {configDefMap.get(cfg.configKey)?.options?.length ? (
                <select value={cfg.configValue || ""} onChange={(e) => setConfigs((prev) => prev.map((x) => x.id === cfg.id ? { ...x, configValue: e.target.value } : x))} className="rounded border px-2 py-1">
                  {configDefMap.get(cfg.configKey)?.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : isMultilineConfigKey(cfg.configKey) ? (
                <textarea
                  value={cfg.configValue || ""}
                  onChange={(e) => setConfigs((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: e.target.value } : x)))}
                  rows={10}
                  spellCheck={false}
                  className="min-h-[200px] w-full resize-y rounded border border-slate-300 px-2 py-2 font-sans text-sm leading-relaxed text-slate-800 [tab-size:4] whitespace-pre-wrap"
                  placeholder="可换行、多空格排版；主页将按换行分段显示。"
                />
              ) : isColorConfigKey(cfg.configKey) ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={normalizeHexColor(cfg.configValue)}
                      onChange={(e) =>
                        setConfigs((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: e.target.value } : x)))
                      }
                      className="h-9 w-11 rounded border px-1 py-1"
                      title="颜色盘选择"
                    />
                    <input
                      type="text"
                      value={cfg.configValue || ""}
                      onChange={(e) => setConfigs((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: e.target.value } : x)))}
                      className="w-full rounded border px-2 py-1"
                      placeholder="#334155 或 rgba(...)"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {colorPalette.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="h-5 w-5 rounded border border-slate-300"
                        style={{ backgroundColor: c }}
                        title={c}
                        onClick={() =>
                          setConfigs((prev) => prev.map((x) => (x.id === cfg.id ? { ...x, configValue: c } : x)))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type={configDefMap.get(cfg.configKey)?.isSensitive && !showSensitive[cfg.configKey] ? "password" : "text"}
                    value={cfg.configValue || ""}
                    onChange={(e) => setConfigs((prev) => prev.map((x) => x.id === cfg.id ? { ...x, configValue: e.target.value } : x))}
                    className="w-full rounded border px-2 py-1"
                  />
                  {configDefMap.get(cfg.configKey)?.isSensitive ? (
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => setShowSensitive((prev) => ({ ...prev, [cfg.configKey]: !prev[cfg.configKey] }))}
                    >
                      {showSensitive[cfg.configKey] ? "隐藏" : "查看"}
                    </button>
                  ) : null}
                </div>
              )}
              <button
                className={`rounded bg-blue-600 px-2 py-1 text-white ${isMultilineConfigKey(cfg.configKey) ? "md:self-start" : ""}`}
                onClick={async () => {
                const def = configDefMap.get(cfg.configKey);
                if (!validateByType(cfg.configValue || "", def?.valueType)) {
                  toast.error(`配置值类型不正确，应为 ${def?.valueType || "STRING"}`);
                  return;
                }
                await updateSystemConfig(cfg.id, cfg);
                toast.success(def?.requiresRestart ? "配置已更新（需重启服务生效）" : "配置已更新");
              }}>保存</button>
            </div>
          ))}
        </div>
        )}
      </section>
      )}
    </div>
  );
}
