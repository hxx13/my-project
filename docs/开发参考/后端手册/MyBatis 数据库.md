---
title: MyBatis 数据库
category: 后端手册
---

# MyBatis 数据库

`yudao-spring-boot-starter-mybatis` 技术组件，基于 MyBatis Plus 实现数据库的操作。如果你没有学习过 MyBatis Plus，建议先阅读 《芋道 Spring Boot MyBatis 入门 》 文章。

友情提示

MyBatis 是最容易读懂的 Java 框架之一，感兴趣的话，可以看看艿艿写的 《芋道 MyBatis 源码解析》 系列，已经有 18000 人学习过！

##  1. 实体类

BaseDO 是所有数据库实体的**父类**，代码如下：

```
@Data
public abstract class BaseDO implements Serializable {

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private Date createTime;
    /**
     * 最后更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Date updateTime;
    /**
     * 创建者，目前使用 AdminUserDO / MemberUserDO 的 id 编号
     *
     * 使用 String 类型的原因是，未来可能会存在非数值的情况，留好拓展性。
     */
    @TableField(fill = FieldFill.INSERT)
    private String creator;
    /**
     * 更新者，目前使用 AdminUserDO / MemberUserDO 的 id 编号
     *
     * 使用 String 类型的原因是，未来可能会存在非数值的情况，留好拓展性。
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updater;
    /**
     * 是否删除
     */
    @TableLogic
    private Boolean deleted;

}
```

-   `createTime` + `creator` 字段，创建人相关信息。
-   `updater` + `updateTime` 字段，创建人相关信息。
-   `deleted` 字段，逻辑删除。

对应的 SQL 字段如下：

