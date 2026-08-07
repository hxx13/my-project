package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.analysis.model.AgvRoute;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

/**
 * AGV 路线发现 v6 — 时间戳顺序 + 增量优化。
 *
 * 不做速度计算，不做批量共识。
 * 按时间戳连线 → 第一条做模板 → 后续穿行逐点最近邻匹配优化。
 *
 * @deprecated Replaced by AgvRouteTopologyService (Model v2). 路线模型2 已取代此算法。
 */
@Deprecated
@Service
public class AgvRouteService {

    private static final Logger log = LoggerFactory.getLogger(AgvRouteService.class);

    /** 停留判定：连续N个点位移<阈值则切分 */
    private static final double STOP_DELTA_M = 0.01;
    private static final int STOP_COUNT = 30;
    /** 断网断点：时间间隔>此秒数则切开 */
    private static final double GAP_CUT_SEC = 10.0;
    /** 路线匹配：空间重叠阈值 */
    private static final double OVERLAP_MIN = 0.3;
    private static final double GRID_M = 1.0;
    /** 最近邻匹配最大距离(m) */
    private static final double MATCH_RADIUS_M = 1.5;
    /** 查询天数 */
    private static final int QUERY_DAYS = 7;

    private final AgvAnalysisMapper analysisMapper;
    private final AgvTrajectoryMapper trajectoryMapper;
    private final AgvSpatialService spatialService;

    public AgvRouteService(AgvAnalysisMapper analysisMapper, AgvTrajectoryMapper trajectoryMapper,
                           AgvSpatialService spatialService) {
        this.analysisMapper = analysisMapper;
        this.trajectoryMapper = trajectoryMapper;
        this.spatialService = spatialService;
    }

    public List<AgvRoute> listAll() { return analysisMapper.selectAllRoutes(); }
    public List<AgvRoute> listByRobot(String ip) { return analysisMapper.selectRoutesByRobot(ip); }
    public int discoverRoutes() { return discoverRoutes(false); }

    public int discoverRoutes(boolean force) {
        int created = 0;
        for (String ip : new String[]{"172.22.159.16","172.22.159.18","172.22.159.20","172.22.159.22"}) {
            if (force) {
                List<AgvRoute> old = analysisMapper.selectRoutesByRobot(ip);
                if (!old.isEmpty()) analysisMapper.deleteRoutesByRobot(ip);
            } else {
                if (!analysisMapper.selectRoutesByRobot(ip).isEmpty()) continue;
            }
            created += discoverForRobot(ip);
        }
        return created;
    }

    public int discoverRoutes(LocalDateTime from, LocalDateTime to) { return discoverRoutes(false); }

    // ═══════════════════════════════════════════════════════════════

    private int discoverForRobot(String ip) {
        LocalDateTime since = LocalDateTime.now().minusDays(QUERY_DAYS);
        List<Map<String, Object>> rows = trajectoryMapper.selectTrajectoryAnalytics(
            ip, since, LocalDateTime.now(), 100000);
        if (rows.size() < 100) return 0;

        // 1. 按时间戳连线，切出移动段（仅靠位移判定，不用速度）
        List<List<double[]>> traversals = extractByTime(rows);
        log.info("[Route] {} {} traversals", ip, traversals.size());
        if (traversals.isEmpty()) return 0;

        // 2. 增量处理：第一条做模板，后续比对优化
        List<RouteTemplate> templates = new ArrayList<>();

        for (List<double[]> trav : traversals) {
            Set<String> sig = cellSig(trav);
            if (sig.size() < 3) continue;

            // 找匹配的模板
            RouteTemplate matched = null;
            double bestOverlap = OVERLAP_MIN;
            for (RouteTemplate t : templates) {
                double ov = overlap(t.signature, sig);
                if (ov > bestOverlap) { bestOverlap = ov; matched = t; }
            }

            if (matched != null) {
                // 逐点最近邻匹配优化
                refineTemplate(matched, trav);
                matched.frequency++;
            } else {
                // 新路线
                templates.add(new RouteTemplate(trav, sig));
            }
        }

        // 3. 存储
        int created = 0;
        for (RouteTemplate t : templates) {
            if (t.points.size() < 3) continue;
            double[] s = t.points.get(0), e = t.points.get(t.points.size()-1);
            boolean roundTrip = Math.sqrt((s[0]-e[0])*(s[0]-e[0])+(s[1]-e[1])*(s[1]-e[1])) < 3.0;
            String fromName = nearestName(rows, s);
            String toName = roundTrip ? fromName : nearestName(rows, e);
            String type = roundTrip ? "REVERSE" : "TRANSPORT";

            AgvRoute r = new AgvRoute();
            r.setRobotIp(ip); r.setName("运输路线-"+fromName+"→"+toName); r.setRouteType(type);
            r.setPathJson(toJson(t.points));
            r.setColor(type.equals("REVERSE")?"#ec4899":"#3b82f6");
            r.setFromStation(fromName); r.setToStation(toName);
            r.setFrequency(t.frequency); r.setEnabled(true);
            analysisMapper.insertRoute(r);
            created++;
        }
        return created;
    }

    // ═══════════════════════════════════════════════════════════════
    // 按时间戳连线提取移动段
    // ═══════════════════════════════════════════════════════════════

