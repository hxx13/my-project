# 小程序图片上传开发规范（强制）

## 目的

- 统一小程序端图片上传行为，避免再次出现「大图上传失败 / callFunction 链路异常」。
- 明确约束：业务图片只走云存储，不走 Spring 上传反补。

## 强制规则

1. 小程序业务图片上传必须使用 `springAuth.uploadCloudMediaFile()`。
2. 后端业务接口中仅保存图片标识（`cloud://...` 或已约定的媒体 URL 字段），不要求 Spring 接收图片二进制。
3. 禁止在业务页面中使用 `springAuth.uploadSpringFile()` 处理多图/流程图上传。
4. 禁止新增「小程序先传后端，再由后端反补 URL 到小程序」的流程。

## 标准实现方式

参考已落地页面：

- `pages/suppliesAdmin/index.js`（新建物资封面）
- `pages/assetRecord/index.js`（申请转移图片）
- `pages/assetTransferRecord/index.js`（转移记录补图）

标准步骤：

1. 选图：优先 `wx.chooseMedia`，回退 `wx.chooseImage(sizeType: ['compressed'])`。
2. 上传：对每张图调用 `springAuth.uploadCloudMediaFile(path, '<业务目录>')`。
3. 存储：将返回的 `cloud://` fileID 直接作为业务字段提交给后端。
4. 展示/预览：统一通过 `springAuth.toAbsoluteMediaUrl()` 归一化后再展示。

## 目录建议

- 物资封面：`supplies/covers`
- 资产转移前图：`asset-transfer/before`
- 资产转移后图：`asset-transfer/after`
- 其他新模块：`<domain>/<scene>`

## 禁止示例

以下模式一律不允许在新功能中出现：

- `uploadSpringFile(...)` 上传业务图片；
- 将图片 base64 包进 `callFunction` 再转发到 Spring 上传；
- 后端新增上传接口专门给小程序业务图做中转反补。

## Code Review 检查清单

- [ ] 是否仅使用 `uploadCloudMediaFile`？
- [ ] 是否把上传结果（fileID/URL）直接提交业务接口？
- [ ] 是否移除了页面里对 `uploadSpringFile` 的依赖？
- [ ] 是否在预览/展示前调用了 `toAbsoluteMediaUrl`？
- [ ] 是否处理了用户取消选择、部分上传失败、逐张重试提示？

## 备注

- `uploadSpringFile` 仅保留给特定历史接口兼容场景，不作为新业务默认方案。
- 如确需例外，必须在需求评审中说明原因并同步本规范。
