package com.example.demo.common.bootstrap;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * bootstrap 脚本的格式闸。
 *
 * <p>Spring 的 {@code ScriptUtils.splitSqlScript} 靠**分隔符**切语句：末尾没有 {@code ;} 的脚本
 * 会被切成 **0 条** —— 不执行任何 SQL、不抛异常、还被判定为成功。
 * 也就是说「脚本跑了」和「脚本什么都没干」在日志里长得**一模一样**。
 *
 * <p><b>2026-09-15 踩过</b>：{@code bootstrap-print-station.sql} 与 {@code bootstrap-print-job.sql}
 * 两处缺尾分号，导致生产上打印那两张表**从建库起就没建出来**，接口 500、
 * 失败清单里却找不到它，查了一整晚。这个测试就是为了让那种夜晚不再有第二次。
 */
class BootstrapScriptFormatTest {

    @Test
    void everyBootstrapScriptEndsWithSemicolon() throws IOException {
        Path dir = Paths.get("src/main/resources/db");
        List<String> offenders = new ArrayList<>();

        try (Stream<Path> files = Files.list(dir)) {
            for (Path p : files.filter(f -> f.getFileName().toString().endsWith(".sql")).toList()) {
                List<String> body = Files.readAllLines(p, StandardCharsets.UTF_8).stream()
                        .map(String::strip)
                        .filter(l -> !l.isEmpty() && !l.startsWith("--"))
                        .toList();
                // 整份都是注释 = 没有语句可执行，无害，跳过
                if (body.isEmpty()) continue;
                if (!body.get(body.size() - 1).endsWith(";")) {
                    offenders.add(p.getFileName().toString());
                }
            }
        }

        assertTrue(offenders.isEmpty(),
                "这些 bootstrap 脚本末尾没有分号，会被 Spring 切成 0 条语句静默跳过（不报错、日志全绿）："
                        + offenders);
    }
}
