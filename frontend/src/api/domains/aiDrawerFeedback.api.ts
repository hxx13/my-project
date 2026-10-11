import { authHttp } from "@/api/core/authHttp";

/**
 * AI 对话抽屉「详情」里的反馈接口。三个口全在这里，组件不直连：
 *   · 提交：POST /v1/ai/drawer/feedback，{content, imageUrls[]}（文字必填、图 ≤6）；
 *   · 列表：GET  /v1/ai/drawer/feedback?page=&size=，`all=true` 才看全部（**仅 ≥超管**，非超管传 true 会被后端直接拒）；
 *   · 回复改状态：POST /v1/ai/drawer/feedback/reply，{id, replyContent, status}，
 *     status 只允许 PENDING / REPLIED；**空回复 + PENDING = 撤回**（仅 ≥超管）。
 * 分页形状：{list,total,page,size,scope}，page 从 0 起。图片地址是本站上传返回的相对路径（含 /api/upload/files/）。
 */
interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type FeedbackStatus = "PENDING" | "REPLIED";

/** 回复串里的一条。 */
export interface AiDrawerFeedbackReply {
  content: string;
  imageUrls: string[];
  repliedBy?: string;
  /** 作者展示名（后端按 id 解析；解析不到时前端归一化会回落到 repliedBy） */
  repliedByName?: string;
  repliedAt?: string;
}

export interface AiDrawerFeedbackRow {
  id: number;
  userId?: string;
  /** 提交人姓名快照 */
  userName?: string;
  content: string;
  imageUrls: string[];
  status: FeedbackStatus;
  /** 回复串（升序，逐条累积）；没有回复时为空数组 */
  replies?: AiDrawerFeedbackReply[];
  /** 兼容读：= 最后一条回复的内容 */
  replyContent?: string;
  /** 兼容读：= 最后一条回复的附图 */
  replyImageUrls?: string[];
  repliedBy?: string;
  repliedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiDrawerFeedbackPage {
  list: AiDrawerFeedbackRow[];
  total: number;
  page: number;
  size: number;
  scope: string;
}

/** 提交一条反馈。失败抛出（消息优先取后端 message），组件据「抛没抛」判成败、绝不假装成功。 */
export async function submitAiDrawerFeedback(
  content: string,
  imageUrls: string[],
): Promise<AiDrawerFeedbackRow> {
  const res = await authHttp.post<Result<AiDrawerFeedbackRow>>("/v1/ai/drawer/feedback", {
    content,
    imageUrls,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "提交失败");
  return res.data.data;
}

/** 反馈列表（默认只看自己的；{all:true} 仅超管可传）。 */
export async function fetchAiDrawerFeedback(params: {
  page: number;
  size: number;
  all?: boolean;
}): Promise<AiDrawerFeedbackPage> {
  const res = await authHttp.get<Result<AiDrawerFeedbackPage>>("/v1/ai/drawer/feedback", { params });
  if (!res.data?.success) throw new Error(res.data?.message || "读取失败");
  return res.data.data;
}

/** 回复并改状态（仅超管）。replyImageUrls 可选、与提交侧同形；后端未落地时字段被忽略也不报错。 */
export async function replyAiDrawerFeedback(body: {
  id: number;
  replyContent: string;
  status: FeedbackStatus;
  replyImageUrls?: string[];
}): Promise<void> {
  const res = await authHttp.post<Result<unknown>>("/v1/ai/drawer/feedback/reply", body);
  if (!res.data?.success) throw new Error(res.data?.message || "回复失败");
}
