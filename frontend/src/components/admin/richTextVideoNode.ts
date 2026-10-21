import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 站内视频节点：只存上传后的文件地址。
 * 展示侧统一换成「缩略卡 + 弹窗播放」，编辑器里保留原生 controls 便于确认。
 */
export const RichTextVideo = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: "controls",
        preload: "metadata",
        playsinline: "true",
      }),
    ];
  },
});