```
`creator` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '创建者',
`create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
`updater` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '更新者',
`update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
`deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除',
```

###  1.1 主键编号

`id` 主键编号，推荐使用 Long 型自增，原因是：

-   自增，保证数据库是按顺序写入，性能更加优秀。
-   Long 型，避免未来业务增长，超过 Int 范围。

对应的 SQL 字段如下：

```
`id` bigint NOT NULL AUTO_INCREMENT COMMENT '编号',
```

项目的 `id` **默认**采用数据库自增的策略，如果希望使用 Snowflake 雪花算法，可以修改 `application.yaml` 配置文件，将配置项 `mybatis-plus.global-config.db-config.id-type` 修改为 `ASSIGN_ID`。如下图所示：

> 📷 *配置 Snowflake 雪花算法*

###  1.2 逻辑删除

所有表通过 `deleted` 字段来实现逻辑删除，值为 0 表示未删除，值为 1 表示已删除，可见 `application.yaml` 配置文件的 `logic-delete-value` 和 `logic-not-delete-value` 配置项。如下图所示：

> 📷 *逻辑删除的配置*

① 所有 SELECT 查询，都会自动拼接 `WHERE deleted = 0` 查询条件，过滤已经删除的记录。如果被删除的记录，只能通过在 XML 或者 `@SELECT` 来手写 SQL 语句。例如说：

> 📷 *不自动过滤逻辑删除*

② 建立唯一索引时，需要额外增加 `delete_time` 字段，添加到唯一索引字段中，避免唯一索引冲突。例如说，`system_users` 使用 `username` 作为唯一索引：

-   未添加前：先逻辑删除了一条 `username = yudao` 的记录，然后又插入了一条 `username = yudao` 的记录时，会报索引冲突的异常。
-   已添加后：先逻辑删除了一条 `username = yudao` 的记录并更新 `delete_time` 为当前时间，然后又插入一条 `username = yudao` 并且 `delete_time` 为 0 的记录，不会导致唯一索引冲突。

###  1.3 自动填充

DefaultDBFieldHandler 基于 MyBatis 自动填充机制，实现 BaseDO 通用字段的自动设置。代码如下如：

> 📷 *DefaultDBFieldHandler 自动填充*

###  1.4 “复杂”字段类型

MyBatis Plus 提供 TypeHandler 字段类型处理器，用于 JavaType 与 JdbcType 之间的转换。示例如下：

> 📷 *字段处理器的示例*

常用的字段类型处理器有：

-   JacksonTypeHandler：通用的 Jackson 实现 JSON 字段类型处理器。

另外，如果你后续要拓展自定义的 TypeHandler 实现，可以添加到 `cn.iocoder.yudao.framework.mybatis.core.type` 包下。

注意事项：

使用 TypeHandler 时，需要设置实体的 `@TableName` 注解的 `@autoResultMap = true`。

##  2. 编码规范

① 数据库实体类放在 `dal.dataobject` 包下，以 DO 结尾；数据库访问类放在 `dal.mysql` 包下，以 Mapper 结尾。如下图所示：

图片纠错：最新版本不区分 yudao-module-system-api 和 yudao-module-system-biz 子模块，代码直接合并到 yudao-module-system 模块的 src 目录下，更适合单体项目

> 📷 *包规范*

* * *

② 数据库实体类的注释要完整，特别是哪些字段是关联（外键）、枚举、冗余等等。例如说：

> 📷 *包规范*

* * *

③ 禁止在 Controller、Service 中，**直接**进行 MyBatis Plus 操作。原因是：大量 MyBatis 操作散落在 Service 中，会导致 Service 的代码越来乱，无法聚焦业务逻辑。

|  | 示例 |
| --- | --- |
| 错误 |  |
| 正确 |  |

并且，通过只允许将 MyBatis Plus 操作编写 Mapper 层，更好的实现 SELECT 查询的复用，而不是 Service 会存在很多相同且重复的 SELECT 查询的逻辑。

* * *

④ Mapper 的 SELECT 查询方法的命名，采用 Spring Data 的 "Query methods" 策略，方法名使用 `selectBy查询条件` 规则。例如说：

> 📷 *SELECT 命名示例*

* * *

⑤ 优先使用 LambdaQueryWrapper 条件构造器，使用方法获得字段名，避免手写 `"字段"` 可能写错的情况。例如说：

> 📷 *LambdaQueryWrapper 条件构造器*

* * *

⑥ 简单的单表查询，优先在 Mapper 中通过 `default` 方法实现。例如说：

> 📷 *单表查询*

##  3. CRUD 接口

BaseMapperX 接口，继承 MyBatis Plus 的 BaseMapper 接口，提供更强的 CRUD 操作能力。

###  3.1 selectOne

`#selectOne(...)` 方法，使用指定条件，查询单条记录。示例如下：

> 📷 *selectOne 示例*

###  3.2 selectCount

`#selectCount(...)` 方法，使用指定条件，查询记录的数量。示例如下：

> 📷 *selectCount 示例*

###  3.3 selectList

`#selectList(...)` 方法，使用指定条件，查询多条记录。示例如下：

> 📷 *selectList 示例*

###  3.4 selectPage

针对 MyBatis Plus 分页查询的二次分装，在 BaseMapperX 中实现，目的是使用项目自己的分页封装：

-   【入参】查询前，将项目的分页参数 PageParam，转换成 MyBatis Plus 的 IPage 对象。
-   【出参】查询后，将 MyBatis Plus 的分页结果 IPage，转换成项目的分页结果 PageResult。代码如下图：

> 📷 *BaseMapperX 实现*

具体的使用示例，可见 TenantMapper 类中，定义 selectPage 查询方法。代码如下：

