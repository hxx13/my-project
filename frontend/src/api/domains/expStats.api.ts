import { authHttp } from "@/api/core/authHttp";

export interface ExpSummary {
  totalExp: number;
  todayExp: number;
  activeUsers: number;
  todayActiveUsers: number;
  topEarners: Array<{
    userId: string;
    userName: string;
    totalExp: number;
    todayExp: number;
  }>;
}

export interface ExpRecord {
  id: number;
  userId: string;
  userName: string;
  expAmount: number;
  sourceType: string;
  accessType: number;
  roomId: string;
  roomName: string;
  createTime: string;
}

export interface ExpRecordsPage {
  list: ExpRecord[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export async function fetchExpSummary(): Promise<ExpSummary> {
  const res = await authHttp.get("/v1/twin/rpg/exp/summary");
  return (res.data?.data ?? { totalExp: 0, todayExp: 0, activeUsers: 0, todayActiveUsers: 0, topEarners: [] }) as ExpSummary;
}

export async function fetchExpRecords(params: {
  pageNum?: number;
  pageSize?: number;
  userId?: string;
  sourceType?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ExpRecordsPage> {
  const res = await authHttp.get("/v1/twin/rpg/exp/records", { params });
  return (res.data?.data ?? { list: [], total: 0, pageNum: 1, pageSize: 20 }) as ExpRecordsPage;
}
