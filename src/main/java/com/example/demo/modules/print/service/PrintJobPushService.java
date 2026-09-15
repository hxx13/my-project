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
}
