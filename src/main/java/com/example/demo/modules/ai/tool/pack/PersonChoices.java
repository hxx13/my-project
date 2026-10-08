package com.example.demo.modules.ai.tool.pack;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 人员候选 → 载体可点选的选项。
 *
 * <p><b>value 用工号</b>：芯片点下去就是下一条用户消息，而工具按工号能唯一定位到人；用姓名当值在重名时
 * 会原地打转（选完还是多命中）。没有工号才退回用姓名。
 *
 * <p>两个包都在用（公共查询的「命中多条」、免冻包的「一个人多张卡」），所以抽成一份 ——
 * 「值必须是能唯一定位的东西」是规则，不是两处各自的口味。
 */
final class PersonChoices {

    private PersonChoices() {
    }

    /** 每项取 name / jobNumber / department 三个键，缺了按空处理 */
    static List<Map<String, Object>> of(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row == null) {
                continue;
            }
            String name = str(row.get("name"));
            String job = str(row.get("jobNumber"));
            String dept = str(row.get("department"));
            String value = job.isEmpty() ? name : job;
            if (value.isEmpty()) {
                continue;
            }
            StringBuilder label = new StringBuilder(name.isEmpty() ? value : name);
            if (!job.isEmpty()) {
                label.append(" · ").append(job);
            }
            if (!dept.isEmpty()) {
                label.append(" · ").append(dept);
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", label.toString());
            item.put("value", value);
            out.add(item);
        }
        return out;
    }

    private static String str(Object o) {
        if (o == null) {
            return "";
        }
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}
