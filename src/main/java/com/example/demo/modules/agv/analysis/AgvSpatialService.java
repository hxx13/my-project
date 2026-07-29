package com.example.demo.modules.agv.analysis;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.agv.analysis.model.AgvSpatialElement;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import com.example.demo.modules.agv.mapper.AgvTrajectoryMapper;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class AgvSpatialService {

    private final AgvAnalysisMapper mapper;
    private final AgvTrajectoryMapper trajectoryMapper;

    public AgvSpatialService(AgvAnalysisMapper mapper, AgvTrajectoryMapper trajectoryMapper) {
        this.mapper = mapper;
        this.trajectoryMapper = trajectoryMapper;
    }

    /** Auto-import zones from trajectory history on first startup (when table is empty). */
    @PostConstruct
    public void autoImportOnStartup() {
        List<AgvSpatialElement> existing = mapper.selectAllSpatialElements();
        if (existing.isEmpty()) {
            List<AgvSpatialElement> candidates = autoGenerateCandidates(null);
            for (AgvSpatialElement e : candidates) {
                e.setIsActive(true);
                mapper.insertSpatialElement(e);
            }
            System.out.println("[AgvSpatial] Auto-imported " + candidates.size() + " zones from trajectory history");
        }
    }

    public List<AgvSpatialElement> listAll() {
        return mapper.selectAllSpatialElements();
    }

    public AgvSpatialElement getById(Long id) {
        AgvSpatialElement e = mapper.selectSpatialElementById(id);
        if (e == null) throw new TwinBusinessException(ErrorCodeConstants.AGV_ZONE_NOT_FOUND, "空间元素不存在: " + id);
        return e;
    }

    public AgvSpatialElement save(AgvSpatialElement e) {
        if (e.getId() == null) {
            e.setIsActive(true);
            mapper.insertSpatialElement(e);
        } else {
            mapper.updateSpatialElement(e);
        }
        return e;
    }

    public void softDelete(Long id) {
        mapper.softDeleteSpatialElement(id);
    }

    /**
     * Auto-generate candidate zones from all distinct stations in trajectory history.
     * Scans agv_trajectory, groups by station name, and returns unsaved candidate elements
     * with preset semantic tags.
     */
    public List<AgvSpatialElement> autoGenerateCandidates(String mapNameFilter) {
        List<Map<String, Object>> stations = trajectoryMapper.selectDistinctStations(mapNameFilter);
        List<AgvSpatialElement> candidates = new ArrayList<>();
        for (Map<String, Object> row : stations) {
            String station = (String) row.get("station");
            String mapName = (String) row.get("map_name");
            if (station == null || station.isEmpty()) continue;

            // Query coordinate bounds for this station to build a bounding polygon
            List<Map<String, Object>> coords = trajectoryMapper.selectStationCoords(station, 50);
            String polygonJson = buildBoundingPolygon(coords);

            AgvSpatialElement e = new AgvSpatialElement();
            e.setName(station);
            e.setMapName(mapName);
            e.setElementType("STATION_ZONE");
            e.setStationPattern(station);
            e.setPolygonJson(polygonJson);
            e.setSemanticTags(inferTags(station));
            e.setColor(inferColor(station));
            e.setIsActive(true);
            candidates.add(e);
        }
        return candidates;
    }

    /** Build a small bounding box polygon around a set of coordinate samples */
    private String buildBoundingPolygon(List<Map<String, Object>> coords) {
        if (coords == null || coords.isEmpty()) return null;
        double minX = Double.MAX_VALUE, minY = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
        for (Map<String, Object> row : coords) {
            Double x = toDouble(row.get("x")), y = toDouble(row.get("y"));
            if (x == null || y == null) continue;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        // Expand by 0.5m margin and ensure minimum size
        double mx = 0.5, my = 0.5;
        if (maxX - minX < 1.0) { double cx = (minX + maxX) / 2; minX = cx - 0.5; maxX = cx + 0.5; }
        if (maxY - minY < 1.0) { double cy = (minY + maxY) / 2; minY = cy - 0.5; maxY = cy + 0.5; }
        minX -= mx; minY -= my; maxX += mx; maxY += my;
        return String.format("[[%.4f,%.4f],[%.4f,%.4f],[%.4f,%.4f],[%.4f,%.4f]]",
                minX, minY, maxX, minY, maxX, maxY, minX, maxY);
    }

    private static Double toDouble(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        return null;
    }

    private String inferTags(String station) {
        if (station.startsWith("CP")) return "[\"充电\"]";
        if (station.startsWith("LM")) return "[\"作业\"]";
        if (station.startsWith("AP")) return "[\"路径\"]";
        return "[\"未知\"]";
    }

    private String inferColor(String station) {
        if (station.startsWith("CP")) return "#22c55e";
        if (station.startsWith("LM")) return "#f59e0b";
        if (station.startsWith("AP")) return "#6b7280";
        return "#3b82f6";
    }
}
