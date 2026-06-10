---


title: HTTPS 证书
category: 运维手册


---

# HTTPS 证书

本小节，讲解如何在 Nginx 配置 SSL 证书，实现前端和后端使用 HTTPS 安全访问的功能。

考虑到各大云服务厂商的文档写的比较齐全，这里更多做汇总与整理。

😜 如果想要免费的 SSL 证书，请申请 DV 单域名证书。如果要配置多个域名，可以申请多个 DV 单域名证书。

友情提示：HTTPS 的学习资料？

- [《HTTPS 的工作原理》](http://www.iocoder.cn/Fight/How-HTTPS-works/?yudao)
- [《面试官：你连 HTTPS 原理没搞懂，还给我讲“中间人攻击”？》](http://www.iocoder.cn/Fight/Interviewer-You-do-not-understand-how-HTTPS-works-and-you-are-telling-me-about-the-man-in-the-middle-attack/?yudao)

重要！有个球友共享了 [https://t.zsxq.com/th7np](https://t.zsxq.com/th7np) 了他的配置过程，大家可以借鉴下！

##  1. 阿里云 SSL【最常用】

- 第一步，[免费证书申购流程](https://help.aliyun.com/document_detail/205510.html)
- 第二步，[在 Nginx 或 Tengine 服务器上安装证书](https://help.aliyun.com/document_detail/98728.html)

![视频教程](/knowledge-images/89dfd977cc18.png)

##  2. FreeSSL【最便宜】

[FreeSSL.cn](https://freessl.cn/)，一个提供免费 HTTPS 证书申请的网站。

疑问：有没其它类似的平台？

- [OHTTPS](https://ohttps.com/)：免费提供 HTTPS 证书，支持一键申请、自动更新、自动部署的功能。

##  3. 腾讯云 SSL

- 第一步，[免费 SSL 证书申请流程](https://cloud.tencent.com/document/product/400/6814)
- 第二步，[Nginx 服务器 SSL 证书安装部署](https://cloud.tencent.com/document/product/400/35244)

![视频教程](/knowledge-images/625842a325b6.png)

##  4. 华为云 SSL

- 第一步，[SSL 证书申购流程](https://support.huaweicloud.com/usermanual-ccm/ccm_01_0073.html)
- 第二步，[下载与安装 SSL 证书](https://support.huaweicloud.com/usermanual-ccm/ccm_01_0027.html)

1Panel 部署 服务监控
