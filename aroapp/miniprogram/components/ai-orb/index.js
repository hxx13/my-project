/**
 * 球球（智能助手载体）—— 小程序版。
 *
 * 形象与表情数据来自 Web 端 emotion-ball 引擎（线上 scan.assistant.carrier = ball）：
 * 米白哑光球 + 25 组眼环（形状见 emotions.wxss，由脚本从引擎 rings.js 生成）。
 *
 * 轮换逻辑放在组件自己身上 —— 早先写在抽屉里，结果 tabBar 那个球没人管、
 * 永远停在同一个表情。换成 auto 开关：要动的传 true，消息列表里的头像不传。
 */

/**
 * 表情池：引擎的 25 组眼环全用上，不挑不分组 —— 闭眼、怒目也照轮。
 * 只有「节奏」还分待机/思考（思考时换得勤一点，看得出在干活）。
 */
const ALL_EMOTIONS = [];
for (let i = 0; i < 25; i += 1) ALL_EMOTIONS.push(i);

/** 与 Web 端一致的轮换节奏 */
const IDLE_ROTATE_MS = 6000;
const THINK_ROTATE_MS = 2500;

/** 待机小动作（引擎的 antics）：9~18s 随机来一次，一次约 1.3s */
const ANTIC_ACTIONS = ['tilt', 'bounce', 'wobble'];
const ANTIC_MIN_MS = 9000;
const ANTIC_MAX_MS = 18000;
const ANTIC_HOLD_MS = 1300;

/** 随机取一个，避开当前这个 —— 连着抽中同一个，看着就像没在变 */
function nextEmotion(avoid) {
  for (let i = 0; i < 8; i += 1) {
    const v = ALL_EMOTIONS[Math.floor(Math.random() * ALL_EMOTIONS.length)];
    if (v !== avoid) return v;
  }
  return 0;
}

/** 闭眼到睁开的用时长；换形状卡在闭塞最深的那一帧 */
const SWITCH_BLINK_MS = 260;
const SWITCH_SWAP_AT_MS = 130;

Component({
  properties: {
    /** idle / thinking —— 决定轮换节奏，不改变外观 */
    state: { type: String, value: 'idle' },
    /** 球直径，单位 rpx */
    size: { type: Number, value: 120 },
    /**
     * 是否自动轮换表情与待机动作。
     * 默认关：消息列表里每条答复旁都挂一个球，一屏十来个各自动起来会很乱、也费性能。
     */
    auto: { type: Boolean, value: false },
    /** 手动指定表情（auto 为 false 时生效），25 组眼环下标 */
    emotion: { type: Number, value: 0 },
  },

  data: {
    /** auto 时由组件自己推进的表情/动作 */
    liveEmotion: 0,
    liveAction: '',
    /**
     * 正在换表情：眼睛先眯上再睁开，形状在闭上那一瞬替换。
     *
     * Web 端引擎是 48 个点逐点弹簧插值，形状是"长"过去的；小程序里只换 CSS 类
     * 会让背景图瞬间替换，看着很硬。真做插值要把 25 组点数据全导进来、每帧算
     * 96 个坐标拼 SVG，setData 吃不消。借一次眨眼遮住那次替换，观感就自然了。
     */
    switching: false,
  },

  observers: {
    state(next) {
      if (this.data.auto) this.restartRotate(next === 'thinking');
    },
    auto(next) {
      if (next) this.restartRotate(this.data.state === 'thinking');
      else this.stopAll();
    },
    /** 手动指定时直接落屏 —— wxml 只认 liveEmotion，两个来源在组件内归一 */
    emotion(next) {
      if (!this.data.auto) this.setData({ liveEmotion: next });
    },
  },

  lifetimes: {
    attached() {
      if (this.data.auto) this.restartRotate(this.data.state === 'thinking');
      else this.setData({ liveEmotion: this.data.emotion });
    },
    detached() {
      this.stopAll();
    },
  },

  methods: {
    restartRotate(thinking) {
      this.stopAll();

      this.advance(0);
      this.rotateTimer = setInterval(
        () => this.advance(thinking ? THINK_ROTATE_MS : IDLE_ROTATE_MS),
        thinking ? THINK_ROTATE_MS : IDLE_ROTATE_MS,
      );

      // 思考时不插小动作，球光在眨
      if (!thinking) this.scheduleAntic();
    },

    /** 换表情：合眼 → 换形状 → 睁眼（首帧不眨眼，避免刚出现就闭一下） */
    advance(_period) {
      const next = nextEmotion(this.data.liveEmotion);
      if (!this.data.switching && this.data.liveEmotion === next) return;
      this.setData({ switching: true });
      this.swapTimer = setTimeout(() => {
        this.swapTimer = null;
        this.setData({ liveEmotion: next });
        this.switchEndTimer = setTimeout(() => {
          this.switchEndTimer = null;
          this.setData({ switching: false });
        }, SWITCH_BLINK_MS - SWITCH_SWAP_AT_MS);
      }, SWITCH_SWAP_AT_MS);
    },

    scheduleAntic() {
      this.anticTimer = setTimeout(
        () => {
          this.anticTimer = null;
          this.setData({ liveAction: ANTIC_ACTIONS[Math.floor(Math.random() * ANTIC_ACTIONS.length)] });
          this.anticHold = setTimeout(() => {
            this.anticHold = null;
            this.setData({ liveAction: '' });
          }, ANTIC_HOLD_MS);
          this.scheduleAntic(); // 排下一次
        },
        ANTIC_MIN_MS + Math.random() * (ANTIC_MAX_MS - ANTIC_MIN_MS),
      );
    },

    stopAll() {
      if (this.rotateTimer) {
        clearInterval(this.rotateTimer);
        this.rotateTimer = null;
      }
      if (this.anticTimer) {
        clearTimeout(this.anticTimer);
        this.anticTimer = null;
      }
      if (this.anticHold) {
        clearTimeout(this.anticHold);
        this.anticHold = null;
      }
      if (this.swapTimer) {
        clearTimeout(this.swapTimer);
        this.swapTimer = null;
      }
      if (this.switchEndTimer) {
        clearTimeout(this.switchEndTimer);
        this.switchEndTimer = null;
      }
      const patch = {};
      if (this.data.liveAction) patch.liveAction = '';
      if (this.data.switching) patch.switching = false;
      if (Object.keys(patch).length) this.setData(patch);
    },
  },
});
