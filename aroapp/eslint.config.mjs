// aroapp/eslint.config.mjs —— 小程序侧的 lint
//
// 目前只上一条规则，原因见下。
//
// 一、为什么不是 no-invalid-this
// 它只在**严格模式**下报「函数里的 this 不是方法/类成员」。小程序源码全是非严格的
// （实测：同一段问题代码在非严格文件上零输出，加 'use strict' 才报），所以直接上它等于白装。
// 折中办法是配置里写 sourceType:'module' 把一切当严格代码，但那样连
// `this.setData(obj, function () { this.foo() })` 也会被误报——那是**合法**写法：
// 微信会把页面实例绑给 setData 的完成回调。误报会在整个仓库铺开，最后没人看。
//
// 二、所以改用 AST 选择器，只精确匹配「数组/Promise 方法的普通 function 回调里出现 this」。
// 这类回调的 thisArg 是 undefined，写 this.xxx 必然抛 TypeError：
//   arr.find(function (a) { return a.id === this.data.id; })   // ✗ this 不是页面
//   arr.map((a) => this.tag(a))                                 // ✓ 箭头函数词法绑定
//   this.setData({...}, function () { this.loadAll(); })        // ✓ 微信绑了页面
//
// 三、背景事故（2026-09-23）
// 动物订购页 openSpec 用 .find(function (a) { ... this.data.selectedAupId ... }) 查 AUP。
// 异常发生在 setData({ specSheetOpen: true }) 之前，规格弹窗永远打不开——小程序不像浏览器
// 会弹红屏，异常只在 console 里，所以表现是「点选择规格毫无反应」。这条规则就是它的守卫。
//
// 用法: npm run lint （已接进 npm test）

export default [
  { ignores: ['**/miniprogram_npm/**', '**/node_modules/**', '.cloudbase/**'] },
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script' },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(find|findIndex|forEach|map|filter|some|every|reduce|reduceRight|flatMap|sort|then|catch|finally)$/] > FunctionExpression:has(ThisExpression)",
          message:
            '数组/Promise 方法的普通 function 回调里不能用 this（thisArg 是 undefined，必抛 TypeError）——改箭头函数，或在回调外 const self = this; 后引用 self。',
        },
      ],
    },
  },
];
