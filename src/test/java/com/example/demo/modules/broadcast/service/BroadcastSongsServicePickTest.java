package com.example.demo.modules.broadcast.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 开播选曲：必须跳过平台上已经没有的曲目。
 *
 * <p>现场事故：方案首曲被从曲库删掉后，调度器仍拿它去下发，平台回「目标不存在」，
 * 整场不出声。这里钉住「取第一首还在的、都不在就明确失败」。
 */
class BroadcastSongsServicePickTest {

    private static final Map<String, String> LIVE = Map.of(
            "/Data/Program/Other/1.mp3", "LIST-A",
            "/Data/Program/Other/3.mp3", "LIST-B");

    @Test
    void 首曲还在就用首曲() {
        assertEquals("/Data/Program/Other/1.mp3",
                BroadcastSongsService.pickExisting(
                        List.of("/Data/Program/Other/1.mp3", "/Data/Program/Other/3.mp3"), LIVE));
    }

    @Test
    void 首曲没了就跳到下一首() {
        assertEquals("/Data/Program/Other/3.mp3",
                BroadcastSongsService.pickExisting(
                        List.of("/Data/Program/Other/gone.mp3", "/Data/Program/Other/3.mp3"), LIVE));
    }

    @Test
    void 全都不在返回空() {
        assertNull(BroadcastSongsService.pickExisting(
                List.of("/Data/Program/Other/gone.mp3"), LIVE));
        assertNull(BroadcastSongsService.pickExisting(List.of(), LIVE));
        assertNull(BroadcastSongsService.pickExisting(null, LIVE));
    }
}
