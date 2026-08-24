/**
 * 笼位字段字典套 HUB 工作台（对齐 NhpFieldDictWorkbench 卡片列表）。
 * 笼位域仅一套字典 dictKey=cage；码表入口在页壳工具栏角落。
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { fetchCageDictionaries } from "../api/cageForm.api";
import "@/features/aup/aup.css";

export const CAGE_DICT_KEY = "cage";
export const CAGE_DICT_NAME = "笼位字段字典";

export interface CageFieldDictWorkbenchProps {
  keyword: string;
}

export default function CageFieldDictWorkbench({ keyword }: CageFieldDictWorkbenchProps) {
  const navigate = useNavigate();

  const dictQuery = useQuery({
    queryKey: ["cage-info", "dictionaries"],
    queryFn: fetchCageDictionaries,
  });

  const dictionaries = dictQuery.data ?? [];
  const q = keyword.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return dictionaries;
    return dictionaries.filter(
      (d) =>
        d.dictKey.toLowerCase().includes(q) ||
        (d.name || "").toLowerCase().includes(q) ||
        "字段".includes(q) ||
        "数据域".includes(q),
    );
  }, [dictionaries, q]);

  const openFields = (dictKey: string) =>
    navigate(toAdminRoutePath(`/admin/cage-shelves/forms/fields/${dictKey}`));

  const main = (
    <>
      {dictQuery.isLoading ? (
        <div className="aup-empty">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="aup-empty">无匹配数据域套</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {filtered.map((d) => (
            <div className="aup-doc-stack" key={d.dictKey}>
              <div className="aup-doc">
                <div className="aup-doc-hd">
                  <span className="aup-doc-title">{d.name}</span>
                  <span className="aup-doc-no">v{d.version ?? 1}</span>
                </div>
                <div className="aup-doc-body">
                  <div className="aup-f">
                    <div className="aup-f-k">名称</div>
                    <div className="aup-f-v">{d.name}</div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">dictKey</div>
                    <div className="aup-f-v" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {d.dictKey}
                    </div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">字段数</div>
                    <div className="aup-f-v">{d.fieldCount ?? 0}</div>
                  </div>
                  <div className="aup-f">
                    <div className="aup-f-k">说明</div>
                    <div className="aup-f-v" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      {d.description || "笼架认领/详情表单字段，存于 cage_info_field。"}
                    </div>
                  </div>
                </div>
                <div className="aup-doc-foot">
                  <div className="aup-doc-acts" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button type="button" className="btn primary small" onClick={() => openFields(d.dictKey)}>
                      管理结构与字段 ▸
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench cage-form-wb min-h-0 flex-1">
      <div className="aup-wb">
        <div className="aup-wb-main aup-wb-main--full overflow-auto">{main}</div>
      </div>
    </div>
  );
}
