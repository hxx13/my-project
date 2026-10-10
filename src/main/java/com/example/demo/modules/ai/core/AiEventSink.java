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

    /**
     * 让载体跳到某个页面（工具认得入口、但用户不知道在哪儿时用）。
     *
     * <p>默认空实现：**只有 Web 载体能跳**，别的载体（小程序、未来的）接不上就是接不上，
     * 不该为了一个跳转把接口撑成抽象方法、逼所有实现类都写一遍。给了个空体，
     * 「换个载体」这件事就仍然只是实现本接口（可扩展点 E2）。
     *
     * <p>跳转是**前端行为**，服务端只发指令：path 必须来自服务端自己的页面清单
     * （见 NavToolPack），绝不是模型编出来的 URL。
     */
    default void navigate(String path, String label) {
    }

    /**
     * 让载体**当场执行一次导出并下载**（工具已经把「导什么」算好了）。
     *
     * <p>为什么不让后端直接给文件 URL：导出接口要 Authorization 头，聊天里一个裸 URL 点下去会 401；
     * 要么开后端一个**公开签名下载面**，要么让载体用它自己那份登录态去拉 —— 这里选后者（少一个公网面）。
     * 另外「上次的小计配置」存在用户浏览器里，也只有载体够得着（见 MaterialAuditToolPack 的 L1）。
     *
     * @param payloadJson 导出请求 JSON：{@code {"kind":"materialAudit","params":{...},"label":"…"}}
     */
    default void download(String payloadJson) {
    }

    /**
     * 让载体在对话里**显示一张图**（截图 / 后端渲染出来的图都走这里）。
     *
     * <p>两个生产者共用同一个事件，区别只在 {@code path}：
     * <ul>
     *   <li>{@code path} 非空 —— **载体自己去截**：先跳到这个页面、等它渲染稳，再把当前画面截下来。
     *       截到的就是**这个人自己那一份**（他的登录态、他的数据、他的视口与主题），
     *       后端不需要注入任何人的身份。代价：页面会真的跳一下，且只截得到他能打开的页面。</li>
     *   <li>{@code path} 为空 —— 图**已经产好了**（后端自己渲染/截的），载体按 {@code exportId}
     *       去产物接口取字节显示即可。无人值守（定时任务）只能走这条。</li>
     * </ul>
     *
     * <p>两种情况下载体都应当把拿到的字节**回存到这个 exportId 上** —— 历史回看靠产物重挂，
     * 跟 {@link #download} 是同一条口径（见 AiExportArtifactService）。
     *
     * <p>{@code path} 与 {@link #navigate} 一样**只可能来自服务端自己的页面清单**，模型编不出来。
     */
    default void image(Long exportId, String label, String path) {
    }

    record Option(String label, String value) {
    }
}
