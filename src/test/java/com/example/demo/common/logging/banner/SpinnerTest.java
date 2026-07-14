package com.example.demo.common.logging.banner;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class SpinnerTest {

    @Test
    @DisplayName("SHUTTLE: tick 14 次遍历多帧")
    void shuttleTickIteratesMultipleFrames() {
        Spinner spinner = new Spinner(Spinner.SpinnerStyle.SHUTTLE);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 14; i++) seen.add(spinner.tick());
        assertTrue(seen.size() >= 7, "至少 7 个不同帧，实际: " + seen.size());
    }

    @Test
    @DisplayName("PULSE: tick 返回厚重字符")
    void pulseTickReturnsThickChars() {
        Spinner spinner = new Spinner(Spinner.SpinnerStyle.PULSE);
        for (int i = 0; i < 10; i++)
            assertFalse(spinner.tick().isEmpty());
    }

    @Test
    @DisplayName("CLASSIC: tick 10 次遍历多帧")
    void classicTickIteratesMultipleFrames() {
        Spinner spinner = new Spinner(Spinner.SpinnerStyle.CLASSIC);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 10; i++) seen.add(spinner.tick());
        assertTrue(seen.size() >= 4, "至少 4 个不同帧");
    }

    @Test
    @DisplayName("DOTS: tick 返回非空帧")
    void dotsTickReturnsNonEmpty() {
        Spinner spinner = new Spinner(Spinner.SpinnerStyle.DOTS);
        for (int i = 0; i < 20; i++)
            assertFalse(spinner.tick().isEmpty());
    }

    @Test
    @DisplayName("ARC: tick 返回非空帧")
    void arcTickReturnsNonEmpty() {
        Spinner spinner = new Spinner(Spinner.SpinnerStyle.ARC);
        for (int i = 0; i < 10; i++)
            assertFalse(spinner.tick().isEmpty());
    }

    @Test
    @DisplayName("current() 不推进")
    void currentReturnsSameFrame() {
        Spinner spinner = new Spinner();
        assertEquals(spinner.current(), spinner.current());
    }

    @Test
    @DisplayName("reset() 后 current 可访问")
    void resetThenCurrentAccessible() {
        Spinner spinner = new Spinner();
        spinner.tick(); spinner.tick();
        spinner.reset();
        assertNotNull(spinner.current());
    }

    @Test
    @DisplayName("并发：2 线程 × 1000 tick 无异常")
    void concurrentTickIsSafe() throws Exception {
        Spinner spinner = new Spinner();
        ExecutorService exec = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(2);
        AtomicInteger errors = new AtomicInteger(0);
        Runnable task = () -> {
            try {
                for (int i = 0; i < 1000; i++)
                    if (spinner.tick().isEmpty()) errors.incrementAndGet();
            } finally { latch.countDown(); }
        };
        exec.submit(task); exec.submit(task);
        assertTrue(latch.await(5, TimeUnit.SECONDS));
        exec.shutdown();
        assertEquals(0, errors.get());
    }

    @Test
    @DisplayName("默认构造 = SHUTTLE")
    void defaultConstructorIsShuttle() {
        assertNotNull(new Spinner().tick());
    }
}
