package com.example.demo.modules.agv;

import java.util.List;

/**
 * AGV 小车身份 —— 后端唯一来源。
 *
 * <p>此前 IP 散落在 {@code AgvAnalysisService}、{@code AgvRouteService}、
 * {@code AgvRouteTopologyService}、{@code AgvSpatialService} 四处各硬编码一份，
 * 新增一台车要改多处（前端已经收敛到一处，后端还没）。本轮**新代码只从这里取**，
 * 上面那四处的收敛留给后续单独做，本计划不动它们。
 *
 * <p>顺序与前端 {@code agvRobotConfig.ts} 的 AGV_ROBOTS 一致。
 */
public final class AgvRobots {

    public static final String AGV_1 = "172.22.159.16";
    public static final String AGV_2 = "172.22.159.18";
    public static final String AGV_3 = "172.22.159.20";
    public static final String AGV_4 = "172.22.159.22";
    public static final String AGV_5 = "172.22.159.113";
    public static final String AGV_6 = "172.22.159.115";

    /** 六台车，顺序与前端一致 */
    public static final List<String> ALL = List.of(AGV_1, AGV_2, AGV_3, AGV_4, AGV_5, AGV_6);

    /**
     * 洗笼盒的活挂在这台车上（2026-10-10 用户定：只有 1 号车算清洗）。
     * 换成别的车或改成多车时就改这里，并同步改日值里的过滤条件。
     */
    public static final String CAGE_WASH_ROBOT = AGV_1;

    /**
     * 一次抬臂行程 = 多少笼盒（2026-10-10 用户定：固定 80）。
     * <b>改这里要同步改</b> {@code db/bootstrap-agv-stats-config.sql} 里笼盒清洗配置的 weight，
     * 否则「今日实时值」与「日行值」会不一致。
     */
    public static final int CAGES_PER_FORK_STROKE = 80;

    private AgvRobots() {
    }
}
