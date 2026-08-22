package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfStandardVersion;
import com.example.demo.modules.nhp.mapper.CrfStandardVersionMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** NHP 标准库版本。 */
@RestController
@RequestMapping("/api/nhp/standards")
@Tag(name = "NHP 标准库", description = "crf_standard_version")
public class NhpStandardController {

    private final CrfStandardVersionMapper standardVersionMapper;

    public NhpStandardController(CrfStandardVersionMapper standardVersionMapper) {
        this.standardVersionMapper = standardVersionMapper;
    }

    @GetMapping
    @Operation(summary = "标准库版本列表")
    public Result<List<CrfStandardVersion>> list() {
        return Result.success(standardVersionMapper.list());
    }
}
