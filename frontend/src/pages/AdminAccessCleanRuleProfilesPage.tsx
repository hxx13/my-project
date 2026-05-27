import { Navigate, useLocation } from "react-router-dom";

/** 旧「清洗规则方案」独立页 → 统计清洗 Tab 内弹窗 */
export default function AdminAccessCleanRuleProfilesPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", "clean");
  params.set("profiles", "1");
  return <Navigate to={`/admin/dahua-swing-tasks?${params.toString()}`} replace />;
}