    private List<List<double[]>> extractByTime(List<Map<String, Object>> rows) {
        List<List<double[]>> result = new ArrayList<>();
        List<double[]> cur = new ArrayList<>();
        Long lastTs = null;
        int stop = 0;
        double lx = 0, ly = 0;

        for (var row : rows) {
            Double x = toDouble(row.get("x")), y = toDouble(row.get("y"));
            Long ts = toEpochMs(row.get("recorded_at"));
            if (x == null || y == null) continue;

            // 断网断点：时间间隔过大 → 切开
            if (lastTs != null && ts != null && !cur.isEmpty()) {
                double gapSec = (ts - lastTs) / 1000.0;
                if (gapSec > GAP_CUT_SEC) {
                    if (cur.size() >= 2) result.add(cur);
                    cur = new ArrayList<>();
                    stop = 0;
                }
            }

            double move = cur.isEmpty() ? 999 : Math.sqrt((x-lx)*(x-lx)+(y-ly)*(y-ly));
            if (move > STOP_DELTA_M) {
                cur.add(new double[]{x, y});
                stop = 0;
            } else if (!cur.isEmpty()) {
                stop++;
                if (stop > STOP_COUNT) {
                    if (cur.size() >= 2) result.add(cur);
                    cur = new ArrayList<>();
                    stop = 0;
                }
            }
            lx = x; ly = y;
            if (ts != null) lastTs = ts;
        }
        if (cur.size() >= 2) result.add(cur);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // 模板匹配与增量优化
    // ═══════════════════════════════════════════════════════════════

    private static class RouteTemplate {
        List<double[]> points;    // 当前共识路径
        Set<String> signature;
        int frequency = 1;
        RouteTemplate(List<double[]> pts, Set<String> sig) { this.points = pts; this.signature = sig; }
    }

    /** 逐点最近邻匹配：新穿行的每个点去拉近模板的最近点 */
    private void refineTemplate(RouteTemplate tmpl, List<double[]> trav) {
        // 对模板的每个点，在新穿行中找最近邻 → 拉近
        for (int i = 0; i < tmpl.points.size(); i++) {
            double[] tp = tmpl.points.get(i);
            double[] nearest = null;
            double bestD = MATCH_RADIUS_M * MATCH_RADIUS_M;
            for (double[] q : trav) {
                double d = (q[0]-tp[0])*(q[0]-tp[0]) + (q[1]-tp[1])*(q[1]-tp[1]);
                if (d < bestD) { bestD = d; nearest = q; }
            }
            if (nearest != null) {
                // 加权拉近：模板占 n/(n+1)，新点占 1/(n+1)
                double w = 1.0 / (tmpl.frequency + 1);
                tp[0] = tp[0] * (1-w) + nearest[0] * w;
                tp[1] = tp[1] * (1-w) + nearest[1] * w;
            }
        }

        // 反向：新穿行中有模板没有的区域 → 插入新点
        for (double[] q : trav) {
            double minD = MATCH_RADIUS_M * MATCH_RADIUS_M;
            for (double[] tp : tmpl.points) {
                double d = (q[0]-tp[0])*(q[0]-tp[0]) + (q[1]-tp[1])*(q[1]-tp[1]);
                if (d < minD) minD = d;
            }
            if (minD >= MATCH_RADIUS_M * MATCH_RADIUS_M) {
                // 这是一个新区域 → 插入到最近的位置
                insertNearby(tmpl.points, q);
            }
        }
    }

    private void insertNearby(List<double[]> pts, double[] q) {
        int bestI = 0;
        double bestD = Double.MAX_VALUE;
        for (int i = 0; i < pts.size(); i++) {
            double d = (pts.get(i)[0]-q[0])*(pts.get(i)[0]-q[0]) + (pts.get(i)[1]-q[1])*(pts.get(i)[1]-q[1]);
            if (d < bestD) { bestD = d; bestI = i; }
        }
        pts.add(bestI + 1, q);
    }

    // ═══════════════════════════════════════════════════════════════
    // 辅助
    // ═══════════════════════════════════════════════════════════════

    private Set<String> cellSig(List<double[]> pts) {
        Set<String> s = new HashSet<>();
        for (double[] p : pts) s.add((int)(p[0]/GRID_M)+","+(int)(p[1]/GRID_M));
        return s;
    }

    private double overlap(Set<String> a, Set<String> b) {
        if (a.isEmpty()||b.isEmpty()) return 0;
        Set<String> inter = new HashSet<>(a); inter.retainAll(b);
        return (double)inter.size() / Math.min(a.size(), b.size());
    }

    private String nearestName(List<Map<String, Object>> rows, double[] pt) {
        String best=null; double bestD=Double.MAX_VALUE; Set<String> seen=new HashSet<>();
        for (var row:rows){
            String st=row.get("station")!=null?row.get("station").toString():"";
            if(st.isEmpty()||seen.contains(st))continue; seen.add(st);
            Double sx=toDouble(row.get("x")),sy=toDouble(row.get("y"));
            if(sx==null||sy==null)continue;
            double d=(pt[0]-sx)*(pt[0]-sx)+(pt[1]-sy)*(pt[1]-sy);
            if(d<bestD){bestD=d;best=st;}
        }
        return best!=null?spatialService.resolveStationName(best):String.format("(%.0f,%.0f)",pt[0],pt[1]);
    }

    private String toJson(List<double[]> path) {
        StringBuilder sb=new StringBuilder("["); for(int i=0;i<path.size();i++){
            if(i>0)sb.append(","); sb.append(String.format("[%.4f,%.4f]",path.get(i)[0],path.get(i)[1]));}
        return sb.append("]").toString();
    }

    private static Double toDouble(Object o){if(o instanceof Number n)return n.doubleValue();if(o instanceof String s)try{return Double.parseDouble(s);}catch(Exception e){}return null;}
    private static Long toEpochMs(Object o){if(o==null)return null;if(o instanceof java.sql.Timestamp ts)return ts.getTime();if(o instanceof LocalDateTime ldt)return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();return null;}
}
