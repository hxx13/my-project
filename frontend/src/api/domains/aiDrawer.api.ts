import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** 抽屉内容接口的载荷。`copy` 归文案钩子用；`capabilities` 原样交给调用方归一化。 */
export interface AiDrawerContent {
  copy: Record<string, string>;
  capabilities?: unknown;
}

/**
 * 读 AI 对话抽屉的固定文案（键 → 文案）。
 *
 * 后端按代码清单（AiDrawerCopySeed）发全套键、库里没配的回落内置默认，所以理论上键齐全；
 * 但界面仍按「取不到就用调用点原文」用 —— 接口挂掉 / 超时只是退回硬编码，不会白屏。
 */
export async function fetchAiDrawerCopy(signal?: AbortSignal): Promise<Record<string, string>> {
  const res = await authHttp.get<Result<AiDrawerContent>>("/v1/ai/drawer/content", { signal });
  const copy = res.data?.data?.copy;
  return copy && typeof copy === "object" ? copy : {};
}

/**
 * 读抽屉的**能力提示词清单**（服务端已按调用者视角过滤，前端不再判视角）。
 *
 * <p>与 {@link fetchAiDrawerCopy} 打的是同一个接口，这里只取 `capabilities` 那一半。
 * 返回**原始载荷**（unknown）：字段可能缺失/异常，归一化与丢脏放在调用点
 * （`normalizeCapabilityGroups`），便于单测又不让本文件引入业务逻辑。
 */
export async function fetchAiDrawerCapabilities(signal?: AbortSignal): Promise<unknown> {
  const res = await authHttp.get<Result<AiDrawerContent>>("/v1/ai/drawer/content", { signal });
  return res.data?.data?.capabilities;
}

/** 编辑态一行：与后端 `ai_capability_prompt` 一一对应（`id` 为空 = 新增）。 */
export interface AiDrawerCapabilityRow {
  id?: number | null;
  groupName: string;
  title: string;
  promptText: string;
  /** 操作备注：这条提示词点了会做什么（给用户看的说明） */
  note: string;
  sortOrder: number;
  enabled: boolean;
  /** 谁看得见：'' = 全员；STAFF/STUDENT = 视角；ADMIN/SUPER_ADMIN = 角色档 */
  audience: string;
}

/**
 * 读**未按视角过滤**的整份抽屉内容（仅 ≥超管）。
 *
 * <p>编辑器是「读整份 → 改 → 存整份」：不能打只读面 `/content` —— 那面缺 `enabled`/`audience`
 * 且把停用行过滤掉了，照它整份回存会把「谁看得见」清成全员、把停用位重置。
 */
export async function fetchAiDrawerAdminContent(signal?: AbortSignal): Promise<unknown> {
  const res = await authHttp.get<Result<AiDrawerContent>>("/v1/ai/drawer/admin/content", { signal });
  return res.data?.data?.capabilities;
}

/**
 * 整份保存能力清单（仅 ≥超管）：**提交里没有的 id 即删除**，所以必须把当前全部行都带上。
 * `id` 省略 = 新增。
 */
export async function saveAiDrawerCapabilities(items: AiDrawerCapabilityRow[]): Promise<void> {
  await authHttp.post<Result<unknown>>("/v1/ai/drawer/capabilities", items);
}

/**
 * 读**推荐指令条**（输入框上方那条）。
 *
 * <p>服务端已按「个人频次 → 全站热度 → 原排序」排好，**前端不再重排** ——
 * 两端各排一次迟早会出现 web 一个样、小程序一个样。
 *
 * <p>返回**原始载荷**（unknown）：字段可能缺失/异常，归一化放在调用点（`normalizeRecommended`）。
 * 接口挂掉返回空数组由调用点兜底：指令条整条不显示，不影响对话。
 */
export async function fetchAiDrawerRecommended(signal?: AbortSignal): Promise<unknown> {
  const res = await authHttp.get<Result<unknown>>("/v1/ai/drawer/recommended", { signal });
  return res.data?.data;
}
