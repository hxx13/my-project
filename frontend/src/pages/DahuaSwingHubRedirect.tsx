import { Navigate, useLocation } from "react-router-dom";

type Props = {
  tab: "audit" | "records";
  kind?: "daily" | "backfill";
};

/** 旧侧栏路径 → 门禁数据工作台对应 Tab */
export default function DahuaSwingHubRedirect({ tab, kind }: Props) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", tab);
  if (kind) {
    params.set("kind", kind);
  }
  return <Navigate to={`/admin/dahua-swing-tasks?${params.toString()}`} replace />;
}
