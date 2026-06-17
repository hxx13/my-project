package com.example.demo.modules.facerecognition.support;

import ai.djl.inference.Predictor;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * DJL {@link Predictor} 非线程安全：借还池化以支持有限并发推理。
 */
public final class PredictorPool<I, O> implements AutoCloseable {

    private final BlockingQueue<Predictor<I, O>> pool;
    private final List<Predictor<I, O>> all;

    public PredictorPool(int size, Supplier<Predictor<I, O>> factory) {
        int n = Math.max(1, size);
        this.pool = new ArrayBlockingQueue<>(n);
        this.all = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            Predictor<I, O> p = factory.get();
            all.add(p);
            pool.offer(p);
        }
    }

    public O predict(I input, long borrowTimeoutMs) throws Exception {
        Predictor<I, O> predictor = pool.poll(borrowTimeoutMs, TimeUnit.MILLISECONDS);
        if (predictor == null) {
            throw new IllegalStateException("人脸模型推理槽位等待超时");
        }
        try {
            return predictor.predict(input);
        } finally {
            pool.offer(predictor);
        }
    }

    @Override
    public void close() {
        for (Predictor<I, O> p : all) {
            try {
                p.close();
            } catch (Exception ignored) {
            }
        }
        all.clear();
        pool.clear();
    }
}
