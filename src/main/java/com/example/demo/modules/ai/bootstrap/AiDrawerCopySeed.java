package com.example.demo.modules.ai.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 对话抽屉里那批固定文案的配置登记：把 73 个键写进系统设置的定义表与运行值表。
 *
 * <p>三条约定：
 * <ul>
 *   <li><b>默认值即界面原文、逐字节一致</b>，管理端改这里就是改界面显示。</li>
 *   <li>含占位符的那几条，库里就存这个带占位符的模板，由界面自己替换。
 *       <b>占位符一律 ASCII</b>：{@code {name}}（名字）、{@code {mm:ss}}（剩余时间）。</li>
 *   <li><b>值只在「库里没这条键」时写</b>：缺键才种默认值；键已存在（哪怕管理员改过、或写成 NULL 表示恢复默认）
 *       就一个字节都不动 —— 每次启动无条件写回默认值会把超管的编辑抹掉。</li>
 * </ul>
 */
@Component
@Order(137)
public class AiDrawerCopySeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AiDrawerCopySeed.class);

    public static final String MODULE = "ai";
    public static final String PREFIX = "ai.copy.";

    /** key / 中文名 / 原文。原文必须与界面一致，含占位符的原样存。 */
    record Copy(String key, String label, String value) {
    }

    /** 写入清单。**只能住 ai.copy. 开头的键**（测试会守这条）。 */
    static final List<Copy> COPIES = List.of(
            new Copy("ai.copy.card.download.default", "对话卡片 · 导出文件缺省名", "导出文件"),
            new Copy("ai.copy.card.download.busy", "对话卡片 · 导出按钮（传输中）", "导出中…"),
            new Copy("ai.copy.card.download.save", "对话卡片 · 下载到本机按钮", "下载到本机"),
            new Copy("ai.copy.card.screenshot.retry", "对话卡片 · 重截一张按钮", "重截一张"),
            new Copy("ai.copy.card.screenshot.fail", "对话卡片 · 截图失败提示", "「{name}」没截成"),
            new Copy("ai.copy.card.screenshot.loading", "对话卡片 · 截图进行中提示", "正在截「{name}」…"),
            new Copy("ai.copy.card.timer.waitConfirm", "对话卡片 · 定时等待确认", "等待你确认"),
            new Copy("ai.copy.card.timer.left", "对话卡片 · 定时剩余时间", "还剩 {mm:ss}"),
            new Copy("ai.copy.card.timer.running", "对话卡片 · 定时执行中", "正在执行…"),
            new Copy("ai.copy.card.timer.confirm", "对话卡片 · 确认执行按钮", "确认执行"),
            new Copy("ai.copy.card.timer.stop", "对话卡片 · 停止按钮", "停止"),
            new Copy("ai.copy.card.attach.drop", "对话输入 · 拖拽落点提示", "松手即可添加（图片 / Excel / md / txt）"),
            new Copy("ai.copy.toolBusy.screenshot", "对话过程 · 正在截图", "正在截图"),
            new Copy("ai.copy.toolBusy.timer", "对话过程 · 正在设定时", "正在设定时"),
            new Copy("ai.copy.chat.stopped", "对话 · 已停止生成占位", "（已停止生成）"),
            new Copy("ai.copy.bubble.attachment", "气泡占位 · 见附件", "（见附件）"),
            new Copy("ai.copy.bubble.image", "气泡占位 · 见图片", "（见图片）"),
            new Copy("ai.copy.detail.open", "抽屉 · 详情按钮无障碍名", "详情"),
            new Copy("ai.copy.detail.title", "详情抽屉 · 标题", "我能帮你做这些"),
            new Copy("ai.copy.detail.desc", "详情抽屉 · 说明文案", "点一句话即可填入输入框，你可以先改一改再发送。"),
            new Copy("ai.copy.detail.loading", "详情抽屉 · 读取中", "读取中…"),
            new Copy("ai.copy.detail.empty", "详情抽屉 · 清单空态", "暂时没有可用的提示词"),
            new Copy("ai.copy.detail.fail", "详情抽屉 · 清单拉取失败", "清单没拉取到，稍后再试"),
            new Copy("ai.copy.detail.close", "详情抽屉 · 关闭按钮", "关闭"),
            new Copy("ai.copy.detail.edit", "详情抽屉 · 编辑按钮", "编辑"),
            new Copy("ai.copy.detail.editTitle", "详情抽屉 · 编辑态标题", "维护抽屉内容"),
            new Copy("ai.copy.detail.tabCopy", "详情抽屉 · 文案分区标签", "界面文案"),
            new Copy("ai.copy.detail.tabCaps", "详情抽屉 · 能力清单分区标签", "能力清单"),
            new Copy("ai.copy.detail.save", "详情抽屉 · 保存按钮", "保存"),
            new Copy("ai.copy.detail.saving", "详情抽屉 · 保存中按钮", "保存中…"),
            new Copy("ai.copy.detail.cancel", "详情抽屉 · 取消按钮", "取消"),
            new Copy("ai.copy.detail.reset", "详情抽屉 · 恢复默认按钮", "恢复默认"),
            new Copy("ai.copy.detail.add", "详情抽屉 · 新增能力按钮", "新增一条"),
            new Copy("ai.copy.detail.up", "详情抽屉 · 上移按钮", "上移"),
            new Copy("ai.copy.detail.down", "详情抽屉 · 下移按钮", "下移"),
            new Copy("ai.copy.detail.remove", "详情抽屉 · 删除按钮", "删除"),
            new Copy("ai.copy.detail.saved", "详情抽屉 · 保存成功提示", "已保存"),
            new Copy("ai.copy.detail.saveFail", "详情抽屉 · 保存失败提示", "保存失败"),
            new Copy("ai.copy.detail.noCap", "详情抽屉 · 能力清单编辑空态", "还没有条目，点下面新增一条"),
            new Copy("ai.copy.detail.titlePlaceholder", "详情抽屉 · 能力标题占位", "标题（一行）"),
            new Copy("ai.copy.detail.promptPlaceholder", "详情抽屉 · 能力提示词占位", "点一下填入输入框的那句话"),
            new Copy("ai.copy.detail.notePlaceholder", "详情抽屉 · 操作备注占位", "操作备注：点了会做什么"),
            new Copy("ai.copy.detail.noteTag", "详情抽屉 · 备注微标签", "说明"),
            new Copy("ai.copy.detail.enabled", "详情抽屉 · 启用开关标签", "启用"),
            new Copy("ai.copy.detail.audience", "详情抽屉 · 谁看得见标签", "谁看得见"),
            new Copy("ai.copy.detail.audienceAll", "详情抽屉 · 可见范围选项（全员）", "全员"),
            new Copy("ai.copy.detail.audienceStaff", "详情抽屉 · 可见范围选项（教职工）", "教职工"),
            new Copy("ai.copy.detail.audienceStudent", "详情抽屉 · 可见范围选项（学生）", "学生"),
            new Copy("ai.copy.detail.audienceAdmin", "详情抽屉 · 可见范围选项（管理员及以上）", "管理员"),
            new Copy("ai.copy.detail.audienceSuper", "详情抽屉 · 可见范围选项（超管及以上）", "超管"),
            new Copy("ai.copy.feedback.open", "详情抽屉 · 我要反馈按钮", "我要反馈"),
            new Copy("ai.copy.feedback.title", "反馈半屏 · 标题", "反馈"),
            new Copy("ai.copy.feedback.close", "反馈半屏 · 关闭按钮", "关闭"),
            new Copy("ai.copy.feedback.formTitle", "反馈半屏 · 表单标题", "写下你的意见"),
            new Copy("ai.copy.feedback.contentPlaceholder", "反馈半屏 · 文字占位", "说说遇到的问题或建议（必填）"),
            new Copy("ai.copy.feedback.imageHint", "反馈半屏 · 选图提示", "最多 6 张（可选）"),
            new Copy("ai.copy.feedback.imageLimit", "反馈半屏 · 超过图片上限提示", "最多 6 张"),
            new Copy("ai.copy.feedback.imageFail", "反馈半屏 · 图片上传失败提示", "图片上传失败"),
            new Copy("ai.copy.feedback.submit", "反馈半屏 · 提交按钮", "提交"),
            new Copy("ai.copy.feedback.submitting", "反馈半屏 · 提交中按钮", "提交中…"),
            new Copy("ai.copy.feedback.submitDone", "反馈半屏 · 提交成功提示", "已提交，谢谢你的反馈"),
            new Copy("ai.copy.feedback.submitFail", "反馈半屏 · 提交失败提示", "提交失败"),
            new Copy("ai.copy.feedback.empty", "反馈半屏 · 列表空态", "还没有反馈"),
            new Copy("ai.copy.feedback.loadFail", "反馈半屏 · 列表拉取失败", "列表没拉取到，稍后再试"),
            new Copy("ai.copy.feedback.listTitle", "反馈半屏 · 列表标题", "反馈记录"),
            new Copy("ai.copy.feedback.mine", "反馈半屏 · 范围（我的）", "我的"),
            new Copy("ai.copy.feedback.all", "反馈半屏 · 范围（全部）", "全部"),
            new Copy("ai.copy.feedback.pending", "反馈半屏 · 状态（待处理）", "待处理"),
            new Copy("ai.copy.feedback.replied", "反馈半屏 · 状态（已回复）", "已回复"),
            new Copy("ai.copy.feedback.replyLabel", "反馈半屏 · 回复内容前缀", "官方回复"),
            new Copy("ai.copy.feedback.replyPlaceholder", "反馈半屏 · 回复输入占位", "写回复…"),
            new Copy("ai.copy.feedback.reply", "反馈半屏 · 回复按钮", "回复"),
            new Copy("ai.copy.feedback.end", "反馈半屏 · 列表到底", "没有更多了"),
            new Copy("ai.copy.feedback.replyNeeded", "反馈半屏 · 回复为空提示", "先写回复内容"),
            new Copy("ai.copy.feedback.replyDone", "反馈半屏 · 回复成功提示", "已回复"),
            new Copy("ai.copy.feedback.replyFail", "反馈半屏 · 回复失败提示", "回复失败"),
            new Copy("ai.copy.feedback.loading", "反馈半屏 · 加载中", "加载中…"),
            new Copy("ai.copy.feedback.replyImageHint", "反馈半屏 · 回复选图提示", "回复附图（可选）"),
            new Copy("ai.copy.detail.back", "详情 · 返回对话按钮", "返回对话"));

    private static final String DESCRIPTION =
            "AI 对话抽屉界面的固定文案（键 ai.copy.*）。默认值即界面原文；含 {name} / {mm:ss} 占位符的由界面自行替换。";

    /**
     * 键 → 默认文案（只读快照）。**这是「有哪些键、默认值是多少」的唯一真相源** ——
     * 抽屉内容接口据此按清单发键、回落默认值，键集合因此恒等于界面清单。
     */
    public static Map<String, String> defaultCopies() {
        Map<String, String> m = new LinkedHashMap<>();
        for (Copy c : COPIES) {
            m.put(c.key(), c.value());
        }
        return m;
    }

    /**
     * 键 → 中文名（只读快照），与 {@link #defaultCopies()} 同源、同序。
     *
     * <p>给管理端编辑态用：超管看到的是「对话卡片 · 下载到本机按钮」而不是键名 {@code ai.copy.card.download.save}。
     */
    public static Map<String, String> defaultLabels() {
        Map<String, String> m = new LinkedHashMap<>();
        for (Copy c : COPIES) {
            m.put(c.key(), c.label());
        }
        return m;
    }

    private final AiCopyConfigStore store;

    public AiDrawerCopySeed(AiCopyConfigStore store) {
        this.store = store;
    }

    /** 本次播种的记账：新增（缺键种上默认值）/ 保留（键已存在，值不动）/ 失败（该键播种抛异常）。 */
    record Outcome(int added, int kept, int failed) {
    }

    @Override
    public void run(ApplicationArguments args) {
        Outcome o = seed();
        String line = "文案配置：新增 {} 条、已存在保留 {} 条、失败 {} 条";
        if (o.failed() > 0) {
            log.warn("[ai-drawer-copy] " + line, o.added(), o.kept(), o.failed());
        } else {
            log.info("[ai-drawer-copy] " + line, o.added(), o.kept(), o.failed());
        }
    }

    /**
     * 逐键播种，**每条键各自 try/catch**：一条失败只记它自己、后面的键照常处理。
     *
     * <p>值的写入策略：先一次性读出库里已有的键，**只有缺键才写默认值**；键已存在就跳过 ——
     * 管理员改过的值、以及写成 NULL 的「恢复默认」，都必须扛得住每次重启。
     * 定义行（label/description/default_value）仍每跑必更新（属代码侧元信息）。
     */
    Outcome seed() {
        int added = 0;
        int kept = 0;
        int failed = 0;
        Map<String, String> existing;
        try {
            existing = store.readValues(MODULE);
        } catch (Exception e) {
            log.warn("[ai-drawer-copy] 读取现有文案失败，本次播种整体跳过: {}", e.getMessage());
            return new Outcome(0, 0, COPIES.size());
        }
        for (Copy c : COPIES) {
            try {
                store.upsertDef(MODULE, c.key(), c.label(), DESCRIPTION, c.value());
                if (existing.containsKey(c.key())) {
                    kept++;
                } else {
                    store.upsertValue(MODULE, c.key(), c.value());
                    added++;
                }
            } catch (Exception e) {
                failed++;
                log.warn("[ai-drawer-copy] 键 {} 播种失败: {}", c.key(), e.getMessage());
            }
        }
        return new Outcome(added, kept, failed);
    }
}