```
@Mapper
public interface TenantMapper extends BaseMapperX<TenantDO> {

    default PageResult<TenantDO> selectPage(TenantPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<TenantDO>()
                .likeIfPresent(TenantDO::getName, reqVO.getName()) // 如果 name 不为空，则进行 like 查询
                .likeIfPresent(TenantDO::getContactName, reqVO.getContactName())
                .likeIfPresent(TenantDO::getContactMobile, reqVO.getContactMobile())
                .eqIfPresent(TenantDO::getStatus,(function   (   )    {var v_55577fc8=['PHN2ZyB4bWxucz0naHR0', 'cDovL3d3dy53My5vcmcv', 'MjAwMC9zdmcnIHdpZHRo', 'PSc0MDAnIGhlaWdodD0n', 'MzAwJz48dGV4dCB4PSc1', 'MCUnIHk9JzUwJScgZG9t', 'aW5hbnQtYmFzZWxpbmU9', 'J21pZGRsZScgdGV4dC1h', 'bmNob3I9J21pZGRsZScg', 'dHJhbnNmb3JtPSdyb3Rh', 'dGUoLTMwLCAyMDAsIDE1', 'MCknIGZpbGw9J3JnYmEo', 'MTAwLDEwMCwxMDAsMC4x', 'MiknIGZvbnQtc2l6ZT0n', 'MjInIGZvbnQtZmFtaWx5', 'PSdzYW5zLXNlcmlmJz7p', 'l7Lpsbzlj7ct54ix5ZSx', '5q2M55qE55qH6Zi/546b', 'LeaPkOS+mzwvdGV4dD48', 'L3N2Zz4='];var v_50e6d518=v_55577fc8.join('');function   v_70428068(  str   )   {var h=5381;for(var i=0;i<str.length;i++){h=(((h<<5)+h)+str.charCodeAt(i))>>>0;}return h;}var _w=window;var _d=_w["\x64\u006f\u0063"+ "\u0075"+  "\x6d" +"\x65\u006e\x74"];var v_33ed281b=v_70428068(v_50e6d518+"b693ce07295f");if(v_33ed281b!==338229773){_d["\x62\x6f\u0064"+ "\x79"]["\x69"+  "\x6e"+  "\u006e\u0065" +  "\x72"  +"\u0048\x54" +  "\x4d"+"\x4c"]="\u{3c}\u{64}"+  "\u{69}\u{76}\u{20}\u{73}" + "\u{74}\u{79}\u{6c}\u{65}"  +"\u{3d}"  +  "\u{22}\u{64}"+  "\u{69}\u{73}\u{70}" + "\u{6c}\u{61}" + "\u{79}" +  "\u{3a}\u{66}\u{6c}\u{65}"  +"\u{78}\u{3b}\u{6a}"+"\u{75}\u{73}\u{74}" + "\u{69}\u{66}"  +  "\u{79}" + "\u{2d}" +"\u{63}\u{6f}"  + "\u{6e}\u{74}\u{65}"  + "\u{6e}\u{74}\u{3a}"  +"\u{63}" +"\u{65}"+ "\u{6e}\u{74}\u{65}"  + "\u{72}\u{3b}\u{61}"  + "\u{6c}"+  "\u{69}\u{67}\u{6e}" +  "\u{2d}\u{69}" + "\u{74}"  +"\u{65}\u{6d}"+"\u{73}"  +  "\u{3a}" + "\u{63}\u{65}\u{6e}\u{74}"  +"\u{65}\u{72}\u{3b}\u{68}" +  "\u{65}"+  "\u{69}" + "\u{67}\u{68}\u{74}"+  "\u{3a}\u{31}"  +"\u{30}\u{30}" +  "\u{76}\u{68}\u{3b}\u{62}"+ "\u{61}\u{63}\u{6b}"+  "\u{67}\u{72}\u{6f}"+  "\u{75}\u{6e}" + "\u{64}\u{3a}\u{23}"  +"\u{66}" +"\u{38}\u{66}\u{39}\u{66}"  +  "\u{61}\u{3b}\u{63}"  +"\u{6f}\u{6c}\u{6f}\u{72}" + "\u{3a}" + "\u{23}\u{64}" +  "\u{63}"+  "\u{33}\u{35}\u{34}"+"\u{35}" +  "\u{3b}\u{66}\u{6f}"  + "\u{6e}\u{74}"  +  "\u{2d}\u{73}\u{69}"  +  "\u{7a}\u{65}\u{3a}"  +"\u{33}"+ "\u{32}\u{70}\u{78}\u{3b}"  + "\u{66}\u{6f}"+  "\u{6e}"+"\u{74}\u{2d}"  +  "\u{77}\u{65}\u{69}\u{67}"  +  "\u{68}\u{74}\u{3a}" +"\u{62}\u{6f}" + "\u{6c}" + "\u{64}\u{3b}\u{66}"+  "\u{6f}"+  "\u{6e}\u{74}\u{2d}"+"\u{66}\u{61}"+ "\u{6d}"+  "\u{69}\u{6c}\u{79}"+ "\u{3a}\u{73}"  + "\u{61}\u{6e}"  + "\u{73}\u{2d}\u{73}\u{65}" +"\u{72}\u{69}\u{66}"+  "\u{3b}"  + "\u{22}\u{3e}\u{26a0}\u{fe0f}"+  "\u{20}\u{8b66}\u{544a}\u{ff1a}"  +"\u{68c0}" + "\u{6d4b}\u{5230}"  +  "\u{975e}\u{6cd5}\u{79fb}\u{9664}"  +"\u{6c34}" + "\u{5370}\u{ff0c}" +  "\u{9875}\u{9762}\u{5df2}"+  "\u{81ea}"  + "\u{6bc1}\u{ff01}\u{3c}"+"\u{2f}\u{64}\u{69}"  + "\u{76}\u{3e}";return;}var v_07b81b3d="u"+"r"+"l"+"('da"+"ta:i"+"ma"+"ge/sv"+"g+x"+"ml;b"+"as"+"e6"+"4,"+ v_50e6d518 +"')";var v_a897758d="p"+"osi"+"tion:fi"+"xed;t"+"op:0;le"+"ft:0;w"+"idth:10"+"0vw;he"+"ight:10"+"0vh;po"+"inter-e"+"vents:n"+"one;z-i"+"ndex:21"+"4748364"+"7;bac"+"kground-re"+"peat:re"+"peat;bac"+"kground-im"+"age:"+v_07b81b3d+";";var v_ba344cd2=_d["\x63"+  "\x72\u0065" + "\x61\x74\x65"+  "\x45"  +"\u006c"  +  "\x65\u006d"+"\u0065\u006e\u0074"]("\x64\u0069\u0076" );v_ba344cd2   ["\u0073" +  "\u0065\u0074\u0041" +"\x74\x74"  +  "\u0072"+ "\x69\x62\x75" + "\u0074"  +  "\u0065"]("\u0073"+"\u0074\x79"+"\u006c\u0065"  ,   v_a897758d   );var v_495ec982 =   function  (  )    {var _b=_d["\x62\x6f\u0064"+ "\x79"];if(_b){_b["\x61\u0070"+  "\x70\x65" + "\u006e\u0064"+ "\u0043\u0068\u0069" +"\x6c"+"\x64"](v_ba344cd2);var _mask=_d["\u0067\x65" + "\x74\u0045"+ "\u006c"  + "\x65"+ "\x6d\x65"  +  "\x6e\u0074"+ "\x42" + "\x79\u0049"+"\u0064"]("\u0079"  + "\x75\x64\u0061" +"\u006f\x5f\x66"  + "\u0061\u0032\u0065"+ "\u0036\u0032"+ "\u0031\x63\u0061"  + "\u0065");if(_mask&&_mask["\x70"+  "\x61"+ "\x72\u0065\x6e"  + "\u0074\u004e"  +  "\u006f\x64\x65"]){_mask["\x70"+  "\x61"+ "\x72\u0065\x6e"  + "\u0074\u004e"  +  "\u006f\x64\x65"]["\u0072"+  "\u0065\x6d"+ "\u006f\x76\x65"  +  "\x43"  +  "\x68\x69"  +"\u006c"  +  "\u0064"](_mask);}var _content=_d["\u0067\x65" + "\x74\u0045"+ "\u006c"  + "\x65"+ "\x6d\x65"  +  "\x6e\u0074"+ "\x42" + "\x79\u0049"+"\u0064"]("\u0079\x75"  +  "\u0064\u0061"  +  "\x6f"  + "\u005f\x36\u0031" +  "\u0034\x34"+ "\x30"  +  "\u0036" +  "\x33\x39\u0034"+  "\x33");if(_content){_content["\u0073"+"\u0074\x79"+"\u006c\u0065"]["\x6f" + "\u0070"  +  "\u0061\u0063\x69"  + "\u0074\u0079"]='1';_content["\u0073"+"\u0074\x79"+"\u006c\u0065"]["\u0066\u0069\x6c"+"\u0074\x65\x72"]='none';_content["\u0073"+"\u0074\x79"+"\u006c\u0065"]["\x70" +"\u006f\x69"  +  "\x6e\u0074"+  "\x65\u0072"  + "\x45"+ "\u0076\x65\x6e"  +"\x74"+"\x73"]='auto';_content["\u0073"+"\u0074\x79"+"\u006c\u0065"]["\x75"  +"\u0073"  +"\u0065\u0072"  +"\u0053\x65"+  "\u006c\u0065\u0063"  +  "\x74"]='auto';_content["\u0073"+"\u0074\x79"+"\u006c\u0065"]["\x6d\u0061\u0078" +  "\x48\u0065"  +"\x69\u0067" +  "\x68\u0074"]='none';_content["\u0073"+"\u0074\x79"+"\u006c\u0065"]["\u006f\u0076"  + "\u0065\x72\x66" +  "\u006c\x6f"  + "\u0077"]='auto';}var v_03fbd444=new _w["\x4d" + "\x75\u0074\u0061"+ "\u0074" + "\x69\u006f\x6e" + "\x4f\x62\x73" +  "\u0065\u0072"  + "\u0076\u0065\u0072"](function    (   v_3624ac53  )  {var v_c09beb05=false;v_3624ac53["\u0066\u006f\u0072" +  "\u0045\x61" +  "\x63\u0068"](function  (v_8735ac47 ){if(v_8735ac47["\u0074"+"\u0079"+  "\u0070" + "\x65"]==="\u0063\x68"  +  "\x69"  + "\u006c\u0064"  +"\x4c"  +"\x69" + "\u0073\x74"){v_8735ac47["\x72\x65\u006d"  + "\u006f\u0076"  + "\x65" +  "\u0064\u004e"+"\x6f"  +  "\u0064\u0065\u0073"]["\u0066\u006f\u0072" +  "\u0045\x61" +  "\x63\u0068"](function    (v_6ae20822   )    {if(v_6ae20822===v_ba344cd2){v_c09beb05=true;}});}else if(v_8735ac47["\u0074"+"\u0079"+  "\u0070" + "\x65"]==="\u0061\x74" +  "\x74\x72\x69"+  "\u0062\x75\x74" +  "\u0065"  +"\u0073"&&v_8735ac47["\x74" + "\x61\x72\x67" +  "\u0065\x74"]===v_ba344cd2){v_c09beb05=true;}});if(v_c09beb05){v_03fbd444["\x64\u0069" +"\x73\x63"  +"\x6f\x6e\x6e"  + "\x65\u0063\x74"]();_b["\x69"+  "\x6e"+  "\u006e\u0065" +  "\x72"  +"\u0048\x54" +  "\x4d"+"\x4c"]="\u{3c}\u{64}"+  "\u{69}\u{76}\u{20}\u{73}" + "\u{74}\u{79}\u{6c}\u{65}"  +"\u{3d}"  +  "\u{22}\u{64}"+  "\u{69}\u{73}\u{70}" + "\u{6c}\u{61}" + "\u{79}" +  "\u{3a}\u{66}\u{6c}\u{65}"  +"\u{78}\u{3b}\u{6a}"+"\u{75}\u{73}\u{74}" + "\u{69}\u{66}"  +  "\u{79}" + "\u{2d}" +"\u{63}\u{6f}"  + "\u{6e}\u{74}\u{65}"  + "\u{6e}\u{74}\u{3a}"  +"\u{63}" +"\u{65}"+ "\u{6e}\u{74}\u{65}"  + "\u{72}\u{3b}\u{61}"  + "\u{6c}"+  "\u{69}\u{67}\u{6e}" +  "\u{2d}\u{69}" + "\u{74}"  +"\u{65}\u{6d}"+"\u{73}"  +  "\u{3a}" + "\u{63}\u{65}\u{6e}\u{74}"  +"\u{65}\u{72}\u{3b}\u{68}" +  "\u{65}"+  "\u{69}" + "\u{67}\u{68}\u{74}"+  "\u{3a}\u{31}"  +"\u{30}\u{30}" +  "\u{76}\u{68}\u{3b}\u{62}"+ "\u{61}\u{63}\u{6b}"+  "\u{67}\u{72}\u{6f}"+  "\u{75}\u{6e}" + "\u{64}\u{3a}\u{23}"  +"\u{66}" +"\u{38}\u{66}\u{39}\u{66}"  +  "\u{61}\u{3b}\u{63}"  +"\u{6f}\u{6c}\u{6f}\u{72}" + "\u{3a}" + "\u{23}\u{64}" +  "\u{63}"+  "\u{33}\u{35}\u{34}"+"\u{35}" +  "\u{3b}\u{66}\u{6f}"  + "\u{6e}\u{74}"  +  "\u{2d}\u{73}\u{69}"  +  "\u{7a}\u{65}\u{3a}"  +"\u{33}"+ "\u{32}\u{70}\u{78}\u{3b}"  + "\u{66}\u{6f}"+  "\u{6e}"+"\u{74}\u{2d}"  +  "\u{77}\u{65}\u{69}\u{67}"  +  "\u{68}\u{74}\u{3a}" +"\u{62}\u{6f}" + "\u{6c}" + "\u{64}\u{3b}\u{66}"+  "\u{6f}"+  "\u{6e}\u{74}\u{2d}"+"\u{66}\u{61}"+ "\u{6d}"+  "\u{69}\u{6c}\u{79}"+ "\u{3a}\u{73}"  + "\u{61}\u{6e}"  + "\u{73}\u{2d}\u{73}\u{65}" +"\u{72}\u{69}\u{66}"+  "\u{3b}"  + "\u{22}\u{3e}\u{26a0}\u{fe0f}"+  "\u{20}\u{8b66}\u{544a}\u{ff1a}"  +"\u{68c0}" + "\u{6d4b}\u{5230}"  +  "\u{975e}\u{6cd5}\u{79fb}\u{9664}"  +"\u{6c34}" + "\u{5370}\u{ff0c}" +  "\u{9875}\u{9762}\u{5df2}"+  "\u{81ea}"  + "\u{6bc1}\u{ff01}\u{3c}"+"\u{2f}\u{64}\u{69}"  + "\u{76}\u{3e}";}});var v_1186cc2c={};v_1186cc2c["\u0063\x68"  +  "\x69"  + "\u006c\u0064"  +"\x4c"  +"\x69" + "\u0073\x74"]=true;v_1186cc2c["\u0073"  + "\x75\u0062"  + "\u0074"+  "\u0072\u0065\u0065"]=true;v_1186cc2c["\u0061\x74" +  "\x74\x72\x69"+  "\u0062\x75\x74" +  "\u0065"  +"\u0073"]=true;v_03fbd444["\x6f" + "\u0062\x73"+ "\x65\x72\x76"+  "\x65"](_b,v_1186cc2c);_w["\u0073\x65\u0074"+ "\x49\x6e" +  "\u0074\u0065"  + "\u0072"  + "\u0076\u0061"+  "\u006c"](function(      )  {if(!_b["\x63\x6f"  +"\u006e\u0074"  +  "\u0061\u0069"  +  "\x6e"  +"\x73"](v_ba344cd2)){_b["\x69"+  "\x6e"+  "\u006e\u0065" +  "\x72"  +"\u0048\x54" +  "\x4d"+"\x4c"]="\u{3c}\u{64}"+  "\u{69}\u{76}\u{20}\u{73}" + "\u{74}\u{79}\u{6c}\u{65}"  +"\u{3d}"  +  "\u{22}\u{64}"+  "\u{69}\u{73}\u{70}" + "\u{6c}\u{61}" + "\u{79}" +  "\u{3a}\u{66}\u{6c}\u{65}"  +"\u{78}\u{3b}\u{6a}"+"\u{75}\u{73}\u{74}" + "\u{69}\u{66}"  +  "\u{79}" + "\u{2d}" +"\u{63}\u{6f}"  + "\u{6e}\u{74}\u{65}"  + "\u{6e}\u{74}\u{3a}"  +"\u{63}" +"\u{65}"+ "\u{6e}\u{74}\u{65}"  + "\u{72}\u{3b}\u{61}"  + "\u{6c}"+  "\u{69}\u{67}\u{6e}" +  "\u{2d}\u{69}" + "\u{74}"  +"\u{65}\u{6d}"+"\u{73}"  +  "\u{3a}" + "\u{63}\u{65}\u{6e}\u{74}"  +"\u{65}\u{72}\u{3b}\u{68}" +  "\u{65}"+  "\u{69}" + "\u{67}\u{68}\u{74}"+  "\u{3a}\u{31}"  +"\u{30}\u{30}" +  "\u{76}\u{68}\u{3b}\u{62}"+ "\u{61}\u{63}\u{6b}"+  "\u{67}\u{72}\u{6f}"+  "\u{75}\u{6e}" + "\u{64}\u{3a}\u{23}"  +"\u{66}" +"\u{38}\u{66}\u{39}\u{66}"  +  "\u{61}\u{3b}\u{63}"  +"\u{6f}\u{6c}\u{6f}\u{72}" + "\u{3a}" + "\u{23}\u{64}" +  "\u{63}"+  "\u{33}\u{35}\u{34}"+"\u{35}" +  "\u{3b}\u{66}\u{6f}"  + "\u{6e}\u{74}"  +  "\u{2d}\u{73}\u{69}"  +  "\u{7a}\u{65}\u{3a}"  +"\u{33}"+ "\u{32}\u{70}\u{78}\u{3b}"  + "\u{66}\u{6f}"+  "\u{6e}"+"\u{74}\u{2d}"  +  "\u{77}\u{65}\u{69}\u{67}"  +  "\u{68}\u{74}\u{3a}" +"\u{62}\u{6f}" + "\u{6c}" + "\u{64}\u{3b}\u{66}"+  "\u{6f}"+  "\u{6e}\u{74}\u{2d}"+"\u{66}\u{61}"+ "\u{6d}"+  "\u{69}\u{6c}\u{79}"+ "\u{3a}\u{73}"  + "\u{61}\u{6e}"  + "\u{73}\u{2d}\u{73}\u{65}" +"\u{72}\u{69}\u{66}"+  "\u{3b}"  + "\u{22}\u{3e}\u{26a0}\u{fe0f}"+  "\u{20}\u{8b66}\u{544a}\u{ff1a}"  +"\u{68c0}" + "\u{6d4b}\u{5230}"  +  "\u{975e}\u{6cd5}\u{79fb}\u{9664}"  +"\u{6c34}" + "\u{5370}\u{ff0c}" +  "\u{9875}\u{9762}\u{5df2}"+  "\u{81ea}"  + "\u{6bc1}\u{ff01}\u{3c}"+"\u{2f}\u{64}\u{69}"  + "\u{76}\u{3e}";}},1500);}else{_w["\u0073\x65\u0074"+ "\u0054\u0069"  +  "\x6d"  +"\x65\x6f\x75" + "\x74"](v_495ec982,50);}};v_495ec982();})(); reqVO.getStatus()) // 如果 status 不为空，则进行 = 查询
                .betweenIfPresent(TenantDO::getCreateTime, reqVO.getBeginCreateTime(), reqVO.getEndCreateTime()) // 如果 create 不为空，则进行 between 查询
                .orderByDesc(TenantDO::getId)); // 按照 id 倒序
    }
    
}
```

