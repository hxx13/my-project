import { defineTeekConfig } from 'vitepress-theme-teek/config'
import yudaoSidebar from './yudao-sidebar'

const mainSidebar = [
  { text: '🏠 首页', link: '/' },
  { text: '后端架构', collapsed: false, items: [
    { text: '后端架构规范', link: '/后端架构规范' },
    { text: '架构设计规范', link: '/架构设计规范' },
  ]},
  { text: '前端架构', collapsed: false, items: [
    { text: 'Web 端', collapsed: true, items: [
      { text: '前端Web架构规范', link: '/前端Web架构规范' },
      { text: '页面权限发现', link: '/页面权限发现' },
    ]},
    { text: '小程序端', collapsed: true, items: [
      { text: '前端小程序架构规范', link: '/前端小程序架构规范' },
    ]},
  ]},
  { text: '开发运维', collapsed: true, items: [
    { text: '部署指南', link: '/部署指南' },
    { text: '业务扩展工作流', link: '/业务扩展工作流' },
    { text: '后端开发参考', link: '/开发参考' },
  ]},
  { text: '后端开发参考', collapsed: true, items: yudaoSidebar as any },
  { text: '参考资料', collapsed: true, items: [
    { text: '改进路线图', link: '/改进路线图' },
    { text: '竞品分析', link: '/竞品分析' },
    { text: '角色能力矩阵', link: '/角色能力矩阵' },
  ]},
];

export default defineTeekConfig({
  // ── Site Metadata ──
  title: 'TwinSystem 设计档案',
  description: 'TwinSystem 网站内部逻辑全景 — 架构文档、设计档案、业务导图、开发指南',
  base: '/my-project/',

  // 排除内部设计文档（含大量 JSX 代码片段，会导致构建报错）
  srcExclude: ['**/superpowers/**'],

  ignoreDeadLinks: true,

  // ── Head ──
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  // ── Theme Config ──
  // 以下都是 Teek 专有配置
  docAnalysis: {
    // 页面底部展示上一篇/下一篇链接
    pagination: true,
  },

  // 导航栏上的搜索
  search: {
    provider: 'local',
  },

  // 顶部导航
  nav: [
    { text: '首页', link: '/' },
    {
      text: '架构文档',
      items: [
        { text: '后端架构', link: '/后端架构规范' },
        { text: '前端 Web 架构', link: '/前端Web架构规范' },
        { text: '前端小程序架构', link: '/前端小程序架构规范' },
      ],
    },
    {
      text: '设计档案',
      items: [
        { text: '架构规范与设计指南', link: '/架构设计规范' },
      ],
    },
    {
      text: '业务逻辑导图',
      link: '/mindmap/mermaid/00-overview',
    },
    {
      text: '开发指南',
      items: [
        { text: '部署指南', link: '/部署指南' },
        { text: '业务扩展工作流', link: '/业务扩展工作流' },
        { text: '后端开发参考', link: '/开发参考' },
      ],
    },
    {
      text: '参考资料',
      items: [
        { text: '改进路线图', link: '/改进路线图' },
        { text: '竞品分析', link: '/竞品分析' },
        { text: '角色能力矩阵', link: '/角色能力矩阵' },
      ],
    },
  ],

  // ── 主侧边栏内容（'/'' 和 '/开发参考/' 共用，防止 Teek 自动替换） ──
  sidebar: {
    '/': mainSidebar,
    '/开发参考/': mainSidebar,
    '/mindmap/mermaid/': [
      { text: '业务全景总览', link: '/mindmap/mermaid/00-overview' },
      { text: '门禁与通行', collapsed: true, items: [
        { text: 'accessfusion', link: '/mindmap/mermaid/01-accessfusion' },
        { text: 'accessrule', link: '/mindmap/mermaid/02-accessrule' },
        { text: 'swipealert', link: '/mindmap/mermaid/28-swipealert' },
      ]},
      { text: '核心业务', collapsed: true, items: [
        { text: 'admin', link: '/mindmap/mermaid/03-admin' },
        { text: 'student', link: '/mindmap/mermaid/26-student' },
        { text: 'auth', link: '/mindmap/mermaid/08-auth' },
        { text: 'notification', link: '/mindmap/mermaid/18-notification' },
        { text: 'twin', link: '/mindmap/mermaid/30-twin' },
      ]},
      { text: '资产与设施', collapsed: true, items: [
        { text: 'asset', link: '/mindmap/mermaid/07-asset' },
        { text: 'cageshelf', link: '/mindmap/mermaid/09-cageshelf' },
        { text: 'facilitymaintenance', link: '/mindmap/mermaid/13-facilitymaintenance' },
        { text: 'supplies', link: '/mindmap/mermaid/27-supplies' },
      ]},
      { text: '数据分析', collapsed: true, items: [
        { text: 'analytics', link: '/mindmap/mermaid/05-analytics' },
        { text: 'telemetry', link: '/mindmap/mermaid/29-telemetry' },
      ]},
      { text: '全部模块', collapsed: true, items: [
        { text: 'adminfile', link: '/mindmap/mermaid/04-adminfile' },
        { text: 'aro', link: '/mindmap/mermaid/06-aro' },
        { text: 'chat', link: '/mindmap/mermaid/10-chat' },
        { text: 'dahua', link: '/mindmap/mermaid/11-dahua' },
        { text: 'docs', link: '/mindmap/mermaid/12-docs' },
        { text: 'invite', link: '/mindmap/mermaid/14-invite' },
        { text: 'llm', link: '/mindmap/mermaid/15-llm' },
        { text: 'me', link: '/mindmap/mermaid/16-me' },
        { text: 'mp', link: '/mindmap/mermaid/17-mp' },
        { text: 'order', link: '/mindmap/mermaid/19-order' },
        { text: 'pagepermission', link: '/mindmap/mermaid/20-pagepermission' },
        { text: 'policy', link: '/mindmap/mermaid/21-policy' },
        { text: 'purchase', link: '/mindmap/mermaid/22-purchase' },
        { text: 'repair', link: '/mindmap/mermaid/23-repair' },
        { text: 'roommapping', link: '/mindmap/mermaid/24-roommapping' },
        { text: 'site', link: '/mindmap/mermaid/25-site' },
        { text: 'upload', link: '/mindmap/mermaid/31-upload' },
      ]},
    ],
  },

  // ── Social Links ──
  socialLinks: [
    { icon: 'github', link: 'https://github.com' },
  ],

  // ── Footer ──
  footer: {
    message: '由 VitePress + Teek 构建',
    copyright: '© 2026 TwinSystem',
  },

  // ── Teek 专有：文档/博客模式 ──
  // LayoutMode: 'doc' → 文档模式 | 'blog' → 博客模式
  layoutMode: 'doc',

  // ── Teek 专有：主题色 ──
  themeColor: {
    primary: '#5a7aff',     // 主色调（偏蓝紫，符合少数派风格）
  },

  // 明暗模式
  appearance: true,
})
