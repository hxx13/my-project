/**
 * 监控面板 Socket.IO Hook
 *
 * 监听 MONITOR_JOB_START / MONITOR_JOB_END 事件，
 * 实时更新 useMonitorStore，实现任务状态即时反映。
 *
 * 复用项目现有的 useSocket() hook（reconnectionAttempts: Infinity）。
 */

import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useMonitorStore } from "@/store/useMonitorStore";

interface JobStartPayload {
  jobKey: string;
  startedAt: string;
  triggerType: string;
}

interface JobEndPayload {
  jobKey: string;
  success: boolean;
  summary: string;
  error?: string;
  finishedAt: string;
}

export function useMonitorSocket() {
  const socket = useSocket();
  const setSocketConnected = useMonitorStore((s) => s.setSocketConnected);
  const updateJob = useMonitorStore((s) => s.updateJob);
  const addRecentLog = useMonitorStore((s) => s.addRecentLog);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onJobStart = (data: JobStartPayload) => {
      updateJob(data.jobKey, {
        running: true,
        status: "RUNNING",
        lastRunAt: data.startedAt,
      });
    };

    const onJobEnd = (data: JobEndPayload) => {
      const newStatus = data.success ? "SUCCESS" : "FAILED";
      updateJob(data.jobKey, {
        running: false,
        status: newStatus,
        lastStatus: newStatus,
        lastError: data.error ?? null,
        lastRunAt: data.finishedAt,
      });
      addRecentLog({
        ts: data.finishedAt,
        jobKey: data.jobKey,
        jobName: "", // 由 store 中已有数据补充
        success: data.success,
        detail: data.summary,
      });
    };

    // 初始化连接状态
    setSocketConnected(socket.connected);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("MONITOR_JOB_START", onJobStart);
    socket.on("MONITOR_JOB_END", onJobEnd);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("MONITOR_JOB_START", onJobStart);
      socket.off("MONITOR_JOB_END", onJobEnd);
    };
  }, [socket, setSocketConnected, updateJob, addRecentLog]);
}
