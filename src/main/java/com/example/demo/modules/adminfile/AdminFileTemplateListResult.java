package com.example.demo.modules.adminfile;

import java.util.List;
import java.util.Map;

/** 管理端文件模板列表：正常返回或缺表时带运维提示 */
public record AdminFileTemplateListResult(List<Map<String, Object>> items, String schemaHint) {
}
