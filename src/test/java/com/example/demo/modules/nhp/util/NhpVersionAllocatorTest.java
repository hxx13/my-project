package com.example.demo.modules.nhp.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class NhpVersionAllocatorTest {

    @Test
    void empty_yieldsOne() {
        assertEquals(1, NhpVersionAllocator.nextAvailable(List.of()));
        assertEquals(1, NhpVersionAllocator.nextAvailable(null));
    }

    @Test
    void deleteV2_whenOnlyV1Remains_nextIs2() {
        // 曾有 v1,v2；删掉 v2 后活跃仅 v1 → 下一版补位 2
        assertEquals(2, NhpVersionAllocator.nextAvailable(List.of(1)));
    }

    @Test
    void holeAtV2_withV1AndV3_nextIs2() {
        // 有 v1,v3，删了 v2 → 下一版补位 2（不 bump 到 4，也不改写 v3）
        assertEquals(2, NhpVersionAllocator.nextAvailable(List.of(1, 3)));
    }

    @Test
    void contiguous_1_2_nextIs3() {
        assertEquals(3, NhpVersionAllocator.nextAvailable(List.of(1, 2)));
    }

    @Test
    void ignoresNonPositiveAndNull() {
        assertEquals(1, NhpVersionAllocator.nextAvailable(java.util.Arrays.asList(null, 0, -5)));
        assertEquals(2, NhpVersionAllocator.nextAvailable(java.util.Arrays.asList(1, null, 0)));
    }
}
