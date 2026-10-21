package com.example.demo.modules.training.service;

import com.example.demo.modules.training.entity.LearningVideo;
import com.example.demo.modules.training.entity.LearningVideoProgress;
import com.example.demo.modules.training.mapper.LearningVideoMapper;
import com.example.demo.modules.training.mapper.LearningVideoProgressMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 学习视频库 + 观看进度。
 *
 * <p>规则都在这里收口（学生端只是展示）：
 * <ul>
 *   <li>允许快进 = 0：一次上报跨度超过 {@link #MAX_JUMP_SECONDS} 视为拖动，该段不计入观看时长；</li>
 *   <li>记住位置 = 0：返回的续播点恒为 0；</li>
 *   <li>未看完必须重看 = 1：未完成时续播点恒为 0；</li>
 *   <li>完成判定：累计有效观看达到「视频时长 × 完成阈值%」。</li>
 * </ul>
 */
@Service
public class LearningVideoService {

    /** 单次心跳允许计入的最大跨度；超过即视为拖动/跳转。 */
    private static final int MAX_JUMP_SECONDS = 5;

    private final LearningVideoMapper videoMapper;
    private final LearningVideoProgressMapper progressMapper;

    public LearningVideoService(LearningVideoMapper videoMapper,
                                LearningVideoProgressMapper progressMapper) {
        this.videoMapper = videoMapper;
        this.progressMapper = progressMapper;
    }

    // ================= 管理端 =================

    public List<LearningVideo> listAll() {
        return videoMapper.listAll();
    }

    @Transactional
    public LearningVideo create(Map<String, Object> body, String operatorId) {
        LearningVideo v = new LearningVideo();
        v.setTitle(str(body.get("title")));
        v.setFileUrl(str(body.get("fileUrl")));
        if (v.getTitle() == null || v.getFileUrl() == null) {
            throw new IllegalArgumentException("缺少标题或文件地址");
        }
        v.setFileRecordId(toLong(body.get("fileRecordId")));
        v.setDurationSeconds(intOr(body.get("durationSeconds"), 0));
        v.setSizeBytes(longOr(body.get("sizeBytes"), 0L));
        v.setAllowSeek(intOr(body.get("allowSeek"), 1));
        v.setRememberPosition(intOr(body.get("rememberPosition"), 1));
        v.setRequireFullWatch(intOr(body.get("requireFullWatch"), 0));
        v.setCompleteThreshold(clampThreshold(intOr(body.get("completeThreshold"), 95)));
        v.setActive(intOr(body.get("active"), 1));
        v.setSortOrder(intOr(body.get("sortOrder"), 0));
        v.setCreatedBy(operatorId);
        videoMapper.insert(v);
        return videoMapper.findById(v.getId());
    }

    @Transactional
    public LearningVideo update(Long id, Map<String, Object> body) {
        LearningVideo v = videoMapper.findById(id);
        if (v == null) return null;
        if (body.get("title") != null) v.setTitle(str(body.get("title")));
        if (body.get("fileUrl") != null) v.setFileUrl(str(body.get("fileUrl")));
        if (body.get("fileRecordId") != null) v.setFileRecordId(toLong(body.get("fileRecordId")));
        if (body.get("durationSeconds") != null) v.setDurationSeconds(intOr(body.get("durationSeconds"), 0));
        if (body.get("sizeBytes") != null) v.setSizeBytes(longOr(body.get("sizeBytes"), 0L));
        if (body.get("allowSeek") != null) v.setAllowSeek(intOr(body.get("allowSeek"), 1));
        if (body.get("rememberPosition") != null) v.setRememberPosition(intOr(body.get("rememberPosition"), 1));
        if (body.get("requireFullWatch") != null) v.setRequireFullWatch(intOr(body.get("requireFullWatch"), 0));
        if (body.get("completeThreshold") != null) {
            v.setCompleteThreshold(clampThreshold(intOr(body.get("completeThreshold"), 95)));
        }
        if (body.get("active") != null) v.setActive(intOr(body.get("active"), 1));
        if (body.get("sortOrder") != null) v.setSortOrder(intOr(body.get("sortOrder"), 0));
        videoMapper.update(v);
        return videoMapper.findById(id);
    }

    @Transactional
    public int delete(Long id) {
        return videoMapper.delete(id);
    }

    // ================= 学生端 =================

    /** 已上架视频 + 我的进度。resumeSeconds 已按视频规则折算好，前端直接 seek。 */
    public List<Map<String, Object>> listForStudent(String personId) {
        Map<Long, LearningVideoProgress> progressMap = new LinkedHashMap<>();
        for (LearningVideoProgress p : progressMapper.listByPerson(personId)) {
            progressMap.put(p.getVideoId(), p);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (LearningVideo v : videoMapper.listActive()) {
            out.add(view(v, progressMap.get(v.getId())));
        }
        return out;
    }

    /**
     * 上报一次观看心跳。position/duration 由播放器上报；watchedDelta 是本次实际播放的秒数。
     * ended=true 表示播放到了结尾（用于完成判定）。
     */
    @Transactional
    public Map<String, Object> report(String personId, Long videoId, Integer position,
                                      Integer watchedDelta, Integer duration, Boolean ended) {
        LearningVideo v = videoMapper.findById(videoId);
        if (v == null || v.getActive() == null || v.getActive() != 1) {
            throw new IllegalArgumentException("视频不存在或已下架");
        }
        LearningVideoProgress p = progressMapper.find(personId, videoId);
        if (p == null) {
            p = new LearningVideoProgress();
            p.setPersonId(personId);
            p.setVideoId(videoId);
            p.setPositionSeconds(0);
            p.setWatchedSeconds(0);
            p.setDurationSeconds(0);
            p.setCompleted(0);
        }

        int knownDuration = v.getDurationSeconds() == null ? 0 : v.getDurationSeconds();
        int clientDuration = duration == null ? 0 : Math.max(0, duration);
        if (knownDuration <= 0 && clientDuration > 0) {
            videoMapper.fillDuration(videoId, clientDuration);
            knownDuration = clientDuration;
        }

        int delta = watchedDelta == null ? 0 : Math.max(0, watchedDelta);
        // 禁止快进的视频：跨度异常视为拖动，不计入有效观看
        if (!isOn(v.getAllowSeek()) && delta > MAX_JUMP_SECONDS) {
            delta = 0;
        }
        delta = Math.min(delta, MAX_JUMP_SECONDS * 3);

        int watched = (p.getWatchedSeconds() == null ? 0 : p.getWatchedSeconds()) + delta;
        int pos = position == null ? 0 : Math.max(0, position);
        int threshold = v.getCompleteThreshold() == null ? 95 : clampThreshold(v.getCompleteThreshold());
        boolean completed = p.getCompleted() != null && p.getCompleted() == 1;
        if (!completed && knownDuration > 0 && watched * 100L >= (long) knownDuration * threshold) {
            completed = true;
        }
        // 播放到结尾：即便时长有误差也算完成（否则 30 秒短片常卡在 94%）
        if (!completed && Boolean.TRUE.equals(ended) && watched * 100L >= (long) knownDuration * Math.max(10, threshold - 10)) {
            completed = true;
        }

        p.setPositionSeconds(pos);
        p.setWatchedSeconds(watched);
        p.setDurationSeconds(knownDuration);
        p.setCompleted(completed ? 1 : 0);
        p.setLastWatchedAt(LocalDateTime.now());
        progressMapper.upsert(p);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("videoId", videoId);
        out.put("positionSeconds", pos);
        out.put("watchedSeconds", watched);
        out.put("durationSeconds", knownDuration);
        out.put("completed", completed);
        out.put("resumeSeconds", resumePoint(v, p));
        out.put("percent", percent(watched, knownDuration));
        return out;
    }

    /** 培训绑定的视频是否全部完成。已删除/已下架的视频不再拦人（学生无从观看）。 */
    public Map<String, Object> completionFor(String personId, List<Long> videoIds) {
        List<Map<String, Object>> items = new ArrayList<>();
        boolean all = true;
        for (Long vid : videoIds) {
            LearningVideo v = videoMapper.findById(vid);
            if (v == null || !isOn(v.getActive())) {
                continue;
            }
            LearningVideoProgress p = progressMapper.find(personId, vid);
            boolean done = p != null && p.getCompleted() != null && p.getCompleted() == 1;
            if (!done) all = false;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("videoId", vid);
            m.put("title", v.getTitle());
            m.put("active", true);
            m.put("completed", done);
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allCompleted", all);
        out.put("videos", items);
        return out;
    }

    // ================= 内部 =================

    private Map<String, Object> view(LearningVideo v, LearningVideoProgress p) {
        int duration = v.getDurationSeconds() == null ? 0 : v.getDurationSeconds();
        int watched = p == null || p.getWatchedSeconds() == null ? 0 : p.getWatchedSeconds();
        boolean completed = p != null && p.getCompleted() != null && p.getCompleted() == 1;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("title", v.getTitle());
        m.put("fileUrl", v.getFileUrl());
        m.put("durationSeconds", duration);
        m.put("sizeBytes", v.getSizeBytes());
        m.put("allowSeek", isOn(v.getAllowSeek()));
        m.put("rememberPosition", isOn(v.getRememberPosition()));
        m.put("requireFullWatch", isOn(v.getRequireFullWatch()));
        m.put("completeThreshold", v.getCompleteThreshold());
        m.put("completed", completed);
        m.put("watchedSeconds", watched);
        m.put("percent", percent(watched, duration));
        m.put("resumeSeconds", resumePoint(v, p));
        m.put("lastWatchedAt", p == null ? null : p.getLastWatchedAt());
        return m;
    }

    /** 续播点：没记住位置 / 要求未看完重来 → 0。 */
    private int resumePoint(LearningVideo v, LearningVideoProgress p) {
        if (p == null) return 0;
        boolean completed = p.getCompleted() != null && p.getCompleted() == 1;
        if (!isOn(v.getRememberPosition())) return 0;
        if (isOn(v.getRequireFullWatch()) && !completed) return 0;
        return p.getPositionSeconds() == null ? 0 : Math.max(0, p.getPositionSeconds());
    }

    private static int percent(int watched, int duration) {
        if (duration <= 0) return 0;
        return (int) Math.min(100, Math.round(watched * 100.0 / duration));
    }

    private static boolean isOn(Integer v) {
        return v != null && v == 1;
    }

    private static int clampThreshold(int v) {
        return Math.min(100, Math.max(10, v));
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOr(Object v, int fallback) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Integer.parseInt(s.trim()); } catch (NumberFormatException ignored) { return fallback; }
        }
        return fallback;
    }

    private static Long longOr(Object v, Long fallback) {
        if (v instanceof Number n) return n.longValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Long.parseLong(s.trim()); } catch (NumberFormatException ignored) { return fallback; }
        }
        return fallback;
    }

    private static Long toLong(Object v) {
        return longOr(v, null);
    }
}
