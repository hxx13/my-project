import { useQuery } from "@tanstack/react-query";
import { fetchAupProjectGroupOptions } from "../api/aup.api";
import {
  fetchRefDataList,
  fetchRefDataOptions,
} from "@/api/domains/referenceData.api";

/**
 * AUP 表单 select 下拉动态数据源（不依赖 ARO，全程无硬编码）。
 * - ANIMAL_BREED（物种大类，非可购层）→ 取 ref_data 全量顶层节点；
 * - ANIMAL_STRAIN（品系，可购层）→ 取 ref_data 可购项；
 * - projectGroup（课题组）→ 取本地 project_group 字典表（value=id, label=name）。
 * 前两者 value/label 取 ref_data.fieldData.title；projectGroup 直接返回 {value,label}。
 */
export function useRefDataOptions(refType?: string) {
  return useQuery({
    queryKey: ["ref-data-options", refType],
    enabled: !!refType,
    queryFn: async () => {
      if (!refType) return [];
      if (refType === "projectGroup") {
        return fetchAupProjectGroupOptions();
      }
      const list =
        refType === "ANIMAL_BREED"
          ? await fetchRefDataList(refType, { page: 1, size: 500 })
          : await fetchRefDataOptions(refType);
      return list
        .filter(
          (it) =>
            it &&
            typeof it.fieldData?.title === "string" &&
            it.fieldData.title.trim() !== "",
        )
        .map((it) => {
          const label = it.fieldData.title.trim();
          return { value: label, label };
        });
    },
  });
}
