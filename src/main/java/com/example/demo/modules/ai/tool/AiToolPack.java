package com.example.demo.modules.ai.tool;

import com.example.demo.modules.auth.entity.User;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 工具包 —— 按业务域分组的工具集合。**这是本架构唯一的主要扩展点（E1）**。
 *
 * 新增一项能力 = 新增一个实现本接口的 Spring Bean，不改既有代码：
 * 注册由 {@link ToolRegistry} 自动收集；该包的 L1 约束默认值由 {@link #defaultPrompt()} 自带，
 * 启动时自动注册进系统配置（见 AiPromptSeed）；该包要用的能力码由 {@link #capabilities()} 自带，
 * 启动时自动注册进闸门（见 AiCapabilityBootstrap）。
 */
public interface AiToolPack {

    /** 包标识，小写下划线，如 {@code unfreeze}。用于配置 key {@code ai.prompt.pack.<packKey>}。 */
    String packKey();

    /** 中文名，给人看（路由与后台配置页）。 */
    String displayName();

    /** L1 约束默认值（该域特有的业务口径）。后台可覆盖。 */
    String defaultPrompt();

    /** 本包提供的工具。 */
    List<AiTool> tools();

    /**
     * 这个包服务于哪些**视角**（教职工 / 学生）。开启对话时按调用者的视角选包注入。
     *
     * <p><b>默认 STAFF</b>：现有包全是教职工视角的（2026-10-09 用户确认）；将来做学生包时，
     * 那个包显式声明 {@code Set.of(AiView.STUDENT)}（或两者都要就都写上）。
     *
     * <p>为什么默认偏严：漏声明只是「某个包暂时不服务学生」，反过来（默认两边都给）就是
     * 把教职工能力直接暴露给学生 —— 两种错的代价不对称。
     */
    default Set<AiView> views() {
        return Set.of(AiView.STAFF);
    }

    /**
     * **路由词**：用户这句话里/这个页面上出现这些词时，本包该被带上（L2 路由，见设计文档 §4、§6.3）。
     *
     * <p>为什么写在**包自己**这里：路由是准确率层，不是安全层。但每加一个包就要去改一张集中的
     * 路由表，等于把 E1（「加一个包，零改动既有文件」）作废 —— 所以词跟着包走。
     *
     * <p>{@link #packKey()} 与 {@link #displayName()} 天然就是路由词（英文 key 直接命中页面路径，
     * 如 {@code /console/admin/door-control} → {@code door}），这里只补中文口语说法。
     *
     * <p>匹配不上时会**全包下发**（保守回落），所以少写几个词只是少省点 token，不会让用户办不了事；
     * 反之写得太宽（比如「查」）会让每个包都被带上，等于没路由。
     */
    default Set<String> routeHints() {
        return Set.of();
    }

    /**
     * 本包用到的能力码 → 判定逻辑。启动时注册进能力闸门。
     *
     * <p>判定**必须与该能力对应的既有入口同口径**（同一个角色阈值、同一套范围判定）。
     * 两边各写一遍是漏洞的来源（接口摸排文档 §6 通则 2：同一动作在全平台有 4 种权限口径），
     * 所以这里优先复用既有的角色枚举与判定方法，不要另起一套。
     */
    default Map<String, Predicate<User>> capabilities() {
        return Map.of();
    }
}
