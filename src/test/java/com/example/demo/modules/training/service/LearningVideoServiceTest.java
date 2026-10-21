package com.example.demo.modules.training.service;

import com.example.demo.modules.training.entity.LearningVideo;
import com.example.demo.modules.training.entity.LearningVideoProgress;
import com.example.demo.modules.training.mapper.LearningVideoMapper;
import com.example.demo.modules.training.mapper.LearningVideoProgressMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 观看规则：禁止快进不计时长、未看完重来、完成阈值、培训门禁。 */
class LearningVideoServiceTest {

    private LearningVideoMapper videos;
    private LearningVideoProgressMapper progress;
    private LearningVideoService service;

    private LearningVideo video;

    @BeforeEach
    void setUp() {
        videos = mock(LearningVideoMapper.class);
        progress = mock(LearningVideoProgressMapper.class);
        service = new LearningVideoService(videos, progress);

        video = new LearningVideo();
        video.setId(1L);
        video.setTitle("演示");
        video.setFileUrl("/api/upload/files/x.mp4");
        video.setDurationSeconds(100);
        video.setAllowSeek(1);
        video.setRememberPosition(1);
        video.setRequireFullWatch(0);
        video.setCompleteThreshold(95);
        video.setActive(1);
        when(videos.findById(1L)).thenReturn(video);
        when(progress.upsert(any())).thenReturn(1);
    }

    @Test
    void seekJumpIsNotCountedWhenSeekDisabled() {
        video.setAllowSeek(0);
        when(progress.find("u1", 1L)).thenReturn(null);

        Map<String, Object> out = service.report("u1", 1L, 40, 40, 100, false);

        assertEquals(0, out.get("watchedSeconds"), "跨度超过阈值应视为拖动，不计入观看");
        assertFalse((Boolean) out.get("completed"));
    }

    @Test
    void reachesThresholdMarksCompleted() {
        LearningVideoProgress p = progress(94, 60, 0);
        when(progress.find("u1", 1L)).thenReturn(p);

        Map<String, Object> out = service.report("u1", 1L, 65, 5, 100, false);

        assertEquals(99, out.get("watchedSeconds"));
        assertTrue((Boolean) out.get("completed"));
    }

    @Test
    void incompleteRestartsFromZeroWhenFullWatchRequired() {
        video.setRequireFullWatch(1);
        LearningVideoProgress p = progress(40, 50, 0);
        when(progress.find("u1", 1L)).thenReturn(p);

        Map<String, Object> out = service.report("u1", 1L, 55, 5, 100, false);

        assertEquals(0, out.get("resumeSeconds"), "未看完且要求完整观看时必须从头开始");
    }

    @Test
    void remembersPositionWhenAllowed() {
        LearningVideoProgress p = progress(40, 50, 0);
        when(progress.find("u1", 1L)).thenReturn(p);

        Map<String, Object> out = service.report("u1", 1L, 55, 5, 100, false);

        assertEquals(55, out.get("resumeSeconds"));
    }

    @Test
    void trainingGateRequiresEveryBoundVideo() {
        LearningVideoProgress done = progress(100, 0, 1);
        when(progress.find("u1", 1L)).thenReturn(done);

        Map<String, Object> all = service.completionFor("u1", List.of(1L));
        assertTrue((Boolean) all.get("allCompleted"));

        LearningVideoProgress partial = progress(40, 50, 0);
        when(progress.find("u1", 1L)).thenReturn(partial);
        Map<String, Object> notAll = service.completionFor("u1", List.of(1L));
        assertFalse((Boolean) notAll.get("allCompleted"));
    }

    private static LearningVideoProgress progress(int watched, int position, int completed) {
        LearningVideoProgress p = new LearningVideoProgress();
        p.setPersonId("u1");
        p.setVideoId(1L);
        p.setWatchedSeconds(watched);
        p.setPositionSeconds(position);
        p.setDurationSeconds(100);
        p.setCompleted(completed);
        return p;
    }
}
