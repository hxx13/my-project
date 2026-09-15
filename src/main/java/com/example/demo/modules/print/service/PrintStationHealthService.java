package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintStation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 工位在线判定的唯一出口。前端不参与，别的服务不复制这份逻辑。
 *
 * <p>两类工位判据不同：KIOSK 看工位页心跳（{@code last_seen_at}），
 * SERVER 看打印机端口探测结论（{@code printer_online} + {@code printer_checked_at}）。
 */
@Service
public class PrintStationHealthService {

    /** 心跳写库节流阈值：距上次写入小于该值直接跳过，不碰库。单位 = 毫秒。 */
    private static final long HEARTBEAT_THROTTLE_MS = 30_000L;

    /** KIOSK 心跳判离线阈值：3 个轮询周期（15s/次），容忍一次丢包或重连。单位 = 秒。 */
    private static final long KIOSK_ONLINE_SECONDS = 90L;

    /** 打印机探测结论有效期：超过 3 分钟没新探测，说明探测任务本身失联，比「打印机不通」更严重。单位 = 秒。 */
    private static final long SERVER_CHECK_STALE_SECONDS = 180L;

    /**
     * 各工位上次写 last_seen_at 的 epoch millis，仅进程内。重启即失 = 每个工位多写一次，无害，不必持久化。
     */
    private final ConcurrentHashMap<String, Long> lastHeartbeatWrite = new ConcurrentHashMap<>();

    private final JdbcTemplate jdbc;

    public PrintStationHealthService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 工位页轮询时回写心跳（须已过鉴权）。带节流，节流命中不碰库。 */
    public void touch(String stationId) {
        long now = System.currentTimeMillis();
        Long lastWrite = lastHeartbeatWrite.get(stationId);
        if (lastWrite != null && now - lastWrite < HEARTBEAT_THROTTLE_MS) {
            return;
        }
        lastHeartbeatWrite.put(stationId, now);
        jdbc.update("UPDATE print_station SET last_seen_at = NOW() WHERE id = ?", stationId);
    }

    /** 在线状态 + 面向前端的一句人话原因。原因在这里生成，前端不用拿时间戳自己减。 */
    public Health liveStatusOf(PrintStation s) {
        LocalDateTime now = LocalDateTime.now();
        if (PrintStation.MODE_SERVER.equals(s.getMode())) {
            return serverStatus(s, now);
        }
        return kioskStatus(s, now);
    }

    private Health kioskStatus(PrintStation s, LocalDateTime now) {
        if (s.getLastSeenAt() == null) {
            return new Health(PrintStationHealth.UNKNOWN, "从未上报过心跳");
        }
        if (secondsSince(s.getLastSeenAt(), now) <= KIOSK_ONLINE_SECONDS) {
            return new Health(PrintStationHealth.ONLINE, "在线");
        }
        return new Health(PrintStationHealth.OFFLINE, "最后心跳 " + ago(s.getLastSeenAt(), now) + "前");
    }

    private Health serverStatus(PrintStation s, LocalDateTime now) {
        if (s.getPrinterCheckedAt() == null) {
            return new Health(PrintStationHealth.UNKNOWN, "从未探测过打印机");
        }
        if (secondsSince(s.getPrinterCheckedAt(), now) > SERVER_CHECK_STALE_SECONDS) {
            return new Health(PrintStationHealth.OFFLINE, "探测任务失联（" + ago(s.getPrinterCheckedAt(), now) + "前探测）");
        }
        if (Boolean.TRUE.equals(s.getPrinterOnline())) {
            return new Health(PrintStationHealth.ONLINE, "打印机可达");
        }
        return new Health(PrintStationHealth.OFFLINE, "打印机不可达（" + ago(s.getPrinterCheckedAt(), now) + "前探测）");
    }

    private static long secondsSince(LocalDateTime at, LocalDateTime now) {
        return Duration.between(at, now).getSeconds();
    }

    /** 把「距 now 多久」折成人话：「X 秒」「X 分钟」。负值（时钟回拨）按 0 算。 */
    private static String ago(LocalDateTime at, LocalDateTime now) {
        long secs = Math.max(0, Duration.between(at, now).getSeconds());
        if (secs < 60) return secs + " 秒";
        return (secs / 60) + " 分钟";
    }

    /** 工位在线状态。UNKNOWN（从没连过）与 OFFLINE（连过、断了）是两回事，运维动作不同。 */
    public enum PrintStationHealth {
        ONLINE, OFFLINE, UNKNOWN
    }

    /** 判定结果：状态 + 一句可读原因。 */
    public record Health(PrintStationHealth status, String reason) {}
}
