/**
 * 客户端版本 API 层
 *
 * GET /api/client-version — 公开接口，版本检查 + 刷新触发
 * GET /api/v1/monitor/client-versions — ADMIN 权限，监控页统计
 */

import { authHttp } from "@/api/core/authHttp";
import { adminHttp } from "@/api/core/adminHttp";

// ═══════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════

export interface ClientVersionResponse {
    buildId: string;
    reloadId: number;
    forceReloadAt: string | null;
    /** 服务端进程启动标识；与 ROOM_ACK 的 bootId 比对可发现"服务端已重启但 socket 未感知" */
    bootId?: string;
}

export interface ClientVersionStats {
    expectedBuildId: string;
    reloadId: number;
    forceReloadAt: string | null;
    lastReloadTriggeredBy: string | null;
    lastReloadTriggeredAt: string | null;
    totalClients: number;
    upToDate: number;
    outdated: number;
    distribution: Record<string, number>;
}

export interface BroadcastReloadResult {
    buildId: string;
    reloadId: number;
    forceReloadAt: string;
    stats: ClientVersionStats;
}

// ═══════════════════════════════════════════
// API 方法
// ═══════════════════════════════════════════

const CLIENT_VERSION_URL = '/api/client-version';

/** 客户端版本检查（公开，无需认证） */
export async function fetchClientVersion(
    clientId: string,
    clientBuildId: string,
    channel: string = 'web',
): Promise<ClientVersionResponse> {
    const params = new URLSearchParams({ clientId, clientBuildId, channel });
    const res = await fetch(`${CLIENT_VERSION_URL}?${params}`);
    if (!res.ok) {
        if (res.status === 429) {
            throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error(`版本检查失败: ${res.status}`);
    }
    const json = await res.json();
    return json.data as ClientVersionResponse;
}

/** 监控页：客户端版本分布统计 */
export async function fetchClientVersionStats(): Promise<ClientVersionStats> {
    const res = await authHttp.get<{ data: ClientVersionStats }>(
        '/v1/monitor/client-versions',
    );
    return res.data.data;
}

/** 管理员：触发全客户端刷新（双通道） */
export async function broadcastClientReload(): Promise<BroadcastReloadResult> {
    const res = await adminHttp.post<{ data: BroadcastReloadResult }>(
        '/settings/broadcast-client-reload',
    );
    return res.data.data;
}
