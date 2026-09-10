package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.referencedata.entity.RefOrder;
import com.example.demo.modules.referencedata.entity.RefOrderLine;
import com.example.demo.modules.referencedata.mapper.RefOrderLineMapper;
import com.example.demo.modules.referencedata.mapper.RefOrderMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把 ARO 原站订单（aro_animal_order）导入本地订单库（ref_order / ref_order_line）。
 *
 * <p>设计要点：
 * <ul>
 *   <li><b>幂等</b>：按 (source='ARO', sn) upsert，重跑只刷新状态与明细，不产生重复单。</li>
 *   <li><b>不自动跑</b>：万级数据放启动链会拖慢启动，只由管理端按钮手动触发。</li>
 *   <li><b>容错</b>：逐单处理，单笔失败不中断整体，结果里回传失败单号，重跑即可补齐。</li>
 *   <li><b>字段兼容</b>：领用人/领用房间/备注直接复用本地已有列；
 *       雄数/雌数拆成「性别: 雄性 / 性别: 雌性」规格选项，与本地加购口径一致。</li>
 * </ul>
 */
@Service
public class AroOrderImportService {

    private static final Logger log = LoggerFactory.getLogger(AroOrderImportService.class);

    public static final String SOURCE_ARO = "ARO";

    private static final DateTimeFormatter ARO_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 雄/雌对应的规格选项文字；模板名从 ref_spec_template 里取，取不到用这个兜底。 */
    private static final String DEFAULT_GENDER_TEMPLATE = "性别";
    private static final String OPTION_MALE = "雄性";
    private static final String OPTION_FEMALE = "雌性";

    private final JdbcTemplate jdbcTemplate;
    private final RefOrderMapper orderMapper;
    private final RefOrderLineMapper orderLineMapper;

    public AroOrderImportService(JdbcTemplate jdbcTemplate,
                                 RefOrderMapper orderMapper,
                                 RefOrderLineMapper orderLineMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderMapper = orderMapper;
        this.orderLineMapper = orderLineMapper;
    }

    /** 导入结果，回给前端提示用。 */
    public record ImportResult(int ordersCreated, int ordersUpdated, int linesWritten,
                               int failed, List<String> failedSns) {}

