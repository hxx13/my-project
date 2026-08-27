import { authHttp } from "@/api/core/authHttp";

export type TeamVisibility = "PUBLIC" | "PRIVATE";

export interface TeamSummary {
  id: number;
  name: string;
  description?: string;
  visibility: TeamVisibility;
  status: string;
  ownerPersonnelId: number;
  ownerName: string;
  memberCount: number;
  createdAt: string;
}

export interface TeamMember {
  memberId: number;
  personnelId: number;
  name: string;
  staffId: string | null;
  aroUserId: string | null;
  jobNumber: string | null;
  departmentName: string | null;
  projectGroupName: string | null;
  roleCode: string;
  joinedAt: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMember[];
  pendingCount: number;
}

export interface TeamJoinRequest {
  id: number;
  teamId: number;
  personnelId: number;
  name: string;
  type: string;
  status: string;
  message?: string;
  reviewerName?: string;
  createdAt: string;
}

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface TeamPage {
  list: TeamSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TeamJoinRequestPage {
  list: TeamJoinRequest[];
  total: number;
  page: number;
  pageSize: number;
}

const BASE = "/portal/admin/team";

export async function fetchTeams(page = 1, pageSize = 20, keyword = "") {
  const params: Record<string, unknown> = { page, pageSize };
  if (keyword.trim()) params.keyword = keyword.trim();
  const res = await authHttp.get<Result<TeamPage>>(BASE, { params });
  return res.data.data ?? { list: [], total: 0, page, pageSize };
}

export async function fetchTeamDetail(id: number | string) {
  const res = await authHttp.get<Result<TeamDetail>>(`${BASE}/${id}`);
  return res.data.data;
}

export async function createTeam(body: {
  name: string;
  description?: string;
  visibility: TeamVisibility;
  maxMembers?: number;
}) {
  const res = await authHttp.post<Result<TeamDetail>>(BASE, body);
  return res.data.data;
}

export async function updateTeam(
  id: number | string,
  body: { name?: string; description?: string; visibility?: TeamVisibility; avatar?: string },
) {
  const res = await authHttp.put<Result<TeamDetail>>(`${BASE}/${id}`, body);
  return res.data.data;
}

export async function dissolveTeam(id: number | string) {
  await authHttp.post(`${BASE}/${id}/dissolve`);
}

export async function transferTeam(id: number | string, targetMemberId: number) {
  await authHttp.post(`${BASE}/${id}/transfer`, { targetMemberId });
}

export async function fetchTeamMembers(id: number | string) {
  const res = await authHttp.get<Result<TeamMember[]>>(`${BASE}/${id}/members`);
  return res.data.data ?? [];
}

export async function addTeamMember(id: number | string, body: { personnelId: number; roleCode?: string }) {
  const res = await authHttp.post<Result<TeamMember>>(`${BASE}/${id}/members`, body);
  return res.data.data;
}

export async function updateMemberRole(id: number | string, memberId: number, roleCode: string) {
  await authHttp.put(`${BASE}/${id}/members/${memberId}/role`, { roleCode });
}

export async function removeTeamMember(id: number | string, memberId: number) {
  await authHttp.delete(`${BASE}/${id}/members/${memberId}`);
}

export async function inviteMembers(id: number | string, body: { personnelIds: number[]; message?: string }) {
  await authHttp.post(`${BASE}/${id}/invite`, body);
}

export async function requestTeamJoin(id: number | string, body: { personnelId: number; message?: string }) {
  await authHttp.post(`${BASE}/${id}/join-requests`, body);
}

export async function fetchTeamJoinRequests(
  id: number | string,
  params: { status?: string; page?: number; pageSize?: number } = {},
) {
  const q: Record<string, unknown> = { page: params.page ?? 1, pageSize: params.pageSize ?? 100 };
  if (params.status) q.status = params.status;
  const res = await authHttp.get<Result<TeamJoinRequestPage>>(`${BASE}/${id}/join-requests`, { params: q });
  return res.data.data ?? { list: [], total: 0, page: 1, pageSize: 100 };
}

export async function approveTeamJoinRequest(id: number | string, requestId: number) {
  await authHttp.post(`${BASE}/${id}/join-requests/${requestId}/approve`);
}

export async function rejectTeamJoinRequest(id: number | string, requestId: number, reason: string) {
  await authHttp.post(`${BASE}/${id}/join-requests/${requestId}/reject`, { reason });
}

export async function cancelTeamJoinRequest(id: number | string, requestId: number) {
  await authHttp.post(`${BASE}/${id}/join-requests/${requestId}/cancel`);
}
