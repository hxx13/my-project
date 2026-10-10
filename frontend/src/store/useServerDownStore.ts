import { create } from "zustand";

/**
 * 「后端连不上」的全局开关。
 *
 * <p>服务重启期间所有人都只会看到一个居中弹窗（见 [ServerRestartNotice]），而不是各自
 * 那条链路上冒出来的红色 toast —— 那些原文是 `Network Error` / `HTTP 502` 这类，
 * 现场没人看得懂是在说服务器没起来。
 *
 * <p>判定口径只有一句：**压根没拿到后端响应**。放到这里而不是各调用点各判一次，
 * 是因为触发点很散（axios 三个实例、球球那条 fetch SSE、socket 断开），
 * 口径分家就会有的弹有的不弹。
 */
interface ServerDownState {
  down: boolean;
  markDown: () => void;
  markUp: () => void;
}

export const useServerDownStore = create<ServerDownState>((set, get) => ({
  down: false,
  markDown: () => {
    if (!get().down) set({ down: true });
  },
  markUp: () => {
    if (get().down) set({ down: false });
  },
}));

/** 后端已停/未就绪时 nginx 会代答的网关错误码 */
const GATEWAY_DOWN_STATUS = [502, 503, 504];

/**
 * 这个错误是不是「后端不可达」。
 *
 * <p>三类都算：网关代答（502/503/504）、axios 连接失败（ERR_NETWORK）、
 * fetch 的 `TypeError: Failed to fetch`。**有其它响应码的不算** —— 那说明后端活着，
 * 是业务错误，该按原来的提示走。
 */
export function isServerUnreachable(error: unknown): boolean {
  const e = error as
    | { response?: { status?: number }; code?: string; name?: string; message?: string }
    | null
    | undefined;
  if (!e) return false;

  const status = e.response?.status;
  if (typeof status === "number") return GATEWAY_DOWN_STATUS.includes(status);

  if (e.code === "ERR_NETWORK" || e.code === "ECONNABORTED") return true;
  if (e.name === "TypeError") return true;
  return /failed to fetch|network\s*error|load failed|connection refused/i.test(e.message ?? "");
}

/** 判定并上报；调用点只写这一行。返回是否已判为不可达。 */
export function reportIfServerUnreachable(error: unknown): boolean {
  const unreachable = isServerUnreachable(error);
  if (unreachable) useServerDownStore.getState().markDown();
  return unreachable;
}

/** HTTP 状态码版本的判定，给 fetch 那条链路用（拿不到 Error 对象，只有 Response） */
export function reportIfGatewayDown(status: number): boolean {
  const down = GATEWAY_DOWN_STATUS.includes(status);
  if (down) useServerDownStore.getState().markDown();
  return down;
}
