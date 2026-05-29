import { adminHttp } from "@/api/core/adminHttp";

export interface LoggerCategory {
  key: string;
  loggerName: string;
  level: string;
}

export interface LogLevelsResponse {
  root: string;
  levelOptions: string[];
  categories: LoggerCategory[];
}

export interface LogTogglesResponse {
  scanTimingConsoleEnabled: boolean;
  scanTimingConsoleMinMs: number;
  accessRuleDahuaDebugEnabled: boolean;
  telemetryArchiveEnabled: boolean;
  rootLevel: string;
  categories: { key: string; enabled: boolean }[];
}

export interface LogEntry {
  ts: string;
  tsEpochMs: number;
  level: string;
  logger: string;
  message: string;
}

export interface LogRecentResponse {
  entries: LogEntry[];
  total: number;
}

export const fetchLogLevels = async (): Promise<LogLevelsResponse> => {
  const res = await adminHttp.get("/logging/levels");
  return res.data;
};

export const setLogLevel = async (loggerName: string, level: string): Promise<{ ok: boolean; loggerName: string; level: string }> => {
  const res = await adminHttp.post("/logging/level", { loggerName, level });
  return res.data;
};

export const resetLogLevels = async (): Promise<{ ok: boolean; message: string }> => {
  const res = await adminHttp.post("/logging/reset");
  return res.data;
};

export const syncLogFromDb = async (): Promise<{ ok: boolean; message: string }> => {
  const res = await adminHttp.post("/logging/sync-from-db");
  return res.data;
};

export const fetchLogToggles = async (): Promise<LogTogglesResponse> => {
  const res = await adminHttp.get("/logging/toggles");
  return res.data;
};

export const fetchRecentLogs = async (count = 200, minLevel = ""): Promise<LogRecentResponse> => {
  const res = await adminHttp.get("/logging/recent", { params: { count, minLevel } });
  return res.data;
};

export const clearLogBuffer = async (): Promise<{ ok: boolean; message: string }> => {
  const res = await adminHttp.post("/logging/clear-buffer");
  return res.data;
};
