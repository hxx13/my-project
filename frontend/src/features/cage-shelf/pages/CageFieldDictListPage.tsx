import { Navigate } from "react-router-dom";

/**
 * CageFieldDictListPage — 笼位字段字典套列表（薄壳）。
 *
 * 自建后端只有一套笼位字段字典（cage），字段套列表路由直接落到 cage 字段页。
 */
export default function CageFieldDictListPage() {
  return <Navigate to="/console/admin/cage-shelves/forms/fields/cage" replace />;
}
