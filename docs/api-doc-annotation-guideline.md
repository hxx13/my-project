# 接口注解规范（API 文档）

适用范围：所有 `/api/**` 控制器与接口方法。

## 必填项

- 控制器必须声明 `@Tag(name = "...", description = "...")`
- 接口方法必须声明 `@Operation(summary = "...", description = "...")`
- 关键接口建议补充 `@ApiResponses`（至少含 `200/400/401/403/500`）

## 入参规范

- `@PathVariable`、`@RequestParam`、`@RequestHeader` 参数命名要语义化
- DTO 字段建议补充 `@Schema(description = "...")`
- 复杂请求体需要给出可读字段名称，避免 `param1/param2`

## 返回规范

- 推荐统一使用 `Result<T>` 返回结构
- 错误场景返回信息应可直接用于前端提示

## 质量检查建议

- 接口中心若提示“缺少 @Operation(summary)”或“控制器缺少 @Tag”，应优先修复
- 新增接口后在“接口中心”确认是否自动发现、摘要是否清晰、示例是否可用
