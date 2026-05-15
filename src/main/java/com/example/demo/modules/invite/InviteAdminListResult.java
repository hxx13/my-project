package com.example.demo.modules.invite;

import java.util.List;
import java.util.Map;

/** 管理端推荐码列表：正常返回或缺表时带运维提示 */
public record InviteAdminListResult(List<Map<String, Object>> items, String schemaHint) {
}
