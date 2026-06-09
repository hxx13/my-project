---
title: Dify 工作流
category: AI大模型手册
---

# Dify 工作流

##  1. Dify 是什么？

Dify 是一个开源的 LLM 应用开发平台。其直观的界面结合了 AI 工作流、RAG 管道、Agent、模型管理、可观测性功能等，让您可以快速从原型到生产。

它的官网是 https://dify.ai/，可直接申请使用。

同时，它也是个开源项目，地址是 https://github.com/langgenius/dify，可以自行部署。

##  2. 如何接入？

由于 Dify 的 对话接口 不兼容 GPT 的接口，所以无法使用 [《【模型接入】OpenAI》](/开发参考/AI大模型手册/【模型接入】OpenAI.md) 的方式，无法通过 OpenAIChatModel 进行接入。

不过，社区里有人提供了 https://github.com/fatwang2/dify2openai 项目，可以将 Dify 的对话接口转换为 OpenAI 的接口，这样就可以使用 OpenAIChatModel 进行接入了。

下面，我们讲解下，如何把我们系统中的 [《AI 对话聊天》](/开发参考/AI大模型手册/AI 聊天对话.md) ，接入到 Dify 的工作室（聊天助手、Agent、工作流等）。

###  2.1 第一步：创建 Dify 应用

① 在 https://cloud.dify.ai/apps 工作室，点击【创建空白应用】按钮，创建一个应用。具体怎么创建，可见 https://docs.dify.ai/zh-hans/guides/application-orchestrate/creating-an-application 文档。

> 📷 *新建应用*

② 点击应用，切换到【访问 API】选项，再点击【API 密钥】按钮，之后点击【创建密钥】按钮，生成一个 API 密钥。

> 📷 *新建 API 密钥*

###  2.2 第二步：配置 API 密钥与模型

〇 本地搭建 https://github.com/fatwang2/dify2openai 项目，将 Dify 的对话接口转换为 OpenAI 的接口。

① 在我们系统的 \[AI 大模型 -> 控制台 -> API 密钥\] 菜单，新建一个 Dify 的 API 密钥，填写上面的“密钥”，并设置 URL 为 `http://127.0.0.1:3000` 。如下图所示：

> 📷 *API 密钥*

② 在我们系统的 \[AI 大模型 -> 控制台 -> 模型配置\] 菜单，新建一个 Dify 的聊天模型，填写上面的“模型名称” + “API 密钥” + “API URL”。如下图所示：

> 📷 *模型配置*

###  2.3 第三步：AI 对话聊天

在 \[AI 大模型 -> AI 对话\] 菜单，选择 Dify 的聊天模型，即可开始对话。如下图所示：

> 📷 *AI 对话*

##  3. 常见问题？

① 如果你想使用 Dify 知识库接口，可参考 https://docs.dify.ai/zh-hans/guides/knowledge-base/external-knowledge-api-documentation 进行对接。

当然，我们系统已经提供了 [《AI 知识库》](/开发参考/AI大模型手册/AI 知识库（RAG）.md) 功能。

② 如果使用 Dify 对话接口时，需要传递 `input`、`files` 等参数，无法采用上述方式接入。

此时，只能参考 OpenAiChatModel 的源码，实现类似 DifyChatModel 的接入，甚至要修改 `dify2openai` 源码。
