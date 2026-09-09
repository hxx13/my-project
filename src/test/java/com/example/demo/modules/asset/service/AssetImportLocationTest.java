package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.entity.AssetLocation;
import com.example.demo.modules.asset.mapper.AssetMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.upload.service.UploadFileService;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 导入地点修正：locationValues 归一化匹配 + mapping 的 create/nodeId 分支（mock mapper，不起 Spring） */
class AssetImportLocationTest {

    private static AssetLocation node(long id, Long parentId, String name) {
        AssetLocation n = new AssetLocation();
        n.setId(id);
        n.setParentId(parentId);
        n.setName(name);
        return n;
    }

    private static AssetService service(AssetMapper mapper, AssetLocationService loc) {
        return new AssetService(mapper, mock(UploadFileService.class), mock(UserDisplayNameService.class), loc);
    }

    private static byte[] csv(String body) {
        return body.getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] xlsx(String[][] rows) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            var sheet = wb.createSheet("资产记录");
            for (int r = 0; r < rows.length; r++) {
                var row = sheet.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    row.createCell(c).setCellValue(rows[r][c]);
                }
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    @Test
    void csvLocationValuesDedupMatchAndSkipBlank() {
        AssetLocationService loc = mock(AssetLocationService.class);
        when(loc.listAll()).thenReturn(List.of(
                node(1L, null, "西6"),
                node(2L, null, "动科部")
        ));
        AssetService svc = service(mock(AssetMapper.class), loc);
        byte[] bytes = csv("资产编码,资产名称,存放地点\n"
                + "A1,甲,西6\n"
                + "A2,乙, 西6 \n"
                + "A3,丙,动科部\n"
                + "A4,丁,\n"
                + "A5,戊,未知地点\n");

        List<Map<String, Object>> values = svc.buildLocationValues(bytes, true);

        assertEquals(3, values.size());
        assertEquals("西6", values.get(0).get("text"));
        assertEquals(1L, values.get(0).get("matchedNodeId"));
        assertEquals("西6", values.get(0).get("matchedNodeName"));
        assertEquals(2L, values.get(1).get("matchedNodeId"));
        assertEquals("未知地点", values.get(2).get("text"));
        assertNull(values.get(2).get("matchedNodeId"));
        assertNull(values.get(2).get("matchedNodeName"));
    }

    @Test
    void excelLocationValuesMatchAndMissingColumnReturnsEmpty() throws Exception {
        AssetLocationService loc = mock(AssetLocationService.class);
        when(loc.listAll()).thenReturn(List.of(node(1L, null, "西6")));
        AssetService svc = service(mock(AssetMapper.class), loc);

        byte[] bytes = xlsx(new String[][]{
                {"资产编码", "资产名称", "存放地点"},
                {"A1", "甲", "西6"},
                {"A2", "乙", "西6"}
        });
        List<Map<String, Object>> values = svc.buildLocationValues(bytes, false);
        assertEquals(1, values.size());
        assertEquals(1L, values.get(0).get("matchedNodeId"));

        byte[] noLocationCol = xlsx(new String[][]{
                {"资产编码", "资产名称"},
                {"A1", "甲"}
        });
        assertEquals(List.of(), svc.buildLocationValues(noLocationCol, false));
    }

    @Test
    void locationValuesTruncatedAt200() {
        AssetLocationService loc = mock(AssetLocationService.class);
        when(loc.listAll()).thenReturn(List.of());
        AssetService svc = service(mock(AssetMapper.class), loc);
        StringBuilder sb = new StringBuilder("资产编码,资产名称,存放地点\n");
        for (int i = 0; i < 250; i++) {
            sb.append("A").append(i).append(",名").append(i).append(",地点").append(i).append("\n");
        }
        assertEquals(200, svc.buildLocationValues(csv(sb.toString()), true).size());
    }

    @Test
    void mappingCreateCallsResolveOrCreate() {
        AssetMapper mapper = mock(AssetMapper.class);
        AssetLocationService loc = mock(AssetLocationService.class);
        when(loc.resolveOrCreateTopLevelByName("新地点")).thenReturn(42L);
        when(mapper.linkAssetsToLocationNode("BATCH_1", "col_存放地点", "新地点", 42L)).thenReturn(3);
        List<Map<String, String>> warnings = new ArrayList<>();

        int linked = service(mapper, loc).applyLocationMappings(
                "BATCH_1",
                List.of(new HashMap<>(Map.of("text", "新地点", "create", true))),
                "col_存放地点", warnings);

        assertEquals(3, linked);
        assertEquals(0, warnings.size());
        verify(loc).resolveOrCreateTopLevelByName("新地点");
    }

    @Test
    void mappingNodeIdUsedWhenNodeExists() {
        AssetMapper mapper = mock(AssetMapper.class);
        AssetLocationService loc = mock(AssetLocationService.class);
        when(loc.exists(7L)).thenReturn(true);
        when(mapper.linkAssetsToLocationNode("BATCH_1", "col_存放地点", "西6", 7L)).thenReturn(2);
        List<Map<String, String>> warnings = new ArrayList<>();

        int linked = service(mapper, loc).applyLocationMappings(
                "BATCH_1",
                List.of(new HashMap<>(Map.of("text", "西6", "nodeId", 7))),
                "col_存放地点", warnings);

        assertEquals(2, linked);
        assertEquals(0, warnings.size());
        verify(loc, never()).resolveOrCreateTopLevelByName(anyString());
    }

    @Test
    void mappingMissingNodeSkippedWithWarning() {
        AssetMapper mapper = mock(AssetMapper.class);
        AssetLocationService loc = mock(AssetLocationService.class);
        when(loc.exists(9L)).thenReturn(false);
        List<Map<String, String>> warnings = new ArrayList<>();

        int linked = service(mapper, loc).applyLocationMappings(
                "BATCH_1",
                List.of(new HashMap<>(Map.of("text", "西6", "nodeId", 9)),
                        new HashMap<>(Map.of("text", "   ")),
                        new HashMap<>(Map.of("nodeId", 1))),
                "col_存放地点", warnings);

        assertEquals(0, linked);
        assertEquals(1, warnings.size());
        verify(mapper, never()).linkAssetsToLocationNode(anyString(), anyString(), anyString(), any());
    }
}
