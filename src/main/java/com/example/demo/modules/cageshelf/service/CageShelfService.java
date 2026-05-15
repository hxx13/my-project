package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CageShelfService {
    private final CageShelfMapper cageShelfMapper;
    private final AroService aroService;

    public CageShelfService(CageShelfMapper cageShelfMapper, AroService aroService) {
        this.cageShelfMapper = cageShelfMapper;
        this.aroService = aroService;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importFromCsv(String userId, MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请上传 CSV 文件");
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".csv")) {
            throw new IllegalArgumentException("仅支持 CSV 文件");
        }
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        cageShelfMapper.clearAll();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null || headerLine.isBlank()) {
                throw new IllegalArgumentException("CSV 文件为空");
            }
            List<String> headers = parseCsvLine(headerLine);
            Map<String, Integer> idx = buildHeaderIndex(headers);
            assertRequiredHeaders(idx);

            String line;
            int lineNum = 1;
            while ((line = reader.readLine()) != null) {
                lineNum++;
                if (line.isBlank()) {
                    continue;
                }
                try {
                    List<String> cells = parseCsvLine(line);
                    Long shelveId = toLong(cell(cells, idx, "架子id"));
                    Long areaId = toLong(cell(cells, idx, "区域id"));
                    String areaName = trim(cell(cells, idx, "区域名称"));
                    Long floorId = toLong(cell(cells, idx, "楼层id"));
                    String floorName = trim(cell(cells, idx, "楼层名称"));
                    Long roomId = toLong(cell(cells, idx, "房间id"));
                    String roomName = trim(cell(cells, idx, "房间名称"));
                    String shelveName = trim(cell(cells, idx, "架子名称"));
                    Integer orders = toInt(cell(cells, idx, "排序"));

                    if (shelveId == null || areaId == null || areaName.isBlank() || floorId == null
                            || floorName.isBlank() || roomId == null || roomName.isBlank()) {
                        skipped++;
                        errors.add("第" + lineNum + "行关键字段缺失");
                        continue;
                    }
                    Integer campusId = mapCampusId(areaId, areaName);

                    CageShelfIndex row = new CageShelfIndex();
                    row.setCampusId(campusId);
                    row.setCampusName(campusId == 1 ? "浦西" : "浦东");
                    row.setAreaId(areaId);
                    row.setAreaName(areaName);
                    row.setFloorId(floorId);
                    row.setFloorName(floorName);
                    row.setRoomId(roomId);
                    row.setRoomName(roomName);
                    row.setShelveId(shelveId);
                    row.setShelveName(shelveName.isBlank() ? ("架子-" + shelveId) : shelveName);
                    row.setOrders(orders == null ? 0 : orders);

                    boolean existed = cageShelfMapper.countByShelveId(shelveId) > 0;
                    cageShelfMapper.upsertIndex(row);
                    if (existed) {
                        updated++;
                    } else {
                        created++;
                    }
                } catch (Exception e) {
                    skipped++;
                    errors.add("第" + lineNum + "行解析失败: " + e.getMessage());
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", created);
        out.put("updated", updated);
        out.put("skipped", skipped);
        out.put("errors", errors.size() > 20 ? errors.subList(0, 20) : errors);
        out.put("operatorId", userId);
        return out;
    }

    public Map<String, Object> filterOptions(Integer campusId,
                                             String areaId,
                                             String areaName,
                                             String floorId,
                                             String floorName,
                                             String roomId,
                                             String roomName) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("campuses", cageShelfMapper.listCampuses());
        out.put("areas", cageShelfMapper.listAreas(campusId));
        out.put("floors", cageShelfMapper.listFloors(campusId, areaId, trim(areaName)));
        out.put("rooms", cageShelfMapper.listRooms(campusId, areaId, trim(areaName), floorId, trim(floorName)));
        out.put("shelves", cageShelfMapper.listShelves(campusId, areaId, floorId, trim(areaName), trim(floorName), roomId, trim(roomName)));
        return out;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchShelfDetail(String shelveId) {
        if (shelveId == null || shelveId.isBlank()) {
            throw new IllegalArgumentException("shelveId 不能为空");
        }
        CageShelfIndex index = cageShelfMapper.findByShelveId(shelveId);
        if (index == null) {
            throw new IllegalArgumentException("未找到该笼架索引，请先导入 CSV");
        }
        Long externalId = toLong(shelveId);
        if (externalId == null) {
            throw new IllegalArgumentException("shelveId 非法");
        }
        Long roomId = index.getRoomId();
        if (roomId == null) {
            throw new IllegalArgumentException("索引中缺少房间ID，无法查询笼位列表（请确认 CSV 含「房间id」并已重新导入）");
        }
        // 官方接口：GET /jtu/api/admin/book/{roomId}/{shelveId}/animalCages ，根级 data 为笼位数组
        Map<String, Object> raw = aroService.fetchAnimalCagesByRoomAndShelve(roomId, externalId);
        if (raw == null || raw.isEmpty()) {
            throw new IllegalStateException("外部笼位列表无响应（网络异常或未登录 ARO），请稍后重试");
        }
        if (!isAroListBodySuccess(raw)) {
            String tip = trim(raw.get("message"));
            throw new IllegalStateException(
                    tip.isEmpty() ? "官方笼位接口返回失败（status 非成功）" : "官方笼位接口: " + tip);
        }
        Object dataObj = raw.get("data");
        if (dataObj != null && !(dataObj instanceof List<?>)) {
            throw new IllegalStateException("官方笼位接口 data 格式异常（期望笼位数组）");
        }
        List<Map<String, Object>> cages = castList(dataObj);

        // 状态回填：新接口缺失状态时，从旧 book 接口按坐标补齐状态字段
        Map<String, Object> statusRaw = aroService.fetchAnimalCagesStatusByBook(roomId, externalId);
        Map<String, Map<String, Object>> statusByPos = buildStatusByPosition(statusRaw);
        Map<String, Map<String, Object>> byPos = new HashMap<>();
        for (Map<String, Object> cage : cages) {
            Integer x = toIntObj(cage.get("postionX"));
            if (x == null) {
                x = toIntObj(cage.get("positionX"));
            }
            Integer y = toIntObj(cage.get("postionY"));
            if (y == null) {
                y = toIntObj(cage.get("positionY"));
            }
            if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) {
                continue;
            }
            fillStatusFromFallback(cage, statusByPos.get(y + "-" + x));
            byPos.put(y + "-" + x, simplifyCell(cage, x, y, index));
        }

        List<Map<String, Object>> grid = new ArrayList<>();
        for (int y = 1; y <= 10; y++) {
            for (int x = 1; x <= 8; x++) {
                Map<String, Object> cell = byPos.get(y + "-" + x);
                if (cell == null) {
                    cell = new LinkedHashMap<>();
                    cell.put("x", x);
                    cell.put("y", y);
                    cell.put("position", toPosition(x, y));
                    cell.put("empty", true);
                    cell.put("stateLabel", "空位");
                }
                grid.add(cell);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> shelfMeta = new LinkedHashMap<>();
        shelfMeta.put("campusId", index.getCampusId());
        shelfMeta.put("campusName", index.getCampusName());
        shelfMeta.put("areaName", index.getAreaName());
        shelfMeta.put("floorName", index.getFloorName());
        shelfMeta.put("roomName", index.getRoomName());
        shelfMeta.put("shelveId", index.getShelveId());
        shelfMeta.put("shelveName", index.getShelveName());
        out.put("shelfMeta", shelfMeta);
        out.put("grid", grid);
        out.put("totalCells", grid.size());
        out.put("filledCells", byPos.size());
        return out;
    }

    public Map<String, Object> listIndexRows(Integer campusId, String areaId, String floorId, String roomId, int page, int size) {
        int safeSize = Math.max(10, Math.min(size, 200));
        int safePage = Math.max(1, page);
        int offset = (safePage - 1) * safeSize;
        List<Map<String, Object>> rows = cageShelfMapper.listIndexes(campusId, trim(areaId), trim(floorId), trim(roomId), safeSize, offset);
        int total = cageShelfMapper.countIndexes(campusId, trim(areaId), trim(floorId), trim(roomId));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("total", total);
        out.put("page", safePage);
        out.put("size", safeSize);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castList(Object o) {
        if (!(o instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                out.add((Map<String, Object>) map);
            }
        }
        return out;
    }

    private Map<String, Object> simplifyCell(Map<String, Object> cage, int x, int y, CageShelfIndex index) {
        Map<String, Object> cell = new LinkedHashMap<>();
        Map<String, Object> cageBoxVo = castMap(cage.get("cageBoxVo"));
        cell.put("x", x);
        cell.put("y", y);
        cell.put("position", toPosition(x, y));
        cell.put("empty", false);
        cell.put("id", cage.get("id"));
        cell.put("name", trim(cage.get("name")));
        cell.put("piName", trim(cage.get("piName")));
        cell.put("projectGroup", cageBoxVo == null ? "" : trim(cageBoxVo.get("projectName")));
        cell.put("departmentName", cageBoxVo == null ? "" : decodeDisplayText(cageBoxVo.get("departmentName")));
        cell.put("projectPiName", cageBoxVo == null ? "" : trim(cageBoxVo.get("projectPiName")));
        cell.put("rentType", toIntObj(cage.get("rentType")));
        cell.put("animalCageType", toIntObj(cage.get("animalCageType")));
        cell.put("isCageBox", cage.get("isCageBox"));
        cell.put("stateLabel", resolveStateLabel(toIntObj(cage.get("animalCageType")), toIntObj(cage.get("rentType"))));

        // UE 蓝图字段白名单二次封装：供前端按统一键名读取笼盒信息
        cell.put("cageBoxInfo", buildCageBoxInfo(cage, cageBoxVo, index, x, y));
        cell.put("detail", buildDetailWhitelist(cage, cageBoxVo));
        return cell;
    }

    /**
     * 对齐 UE 蓝图中 ST_CageData 预设字段，统一二次封装。
     */
    private static Map<String, Object> buildCageBoxInfo(Map<String, Object> cage,
                                                        Map<String, Object> cageBoxVo,
                                                        CageShelfIndex index,
                                                        int x,
                                                        int y) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("AnimalCageType", toIntObj(firstNonNull(cage, "animalCageType")));
        d.put("PositionX", x);
        d.put("PositionY", y);
        d.put("AreaId", toIntObj(firstNonNullOr(cage, "areaId", index == null ? null : index.getAreaId())));
        d.put("DepartmentName", decodeDisplayText(firstNonNull(cageBoxVo, "departmentName")));
        d.put("floorId", String.valueOf(firstNonNullOr(cage, "floorId", index == null ? "" : index.getFloorId())));
        d.put("RoomName", decodeDisplayText(firstNonNullOr(cage, "roomName", index == null ? "" : index.getRoomName())));
        d.put("ShelveName", decodeDisplayText(firstNonNullOr(cage, "shelveName", index == null ? "" : index.getShelveName())));
        d.put("ProjectPiName", decodeDisplayText(firstNonNull(cageBoxVo, "projectPiName")));
        d.put("MobilePhone", decodeDisplayText(firstNonNull(cageBoxVo, "mobilePhone")));
        d.put("AupNumber", decodeDisplayText(firstNonNull(cageBoxVo, "aupNumber")));
        d.put("CageBoxQrCode", decodeDisplayText(firstNonNullOr(cageBoxVo, "cageBoxQrCode", firstNonNull(cageBoxVo, "cageBoxCode"))));
        d.put("createAdmin", decodeDisplayText(firstNonNullOr(cageBoxVo, "createAdmin", firstNonNull(cageBoxVo, "createAdminName"))));
        d.put("CreateTime", decodeDisplayText(firstNonNull(cageBoxVo, cage, "createTime")));
        d.put("UpdateTime", decodeDisplayText(firstNonNull(cageBoxVo, cage, "updateTime")));
        d.put("SpecialBreedingName", decodeDisplayText(firstNonNull(cageBoxVo, "specialBreedingName")));
        d.put("specialBreedingDescription", decodeDisplayText(firstNonNull(cageBoxVo, "specialBreedingDescription")));
        d.put("State", toIntObj(firstNonNullOr(cage, "state", firstNonNull(cage, "animalCageType"))));
        d.put("StateName", decodeDisplayText(firstNonNull(cage, "stateName")));
        d.put("HasPhysicalBox", toBooleanObj(firstNonNullOr(cage, "isCageBox", firstNonNull(cageBoxVo, "isBindAnimalCage"))));
        return d;
    }

    /**
     * 弹窗仅展示白名单字段；字符串经 URL 解码与 HTML 实体反转义（常见编码场景）。
     */
    private static Map<String, Object> buildDetailWhitelist(Map<String, Object> cage, Map<String, Object> cageBoxVo) {
        Map<String, Object> d = new LinkedHashMap<>();
        putDetail(d, "cageBoxCode", firstNonNull(cageBoxVo, "cageBoxCode"));
        putDetail(d, "createAdminName", firstNonNull(cageBoxVo, "createAdminName"));
        putDetail(d, "departmentName", firstNonNull(cageBoxVo, "departmentName"));
        putDetail(d, "isBindAnimalCage", firstNonNull(cageBoxVo, "isBindAnimalCage"));
        putDetail(d, "projectPiName", firstNonNull(cageBoxVo, "projectPiName"));
        putDetail(d, "aupNumber", firstNonNull(cageBoxVo, "aupNumber"));
        putDetail(d, "managerUserName", firstNonNull(cageBoxVo, "managerUserName"));
        putDetail(d, "piName", cage.get("piName"));
        putDetail(d, "createTime", firstNonNull(cageBoxVo, cage, "createTime"));
        putDetail(d, "updateTime", firstNonNull(cageBoxVo, cage, "updateTime"));
        return d;
    }

    private static Object firstNonNull(Map<String, Object> box, String key) {
        if (box == null) {
            return null;
        }
        return box.get(key);
    }

    private static Object firstNonNull(Map<String, Object> box, Map<String, Object> cage, String key) {
        Object a = box == null ? null : box.get(key);
        if (a != null && !isBlankScalar(a)) {
            return a;
        }
        return cage.get(key);
    }

    private static Object firstNonNullOr(Map<String, Object> source, String key, Object fallback) {
        Object v = firstNonNull(source, key);
        return v != null ? v : fallback;
    }

    private static boolean isBlankScalar(Object o) {
        if (o == null) {
            return true;
        }
        if (o instanceof String s) {
            return s.isBlank();
        }
        return false;
    }

    private static void putDetail(Map<String, Object> out, String key, Object raw) {
        out.put(key, normalizeDetailValue(raw));
    }

    private static Object normalizeDetailValue(Object raw) {
        if (raw == null) {
            return "";
        }
        if (raw instanceof Number || raw instanceof Boolean) {
            return raw;
        }
        return decodeDisplayText(raw);
    }

    /**
     * 对展示用字符串做：trim、UTF-8 形式 URL 解码（可重复一次）、常见 HTML 实体反转义。
     */
    private static String decodeDisplayText(Object v) {
        String s = v == null ? "" : String.valueOf(v).trim();
        if (s.isEmpty()) {
            return "";
        }
        s = tryUrlDecodeUtf8(s);
        s = unescapeBasicHtmlEntities(s);
        return s;
    }

    private static String tryUrlDecodeUtf8(String s) {
        if (!s.contains("%")) {
            return s;
        }
        try {
            String once = URLDecoder.decode(s, StandardCharsets.UTF_8);
            if (once.contains("%")) {
                try {
                    return URLDecoder.decode(once, StandardCharsets.UTF_8);
                } catch (IllegalArgumentException e) {
                    return once;
                }
            }
            return once;
        } catch (IllegalArgumentException e) {
            return s;
        }
    }

    private static String unescapeBasicHtmlEntities(String s) {
        return s.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&nbsp;", " ");
    }

    private static String resolveStateLabel(Integer animalCageType, Integer rentType) {
        if (animalCageType != null) {
            return switch (animalCageType) {
                case 1 -> "等待分配";
                case 2 -> "已预约(无笼盒)";
                case 3 -> "已预约(有笼盒)";
                case 4 -> "异常";
                default -> "未知";
            };
        }
        if (rentType != null) {
            return switch (rentType) {
                case 1 -> "空闲";
                case 2 -> "正常租用";
                case 3 -> "接近到期";
                case 4 -> "很快到期";
                default -> "未知";
            };
        }
        return "未知";
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Map<String, Object>> buildStatusByPosition(Map<String, Object> statusRaw) {
        Map<String, Map<String, Object>> out = new HashMap<>();
        if (statusRaw == null || statusRaw.isEmpty() || !isAroListBodySuccess(statusRaw)) {
            return out;
        }
        Object dataObj = statusRaw.get("data");
        if (!(dataObj instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            Map<String, Object> row = (Map<String, Object>) map;
            Integer x = toIntObj(firstNonNullOr(row, "postionX", row.get("positionX")));
            Integer y = toIntObj(firstNonNullOr(row, "postionY", row.get("positionY")));
            if (x == null || y == null || x < 1 || x > 8 || y < 1 || y > 10) {
                continue;
            }
            out.put(y + "-" + x, row);
        }
        return out;
    }

    private static void fillStatusFromFallback(Map<String, Object> cage, Map<String, Object> fallback) {
        if (cage == null || fallback == null) {
            return;
        }
        Integer currentAnimalCageType = toIntObj(cage.get("animalCageType"));
        Integer fallbackAnimalCageType = toIntObj(fallback.get("animalCageType"));
        if (isMissingStateCode(currentAnimalCageType) && !isMissingStateCode(fallbackAnimalCageType)) {
            cage.put("animalCageType", fallbackAnimalCageType);
        }
        Integer currentState = toIntObj(cage.get("state"));
        Integer fallbackState = toIntObj(fallback.get("state"));
        if (isMissingStateCode(currentState) && !isMissingStateCode(fallbackState)) {
            cage.put("state", fallbackState);
        }
        // 兼容：部分返回仅给 state，不给 animalCageType；前端状态色依赖 animalCageType
        Integer mergedAnimalCageType = toIntObj(cage.get("animalCageType"));
        Integer mergedState = toIntObj(cage.get("state"));
        if (isMissingStateCode(mergedAnimalCageType) && !isMissingStateCode(mergedState)) {
            cage.put("animalCageType", mergedState);
        }
        if (isBlankScalar(cage.get("stateName")) && !isBlankScalar(fallback.get("stateName"))) {
            cage.put("stateName", fallback.get("stateName"));
        }
        if (cage.get("rentType") == null) {
            cage.put("rentType", fallback.get("rentType"));
        }
    }

    private static boolean isMissingStateCode(Integer v) {
        return v == null || v <= 0;
    }

    private static String toPosition(int x, int y) {
        char col = (char) ('A' + Math.max(0, x - 1));
        return col + "-" + y;
    }

    private static String trim(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    /** ARO 列表类接口：通常为 status=0 表示成功；无 status 时视为成功。 */
    private static boolean isAroListBodySuccess(Map<String, Object> raw) {
        Object succ = raw.get("success");
        if (succ instanceof Boolean && Boolean.FALSE.equals(succ)) {
            return false;
        }
        Object status = raw.get("status");
        if (status == null) {
            return true;
        }
        if (status instanceof Number n) {
            return n.intValue() == 0;
        }
        String s = String.valueOf(status).trim();
        return "0".equals(s) || "0.0".equals(s);
    }

    private static Integer mapCampusId(Long areaId, String areaName) {
        if (areaId == null) {
            return 1;
        }
        if (areaId == 1L) {
            return 1;
        }
        if (areaId == 2L) {
            return 2;
        }
        String area = trim(areaName);
        if (area.contains("浦东")) {
            return 2;
        }
        return 1;
    }

    private static Long toLong(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(text.trim());
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Integer toInt(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(text.trim());
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Integer toIntObj(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception ignore) {
            return null;
        }
    }

    private static Boolean toBooleanObj(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) {
            return false;
        }
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "yes".equalsIgnoreCase(s) || "y".equalsIgnoreCase(s);
    }

    private static String cell(List<String> row, Map<String, Integer> idx, String header) {
        Integer i = idx.get(normalizeHeader(header));
        if (i == null || i < 0 || i >= row.size()) {
            return "";
        }
        return row.get(i);
    }

    private static Map<String, Integer> buildHeaderIndex(List<String> headers) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < headers.size(); i++) {
            String normalized = normalizeHeader(headers.get(i));
            if (!normalized.isBlank()) {
                map.put(normalized, i);
            }
        }
        // 常见别名兼容（防止大小写/BOM/命名差异导致误判缺列）
        alias(map, "架子id", "架子ID", "shelveid", "shelfid");
        alias(map, "区域id", "区域ID", "areaid");
        alias(map, "楼层id", "楼层ID", "floorid");
        alias(map, "房间id", "房间ID", "roomid");
        return map;
    }

    private static void assertRequiredHeaders(Map<String, Integer> idx) {
        String[] required = {"架子id", "区域id", "区域名称", "楼层id", "楼层名称", "房间id", "房间名称", "架子名称"};
        for (String key : required) {
            if (!idx.containsKey(normalizeHeader(key))) {
                throw new IllegalArgumentException("CSV 缺少必需表头: " + key);
            }
        }
    }

    private static void alias(Map<String, Integer> idx, String canonical, String... candidates) {
        String c = normalizeHeader(canonical);
        if (idx.containsKey(c)) {
            return;
        }
        for (String raw : candidates) {
            Integer pos = idx.get(normalizeHeader(raw));
            if (pos != null) {
                idx.put(c, pos);
                return;
            }
        }
    }

    private static String normalizeHeader(String text) {
        if (text == null) {
            return "";
        }
        return text
                .replace("\uFEFF", "")
                .replace(" ", "")
                .replace("　", "")
                .trim()
                .toLowerCase();
    }

    private static List<String> parseCsvLine(String line) {
        List<String> out = new ArrayList<>();
        if (line == null) {
            return out;
        }
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    sb.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (c == ',' && !inQuotes) {
                out.add(sb.toString().trim());
                sb.setLength(0);
                continue;
            }
            sb.append(c);
        }
        out.add(sb.toString().trim());
        return out;
    }
}
