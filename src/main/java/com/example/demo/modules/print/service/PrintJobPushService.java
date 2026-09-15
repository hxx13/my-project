package com.example.demo.modules.print.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 把「有新任务」推给工位。
 *
 * 这只是降低延迟的通道 —— 任务真被领走靠工位轮询兜底。
 * 所以推送失败只记日志，绝不抛给调用方：任务已经在库里躺着等人领了。
 *
 * 复用按人房间 mobile_user:{userId}，不新增房间机制。
 */
@Service
public class PrintJobPushService {

    public static final String EVENT_PRINT_JOB = "PRINT_JOB";
    /** 与前端 config/socketEvents.ts 的 SOCKET_CLIENT_FORCE_RELOAD 一致 */
    public static final String EVENT_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

    private static final Logger log = LoggerFactory.getLogger(PrintJobPushService.class);

    private final SocketIOServer server;

    public PrintJobPushService(SocketIOServer server) {
        this.server = server;
    }

    public void notifyNewJob(PrintStation station, String jobId) {
        if (station == null || station.getUserId() == null || jobId == null) return;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("jobId", jobId);
            payload.put("stationId", station.getId());
            server.getRoomOperations(MobileUserSocketPushService.roomForUser(station.getUserId()))
                    .sendEvent(EVENT_PRINT_JOB, payload);
        } catch (Exception e) {
            log.warn("[print] 推送打印任务失败 jobId={}: {}", jobId, e.getMessage());
        }
    }

    /**
     * 让该工位的页面刷新。
     *
     * 工位机通常无人值守，部署或改完配置后不该让人跑到机器前按 F5。
     * 定向发给**该工位账号个人的房间**，而不是广播给 reload:web —— 广播会把
     * 所有开着的后台页面一起刷掉。
     */
    public void reloadStation(PrintStation station) {
        if (station == null || station.getUserId() == null) return;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("reason", "admin-command");
            payload.put("stationId", station.getId());
            payload.put("at", java.time.Instant.now().toString());
            server.getRoomOperations(MobileUserSocketPushService.roomForUser(station.getUserId()))
                    .sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
            log.info("[print] 已要求工位页刷新 stationId={}", station.getId());
        } catch (Exception e) {
            log.warn("[print] 刷新工位页失败 stationId={}: {}", station.getId(), e.getMessage());
        }
    }
}
