package com.example.demo.common.util;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class StudentIdGeneratorTest {

    private static final long EPOCH = 1288834974657L;

    @Test
    void generates_19_digit_numeric_id() {
        StudentIdGenerator g = new StudentIdGenerator(1000L);
        String id = g.nextId();
        assertEquals(19, id.length(), "应为 19 位，实际 " + id);
        assertTrue(id.chars().allMatch(Character::isDigit), "应全为数字，实际 " + id);
    }

    @Test
    void ids_are_strictly_increasing() {
        StudentIdGenerator g = new StudentIdGenerator(1000L);
        long prev = -1L;
        for (int i = 0; i < 5000; i++) {
            long cur = Long.parseLong(g.nextId());
            assertTrue(cur > prev, "第 " + i + " 个 id 未递增: " + prev + " -> " + cur);
            prev = cur;
        }
    }

    @Test
    void ids_are_unique_under_burst() {
        StudentIdGenerator g = new StudentIdGenerator(1000L);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 20000; i++) {
            assertTrue(seen.add(g.nextId()), "出现重复 id，第 " + i + " 次");
        }
    }

    @Test
    void id_decodes_back_to_current_time() {
        StudentIdGenerator g = new StudentIdGenerator(1000L);
        long before = System.currentTimeMillis();
        long decoded = (Long.parseLong(g.nextId()) >> 22) + EPOCH;
        long after = System.currentTimeMillis();
        assertTrue(decoded >= before - 1000 && decoded <= after + 1000,
                "反解时间 " + decoded + " 不在 [" + before + ", " + after + "] 内");
    }

    @Test
    void worker_id_stays_inside_reserved_block() {
        for (long w = 1000L; w <= 1023L; w++) {
            StudentIdGenerator g = new StudentIdGenerator(w);
            long worker = (Long.parseLong(g.nextId()) >> 12) & 0x3FF;
            assertEquals(w, worker, "worker 段应为 " + w);
        }
    }

    @Test
    void rejects_worker_id_outside_reserved_block() {
        assertThrows(IllegalArgumentException.class, () -> new StudentIdGenerator(999L));
        assertThrows(IllegalArgumentException.class, () -> new StudentIdGenerator(1024L));
    }
}
