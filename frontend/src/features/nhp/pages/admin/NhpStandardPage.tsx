/**
 * NHP 标准库配置页（单页，对齐 22 §3.7 / 24 §3.7）。
 *
 * crf_standard_version：D12 统一标准库版本实体，按 standard_code 分组展示版本历史（只读）。
 * 版本由冻结流程产出、禁止覆盖式修改；对象显示名（panel 标题/协议名）由具体表 join，待后端就绪后补。
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  STANDARD_CODE_OPTIONS,
  fetchNhpStandards,
  type NhpStandardVersion,
} from "../../api/nhpStandard.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

export default function NhpStandardPage() {
  const goBack = useGoBack("/content-manager/nhp-template");

  const standardsQuery = useQuery({ queryKey: ["nhp", "standards"], queryFn: fetchNhpStandards });
  const standards = useMemo(() => standardsQuery.data ?? [], [standardsQuery.data]);

  const groups = useMemo(() => {
    const map = new Map<string, NhpStandardVersion[]>();
    for (const s of standards) {
      const list = map.get(s.standardCode) ?? [];
      list.push(s);
      map.set(s.standardCode, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.version - a.version);
    return map;
  }, [standards]);

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>标准库</h1>
            <div className="sub">panel / 放行标准 / 协议 / 字典 版本化 · 冻结后禁止覆盖式修改，变更走新版本</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {standardsQuery.isError ? (
            <div className="aup-wb-empty">加载失败，请刷新重试</div>
          ) : standardsQuery.isLoading ? (
            <div className="aup-wb-empty">加载标准库…</div>
          ) : standards.length === 0 ? (
            <div className="aup-wb-empty">暂无标准版本</div>
          ) : (
            STANDARD_CODE_OPTIONS.map((code) => {
              const list = groups.get(code.value) ?? [];
              if (list.length === 0) return null;
              return (
                <div className="aup-wb-panel" key={code.value}>
                  <div className="aup-wb-panel-hd">
                    <span className="title">{code.label}</span>
                    <span className="aup-wb-chip muted">{list.length} 版</span>
                  </div>
                  <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
                    <table className="aup-wb-table">
                      <thead>
                        <tr>
                          <th>对象</th>
                          <th style={{ width: 90 }}>版本</th>
                          <th>说明</th>
                          <th style={{ width: 90 }}>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((s) => (
                          <tr key={s.id}>
                            <td className="mono">{s.objectRef}</td>
                            <td>v{s.version}</td>
                            <td style={{ color: "var(--muted)" }}>{s.versionNote ?? "—"}</td>
                            <td>
                              <span className={s.active ? "aup-wb-chip" : "aup-wb-chip muted"}>
                                {s.active ? "活跃" : "归档"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
