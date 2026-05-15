import { Navigate } from "react-router-dom";

/** 原「消息通知」已并入 `/admin/staff-messages`，保留路由以兼容书签与外链 */
export default function AdminNotificationPage() {
  return <Navigate to="/admin/staff-messages?workTab=notify" replace />;
}
