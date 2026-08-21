import { adminHttp } from "@/api/core/adminHttp";

export type DispositionStrategyMeta = {
  type: string;
  requiresInteraction: boolean;
  configSchema: Record<string, string>;
};

export type ProductionRuleMeta = {
  code: string;
  label: string;
  sourceType: string;
};

type ApiResponse<T> = {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
};

function unwrap<T>(res: { data: ApiResponse<T> }): T {
  const body = res.data;
  if (body?.success === false || (body?.code != null && body.code !== 200)) {
    throw new Error(body.message || "请求失败");
  }
  return body.data as T;
}

export async function fetchDispositionStrategies(): Promise<DispositionStrategyMeta[]> {
  const res = await adminHttp.get<ApiResponse<DispositionStrategyMeta[]>>(
    "/twin/obligations/meta/disposition-strategies"
  );
  return unwrap(res) ?? [];
}

export async function fetchProductionRules(): Promise<ProductionRuleMeta[]> {
  const res = await adminHttp.get<ApiResponse<ProductionRuleMeta[]>>(
    "/twin/obligations/meta/production-rules"
  );
  return unwrap(res) ?? [];
}

export async function previewChannelDelivery(
  dispositionType: string,
  channel: string
): Promise<{ deliveryMode: string; channelCapability: string; requiresInteraction: boolean }> {
  const res = await adminHttp.get<
    ApiResponse<{ deliveryMode: string; channelCapability: string; requiresInteraction: boolean }>
  >("/twin/obligations/meta/channel-delivery", { params: { dispositionType, channel } });
  return unwrap(res);
}
