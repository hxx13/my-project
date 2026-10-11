package com.example.demo.modules.ai.bootstrap;

import com.example.demo.modules.ai.tool.AiView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * AI 对话抽屉「能力提示词清单」的初值播种：把这批「用户会怎么问」的卡片写进 {@code ai_capability_prompt}。
 *
 * <p>内容全部取自 {@code tool/pack} 下各 {@code AiToolPack} **真实声明的工具** —— 工具包里没有的能力，
 * 一条都不写（清单是给用户照着点的，写不存在的能力等于骗人）。
 *
 * <p><b>只在「还没播过种」时写</b>：这张表以后归超管维护（可增删改排序），一旦播过就**一个字段都不许改**，
 * 否则管理员改过的标题/排序、删掉的条目，每次重启都会被这里覆盖回来。「播过没有」用
 * {@code sys_system_config} 的 {@link #SEEDED_KEY}（{@code module=ai}）记一笔。三条判定：
 * <ul>
 *   <li>有标记 → 什么都不做（表被清空过也不复活）；</li>
 *   <li>没标记但表非空 → 只补标记，不写条目（说明已有数据，别叠一份）；</li>
 *   <li>没标记且表空 → 写入全部条目 + 落标记。</li>
 * </ul>
 *
 * <p>标记与条目都只**逐键 / 逐条 upsert**，绝不整模块覆盖 —— {@code module=ai} 下还住着
 * {@code ai.prompt.*} 与 {@code ai.copy.*} 的键，整包写会把管理员改过的提示词/文案抹掉。
 */
@Component
@Order(138)
public class AiCapabilityPromptSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AiCapabilityPromptSeed.class);

    public static final String MODULE = "ai";
    /** 播种标记键；值固定 "1"，存在即视为已播。 */
    public static final String SEEDED_KEY = "ai.drawer.capability.seeded";

    record Entry(String groupName, String title, String promptText, String note, int sortOrder, String audience) {
    }

    /**
     * 初值清单。每条对应工具包里真实存在的能力（括号里是工具包 / 工具）：
     * 导航导航 NavToolPack（打开页面 / 页面截图）、动物订购 AnimalOrderToolPack（导出 Excel）、
     * 物资选购 supplies、物资处理 suppliesProcess、笼架查询 cage、门禁流水 debugLog、
     * 环境监测 telemetry、检查维护 facilityMaintenance、人员速查 / 课题组 common、
     * 学生审核 review、定时任务 timer、大屏统计 dashboard、学生活跃度 studentActivity。
     * 排序号即界面顺序，同组相邻。
     *
     * <p><b>选词口径：一条提示词 = 一个「点了就能跑通」的动作</b>。判据来自实测（2026-10-11）：
     * <ul>
     *   <li><b>不许带指代词</b>——「某个人」「这条」「这些东西」点下去必然被反问一轮，用户看到的是
     *       「我点了推荐词，它却问我」。要么写死一个库里有真值的例子（「胶棉拖把」「张鹏」「201A」），
     *       要么把它写成不需要参数的自足问句（「我申领过哪些物资」）。</li>
     *   <li><b>要演示「联动」</b>——查完能接着出选项、出下载、出图：导出订购单会弹「小计怎么配」两枚选项、
     *       提交领用单会挂「确认执行」、截图会真把图贴回对话。这类一条顶十条纯查询。</li>
     *   <li><b>不许写够不到的能力</b>——见下。</li>
     * </ul>
     *
     * <p><b>audience 现在表达两件事</b>：视角（{@code STAFF} / {@code STUDENT}）与角色档
     * （{@code ADMIN} / {@code SUPER_ADMIN}，见 {@code AiDrawerContentService#visibleTo}）。
     * 角色档是这一轮补的：工具能不能注入由各工具包的 {@code capabilities()} 按 {@code RoleEnum} 分档，
     * 而清单原先只能写「教职工都看得见」—— 于是「长期归档」「申领审计导出」这类 ADMIN 档的条目
     * 铺给了普通教职工，点了只会被回一句「不在我这轮范围」（实测踩过）。
     *
     * <p><b>角色档只写「闸门就是角色」的条目</b>。若闸门是**业务标签 / 区域 / 服务端判定**
     * （培训管理端的 canManage、订购审核的业务标签），{@code ADMIN} 也表达不了那件事 ——
     * 这种条目一条都不写，宁可少列。闸门是「角色 **或** 某个身份」的（笼位认领的 canApprove =
     * 角色≥ADMIN 或 PI）可以写：那个身份的人看不到这条建议，只是少一条推荐，不会出现「点了办不到」。
     *
     * <p>学生视角今天拿不到任何工具包（{@code AiToolPack#views()} 默认只给教职工），所以一律标
     * {@link AiView#STAFF}；等学生侧工具包落地后再按包声明放行。
     */
    static final List<Entry> ENTRIES = List.of(
            // ── 快捷操作 ──
            new Entry("快捷操作", "打开页面", "帮我打开「笼架信息」页面", "跳到某个后台页面，省得自己找入口", 10, "STAFF"),
            new Entry("快捷操作", "页面截图", "截一张「动物订购审核」页面的图给我", "把某个后台页面截成图贴在对话里，不用自己截屏", 20, "STAFF"),
            new Entry("快捷操作", "导出订购单", "把动物订购单导出成 Excel", "导出订购单表格，小计保留哪几级自己挑", 30, "STAFF"),
            new Entry("快捷操作", "下载领用单", "把我那张物资领用单下载成 PDF", "拿到自己领用单的 PDF，可直接打印", 40, "STAFF"),
            // ── 物资申领与选购 ──
            new Entry("物资申领与选购", "商城库存", "现在商城有哪些物资？库存还剩多少？", "看商城有什么货、各剩多少", 100, "STAFF"),
            new Entry("物资申领与选购", "库存预警", "哪些物资库存快没了？", "挑出快没货的物资，用来决定补什么", 110, "STAFF"),
            new Entry("物资申领与选购", "加入购物车", "帮我把 5 个胶棉拖把加进购物车", "把东西放进领用购物车（还没提交）", 120, "STAFF"),
            new Entry("物资申领与选购", "提交领用单", "把购物车里的东西提交成一张领用单", "开一张领用单，提交前会让你确认", 130, "STAFF"),
            new Entry("物资申领与选购", "待出库领用单", "有哪些物资领用单还没出库？", "看有哪些领用单等着出库", 140, "STAFF"),
            new Entry("物资申领与选购", "消耗与补货", "最近一个月哪些物资消耗最快？该补什么货？", "按消耗速度排，给出还够撑几天（默认看最近 30 天）", 150, "STAFF"),
            new Entry("物资申领与选购", "谁领得最多", "最近一个月谁领物资最多？", "按人排出领用件数（默认看最近 30 天）", 160, "STAFF"),
            new Entry("物资申领与选购", "物资出入库流水", "胶棉拖把最近一个月的出入库流水给我看看", "看某件物资谁领走、什么时候进的", 170, "STAFF"),
            // ── 笼位与实验 ──
            new Entry("笼位与实验", "房间目录", "笼架有哪些房间？", "按校区 / 区域 / 楼层列出笼架房间", 200, "STAFF"),
            // ── 门禁与通行 ──
            new Entry("门禁与通行", "我的刷卡记录", "查一下我今天刷了哪些门", "查自己今天的门禁进出记录", 300, "STAFF"),
            new Entry("门禁与通行", "门禁记录汇总", "把这周的门禁记录按人汇总一下", "按人汇总一段时间里的进出次数", 310, "STAFF"),
            new Entry("门禁与通行", "刷卡失败", "这周谁刷卡失败过？", "汇总非法刷卡的人与次数", 320, "STAFF"),
            new Entry("门禁与通行", "在楼滞留", "现在还有谁在楼里没走？", "看当前在楼 / 可能滞留的人", 330, "STAFF"),
            new Entry("门禁与通行", "实时流水", "刚刚谁刷卡进来了？", "看最近几条进出流水", 340, "STAFF"),
            // ── 环境与遥测 ──
            new Entry("环境与遥测", "环境点位当前值", "现在各环境监测点的温湿度是多少？有没有越限？", "看各区温湿度当前值，越限的会标出来", 400, "STAFF"),
            new Entry("环境与遥测", "点位历史曲线", "帮我看下 201A 最近的历史曲线", "看某个点位一段时间的最高 / 最低 / 平均", 410, "STAFF"),
            // ── 检查维护 ──
            new Entry("检查维护", "耗材用量排行", "最近半年哪些机房耗材用得最多？", "按机房排出耗材用量顺序", 500, "STAFF"),
            new Entry("检查维护", "过滤网更换记录", "各机房最近一次换过滤网是什么时候？", "看每个机房上次换过滤网的时间", 510, "STAFF"),
            new Entry("检查维护", "机房耗材台账", "B1F-A区机房最近半年用了哪些耗材？", "按机房查耗材登记台账", 520, "STAFF"),
            // ── 人员与课题组 ──
            new Entry("人员与课题组", "查人找工号", "帮我查一下张鹏的工号", "按姓名找人，拿到工号与所属课题组", 600, "STAFF"),
            new Entry("人员与课题组", "课题组成员", "张鹏课题组有哪些人？", "列出某个课题组的成员名单", 610, "STAFF"),
            // ── 统计概览 ──
            new Entry("统计概览", "今日进出人次", "今天实验室有多少人进出？", "看今天两校区的进出人次与高峰时段", 700, "STAFF"),
            new Entry("统计概览", "课题组活跃排行", "哪个课题组最活跃？", "按进出活跃度给课题组排名", 710, "STAFF"),
            new Entry("统计概览", "课题组活跃度", "上周哪个课题组最活跃？", "带区间的课题组活跃度排行（区间必须写进正文，不写必被反问）", 720, "STAFF"),
            // ── 我的记录 ──
            new Entry("我的记录", "我的领用单", "我申领过哪些物资？办到哪一步了？", "看自己申领过的单子与进度", 800, "STAFF"),
            new Entry("我的记录", "我的购物车", "帮我看看领用购物车里有什么", "看领用购物车里现在有什么", 810, "STAFF"),
            new Entry("我的记录", "我的待审", "有哪些物资申领和延迟免冻要我审？", "看等着自己审的单子", 820, "STAFF"),
            new Entry("我的记录", "我的定时任务", "我设了哪些定时任务？", "看自己设过的定时提醒与执行结果", 830, "STAFF"),
            new Entry("我的记录", "定时提醒", "过 10 分钟提醒我看看待审的物资申领", "到点让助手替你做一件事", 840, "STAFF"),
            // ── 管理员 ──
            new Entry("管理员", "学生领用导出", "把这个月学生课题组的物资申领导出成 Excel", "导出学生课题组那一侧的物资申领（与「下载领用单」不是一回事）", 900, "ADMIN"),
            new Entry("管理员", "长期归档变量", "长期归档里都选了哪些变量？", "看长期归档采了哪些变量、什么顺序", 910, "ADMIN"),
            new Entry("管理员", "导出长期归档", "把长期归档最近 7 天的数据导成 Excel", "把长期归档的采样导成 Excel 表格", 920, "ADMIN"),
            new Entry("管理员", "长期归档可导出日期", "长期归档哪些天可以导出？", "列出有采样数据的日期", 925, "ADMIN"),
            new Entry("管理员", "免冻名单", "现在谁开了免冻？在哪些房间？", "看当前生效的门禁免冻名单", 930, "ADMIN"),
            new Entry("管理员", "物品库存预警", "哪些物品库存快没了？", "挑出物品管理里快没货的物品", 940, "ADMIN"),
            new Entry("管理员", "物品审核人名单", "新建物品的审核人有哪些可选？", "看可选审核人名单", 945, "ADMIN"),
            new Entry("管理员", "笼位认领待审", "有哪些笼位认领要我审？", "看负责范围内待审的笼位认领单", 950, "ADMIN"),
            new Entry("管理员", "分笼转移待审", "有哪些分笼或转移要我审？", "看负责范围内待审的分笼 / 转移单", 960, "ADMIN"),
            new Entry("管理员", "物品回收站", "哪些物品在回收站里？", "看被删掉的物品，可恢复", 970, "ADMIN"),
            new Entry("管理员", "门禁通道查询", "门禁通道里名字带「大厅」的有哪些？", "按名字查门禁通道，看是否在线", 980, "SUPER_ADMIN"),
            new Entry("管理员", "人员档案", "现在还有多少人没发教职工账号？", "按条件统计人员，比如还没发教职工账号的", 990, "SUPER_ADMIN"),
            new Entry("管理员", "培训报名待审", "有哪些培训报名要我处理？", "看等着自己审批或评分的培训报名", 1000, "SUPER_ADMIN"));

    private final AiCopyConfigStore configStore;
    private final AiCapabilityPromptSeedStore capabilityStore;

    public AiCapabilityPromptSeed(AiCopyConfigStore configStore,
                                  AiCapabilityPromptSeedStore capabilityStore) {
        this.configStore = configStore;
        this.capabilityStore = capabilityStore;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (configStore.readValues(MODULE).containsKey(SEEDED_KEY)) {
                return; // 已播过：一个字段都不改
            }
            if (capabilityStore.countAll() > 0) {
                configStore.upsertValue(MODULE, SEEDED_KEY, "1");
                log.info("[ai-drawer-capability] 表已有条目但无标记，只补标记，不写初值");
                return;
            }
            for (Entry e : ENTRIES) {
                capabilityStore.insert(e.groupName(), e.title(), e.promptText(), e.note(), e.sortOrder(), e.audience());
            }
            configStore.upsertValue(MODULE, SEEDED_KEY, "1");
            log.info("[ai-drawer-capability] 首次播种 {} 条能力提示词", ENTRIES.size());
        } catch (Exception e) {
            log.warn("[ai-drawer-capability] 能力提示词播种跳过: {}", e.getMessage());
        }
    }
}
