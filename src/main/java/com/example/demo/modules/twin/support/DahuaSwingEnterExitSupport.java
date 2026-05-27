package com.example.demo.modules.twin.support;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import org.springframework.util.StringUtils;

import java.util.Map;

/**
 * 从大华刷卡记录或 raw_json 解析进出（1=进，2=出）。
 */
public final class DahuaSwingEnterExitSupport {

    private DahuaSwingEnterExitSupport() {}

    public static Integer resolve(DahuaSwingRecord r) {
        if (r == null) {
            return null;
        }
        Integer direct = normalize(r.getEnterOrExit());
        if (direct != null) {
            return direct;
        }
        if (!StringUtils.hasText(r.getRawJson())) {
            return null;
        }
        try {
            Map<String, Object> m = JSON.parseObject(r.getRawJson());
            if (m == null) {
                return null;
            }
            Integer v = firstInt(m, "enterOrExit", "enter_or_exit", "inAndOutType", "inAndOut", "inOutType");
            return normalize(v);
        } catch (Exception e) {
            return null;
        }
    }

    public static void applyResolved(DahuaSwingRecord r) {
        if (r == null) {
            return;
        }
        Integer resolved = resolve(r);
        if (resolved != null) {
            r.setEnterOrExit(resolved);
        }
    }

    private static Integer firstInt(Map<String, Object> m, String... keys) {
        for (String key : keys) {
            Integer v = intVal(m.get(key));
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    private static Integer normalize(Integer v) {
        if (v == null) {
            return null;
        }
        if (v == 1 || v == 2) {
            return v;
        }
        return null;
    }

    private static Integer intVal(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return normalize(n.intValue());
        }
        try {
            return normalize(Integer.parseInt(String.valueOf(v).trim()));
        } catch (Exception e) {
            return null;
        }
    }
}