    /**
     * 全量导入/刷新 ARO 历史订单。可反复执行。
     */
    public ImportResult importFromAro() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT item_id, sn, area_name, project_name, pi_name, create_time, arrival_date,
                       supplier_name, strain_name, spec_name, male_qty, female_qty,
                       collector_name, order_state_name, consume_location, memo
                FROM aro_animal_order
                ORDER BY sn ASC, item_id ASC
                """);

        String genderTemplate = resolveGenderTemplateName();

        // 按 sn 分组：一个 ARO 订单 = 我们的一个订单，其下 item 拆成明细行
        Map<String, List<Map<String, Object>>> byOrder = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String sn = str(row.get("sn"));
            if (!StringUtils.hasText(sn)) {
                continue;
            }
            byOrder.computeIfAbsent(sn, k -> new ArrayList<>()).add(row);
        }

        int created = 0, updated = 0, lines = 0, failed = 0;
        List<String> failedSns = new ArrayList<>();

        // 一次性预读已导入的 ARO 单号 → orderId。
        // 逐单 SELECT 在万级数据下就是上万次往返，导入会慢到不可接受（重跑尤其亏）。
        Map<String, Long> existingBySn = new LinkedHashMap<>();
        jdbcTemplate.query("SELECT sn, id FROM ref_order WHERE source = ?",
                rs -> { existingBySn.put(rs.getString(1), rs.getLong(2)); }, SOURCE_ARO);

        log.info("[ARO订单导入] 待处理 {} 单，其中已存在 {} 单", byOrder.size(), existingBySn.size());

        for (Map.Entry<String, List<Map<String, Object>>> entry : byOrder.entrySet()) {
            String sn = entry.getKey();
            try {
                Long existingId = existingBySn.get(sn);
                long orderId;
                if (existingId != null) {
                    orderMapper.updateAroOrder(buildOrderForUpdate(existingId, sn, entry.getValue()));
                    updated++;
                    orderId = existingId;
                } else {
                    RefOrder fresh = buildOrderForInsert(sn, entry.getValue());
                    orderMapper.insert(fresh);
                    created++;
                    orderId = fresh.getId();
                }
                lines += writeLines(orderId, entry.getValue(), genderTemplate);
            } catch (Exception e) {
                failed++;
                if (failedSns.size() < 20) {
                    failedSns.add(sn);
                }
                log.warn("[ARO订单导入] sn={} 导入失败: {}", sn, e.getMessage());
            }
        }

        log.info("[ARO订单导入] 完成：新建 {} 单 / 刷新 {} 单 / 明细 {} 行 / 失败 {} 单",
                created, updated, lines, failed);
        return new ImportResult(created, updated, lines, failed, failedSns);
    }

    /** 组装「刷新已存在单」的实体（只更新可变的头部字段）。 */
    private RefOrder buildOrderForUpdate(Long orderId, String sn, List<Map<String, Object>> items) {
        Map<String, Object> head = items.get(0);
        RefOrder o = new RefOrder();
        o.setId(orderId);
        o.setProjectGroupName(trimToNull(str(head.get("project_name"))));
        o.setProjectGroupId(resolveProjectGroupId(str(head.get("project_name"))));
        o.setSubmitterName(trimToNull(str(head.get("pi_name"))));
        o.setSubmitterId("ARO:" + fallback(str(head.get("pi_name")), sn));
        o.setCampus(normalizeCampus(str(head.get("area_name"))));
        o.setAroAreaName(trimToNull(str(head.get("area_name"))));
        o.setStatus(mapStatus(str(head.get("order_state_name"))));
        o.setSubmittedAt(parseTime(str(head.get("create_time"))));
        return o;
    }

    /** 组装「新建单」的实体。 */
    private RefOrder buildOrderForInsert(String sn, List<Map<String, Object>> items) {
        Map<String, Object> head = items.get(0);
        String projectName = str(head.get("project_name"));
        String piName = str(head.get("pi_name"));
        String areaName = str(head.get("area_name"));

        RefOrder o = new RefOrder();
        o.setSn(sn);
        o.setSource(SOURCE_ARO);
        // group_id 是本地共享购物车的分组键，ARO 单无此概念，用课题组名兜底保证非空
        o.setGroupId(fallback(projectName, "aro-unknown"));
        o.setSubmitterId("ARO:" + fallback(piName, sn));
        o.setSubmitterName(trimToNull(piName));
        o.setProjectGroupName(trimToNull(projectName));
        o.setProjectGroupId(resolveProjectGroupId(projectName));
        o.setCampus(normalizeCampus(areaName));
        o.setAroAreaName(trimToNull(areaName));
        o.setStatus(mapStatus(str(head.get("order_state_name"))));
        o.setSubmittedAt(parseTime(str(head.get("create_time"))));
        return o;
    }

    private static String fallback(String v, String def) {
        return StringUtils.hasText(v) ? v.trim() : def;
    }

    /** 写明细：雄/雌拆成两个规格选项行；重跑先清空该单旧明细。 */
    private int writeLines(Long orderId, List<Map<String, Object>> items, String genderTemplate) {
        if (orderId == null) {
            return 0;
        }
        orderLineMapper.deleteByOrderId(orderId);

        int written = 0;
        for (Map<String, Object> item : items) {
            String supplier = str(item.get("supplier_name"));
            String strain = str(item.get("strain_name"));
            String spec = str(item.get("spec_name"));
            String arrival = str(item.get("arrival_date"));
            String collector = str(item.get("collector_name"));
            String room = str(item.get("consume_location"));
            String memo = str(item.get("memo"));
            String chain = buildChainJson(supplier, strain, spec);

            int male = toInt(item.get("male_qty"));
            int female = toInt(item.get("female_qty"));

            if (male > 0) {
                insertLine(orderId, male, genderOption(genderTemplate, OPTION_MALE),
                        supplier, strain, spec, arrival, collector, room, memo, chain);
                written++;
            }
            if (female > 0) {
                insertLine(orderId, female, genderOption(genderTemplate, OPTION_FEMALE),
                        supplier, strain, spec, arrival, collector, room, memo, chain);
                written++;
            }
            if (male <= 0 && female <= 0) {
                // 极少数雄雌都缺的行：仍保留记录，数量记 0，避免整条明细丢失
                insertLine(orderId, 0, null,
                        supplier, strain, spec, arrival, collector, room, memo, chain);
                written++;
            }
        }
        return written;
    }

    private void insertLine(Long orderId, int qty, String genderOption,
                            String supplier, String strain, String spec, String arrival,
                            String collector, String room, String memo, String chain) {
        RefOrderLine line = new RefOrderLine();
        line.setOrderId(orderId);
        // ARO 行没有本地 ref_data id（该列已放开 NOT NULL）
        line.setRefDataId(null);
        line.setSupplierName(trimToNull(supplier));
        line.setStrainName(trimToNull(strain));
        line.setSpecName(trimToNull(spec));
        line.setSpecSelections(genderOption == null ? null : "{\"option\":\"" + escapeJson(genderOption) + "\"}");
        line.setHierarchyChain(chain);
        line.setQuantity(qty);
        line.setArrivalDate(trimToNull(arrival));
        line.setPickupRoomName(trimToNull(room));
        line.setCollectorName(trimToNull(collector));
        line.setLineRemark(trimToNull(memo));
        orderLineMapper.insert(line);
    }

    /**
     * 启发式链 [{规格},{品系},{供应商}]（叶→根），让审核页「物品」列复用本地同一套渲染。
     * ARO 侧没有本地 ref_data id，故 id 为 null。
     */
    private String buildChainJson(String supplier, String strain, String spec) {
        List<String[]> chain = new ArrayList<>();
        if (StringUtils.hasText(spec)) chain.add(new String[]{"GENOTYPE", spec});
        if (StringUtils.hasText(strain)) chain.add(new String[]{"ANIMAL_STRAIN", strain});
        if (StringUtils.hasText(supplier)) chain.add(new String[]{"SUPPLIER", supplier});
        if (chain.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < chain.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"id\":null,\"refType\":\"").append(chain.get(i)[0])
              .append("\",\"displayName\":\"").append(escapeJson(chain.get(i)[1])).append("\"}");
        }
        return sb.append(']').toString();
    }

    /** 与本地加购口径一致：`{模板名}: {选项}`。 */
    private String genderOption(String templateName, String option) {
        return templateName + ": " + option;
    }

    /** 找选项里含雄/雌的规格模板名，保证与前端加购写出的串一致；找不到用兜底名。 */
    private String resolveGenderTemplateName() {
        try {
            List<String> names = jdbcTemplate.queryForList("""
                    SELECT name FROM ref_spec_template
                    WHERE options LIKE '%雄性%' OR options LIKE '%雌性%'
                    LIMIT 1
                    """, String.class);
            if (!names.isEmpty() && StringUtils.hasText(names.get(0))) {
                return names.get(0).trim();
            }
        } catch (Exception e) {
            log.warn("[ARO订单导入] 查性别模板失败，用默认名: {}", e.getMessage());
        }
        return DEFAULT_GENDER_TEMPLATE;
    }

    /**
     * ARO 订单状态 → 本地状态。
     * 空值是 2024 及更早的历史单（占六成），其中绝大多数已有到货日期，按「已完成」处理，
     * 否则这些早已交付的单会涌进待审列表。
     */
    static String mapStatus(String aroState) {
        String s = aroState == null ? "" : aroState.trim();
        return switch (s) {
            case "待动科部审批下单" -> "PENDING";
            case "审批通过" -> "APPROVED";
            case "审批不通过" -> "REJECTED";
            case "已取消" -> "CANCELLED";
            default -> "COMPLETED";
        };
    }

    /** ARO 校区名归一：浦西/6号楼→浦西，浦东→浦东，其余按浦东兜底。 */
    static String normalizeCampus(String areaName) {
        String s = areaName == null ? "" : areaName.trim();
        if (s.contains("浦西") || s.contains("6号楼") || s.contains("西")) {
            return "浦西";
        }
        return "浦东";
    }

    private Long resolveProjectGroupId(String projectName) {
        if (!StringUtils.hasText(projectName)) {
            return null;
        }
        try {
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM project_group WHERE name = ? LIMIT 1", Long.class, projectName.trim());
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private static LocalDateTime parseTime(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String v = raw.trim();
        try {
            return LocalDateTime.parse(v.length() > 19 ? v.substring(0, 19) : v, ARO_TIME);
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(Object v) {
        return cleanText(v == null ? "" : String.valueOf(v));
    }

    private static int toInt(Object v) {
        if (v == null) return 0;
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String trimToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    /**
     * ARO 侧会用 "/"、"无" 之类的占位符表示「没有」，直接当人名/课题组名会落成脏数据
     * （早期单尤其多）。统一清成空串。
     */
    static String cleanText(String v) {
        String s = v == null ? "" : v.trim();
        if (s.isEmpty()) return "";
        return switch (s) {
            case "/", "-", "--", "无", "空", "null", "NULL", "None" -> "";
            default -> s;
        };
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
