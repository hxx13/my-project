import { useMemo } from "react";
import { AdminSearchSelect } from "@/components/admin/AdminSearchSelect";
import { useAssetLocationTree } from "@/api/hooks/useAssetLocation";
import type { AssetLocationNode } from "@/api/domains/assetLocation.api";

/**
 * 存放地点选择器：候选为地点树全树节点的「A / B / C」全路径，允许手输。
 * 文本写对后由后端解析并回填 location_node_id（见 createAsset / patchAsset / batchUpdate）。
 */
export default function AssetLocationSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { data: tree = [] } = useAssetLocationTree();
  const options = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: AssetLocationNode[], prefix: string) => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        out.push(label);
        walk(n.children ?? [], label);
      }
    };
    walk(tree, "");
    return out;
  }, [tree]);

  return (
    <AdminSearchSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder="存放地点"
      className={className}
    />
  );
}
