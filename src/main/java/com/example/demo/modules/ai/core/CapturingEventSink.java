package com.example.demo.modules.ai.core;

import java.util.List;

/**
 * **没有客户端在场的 sink** —— 服务端发起的那一轮（条件触发器到点）用它。
 *
 * <p>那一刻前端多半关着，没有任何东西可以推，所以除正文外一律丢弃。
 *
 * <p>但它不是「什么都不要」的占位：**正文要攒下来** ——
 * 调用方（监视器）要拿它去写推送与通知。那些内容本来就在事件流里，只是这回没人接。
 */
public class CapturingEventSink implements AiEventSink {

    private final StringBuilder text = new StringBuilder();

    @Override
    public void delta(String t) {
        if (t != null) {
            text.append(t);
        }
    }

    /** 工具进度没人看得到（没有界面），但**调用记录仍由编排层落审计**，这里不必管。 */
    @Override
    public void tool(String name, String status) {
    }

    /** 服务端发起的轮里出现挂起 = 有写操作没被预授权，属于配置问题；正文里已由编排层写明，这里不额外处理。 */
    @Override
    public void interaction(String token, String kind, String question, List<Option> options,
                            boolean multiSelect) {
    }

    @Override
    public void usage(AiTurnStats stats) {
    }

    @Override
    public void done(AiTurnStats stats) {
    }

    @Override
    public void error(String code, String message) {
        // 出错也要留下痕迹：这条会被拿去写通知，不然用户只看到「没动静」
        text.append("（执行出错：").append(message == null ? code : message).append("）");
    }

    /** 这一轮模型说出来的正文（可能为空 —— 它只调了工具没说人话）。 */
    public String text() {
        return text.toString();
    }
}