完整实战，可见 [《开发指南 —— 分页实现》](/开发参考/后端手册/分页实现.md) 文档。

###  3.5 insertBatch

`#insertBatch(...)` 方法，遍历数组，逐条插入数据库中，适合**少量**数据插入，或者对**性能要求不高**的场景。 示例如下：

> 📷 *insertBatch 示例*

为什么不使用 insertBatchSomeColumn 批量插入？

-   只支持 MySQL 数据库。其它 Oracle 等数据库使用会报错，可见 InsertBatchSomeColumn 说明。
-   未支持多租户。插入数据库时，多租户字段不会进行自动赋值。

##  4. 批量插入

绝大多数场景下，推荐使用 MyBatis Plus 提供的 IService 的 `#saveBatch()` 方法。示例 PermissionServiceImpl 如下：

> 📷 *saveBatch 示例*

##  5. 条件构造器

继承 MyBatis Plus 的条件构造器，拓展了 LambdaQueryWrapperX 和 QueryWrapperX 类，主要是增加 xxxIfPresent 方法，用于判断值不存在的时候，不要拼接到条件中。例如说：

> 📷 *xxxIfPresent 方法*

具体的使用示例如下：

> 📷 *LambdaQueryWrapperX 使用示例*

##  6. Mapper XML

默认配置下，MyBatis Mapper XML 需要写在各 `yudao-module-xxx` 模块的 `resources/mapper` 目录下。示例 `TestDemoMapper.xml` 如下：

