import { useQuery } from "@tanstack/react-query";
import { fetchMyIdentity } from "@/api/domains/personIdentity.api";

/**
 * 当前用户是否持「业务」身份标签。
 *
 * <p>「业务」不是角色，是人员标签（身份码里的 BUSINESS），所以不能用 hasMinRole 判。
 * 审核页原先内联了这个判断，订购时间管理与规格模板是第二、三个消费方，故收成一处。
 *
 * <p>失败/未登录时返回 false —— 判定退化成「只认角色」，不会因为一次网络抖动误放行。
 */
export function useIsBusiness(): boolean {
  const { data: tags } = useQuery({
    queryKey: ["personIdentity", "me"],
    queryFn: fetchMyIdentity,
  });
  return (tags ?? []).some((t) => t.code === "BUSINESS");
}
