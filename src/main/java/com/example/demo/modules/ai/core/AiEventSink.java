package com.example.demo.modules.ai.core;

import java.util.List;

/**
 * 编排层的事件出口 —— **载体无关**。Web 智能体球与小程序各自实现自己的推送方式，
 * 编排层只认这个接口，所以换载体不需要动循环（可扩展点 E2）。
 */
public interface AiEventSink {

    /** 文本增量。 */
    void delta(String text);

    /** 正在调用某个工具（可选展示过程）。 */
    void tool(String name, String status);

    /** 需要用户回应。options 是**结构化**的，前端渲染成可点选控件，不要当文本用。 */
    void interaction(String token, String kind, String question, List<Option> options, boolean multiSelect);

    /**
     * 用量进度：**每完成一轮模型调用就推一次**，让载体能实时显示已耗时长与 token。
     *
     * <p>粒度是「轮」而不是「token」：非流式调用在整轮返回前拿不到 usage，
     * 正文也没法边生成边报。要更细就得让模型调用本身走流式（且依赖 stream_options 带 usage）。
     */
    void usage(AiTurnStats stats);

    /** 本轮结束，附带整轮耗时与 token 用量（跨轮累加）。 */
    void done(AiTurnStats stats);

    /** 出错（含「无权限」这类正常拒绝）。 */
    void error(String code, String message);

    record Option(String label, String value) {
    }
}
