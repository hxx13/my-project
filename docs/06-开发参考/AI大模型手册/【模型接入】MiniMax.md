---
title: 【模型接入】MiniMax
category: AI大模型手册
---

# 【模型接入】MiniMax

项目基于 Spring AI 提供的 `spring-ai-minimax`，实现 MiniMax 的接入：

| 功能 | 模型 | Spring AI 客户端 |
| --- | --- | --- |
| AI 对话 | 对话模型 | MiniMaxChatModel |
| AI 绘画 | 生图模型 | 暂未接入 |

##  1. 申请密钥

MiniMax 有开源版本，性能比肩 GPT-4o，所以我们可以私有化部署。

当然，我们也可以直接使用官方的 API 服务，提供了一定的免费额度，使用也比较方便

下面，我们来看看这两种方式怎么申请（部署）？

###  1.1 方式一：申请 MiniMax 密钥

① 在 MiniMax 上，注册一个账号。

② 在 MiniMax 开放平台 -> 账户管理 -> 接口密钥 上，创建一个 API Key 密钥。

* * *

申请完成后，可以在我们系统的 \[AI 大模型 -> 控制台 -> API 密钥\] 菜单，进行密钥的配置。只需要填写“密钥”，不需要填写“自定义 API URL”（因为 Spring AI 默认官方地址）。如下图所示：

> 📷 *官方的密钥配置*

###  1.2 方式二：私有化部署

参考 https://github.com/MiniMax-AI/MiniMax-01 进行部署

##  2. 模型配置

友情提示：

目前 `ai_model` 表中，已经预置了一些模型，可以直接使用！！！

###  2.1 AI 对话

使用 [《AI 对话》](/开发参考/AI大模型手册/AI 聊天对话.md) 时，需要在 \[AI 大模型 -> 控制台 -> 模型配置\] 菜单，配置对应的聊天模型。

模型有：`MiniMax-Text-01`、`abab6.5s-chat`、`DeepSeek-R1` 等等，可以点击 对话模型 进行查看。

注意，每个模型标识的 `max_tokens`（回复数 Token 数）一般是 4096 或 8192，具体也是看上述链接。

###  2.2 AI 绘图

TODO 等待 MiniMax ImageModel 客户端！

##  3. 如何使用？

① 如果你的项目里需要直接通过 `@Resource` 注入 MiniMaxChatModel 等对象，需要把 `application.yaml` 配置文件里的 `spring.ai.minimax` 配置项，替换成你的！

```
spring:
  ai:
    minimax: # Minimax：https://www.minimaxi.com/
      api-key: xxxx
```

② 如果你希望使用 \[AI 大模型 -> 控制台 -> API 密钥\] 菜单的密钥配置，则可以通过 AiModelService 的 `#getChatModel(...)` 方法，获取对应的模型对象。

* * *

① 和 ② 这两者的后续使用，就是标准的 Spring AI 客户端的使用，调用对应的方法即可。

另外，MoonshotChatModelTests 里有对应的测试用例，可以参考。
