package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.dto.TransferFormData;
import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class TransferFormServicePairsTest {

    private static CageOpPair pair(long source, long target) {
        CageOpPair p = new CageOpPair();
        p.setSource(source);
        p.setTarget(target);
        return p;
    }

    private static Map<String, Object> loc(String campus, String room, String shelf, int x, int y) {
        Map<String, Object> m = new HashMap<>();
        m.put("campusName", campus);
        m.put("roomName", room);
        m.put("shelveName", shelf);
        m.put("positionX", x);
        m.put("positionY", y);
        return m;
    }

    private static Map<Long, Map<String, Object>> locs() {
        Map<Long, Map<String, Object>> m = new HashMap<>();
        m.put(101L, loc("浦东", "201A", "201A-1", 4, 6));
        m.put(102L, loc("浦东", "201B", "201B-2", 1, 3));
        m.put(201L, loc("浦东", "202A", "202A-1", 3, 4));
        m.put(202L, loc("浦东", "202B", "202B-1", 4, 4));
        return m;
    }

    private static CageCellDetail detail(String strain, int female, int male) {
        CageCellDetail d = new CageCellDetail();
        d.setAnimalStrainName(strain);
        d.setAnimalFemaleNumber(female);
        d.setAnimalMaleNumber(male);
        return d;
    }

    @Test
    void 单对不加序号_字面不变() {
        Map<Long, Map<String, Object>> locs = locs();
        List<CageOpPair> pairs = List.of(pair(101L, 201L));
        assertEquals("浦东 / 201A-1 / D-6", TransferFormService.pairLocations(pairs, true, locs));
        assertEquals("浦东 / 202A-1 / C-4", TransferFormService.pairLocations(pairs, false, locs));
    }

    @Test
    void 多对按行加序号_顺序与数据行一致() {
        Map<Long, Map<String, Object>> locs = locs();
        List<CageOpPair> pairs = List.of(pair(101L, 201L), pair(102L, 202L), pair(101L, 202L));
        assertEquals("1. 浦东 / 201A-1 / D-6\n2. 浦东 / 201B-2 / A-3\n3. 浦东 / 201A-1 / D-6",
                TransferFormService.pairLocations(pairs, true, locs));
        assertEquals("1. 浦东 / 202A-1 / C-4\n2. 浦东 / 202B-1 / D-4\n3. 浦东 / 202B-1 / D-4",
                TransferFormService.pairLocations(pairs, false, locs));
    }

    @Test
    void 无对返回空() {
        assertNull(TransferFormService.pairLocations(List.of(), true, locs()));
    }

    @Test
    void 每行自动值来自该对的源笼位() {
        TransferFormData data = new TransferFormData(); // 无人工行 → 全走自动
        List<CageOpPair> pairs = List.of(pair(101L, 201L), pair(102L, 202L));
        Map<Long, CageCellDetail> details = new HashMap<>();
        details.put(101L, detail("BALB/c", 3, 4));
        details.put(102L, detail("C57BL/6", 5, 6));
        Map<Long, Map<String, Object>> forms = new HashMap<>();
        List<TransferFormRenderInput.Row> rows =
                TransferFormService.buildRows(data, pairs, details, forms);
        assertEquals(2, rows.size());
        assertEquals("BALB/c", rows.get(0).getStrain());
        assertEquals(3, rows.get(0).getFemale());
        assertEquals(4, rows.get(0).getMale());
        assertEquals("C57BL/6", rows.get(1).getStrain());
        assertEquals(5, rows.get(1).getFemale());
        assertEquals(6, rows.get(1).getMale());
    }

    @Test
    void 表单值优先于detail_且按各自源取() {
        TransferFormData data = new TransferFormData();
        List<CageOpPair> pairs = List.of(pair(101L, 201L), pair(102L, 202L));
        Map<Long, CageCellDetail> details = new HashMap<>();
        details.put(101L, detail("BALB/c", 3, 4));
        details.put(102L, detail("C57BL/6", 5, 6));
        Map<Long, Map<String, Object>> forms = new HashMap<>();
        Map<String, Object> f1 = new HashMap<>();
        f1.put("animal_strain_name", "SD大鼠");
        forms.put(101L, f1);
        // 102 无表单值 → 走 detail
        List<TransferFormRenderInput.Row> rows =
                TransferFormService.buildRows(data, pairs, details, forms);
        assertEquals("SD大鼠", rows.get(0).getStrain());
        assertEquals("C57BL/6", rows.get(1).getStrain());
    }

    @Test
    void 涉及位置_两源批量单_两个源与目标都算() {
        CageOpRequest req = new CageOpRequest();
        req.setSourceAnimalCageId(101L);
        req.setPairs("[{\"source\":101,\"target\":201},{\"source\":102,\"target\":202}]");
        assertEquals(List.of(101L, 201L, 102L, 202L), TransferFormService.involvedLocationIds(req));
    }

    @Test
    void 涉及位置_单源多目标_源只出现一次() {
        CageOpRequest req = new CageOpRequest();
        req.setSourceAnimalCageId(101L);
        req.setPairs("[{\"source\":101,\"target\":201},{\"source\":101,\"target\":202}]");
        assertEquals(List.of(101L, 201L, 202L), TransferFormService.involvedLocationIds(req));
    }

    @Test
    void 涉及位置_存量单无pairs_退老列() {
        CageOpRequest req = new CageOpRequest();
        req.setSourceAnimalCageId(101L);
        req.setTargetAnimalCageIds("[201,202]");
        assertEquals(List.of(101L, 201L, 202L), TransferFormService.involvedLocationIds(req));
    }
}
