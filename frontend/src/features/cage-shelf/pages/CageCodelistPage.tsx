/**
 * 笼位域码表管理页（薄壳）。
 * 工作台逻辑在 CageCodelistWorkbench；数据来自 cage_info_codelist，与 NHP 隔离。
 */
import CageCodelistWorkbench from "../components/CageCodelistWorkbench";
import { CageFormPageShell } from "../components/CageFormPageShell";

export default function CageCodelistPage() {
  return (
    <CageFormPageShell backTo="/admin/cage-shelves/forms">
      <CageCodelistWorkbench />
    </CageFormPageShell>
  );
}
