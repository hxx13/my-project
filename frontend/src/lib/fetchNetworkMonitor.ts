import { reportIfGatewayDown, reportIfServerUnreachable } from "@/store/useServerDownStore";

let installed = false;

/**
 * 给 window.fetch 挂一层「后端连不上就报一声」。
 *
 * <p>为什么是猴补丁而不是逐个调用点改：全仓三十多处裸 fetch 直连后端（球球 SSE、报表导出、
 * 运行配置、学生端联系方式…），服务重启时它们各把 `HTTP 502` / `Failed to fetch` 原样抛给
 * 各自的 UI —— 现场没人看得懂，只会以为是自己按错了。逐个补一定漏，补了以后新写的还会再犯。
 *
 * <p>只上报、不改行为：响应与异常都原样透传，调用方感知不到这层存在。
 *
 * <ul>
 *   <li>axios 那三条链路另有拦截器（见 api/core/*.ts），不走这里；</li>
 *   <li>用户主动中止（AbortError）不算 —— 判定口径集中在 isServerUnreachable；</li>
 *   <li>判定为「后端不可达」后会先探测一次再弹窗，单次抖动不会糊住界面（见 ServerRestartNotice）。</li>
 * </ul>
 */
export function installFetchNetworkMonitor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const response = await originalFetch(input, init);
      reportIfGatewayDown(response.status);
      return response;
    } catch (error) {
      reportIfServerUnreachable(error);
      throw error;
    }
  };
}
