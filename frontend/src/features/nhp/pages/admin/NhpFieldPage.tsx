/**
 * NHP 字段字典管理页（薄壳）。
 *
 * 实际工作台逻辑已迁至 NhpFieldWorkbench（自包含、可嵌入任意壳）。
 * 本页仅将其挂到内容管理壳下，返回行为沿用工作台缺省逻辑。
 */
import NhpFieldWorkbench from "../../components/NhpFieldWorkbench";

export default function NhpFieldPage() {
  return <NhpFieldWorkbench />;
}
