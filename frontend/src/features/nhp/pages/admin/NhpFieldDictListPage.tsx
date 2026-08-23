/**
 * 字段字典套列表页（薄壳）。
 *
 * 实际工作台逻辑已迁至 NhpFieldDictWorkbench（自包含、可嵌入任意壳）。
 * 本页仅将其挂到内容管理壳下，返回行为沿用工作台缺省逻辑。
 */
import NhpFieldDictWorkbench from "../../components/NhpFieldDictWorkbench";

export default function NhpFieldDictListPage() {
  return <NhpFieldDictWorkbench />;
}
