package com.example.demo.modules.student.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 回归：非本组笼位脱敏。两处都是「静默失效」型缺陷 —— 编译过、界面看不出，但数据在漏：
 *
 * <ol>
 *   <li>网格里的 {@code detail} 是 {@link CageCellDetail} 实体，原先用 castMap 取恒得 null，
 *       嵌套那层脱敏等于从来没执行；而前端详情面板恰好优先读 {@code cell.detail}，
 *       漏的正是 PI / 项目名称 / 管家 / 实验记录 / 照片。</li>
 *   <li>只遮 projectPiName/experimenterName 不够 —— 项目名称还有 projectGroup 这个下发口，
 *       实验员还有 occupantName 这个下发口，不同名同义，不一起遮等于没遮。</li>
 * </ol>
 */
class CageShelfMaskTest {

    /**
     * 全部依赖置 null：脱敏路径只用到 static 工具方法；解析课题组时 mapper 为 null 会抛异常、
     * 被 catch 吞成空课题组集，于是每个非空笼位都按「非本组」处理 —— 正是本测试要的场景。
     */
    private final StudentCageShelfService service = new StudentCageShelfService(
            null, null, null, null, null, null, null, null, null, null, null, null, null);

    private Map<String, Object> cell(boolean empty) {
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName("卢令");
        detail.setProjectName("某某项目");
        detail.setExperimenterName("张三");
        detail.setLabAssistantName("李四");
        detail.setExperimentDesc("实验记录内容");
        detail.setImagesJson("[\"http://example.test/a.png\"]");
        detail.setAroRawData("{\"ProjectPiName\":\"卢令\"}");

        Map<String, Object> c = new LinkedHashMap<>();
        c.put("empty", empty);
        c.put("projectPiName", "卢令");
        c.put("projectGroup", "某某项目");
        c.put("occupantName", "张三");
        c.put("experimenterName", "张三");
        c.put("detail", detail);
        return c;
    }

    @Test
    void masksTopLevelAndNestedDetailForOtherGroupCell() {
        List<Map<String, Object>> out = service.maskGridForUserId("SOMEONE_ELSE", List.of(cell(false)));
        Map<String, Object> masked = out.get(0);

        assertEquals(Boolean.FALSE, masked.get("visible"));
        assertEquals("***", masked.get("projectPiName"));
        assertEquals("***", masked.get("projectGroup"));
        assertEquals("***", masked.get("occupantName"));
        assertEquals("***", masked.get("experimenterName"));

        CageCellDetail d = (CageCellDetail) masked.get("detail");
        assertEquals("***", d.getProjectPiName());
        assertEquals("***", d.getProjectName());
        assertEquals("***", d.getExperimenterName());
        assertEquals("***", d.getLabAssistantName());
        assertEquals("", d.getExperimentDesc());
        assertEquals("[]", d.getImagesJson());
        assertNull(d.getAroRawData());
    }

    @Test
    void keepsEmptyCellVisible() {
        List<Map<String, Object>> out = service.maskGridForUserId("SOMEONE_ELSE", List.of(cell(true)));
        assertEquals(Boolean.TRUE, out.get(0).get("visible"));
    }
}
