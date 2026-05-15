import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface ApiDocItem {
  module?: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: Array<{
    name: string;
    in: "path" | "query" | "header" | "body";
    required: boolean;
    description: string;
    type?: "string" | "number" | "boolean" | "array" | "object";
    defaultValue?: string;
  }>;
  requestBodyExample: string;
  statusCodes?: Array<{ code: string; description: string }>;
  qualityHints?: string[];
}

export interface TryItResponse {
  status: number;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  rawText: string;
}

export interface ApiDocsResponse {
  data: ApiDocItem[];
  standardResponse: Record<string, unknown>;
}

export async function fetchAdminApiDocs() {
  const res = await adminHttp.get<Result<ApiDocsResponse>>("/docs/apis");
  return res.data.data;
}
