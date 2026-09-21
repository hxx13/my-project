import { Navigate, useSearchParams } from "react-router-dom";

/**
 * 兼容旧链接：新用户注册已并入 /student/register（用 Tab 切换「已有编号 / 我是新用户」两条路）。
 *
 * 必须把 query 原样透传：统一认证发现"人员库无记录"时会把用户送到这里，
 * 并带上 ?jobNumber= 与 ?idpUid=。idpUid 要在注册成功后写进 user_auth_binding，
 * 否则下次统一认证还是匹配不上，会陷入"登录 → 引导注册 → 登录"的循环。
 */
export default function StudentRegisterNewPage() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("mode", "new");
  return <Navigate to={`/student/register?${next.toString()}`} replace />;
}
