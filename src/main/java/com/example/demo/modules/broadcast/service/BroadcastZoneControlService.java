package com.example.demo.modules.broadcast.service;

import com.example.demo.modules.broadcast.client.DsppaClient;
import com.example.demo.modules.broadcast.dto.SongListView;
import com.example.demo.modules.broadcast.entity.BroadcastPlan;
import com.example.demo.modules.broadcast.mapper.BroadcastPlanZoneStateMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 分区级独立控制 + 「正在执行什么」的视图。
 *
 * <p>**核心口径（现场反馈后定的）**：定时方案只是**批量启动器**。到点把若干分区带起来之后，
 * 每一路就是独立的播放单元 —— 人工把其中一路停了，它就归自己，方案的循环/兜底**不会**把它
 * 再带起来。之前是整组一起管，导致「想停一路，结果全停」，那是设计问题，不是平台限制：
 * 平台的选中-下发机制本身就支持单分区（厂家自己的控制页就是这么做的）。
 *
 * <p>所以人工暂停某一分会落一行 {@code broadcast_plan_zone_state.paused=1}，
 * 调度器下发前用它排除（见 {@link BroadcastPlanService#effectiveMacs}）。
 */
@Service
public class BroadcastZoneControlService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastZoneControlService.class);

    private final DsppaClient client;
    private final BroadcastPlayService playService;
    private final BroadcastPlanService planService;
    private final BroadcastSongsService songsService;
    private final BroadcastPlanZoneStateMapper zoneStateMapper;

    public BroadcastZoneControlService(DsppaClient client,
                                       BroadcastPlayService playService,
                                       BroadcastPlanService planService,
                                       BroadcastSongsService songsService,
                                       BroadcastPlanZoneStateMapper zoneStateMapper) {
        this.client = client;
        this.playService = playService;
        this.planService = planService;
        this.songsService = songsService;
        this.zoneStateMapper = zoneStateMapper;
    }

    // ---------------------------------------------------------------- 单分区控制

    /**
     * 只暂停这几路。**其余路不受影响** —— 这正是「分区互相独立」的落点。
     *
     * <p>同时给「管着这些分区的运行中方案」记一行人工暂停，免得调度器下一轮又把它带起来。
     */
    public void pauseZones(List<String> macs, String operator) {
        requireZones(macs);
        client.requireReady();
        playService.stop(macs, BroadcastPlayService.SOURCE_MANUAL, null, operator);
        int marked = markPaused(macs, true);
        log.info("[广播] 人工暂停分区 {} 路（记入 {} 个方案的覆盖）", macs.size(), marked);
    }

    /**
     * 只恢复这几路。
     *
     * <p>放什么曲目，按优先级取：① 调用方指定的（前端选中的那首）；② 平台留着的当前曲名；
     * ③ 「管着这一路的运行中方案」的第一首。**必须给得出一个**：置空闲后平台会把曲名清掉，
     * 没有曲目就没法把这一路放回来。按曲目分组下发，不同分区放不同曲子也能各归各位。
     */
    public void resumeZones(List<String> macs, String songPath, String operator) {
        requireZones(macs);
        client.requireReady();

        Map<String, String> pathByMac = resolveResumeSongs(macs, songPath);
        Map<String, List<String>> macsByPath = new LinkedHashMap<>();
        for (String mac : macs) {
            String path = pathByMac.get(mac);
            if (path == null) {
                continue;
            }
            macsByPath.computeIfAbsent(path, k -> new ArrayList<>()).add(mac);
        }
        if (macsByPath.isEmpty()) {
            throw new IllegalArgumentException("没有可恢复的曲目：先在右侧曲库里点一首，再恢复这一路");
        }

        clearPaused(new ArrayList<>(pathByMac.keySet()));
        for (Map.Entry<String, List<String>> e : macsByPath.entrySet()) {
            playService.play(e.getValue(), e.getKey(), null,
                    BroadcastPlayService.SOURCE_MANUAL, null, operator);
        }
        log.info("[广播] 人工恢复分区 {} 路", pathByMac.size());
    }

    // ---------------------------------------------------------------- 正在执行视图

    /**
     * 「现在到底在放什么」：执行中/已暂停的方案，以及它们每一路分区的实时状态。
     *
     * <p>前端拿它显示「正在执行的计划」与逐分区状态；进度条另算（平台不提供播放位置，
     * 只能按曲名 + 时长推算，见前端）。
     */
    public Map<String, Object> activeView() {
        Map<String, Object> out = new LinkedHashMap<>();
        List<BroadcastPlan> plans = planService.activePlans();

        Map<String, Map<String, Object>> liveByMac = new LinkedHashMap<>();
        if (client.isConnected() && client.isLoggedIn()) {
            try {
                for (Map<String, Object> z : client.fetchZones()) {
                    liveByMac.put(String.valueOf(z.get("mac")), z);
                }
            } catch (Exception e) {
                log.debug("[广播] 读取分区实时状态失败: {}", e.getMessage());
            }
        }

        List<Map<String, Object>> planViews = new ArrayList<>(plans.size());
        for (BroadcastPlan plan : plans) {
            Set<String> paused = new LinkedHashSet<>(planService.pausedMacs(plan.getId()));
            List<String> configured = BroadcastPlanService.readList(plan.getZoneMacs());
            List<Map<String, Object>> zoneViews = new ArrayList<>(configured.size());
            for (String mac : configured) {
                Map<String, Object> live = liveByMac.get(mac);
                Map<String, Object> zv = new LinkedHashMap<>();
                zv.put("mac", mac);
                zv.put("name", live == null ? "" : String.valueOf(live.getOrDefault("name", "")));
                zv.put("paused", paused.contains(mac));
                int status = live == null ? -1 : toInt(live.get("play_status"));
                zv.put("playStatus", status);
                zv.put("playing", status == 1);
                zv.put("currentSong", live == null ? "" : String.valueOf(live.getOrDefault("source_name", "")));
                zoneViews.add(zv);
            }
            Map<String, Object> pv = new LinkedHashMap<>();
            pv.put("id", plan.getId());
            pv.put("planName", plan.getPlanName());
            pv.put("runState", plan.getRunState());
            pv.put("loopPlay", Boolean.TRUE.equals(plan.getLoopPlay()));
            pv.put("startTime", plan.getStartTime());
            pv.put("endTime", plan.getEndTime());
            pv.put("runStartedAt", plan.getRunStartedAt());
            pv.put("zoneCount", configured.size());
            pv.put("playingCount", zoneViews.stream().filter(z -> Boolean.TRUE.equals(z.get("playing"))).count());
            pv.put("zones", zoneViews);
            planViews.add(pv);
        }

        out.put("plans", planViews);
        return out;
    }

    // ---------------------------------------------------------------- 内部

    /** 找出每一路该放什么曲目。优先级见 {@link #resumeZones}。 */
    private Map<String, String> resolveResumeSongs(List<String> macs, String explicitSongPath) {
        Map<String, String> out = new LinkedHashMap<>();
        if (explicitSongPath != null && !explicitSongPath.isBlank()) {
            // 调用方指定（前端选了歌）—— 最可靠的一条，直接用它
            for (String mac : macs) {
                out.put(mac, explicitSongPath.trim());
            }
            return out;
        }

        Map<String, String> pathByFileName = pathByFileName();

        // 平台留着的曲名（「已暂停」也不清）→ 完整路径
        Map<String, String> songByMac = new LinkedHashMap<>();
        try {
            for (Map<String, Object> z : client.fetchZones()) {
                String mac = String.valueOf(z.get("mac"));
                if (macs.contains(mac)) {
                    songByMac.put(mac, String.valueOf(z.getOrDefault("source_name", "")));
                }
            }
        } catch (Exception e) {
            log.debug("[广播] 取分区当前曲目失败: {}", e.getMessage());
        }

        // 兜底：管着这一路的运行中方案的第一首
        Map<String, String> planSongByMac = new LinkedHashMap<>();
        for (BroadcastPlan plan : planService.activePlans()) {
            List<String> songs = BroadcastPlanService.readList(plan.getSongPaths());
            if (songs.isEmpty()) {
                continue;
            }
            for (String mac : BroadcastPlanService.readList(plan.getZoneMacs())) {
                planSongByMac.putIfAbsent(mac, songs.get(0));
            }
        }

        for (String mac : macs) {
            String path = pathByFileName.get(songByMac.getOrDefault(mac, ""));
            if (path == null) {
                path = planSongByMac.get(mac);
            }
            if (path != null) {
                out.put(mac, path);
            }
        }
        return out;
    }

    /** 曲名 → 完整路径。播放走完整路径，列表管理走文件名，两套口径都在这里收口。 */
    private Map<String, String> pathByFileName() {
        Map<String, String> out = new LinkedHashMap<>();
        for (SongListView list : songsService.listSongLists()) {
            for (SongListView.SongView s : list.songs()) {
                out.putIfAbsent(s.fileName(), s.pathName());
            }
        }
        return out;
    }

    /** 给「管着这些分区的运行中方案」记人工暂停。返回命中的方案数。 */
    private int markPaused(List<String> macs, boolean paused) {
        int hit = 0;
        for (BroadcastPlan plan : planService.activePlans()) {
            List<String> owned = BroadcastPlanService.readList(plan.getZoneMacs());
            boolean any = false;
            for (String mac : macs) {
                if (owned.contains(mac)) {
                    zoneStateMapper.upsert(plan.getId(), mac, paused);
                    any = true;
                }
            }
            if (any) {
                hit++;
            }
        }
        return hit;
    }

    private void clearPaused(List<String> macs) {
        markPaused(macs, false);
    }

    private static void requireZones(List<String> macs) {
        if (macs == null || macs.isEmpty()) {
            throw new IllegalArgumentException("未指定分区");
        }
    }

    private static int toInt(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (Exception ignored) {
                return -1;
            }
        }
        return -1;
    }
}
