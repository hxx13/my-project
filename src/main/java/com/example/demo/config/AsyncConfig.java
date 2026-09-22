package com.example.demo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableAsync
public class AsyncConfig implements SchedulingConfigurer {

    @Value("${spring.task.scheduling.pool.size:12}")
    private int scheduledPoolSize;

    @Bean(name = "coreTaskExecutor")
    public Executor coreTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setThreadNamePrefix("core-task-");
        executor.initialize();
        return executor;
    }

    @Bean(name = "heavyCalcExecutor")
    public Executor heavyCalcExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setThreadNamePrefix("heavy-calc-");
        executor.initialize();
        return executor;
    }

    /**
     * 裸 {@code @Scheduled} 任务的默认调度池。
     *
     * <p><b>必须用 {@link SchedulingConfigurer} 显式注册，只写
     * {@code spring.task.scheduling.pool.size} 是不生效的。</b>本项目另有四个
     * {@code TaskScheduler} 类型的 Bean（agv / 笼位告警 / 大华签退 / WinCC），
     * 都没有 {@code @Primary}，于是 Spring Boot 的 TaskSchedulingAutoConfiguration
     * 整体退让、该属性从未被读取；ScheduledAnnotationBeanPostProcessor 又选不出
     * 唯一的 TaskScheduler，就自建一个<b>单线程</b> Executor（线程名 pool-N-thread-1）
     * 把三十来个裸 {@code @Scheduled} 全塞进去 —— 任何一条卡住，全站定时任务永久停摆。
     *
     * <p>2026-09-22 刷卡规则「只有触发、没有恢复」即由此产生：一次无超时的 LLM 请求
     * 占死那条线程，门禁常开恢复任务跟着一起死。
     * {@link org.springframework.scheduling.config.ScheduledTaskRegistrar} 会在
     * 「按类型找 TaskScheduler Bean」之前先应用配置器，所以这里设的池优先级最高、
     * 不受那几个专用池影响；带 {@code scheduler="xxx"} 的任务仍走各自的池。
     */
    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        registrar.setTaskScheduler(scheduledTaskScheduler());
    }

    @Bean(name = "scheduledTaskScheduler")
    public ThreadPoolTaskScheduler scheduledTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(Math.max(1, scheduledPoolSize));
        scheduler.setThreadNamePrefix("scheduling-");
        scheduler.initialize();
        return scheduler;
    }
}
