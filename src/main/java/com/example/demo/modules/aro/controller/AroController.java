package com.example.demo.modules.aro.controller;

import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.service.AroService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
// 🚀 规范化路由前缀：标记资源版本
@RequestMapping("/api/v1/aro")
@CrossOrigin("*")
@Tag(name = "ARO对接", description = "ARO外部系统数据拉取接口")
public class AroController {

    @Autowired
    private AroService aroService;

    // 依然保留这个探针，但直接返回结构化的 List！
    @GetMapping("/test-fetch")
    @Operation(summary = "测试拉取ARO记录")
    public List<AroRecord> testFetch() {
        System.out.println("🚀 [ARO 探针] 收到指令，正在突袭 ARO 系统第一页数据...");

        // 调用全新的万能条件拉取接口：不限日期，不限状态，拉取第1页，100条
        List<AroRecord> records = aroService.fetchRecordsByCondition(null, null, 1, 100);

        System.out.println("✅ [ARO 探针] 成功抓取并解析了 " + records.size() + " 条标准数据！");

        // 直接返回 List，Spring Boot 会自动把它变成极其漂亮的 JSON 渲染在浏览器上！
        return records;
    }
}