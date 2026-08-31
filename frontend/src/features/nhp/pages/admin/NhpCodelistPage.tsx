/**
 * NHP 码表管理页（薄壳）。
 *
 * 实际工作台逻辑已迁至 NhpCodelistWorkbench（自包含、可嵌入任意壳）。
 * 「码表审核」入口在 NhpCodelistWorkbench 顶部工具栏，跳到独立审核页（带返回按钮）。
 */
import NhpCodelistWorkbench from "../../components/NhpCodelistWorkbench";

export default function NhpCodelistPage() {
  return <NhpCodelistWorkbench />;
}
