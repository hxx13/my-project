package com.example.demo.modules.broadcast.service;

import com.example.demo.modules.broadcast.client.BroadcastException;
import com.example.demo.modules.broadcast.client.DsppaClient;
import com.example.demo.modules.broadcast.entity.BroadcastPlan;
import com.example.demo.modules.broadcast.entity.BroadcastPlayLog;
import com.example.demo.modules.broadcast.mapper.BroadcastPlayLogMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 广播播放：立即播放与停止。
 *
 * <p>定时调度与人工手动**走同一条执行路径**，这样播放记录的口径永远一致 ——
 * 现场排查「到底是谁没响」时不能有两套日志。
 */
@Service
public class BroadcastPlayService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastPlayService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 触发来源，与 broadcast_play_log.source 一致。 */
    public static final String SOURCE_SCHEDULE = "SCHEDULE";
    public static final String SOURCE_CATCHUP = "CATCHUP";
    public static final String SOURCE_MANUAL = "MANUAL";

    private final DsppaClient client;
    private final BroadcastSongsService songsService;
    private final BroadcastPlayLogMapper logMapper;

    public BroadcastPlayService(DsppaClient client,
                                BroadcastSongsService songsService,
                                BroadcastPlayLogMapper logMapper) {
        this.client = client;
        this.songsService = songsService;
        this.logMapper = logMapper;
    }

    /**
     * 播放一首曲目到指定分区。
     *
     * @param plan     来源方案；手动播放传 null
     * @param operator 操作人；定时触发传 null
     */
    public void play(List<String> macs, String songPath, Integer volume,
                     String source, BroadcastPlan plan, String operator) {
        requireZones(macs);
        if (songPath == null || songPath.isBlank()) {
            throw new IllegalArgumentException("未指定要播放的曲目");
        }
        client.requireReady();
        try {
            // 平台下发播放要求同时给出「曲目属于哪个曲库列表」，**按路径现查**：
            // 用保存时的快照会在曲库变动后回「目标不存在」，且方案里的歌可能横跨多个列表。
            String listId;
            try {
                listId = songsService.findListIdBySongPath(songPath);
            } catch (Exception e) {
                // 曲库清单读不到（HTTP 抖动）时退回方案里保存的，别让一次读文件失败挡住开播
                listId = plan == null ? "" : plan.getSongListId();
            }
            if (listId == null || listId.isBlank()) {
                throw new BroadcastException("曲目已不在平台曲库：" + fileNameOf(songPath) + "，请重新选择曲目");
            }
            client.play(macs, listId, songPath, volume);
            record(plan, source, "PLAY", macs, List.of(songPath), true,
                    "已下发播放：" + fileNameOf(songPath), operator);
            log.info("[广播] 播放成功 source={} macs={} song={}", source, macs, songPath);
        } catch (Exception e) {
            record(plan, source, "PLAY", macs, List.of(songPath), false, describe(e), operator);
            log.warn("[广播] 播放失败 source={} macs={} song={} : {}", source, macs, songPath, describe(e));
            throw e instanceof BroadcastException ? (BroadcastException) e
                    : new BroadcastException("播放失败: " + describe(e));
        }
    }

    /** 停止指定分区的播放。 */
    public void stop(List<String> macs, String source, BroadcastPlan plan, String operator) {
        requireZones(macs);
        client.requireReady();
        try {
            client.stop(macs);
            record(plan, source, "STOP", macs, List.of(), true, "已下发停止", operator);
            log.info("[广播] 停止成功 source={} macs={}", source, macs);
        } catch (Exception e) {
            record(plan, source, "STOP", macs, List.of(), false, describe(e), operator);
            log.warn("[广播] 停止失败 source={} macs={} : {}", source, macs, describe(e));
            throw e instanceof BroadcastException ? (BroadcastException) e
                    : new BroadcastException("停止失败: " + describe(e));
        }
    }

    /**
     * 播放记录。现场排查「今天到底响没响」看这里：平台自己的日志要翻它服务器上的文件，
     * 而且分不清「没触发」和「触发了但下发失败」。
     */
    public List<BroadcastPlayLog> recentLogs(Long planId, int limit) {
        int capped = Math.max(1, Math.min(limit, 500));
        return logMapper.selectRecent(planId, capped);
    }

    private static void requireZones(List<String> macs) {
        if (macs == null || macs.isEmpty()) {
            throw new IllegalArgumentException("未指定目标分区");
        }
    }

    /** 写播放记录。这张表是现场定位「哪次没响」的唯一凭据，失败也要落。 */
    private void record(BroadcastPlan plan, String source, String action,
                        List<String> macs, List<String> songs,
                        boolean success, String message, String operator) {
        try {
            BroadcastPlayLog row = new BroadcastPlayLog();
            row.setPlanId(plan == null ? null : plan.getId());
            row.setPlanName(plan == null ? null : plan.getPlanName());
            row.setSource(source);
            row.setAction(action);
            row.setFiredAt(client.scheduleNow());
            row.setZoneMacs(writeJson(macs));
            row.setSongPaths(writeJson(songs));
            row.setSuccess(success);
            row.setMessage(clip(message));
            row.setOperator(operator);
            logMapper.insert(row);
        } catch (Exception e) {
            // 记录失败不能影响播出本身
            log.warn("[广播] 写播放记录失败(不影响播出): {}", e.getMessage());
        }
    }

    private static String writeJson(List<String> list) {
        try {
            return MAPPER.writeValueAsString(list == null ? List.of() : list);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String clip(String s) {
        if (s == null) {
            return null;
        }
        return s.length() > 500 ? s.substring(0, 500) : s;
    }

    private static String fileNameOf(String path) {
        int idx = path.lastIndexOf('/');
        return idx >= 0 ? path.substring(idx + 1) : path;
    }

    private static String describe(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = e.getClass().getSimpleName();
        }
        return msg.length() > 300 ? msg.substring(0, 300) : msg;
    }
}
