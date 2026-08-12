package com.example.demo.modules.portal.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(117)
public class PortalSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(PortalSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public PortalSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 内容分类表
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS portal_category (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(64) NOT NULL COMMENT '分类名称',
                    scope VARCHAR(32) NOT NULL DEFAULT 'ALL' COMMENT '作用域:NEWS/NOTICE/MODEL_RESOURCE/ALL',
                    parent_id BIGINT NULL COMMENT '父分类ID',
                    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
                    status TINYINT NOT NULL DEFAULT 1 COMMENT '0=禁用 1=启用',
                    cover_url VARCHAR(512) NULL COMMENT '分类封面图',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_pc_scope (scope),
                    INDEX idx_pc_parent (parent_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户内容分类'
                """);

            // 统一内容表
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS portal_content (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    content_type VARCHAR(32) NOT NULL COMMENT 'NEWS/NOTICE/MODEL_RESOURCE',
                    category_id BIGINT NULL COMMENT '分类ID',
                    title VARCHAR(256) NOT NULL COMMENT '标题',
                    summary VARCHAR(512) NULL COMMENT '摘要/副标题',
                    cover_url VARCHAR(512) NULL COMMENT '封面图',
                    content_html MEDIUMTEXT NULL COMMENT '富文本正文',
                    extension_json JSON NULL COMMENT '类型专属扩展字段',
                    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
                    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
                    published_at DATETIME NULL COMMENT '发布时间',
                    created_by VARCHAR(64) NULL COMMENT '创建人ID',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否',
                    deleted_time DATETIME NULL COMMENT '删除时间',
                    deleted_by VARCHAR(50) NULL COMMENT '删除人ID',
                    purge_after_time DATETIME NULL COMMENT '计划彻底清理时间',
                    INDEX idx_pc_type_status (content_type, status, sort_order),
                    INDEX idx_pc_published (published_at),
                    INDEX idx_pc_category (category_id),
                    INDEX idx_pc_deleted (deleted)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户统一内容表'
                """);

            // 种子分类数据
            jdbcTemplate.execute("""
                INSERT IGNORE INTO portal_category (id, name, scope, sort_order, status) VALUES
                (1, '文章干货', 'NEWS', 1, 1),
                (2, '通知公告', 'NOTICE', 1, 1),
                (3, '平台更新', 'NOTICE', 2, 1),
                (4, '基因编辑模型', 'MODEL_RESOURCE', 1, 1),
                (5, '免疫缺陷模型', 'MODEL_RESOURCE', 2, 1),
                (6, '人源化模型', 'MODEL_RESOURCE', 3, 1),
                (7, '疾病模型', 'MODEL_RESOURCE', 4, 1),
                (8, '工具鼠与繁殖', 'MODEL_RESOURCE', 5, 1)
                """);

            // 种子 PAGE 类型内容（关于我们 / FAQ / 联系我们 / 服务指南）
            jdbcTemplate.execute("""
                INSERT IGNORE INTO portal_content (id, content_type, title, summary, content_html, status, sort_order, published_at)
                VALUES
                (1001, 'PAGE', '关于我们',
                 '上海交通大学医学院实验动物科学部，占地面积约2,482.72m²，建筑面积17,602m²，设计笼位5.2万，为全国高校单体最大的实验动物设施。',
                 '<h2>依托平台</h2><p>依托胚胎生物技术平台，保有2,122个基因编辑动物品系。坚持临床科研一体化，服务302个课题组及13家附属医院。</p><h2>国际认证</h2><p>全国高校唯一同时拥有CNAS和AAALAC国际认可的实验动物设施。建设有20多个实验动物研究平台。</p><h2>服务范围</h2><p>普通动物饲养品种包括犬、猴、猪、兔、仓鼠、豚鼠、小鼠、大鼠。特殊实验动物品种包括裸鼹鼠、地松鼠等。</p>',
                 'PUBLISHED', 0, NOW()),
                (1002, 'PAGE', '常见问题',
                 '使用帮助与常见问题解答',
                 '<h3>如何申请使用实验动物？</h3><p>请登录实验动物信息化管理平台，进入「动物订购」模块提交申请。首次使用需联系管理办公室开通账号。</p><h3>实验动物的收费标准是什么？</h3><p>收费标准按照品系、饲养级别和服务类型分档。具体费用请查阅平台公示的收费标准表。</p><h3>如何预约使用仪器设备？</h3><p>通过平台「仪器预约」模块在线预约。部分大型设备需提前培训并取得操作资质后方可预约使用。</p><h3>动物房进出有哪些要求？</h3><p>需完成生物安全培训，持有效门禁卡，按SOP要求穿戴防护装备。</p><h3>如何获取基因编辑小鼠模型？</h3><p>可通过平台「模型资源」浏览现有品系并提交使用申请。</p><h3>忘记平台密码怎么办？</h3><p>登录页面点击「忘记密码」，通过绑定邮箱或手机号重置。</p>',
                 'PUBLISHED', 0, NOW()),
                (1003, 'PAGE', '联系我们',
                 '上海市浦东新区 · 上海交通大学医学院实验动物大楼 | 电话：021-XXXX-XXXX | 邮箱：aro@shsmu.edu.cn | 办公时间：周一至周五 8:30—17:00',
                 '<p>如有任何疑问，请通过以下方式联系我们：</p><p>📍 地址：上海市浦东新区 · 上海交通大学医学院实验动物大楼</p><p>📞 电话：021-XXXX-XXXX（工作日 8:30-17:00）</p><p>📧 邮箱：aro@shsmu.edu.cn</p><p>🕐 办公时间：周一至周五 8:30—17:00</p>',
                 'PUBLISHED', 0, NOW()),
                (1004, 'PAGE', '服务指南',
                 '实验动物使用流程与收费标准',
                 '<h2>使用流程</h2><ol><li>提交实验动物使用申请表</li><li>管理办公室审核</li><li>签订使用协议</li><li>办理门禁卡及相关培训</li><li>按计划进行实验</li></ol><h2>收费标准</h2><p>具体费用按照品系、饲养级别和服务类型分档计算，详情请咨询管理办公室或查阅平台公示。</p>',
                 'PUBLISHED', 0, NOW())
                """);

            // 为已有 PAGE 记录补设 extension_json（INSERT IGNORE 不覆盖，用 UPDATE 确保生效）
            jdbcTemplate.execute("""
                UPDATE portal_content SET extension_json = '{"page_key":"about","stats":[{"label":"建筑面积","value":"17,602","unit":"m²"},{"label":"设计笼位","value":"5.2","unit":"万笼"},{"label":"基因编辑品系","value":"2,122","unit":"个"},{"label":"服务课题组","value":"302","unit":"个"}],"sections":[{"heading":"依托平台","body":"依托胚胎生物技术平台，保有2,122个基因编辑动物品系。坚持临床科研一体化，服务302个课题组及13家附属医院。"},{"heading":"国际认证","body":"全国高校唯一同时拥有CNAS和AAALAC国际认可的实验动物设施。建设有20多个实验动物研究平台。"},{"heading":"服务范围","body":"普通动物饲养品种包括犬、猴、猪、兔、仓鼠、豚鼠、小鼠、大鼠。特殊实验动物品种包括裸鼹鼠、地松鼠等。"}]}' WHERE id = 1001 AND content_type = 'PAGE'
                """);
            jdbcTemplate.execute("""
                UPDATE portal_content SET extension_json = '{"page_key":"faq","faqs":[{"question":"如何申请使用实验动物？","answer":"请登录实验动物信息化管理平台，进入「动物订购」模块提交申请。首次使用需联系管理办公室开通账号。"},{"question":"实验动物的收费标准是什么？","answer":"收费标准按照品系、饲养级别和服务类型分档。具体费用请查阅平台公示的收费标准表。"},{"question":"如何预约使用仪器设备？","answer":"通过平台「仪器预约」模块在线预约。部分大型设备需提前培训并取得操作资质后方可预约使用。"},{"question":"动物房进出有哪些要求？","answer":"需完成生物安全培训，持有效门禁卡，按SOP要求穿戴防护装备。"},{"question":"如何获取基因编辑小鼠模型？","answer":"可通过平台「模型资源」浏览现有品系并提交使用申请。"},{"question":"忘记平台密码怎么办？","answer":"登录页面点击「忘记密码」，通过绑定邮箱或手机号重置。"}]}' WHERE id = 1002 AND content_type = 'PAGE'
                """);
            jdbcTemplate.execute("""
                UPDATE portal_content SET extension_json = '{"page_key":"contact","contacts":[{"label":"地址","icon":"MapPin","value":"上海市浦东新区 · 上海交通大学医学院实验动物大楼"},{"label":"电话","icon":"Phone","value":"021-XXXX-XXXX（工作日 8:30-17:00）"},{"label":"邮箱","icon":"Mail","value":"aro@shsmu.edu.cn"},{"label":"办公时间","icon":"Clock","value":"周一至周五 8:30—17:00"}]}' WHERE id = 1003 AND content_type = 'PAGE'
                """);
            jdbcTemplate.execute("""
                UPDATE portal_content SET extension_json = '{"page_key":"service_guide"}' WHERE id = 1004 AND content_type = 'PAGE'
                """);

            log.info("[portal-schema] 门户内容表结构已就绪");
        } catch (Exception e) {
            log.error("[portal-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }
}
