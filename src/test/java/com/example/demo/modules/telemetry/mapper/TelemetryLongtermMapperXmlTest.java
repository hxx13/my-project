package com.example.demo.modules.telemetry.mapper;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 三段新 XML 必须能被 mybatis **真解析**并注册语句。
 *
 * <p>为什么不能只做文本级断言：`<foreach>` 写错、`resultMap` 指向不存在的类型、
 * `<include refid>` 指向不存在的片段 —— 这些文本检查全都照样绿，而它们失效的时间点
 * 恰好是**用户重启后端那一刻**（报 Invalid bound statement），排查要从「找不到语句」
 * 一路倒推回语法错。所以这里用 {@link XMLMapperBuilder} 真跑一遍解析 + 查语句注册表。
 */
class TelemetryLongtermMapperXmlTest {

    private static final String NS = "com.example.demo.modules.telemetry.mapper.";

    private static final String[] XMLS = {
            "mapper/TelemetryLongtermVariableMapper.xml",
            "mapper/TelemetryLongtermSampleMapper.xml",
            "mapper/TelemetryLongtermSampleLogMapper.xml",
    };

    private static InputStream open(String path) throws Exception {
        InputStream in = Resources.getResourceAsStream(path);
        assertNotNull(in, path + " 不在 classpath 里");
        return in;
    }

    @Test
    void xmlFilesAreParseableAndNamespaced() throws Exception {
        for (String path : XMLS) {
            try (InputStream in = open(path)) {
                String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                assertTrue(text.contains("<mapper namespace=\"" + NS), path + " 的 namespace 不对");
                assertTrue(text.contains("</mapper>"), path + " 没闭合");
            }
        }
    }

    @Test
    void xmlActuallyParsesWithMybatis() throws Exception {
        for (String path : XMLS) {
            // 每个 XML 一个独立 Configuration：同名语句塞进同一个 Configuration 会互相冲突
            Configuration cfg = new Configuration();
            try (InputStream in = open(path)) {
                new XMLMapperBuilder(in, cfg, path, cfg.getSqlFragments()).parse();
            }
            for (String statement : statementsOf(path)) {
                assertTrue(cfg.hasStatement(statement),
                        statement + " 没被注册（XML 里这个 id 写错了或漏了）");
            }
        }
    }

    private static String[] statementsOf(String xmlPath) {
        if (xmlPath.endsWith("VariableMapper.xml")) {
            return new String[]{NS + "TelemetryLongtermVariableMapper.selectAllOrdered",
                    NS + "TelemetryLongtermVariableMapper.deleteAll",
                    NS + "TelemetryLongtermVariableMapper.insertBatch"};
        }
        if (xmlPath.endsWith("SampleLogMapper.xml")) {
            return new String[]{NS + "TelemetryLongtermSampleLogMapper.insert",
                    NS + "TelemetryLongtermSampleLogMapper.selectRecent"};
        }
        return new String[]{NS + "TelemetryLongtermSampleMapper.insertBatch",
                NS + "TelemetryLongtermSampleMapper.countByFilter",
                NS + "TelemetryLongtermSampleMapper.selectPageByFilter",
                NS + "TelemetryLongtermSampleMapper.selectForExport",
                NS + "TelemetryLongtermSampleMapper.selectDistinctMonths",
                NS + "TelemetryLongtermSampleMapper.selectDistinctDays"};
    }
}
