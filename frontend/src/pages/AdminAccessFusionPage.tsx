import { Navigate, useLocation } from "react-router-dom";

/** 旧「门禁统计清洗」独立页 → 门禁数据工作台 · 统计清洗 Tab */
export default function AdminAccessFusionPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", "clean");
  return <Navigate to={`/admin/dahua-swing-tasks?${params.toString()}`} replace />;
}
