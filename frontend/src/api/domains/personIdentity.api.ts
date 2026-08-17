import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** 身份标签（字典项，管理员自由配置；id 后端自增，code 为稳定标识）。 */
export interface IdentityTag {
  id: number;
  code: string;
  label: string;
}

/** 某人持有的身份标签集合 */
export interface PersonIdentity {
  userId: string;
  tags: IdentityTag[];
}

export async function fetchIdentityTags(): Promise<IdentityTag[]> {
  const res = await authHttp.get<Result<IdentityTag[]>>("/person-identity/tags");
  return res.data.data;
}

export async function createIdentityTag(body: {
  code: string;
  label: string;
  sortOrder?: number;
}): Promise<void> {
  await authHttp.post<Result<unknown>>("/person-identity/tags", body);
}

export async function updateIdentityTag(
  id: number,
  body: { label?: string; sortOrder?: number; active?: number }
): Promise<void> {
  await authHttp.put<Result<unknown>>(`/person-identity/tags/${id}`, body);
}

export async function deleteIdentityTag(id: number): Promise<void> {
  await authHttp.delete<Result<unknown>>(`/person-identity/tags/${id}`);
}

export async function fetchPersonIdentity(
  userIds?: string[]
): Promise<PersonIdentity[]> {
  const params: Record<string, string> = {};
  if (userIds && userIds.length > 0) {
    params.userIds = userIds.join(",");
  }
  const res = await authHttp.get<Result<PersonIdentity[]>>("/person-identity", {
    params,
  });
  return res.data.data;
}

export async function setPersonIdentity(
  userId: string,
  tagIds: number[]
): Promise<void> {
  await authHttp.put<Result<unknown>>(
    `/person-identity/${encodeURIComponent(userId)}`,
    { tagIds }
  );
}