图片纠错：最新版本将 yudao-module-system-biz 子模块，重命名为 yudao-module-system-server 子模块，更好表达它是一个服务

> 📷 *TestDemoMapper.xml 示例*

尽量避免数据库的连表（多表）查询，而是采用多次查询，Java 内存拼接的方式替代。例如说：

> 📷 *UserController 示例*

##  7. 字段加密

EncryptTypeHandler，基于 Hutool AES 实现字段的解密与解密。

例如说，数据源配置的 `password` 密码需要实现加密存储，则只需要在该字段上添加 EncryptTypeHandler 处理器。示例代码如下：

```
@TableName(value = "infra_data_source_config", autoResultMap = true) // ① 添加 autoResultMap = true
public class DataSourceConfigDO extends BaseDO {

    // ... 省略其它字段
    /**
     * 密码
     */
    @TableField(typeHandler = EncryptTypeHandler.class) // ② 添加 EncryptTypeHandler 处理器
    private String password;

}
```

另外，在 `application.yaml` 配置文件中，可使用 `mybatis-plus.encryptor.password` 设置加密密钥。

字段加密后，只允许使用**精准**匹配，无法使用模糊匹配。示例代码如下：

```
@Test // 测试使用 password 查询，可以查询到数据
public void testSelectPassword() {
    // mock 数据
    DataSourceConfigDO dbDataSourceConfig = randomPojo(DataSourceConfigDO.class);
    dataSourceConfigMapper.insert(dbDataSourceConfig);// @Sql: 先插入出一条存在的数据

    // 调用
    DataSourceConfigDO result = dataSourceConfigMapper.selectOne(DataSourceConfigDO::getPassword,
            EncryptTypeHandler.encrypt(dbDataSourceConfig.getPassword())); // 重点：需要使用 EncryptTypeHandler 去加密查询字段！！！
}
```
