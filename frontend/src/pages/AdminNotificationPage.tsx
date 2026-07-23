import { Navigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";

/** 原「消息通知」已并入 `/admin/staff-messages`，保留路由以兼容书签与外链 */
export default function AdminNotificationPage() {
  return <Navigate to={`${toAdminRoutePath("/admin/staff-messages")}?workTab=notify`} replace />;
}
