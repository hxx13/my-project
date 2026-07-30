package com.example.demo.modules.agv.analysis;

import com.example.demo.modules.agv.analysis.dto.PrimitiveEvent;
import com.example.demo.modules.agv.analysis.model.AgvSpatialElement;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Layer 2: Scans trajectory rows and emits primitive events.
 * Pure computation — no database access, no state.
 */
public class AgvPrimitiveDetector {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Single row from agv_trajectory, represented as a flat map for flexibility. */
    public static class TrajectoryFrame {
        public String robotIp;
        public LocalDateTime recordedAt;
        public Double x, y, angle;
        public Double battery;
        public Integer taskStatus;
        public String station;
        public Boolean charging, blocked, emergency;
        public Double forkHeight;
        public Integer jackState;
        public Integer relocStatus;
        public String mapName;
        public String diJson;
    }

    /**
     * Scan frames in chronological order, produce primitive events.
     */
    public List<PrimitiveEvent> detect(List<TrajectoryFrame> frames, List<AgvSpatialElement> zones) {
        if (frames == null || frames.isEmpty()) return Collections.emptyList();
        List<PrimitiveEvent> events = new ArrayList<>();
        frames.sort(Comparator.comparing(f -> f.recordedAt));

        TrajectoryFrame prev = null;
        int creepCount = 0;           // consecutive frames with 0.05 < speed < 0.2
        List<Double> turnAngles = new ArrayList<>(); // accumulating angle changes at low speed
        List<Double> spinAngles = new ArrayList<>(); // accumulating angle changes at near-zero speed (SPIN)
        TrajectoryFrame idleStartFrame = null;      // frame where robot stopped (IDLE detection)
        LocalDateTime idleStartTime = null;          // time when idle began

        for (int i = 0; i < frames.size(); i++) {
            TrajectoryFrame cur = frames.get(i);
            double speed = 0;
            if (prev != null && prev.x != null && cur.x != null) {
                double dt = java.time.Duration.between(prev.recordedAt, cur.recordedAt).toMillis() / 1000.0;
                if (dt > 0.01 && dt < 60) {
                    double dx = cur.x - prev.x, dy = cur.y - prev.y;
                    speed = Math.sqrt(dx * dx + dy * dy) / dt;
                }
            }

            // MOVE_START: task 4→2 OR speed breaks 0.1 (whichever fires first)
            if (prev != null && prev.taskStatus != null && cur.taskStatus != null) {
                if (prev.taskStatus == 4 && cur.taskStatus == 2) {
                    events.add(new PrimitiveEvent("MOVE_START", cur.recordedAt, cur.robotIp, cur.x, cur.y));
                } else if (prev.taskStatus != 2 && speed >= 0.1 && (prev.taskStatus == null || prev.taskStatus == 4)) {
                    events.add(new PrimitiveEvent("MOVE_START", cur.recordedAt, cur.robotIp, cur.x, cur.y));
                }
                if (prev.taskStatus == 2 && cur.taskStatus == 4) {
                    events.add(new PrimitiveEvent("MOVE_END", cur.recordedAt, cur.robotIp, cur.x, cur.y));
                }
            }

            // REVERSE: angle jump > 2.5 rad using atan2-normalized delta (handles wrap-around)
            if (prev != null && prev.angle != null && cur.angle != null) {
                double da = Math.abs(Math.atan2(Math.sin(cur.angle - prev.angle), Math.cos(cur.angle - prev.angle)));
                if (da > 2.5) {
                    events.add(pr(cur, "REVERSE", cur.robotIp, cur.x, cur.y));
                }
                // direction-vector × speed < 0 alternative: heading dot velocity < 0
                if (speed > 0.1 && prev.x != null && cur.x != null) {
                    double headingX = Math.cos(cur.angle), headingY = Math.sin(cur.angle);
                    double velX = cur.x - prev.x, velY = cur.y - prev.y;
                    double dot = headingX * velX + headingY * velY;
                    if (dot < 0 && speed > 0.15) {
                        events.add(pr(cur, "REVERSE", cur.robotIp, cur.x, cur.y));
                    }
                }
            }

            // TURN: speed < 0.3 and sustained angle change rate > 0.3 rad/s
            if (speed < 0.3 && prev != null) {
                if (prev.angle != null && cur.angle != null) {
                    double da = Math.abs(Math.atan2(Math.sin(cur.angle - prev.angle), Math.cos(cur.angle - prev.angle)));
                    turnAngles.add(da);
                    if (turnAngles.size() > 5) turnAngles.remove(0);
                    double avgRate = turnAngles.stream().mapToDouble(Double::doubleValue).average().orElse(0);
                    if (turnAngles.size() >= 3 && avgRate > 0.3) {
                        PrimitiveEvent e = pr(cur, "TURN", cur.robotIp, cur.x, cur.y);
                        if (events.stream().noneMatch(ev -> "TURN".equals(ev.getType()) &&
                                Math.abs(java.time.Duration.between(ev.getTimestamp(), e.getTimestamp()).toMillis()) < 2000)) {
                            events.add(e);
                        }
                    }
                }
            } else {
                turnAngles.clear();
            }

            // SPIN (原地旋转): speed < 0.05 and sustained angle change rate > 0.2 rad/s over 3+ frames
            if (speed < 0.05 && prev != null) {
                if (prev.angle != null && cur.angle != null) {
                    double da = Math.abs(Math.atan2(Math.sin(cur.angle - prev.angle), Math.cos(cur.angle - prev.angle)));
                    spinAngles.add(da);
                    if (spinAngles.size() > 5) spinAngles.remove(0);
                    double avgRate = spinAngles.stream().mapToDouble(Double::doubleValue).average().orElse(0);
                    if (spinAngles.size() >= 3 && avgRate > 0.2) {
                        PrimitiveEvent e = pr(cur, "SPIN", cur.robotIp, cur.x, cur.y);
                        if (events.stream().noneMatch(ev -> "SPIN".equals(ev.getType()) &&
                                Math.abs(java.time.Duration.between(ev.getTimestamp(), e.getTimestamp()).toMillis()) < 2000)) {
                            events.add(e);
                        }
                    }
                }
            } else {
                spinAngles.clear();
            }

            // CREEP: 0.05 < speed < 0.2 sustained > 5 frames
            if (speed > 0.05 && speed < 0.2) {
                creepCount++;
                if (creepCount == 5) {
                    events.add(pe(cur, "CREEP", cur.robotIp, cur.x, cur.y, speed));
                }
            } else {
                creepCount = 0;
            }

            // IDLE (原地等待): speed < 0.05 sustained > 30s, emit IDLE_START/IDLE_END
            if (speed < 0.05 && cur.x != null && cur.y != null) {
                if (idleStartFrame == null) {
                    idleStartFrame = cur;
                    idleStartTime = cur.recordedAt;
                }
            } else {
                // Robot started moving — check if idle was long enough
                if (idleStartFrame != null && idleStartTime != null) {
                    long idleSec = java.time.Duration.between(idleStartTime, cur.recordedAt).getSeconds();
                    if (idleSec > 30) {
                        events.add(pr(idleStartFrame, "IDLE_START", cur.robotIp, idleStartFrame.x, idleStartFrame.y));
                        events.add(pr(cur, "IDLE_END", cur.robotIp, cur.x, cur.y));
                    }
                    idleStartFrame = null;
                    idleStartTime = null;
                }
            }

            // If last frame is still idle and long enough, emit an open-ended IDLE
            if (i == frames.size() - 1 && idleStartFrame != null && idleStartTime != null) {
                long idleSec = java.time.Duration.between(idleStartTime, cur.recordedAt).getSeconds();
                if (idleSec > 30) {
                    events.add(pr(idleStartFrame, "IDLE_START", cur.robotIp, idleStartFrame.x, idleStartFrame.y));
                    events.add(pr(cur, "IDLE_END", cur.robotIp, cur.x, cur.y));
                }
            }

            // MAP_CHANGE
            if (prev != null && !Objects.equals(prev.mapName, cur.mapName)) {
                events.add(pr(cur, "MAP_CHANGE", cur.robotIp, cur.x, cur.y));
            }

            // Boolean transitions
            if (prev != null) {
                if (isTrue(cur.charging) && !isTrue(prev.charging))
                    events.add(pr(cur, "CHARGING_START", cur.robotIp, cur.x, cur.y));
                if (!isTrue(cur.charging) && isTrue(prev.charging))
                    events.add(pr(cur, "CHARGING_END", cur.robotIp, cur.x, cur.y));
                if (isTrue(cur.blocked) && !isTrue(prev.blocked))
                    events.add(pr(cur, "BLOCKED_ON", cur.robotIp, cur.x, cur.y));
                if (!isTrue(cur.blocked) && isTrue(prev.blocked))
                    events.add(pr(cur, "BLOCKED_OFF", cur.robotIp, cur.x, cur.y));
                if (isTrue(cur.emergency) && !isTrue(prev.emergency))
                    events.add(pr(cur, "EMERGENCY_ON", cur.robotIp, cur.x, cur.y));
                if (!isTrue(cur.emergency) && isTrue(prev.emergency))
                    events.add(pr(cur, "EMERGENCY_OFF", cur.robotIp, cur.x, cur.y));
            }

            // FORK_RAISE / FORK_LOWER (threshold 0.001m, fork steps: 0→0.033→0.065→0.067, min step=0.002)
            if (prev != null && prev.forkHeight != null && cur.forkHeight != null) {
                double df = cur.forkHeight - prev.forkHeight;
                if (df > 0.001) events.add(pe(cur, "FORK_RAISE", cur.robotIp, cur.x, cur.y, df));
                if (df < -0.001) events.add(pe(cur, "FORK_LOWER", cur.robotIp, cur.x, cur.y, -df));
            }

            // JACK_CHANGE
            if (prev != null && prev.jackState != null && cur.jackState != null && !prev.jackState.equals(cur.jackState)) {
                events.add(pr(cur, "JACK_CHANGE", cur.robotIp, cur.x, cur.y));
            }

            // RELOC
            if (prev != null && prev.relocStatus != null && cur.relocStatus != null && !prev.relocStatus.equals(cur.relocStatus)) {
                events.add(pr(cur, "RELOC", cur.robotIp, cur.x, cur.y));
            }

            // STATION_CHANGE
            if (prev != null && !Objects.equals(prev.station, cur.station)) {
                events.add(pr(cur, "STATION_CHANGE", cur.robotIp, cur.x, cur.y));
            }

            // Zone enter/exit for all element types
            for (AgvSpatialElement zone : zones) {
                boolean curIn = false, prevIn = false;
                String eType = zone.getElementType();
                if ("STATION_ZONE".equals(eType) || "POLYGON_ZONE".equals(eType)) {
                    // Try polygon matching first
                    List<double[]> poly = parsePolygon(zone.getPolygonJson());
                    if (poly != null && !poly.isEmpty()) {
                        curIn = isPointInPolygon(cur.x, cur.y, poly);
                        prevIn = prev != null && isPointInPolygon(prev.x, prev.y, poly);
                    }
                    // Fallback: station name matching (for zones without polygon)
                    if (!curIn && !prevIn && "STATION_ZONE".equals(eType) && zone.getStationPattern() != null) {
                        String p = zone.getStationPattern();
                        curIn = cur.station != null && cur.station.equals(p);
                        prevIn = prev != null && prev.station != null && prev.station.equals(p);
                    }
                } else if ("POI".equals(eType)) {
                    if (zone.getPoiX() != null && zone.getPoiY() != null) {
                        double r = zone.getPoiRadiusM() != null ? zone.getPoiRadiusM() : 1.0;
                        curIn = cur.x != null && cur.y != null &&
                                Math.sqrt((cur.x - zone.getPoiX()) * (cur.x - zone.getPoiX()) + (cur.y - zone.getPoiY()) * (cur.y - zone.getPoiY())) <= r;
                        prevIn = prev != null && prev.x != null && prev.y != null &&
                                Math.sqrt((prev.x - zone.getPoiX()) * (prev.x - zone.getPoiX()) + (prev.y - zone.getPoiY()) * (prev.y - zone.getPoiY())) <= r;
                    }
                } else if ("STATION_PATTERN".equals(eType)) {
                    String pattern = zone.getStationPattern();
                    if (pattern != null) {
                        curIn = cur.station != null && cur.station.matches(pattern.replace("*", ".*"));
                        prevIn = prev != null && prev.station != null && prev.station.matches(pattern.replace("*", ".*"));
                    }
                }
                if (curIn && !prevIn) {
                    PrimitiveEvent e = pr(cur, "ENTER_ZONE", cur.robotIp, cur.x, cur.y);
                    e.setZoneId(zone.getId());
                    events.add(e);
                }
                if (!curIn && prevIn) {
                    PrimitiveEvent e = pr(cur, "EXIT_ZONE", cur.robotIp, cur.x, cur.y);
                    e.setZoneId(zone.getId());
                    events.add(e);
                }
            }

            prev = cur;
        }
        return events;
    }

    // -- helpers --
    private static boolean isTrue(Boolean b) { return b != null && b; }
    private static PrimitiveEvent pr(TrajectoryFrame f, String type, String ip, Double x, Double y) {
        return new PrimitiveEvent(type, f.recordedAt, ip, x, y);
    }
    private static PrimitiveEvent pe(TrajectoryFrame f, String type, String ip, Double x, Double y, double v) {
        PrimitiveEvent e = pr(f, type, ip, x, y);
        e.setValue(v);
        return e;
    }

    /** Ray-casting point-in-polygon test */
    public static boolean isPointInPolygon(Double x, Double y, List<double[]> poly) {
        if (x == null || y == null || poly.size() < 3) return false;
        boolean inside = false;
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            double xi = poly.get(i)[0], yi = poly.get(i)[1];
            double xj = poly.get(j)[0], yj = poly.get(j)[1];
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
                inside = !inside;
        }
        return inside;
    }

    public static List<double[]> parsePolygon(String json) {
        try {
            List<List<Double>> list = JSON.readValue(json, new TypeReference<List<List<Double>>>() {});
            return list.stream().map(l -> new double[]{l.get(0), l.get(1)}).collect(Collectors.toList());
        } catch (Exception e) {
            return null;
        }
    }
}
