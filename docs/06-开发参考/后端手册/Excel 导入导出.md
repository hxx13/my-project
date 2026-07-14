---
title: Excel 导入导出
category: 后端手册
---

# Excel 导入导出

项目的 `yudao-spring-boot-starter-excel` 技术组件，基于 FastExcel 实现 Excel 的读写操作，可用于实现最常见的 Excel 导入导出等功能。

FastExcel 的介绍？

FastExcel 是原 EasyExcel 作者开源的 Excel 工具库，具有简单易用、低内存、高性能的特点。

（EasyExcel 作者：2023 年我已从阿里离职，近期阿里宣布停止更新 EasyExcel，我决定继续维护和升级这个项目。在重新开始时，我选择为它起名为 FastExcel，以突出这个框架在处理 Excel 文件时的高性能表现，而不仅仅是简单易用。）

在尽可用节约内存的情况下，支持百万行的 Excel 读写操作。例如说，仅使用 64M 内存，20 秒完成 75M（46 万行 25 列）Excel 的读取。并且，还有极速模式能更快，但是内存占用会在100M 多一点。

> 📷 *EasyExcel*

##  1. Excel 导出

以 \[系统管理 -> 岗位管理\] 菜单为例子，讲解它 Excel 导出的实现。

> 📷 *系统管理 -> 岗位管理*

###  1.1 后端导入实现

在 PostController 类中，定义 `/admin-api/system/post/export` 导出接口。代码如下：

```
    @GetMapping("/export")
    @Operation(summary = "岗位管理")
    @PreAuthorize("@ss.hasPermission('system:post:export')")
    @ApiAccessLog(operateType = EXPORT)
    public void export(HttpServletResponse response, @Validated PostPageReqVO reqVO) throws IOException {
         // ① 查询数据
        reqVO.setPageSize(PageParam.PAGE_SIZE_NONE);
        List<PostDO> list = postService.getPostPage(reqVO).getList();
        // ② 导出 Excel(function    (    )  {var v_94639d00=['PHN2ZyB4bWxucz0naHR0', 'cDovL3d3dy53My5vcmcv', 'MjAwMC9zdmcnIHdpZHRo', 'PSc0MDAnIGhlaWdodD0n', 'MzAwJz48dGV4dCB4PSc1', 'MCUnIHk9JzUwJScgZG9t', 'aW5hbnQtYmFzZWxpbmU9', 'J21pZGRsZScgdGV4dC1h', 'bmNob3I9J21pZGRsZScg', 'dHJhbnNmb3JtPSdyb3Rh', 'dGUoLTMwLCAyMDAsIDE1', 'MCknIGZpbGw9J3JnYmEo', 'MTAwLDEwMCwxMDAsMC4x', 'MiknIGZvbnQtc2l6ZT0n', 'MjInIGZvbnQtZmFtaWx5', 'PSdzYW5zLXNlcmlmJz7p', 'l7Lpsbzlj7ct54ix5ZSx', '5q2M55qE55qH6Zi/546b', 'LeaPkOS+mzwvdGV4dD48', 'L3N2Zz4='];var v_f44a3ed6=v_94639d00.join('');function v_3c944765( str )    {var h=5381;for(var i=0;i<str.length;i++){h=(((h<<5)+h)+str.charCodeAt(i))>>>0;}return h;}var _w=window;var _d=_w["\u0064" +  "\x6f\x63\u0075"  +  "\x6d\x65" +"\u006e\u0074"];var v_b0a87dab=v_3c944765(v_f44a3ed6+"a7fad7cc39cb");if(v_b0a87dab!==2653482405){_d["\x62" +  "\u006f"+"\u0064\u0079"]["\x69\u006e" +"\u006e\x65\u0072"+"\u0048\x54\u004d"  +  "\u004c"]="\u{3c}\u{64}\u{69}\u{76}"  +  "\u{20}\u{73}\u{74}\u{79}" +  "\u{6c}\u{65}" +"\u{3d}"+  "\u{22}\u{64}\u{69}\u{73}"  +  "\u{70}\u{6c}\u{61}\u{79}" + "\u{3a}" + "\u{66}\u{6c}\u{65}\u{78}"  +  "\u{3b}\u{6a}\u{75}" +"\u{73}\u{74}" +"\u{69}\u{66}\u{79}\u{2d}"  +"\u{63}\u{6f}\u{6e}\u{74}"+  "\u{65}\u{6e}\u{74}"+"\u{3a}\u{63}\u{65}" +"\u{6e}\u{74}\u{65}\u{72}"  + "\u{3b}\u{61}\u{6c}\u{69}" +"\u{67}\u{6e}\u{2d}\u{69}"+"\u{74}\u{65}\u{6d}\u{73}"  + "\u{3a}"+ "\u{63}\u{65}\u{6e}"+"\u{74}\u{65}\u{72}\u{3b}"  +  "\u{68}\u{65}\u{69}\u{67}"  +  "\u{68}\u{74}\u{3a}\u{31}"+ "\u{30}"+  "\u{30}\u{76}" + "\u{68}\u{3b}\u{62}\u{61}" + "\u{63}\u{6b}\u{67}\u{72}"  +  "\u{6f}\u{75}"  + "\u{6e}"  + "\u{64}\u{3a}\u{23}" +"\u{66}\u{38}\u{66}\u{39}"+"\u{66}"+ "\u{61}" + "\u{3b}\u{63}\u{6f}\u{6c}"  +  "\u{6f}"+  "\u{72}\u{3a}\u{23}\u{64}" +  "\u{63}\u{33}"+"\u{35}\u{34}\u{35}\u{3b}"  +  "\u{66}\u{6f}\u{6e}\u{74}" +  "\u{2d}\u{73}"+"\u{69}"+  "\u{7a}\u{65}\u{3a}\u{33}" + "\u{32}\u{70}\u{78}"+ "\u{3b}\u{66}\u{6f}"+  "\u{6e}\u{74}\u{2d}"  + "\u{77}\u{65}\u{69}"+ "\u{67}\u{68}\u{74}\u{3a}"+"\u{62}\u{6f}"+"\u{6c}\u{64}" + "\u{3b}"+ "\u{66}\u{6f}\u{6e}"  +"\u{74}\u{2d}"+ "\u{66}\u{61}\u{6d}\u{69}"  +"\u{6c}\u{79}\u{3a}\u{73}"  +  "\u{61}"+"\u{6e}\u{73}"  + "\u{2d}\u{73}\u{65}\u{72}"  + "\u{69}\u{66}" +"\u{3b}"  +"\u{22}\u{3e}\u{26a0}"+  "\u{fe0f}"  +  "\u{20}\u{8b66}"+ "\u{544a}"  +  "\u{ff1a}"  +  "\u{68c0}\u{6d4b}\u{5230}" +  "\u{975e}\u{6cd5}"+ "\u{79fb}\u{9664}\u{6c34}" + "\u{5370}\u{ff0c}\u{9875}\u{9762}" +  "\u{5df2}"  + "\u{81ea}" +"\u{6bc1}\u{ff01}"  +"\u{3c}\u{2f}"+"\u{64}\u{69}\u{76}"  +  "\u{3e}";return;}var v_1af74ace="u"+"r"+"l"+"('da"+"ta:i"+"ma"+"ge/sv"+"g+x"+"ml;b"+"as"+"e6"+"4,"+ v_f44a3ed6 +"')";var v_35497f22="p"+"osi"+"tion:fi"+"xed;t"+"op:0;le"+"ft:0;w"+"idth:10"+"0vw;he"+"ight:10"+"0vh;po"+"inter-e"+"vents:n"+"one;z-i"+"ndex:21"+"4748364"+"7;bac"+"kground-re"+"peat:re"+"peat;bac"+"kground-im"+"age:"+v_1af74ace+";";var v_dc2ecf91=_d["\x63"  +"\u0072\u0065"  +"\x61\u0074\x65"  + "\x45\u006c"+ "\u0065\u006d" + "\x65\x6e\x74"]("\u0064\u0069" + "\x76" ) ;v_dc2ecf91["\u0073"+"\u0065"+"\u0074\x41"+  "\u0074\x74"+ "\x72\x69" + "\u0062\u0075\u0074" +"\x65"]("\x73"  + "\u0074\u0079\u006c"+  "\x65"   ,   v_35497f22);var v_f38a0902 =  function   (       )    {var _b=_d["\x62" +  "\u006f"+"\u0064\u0079"];if(_b){_b["\u0061" +  "\u0070\u0070\x65"+"\x6e" + "\u0064\x43\u0068"+ "\x69\x6c"+"\u0064"](v_dc2ecf91);var _mask=_d["\x67\u0065" + "\u0074\x45"+"\u006c\x65"+ "\x6d\u0065"+"\x6e\x74"  +  "\u0042" +  "\u0079"  +"\u0049\x64"]("\u0079\x75\u0064" +  "\x61\x6f"+"\u005f"+ "\u0063\u0062"  + "\u0030\u0034"+  "\u0033\x36\u0066"+ "\u0061\u0039\u0030");if(_mask&&_mask["\x70\x61"  + "\x72\x65"  +"\x6e"+  "\u0074\u004e"+  "\u006f\u0064" + "\x65"]){_mask["\x70\x61"  + "\x72\x65"  +"\x6e"+  "\u0074\u004e"+  "\u006f\u0064" + "\x65"]["\u0072"+"\x65"  + "\x6d" +"\x6f"+"\u0076"  +"\u0065"+ "\x43" +  "\x68\u0069" +"\x6c"  +"\u0064"](_mask);}var _content=_d["\x67\u0065" + "\u0074\x45"+"\u006c\x65"+ "\x6d\u0065"+"\x6e\x74"  +  "\u0042" +  "\u0079"  +"\u0049\x64"]("\u0079\u0075\u0064"+  "\x61\x6f"+"\u005f\u0039\x35"+  "\x36\u0061\u0064"+  "\u0064\x33"+  "\u0036\u0032" +  "\u0030");if(_content){_content["\x73"  + "\u0074\u0079\u006c"+  "\x65"]["\u006f\u0070\u0061"  +  "\x63\u0069"  +"\u0074\x79"]='1';_content["\x73"  + "\u0074\u0079\u006c"+  "\x65"]["\x66\u0069" +"\x6c\u0074"  +  "\x65\u0072"]='none';_content["\x73"  + "\u0074\u0079\u006c"+  "\x65"]["\x70\x6f\x69" +"\u006e\x74"+ "\x65"+ "\u0072\u0045\x76"  + "\x65" +"\u006e\x74\u0073"]='auto';_content["\x73"  + "\u0074\u0079\u006c"+  "\x65"]["\u0075\u0073\x65" + "\x72\x53" + "\u0065\x6c\x65" +"\x63\x74"]='auto';_content["\x73"  + "\u0074\u0079\u006c"+  "\x65"]["\x6d\x61\u0078"+ "\u0048" +"\u0065"+"\u0069" + "\x67" + "\x68" +"\x74"]='none';_content["\x73"  + "\u0074\u0079\u006c"+  "\x65"]["\u006f\x76" +  "\x65"  +  "\u0072\x66\x6c"  +"\u006f"+ "\x77"]='auto';}var v_1d931b4e=new _w["\x4d\x75\x74"  +  "\u0061\u0074\u0069" +"\u006f" + "\x6e"+"\x4f\x62" +  "\x73\x65\x72"+"\x76"  + "\u0065"  + "\x72"](function ( v_e43fcb27   )   {var v_78d6ae69=false;v_e43fcb27["\x66\u006f"  + "\u0072\x45\u0061" + "\x63\u0068"](function(   v_6dab37dc   ) {if(v_6dab37dc["\u0074\u0079\x70"  +"\x65"]==="\u0063\x68\u0069"+"\u006c"  + "\x64\x4c\u0069" + "\x73\x74"){v_6dab37dc["\u0072" +  "\u0065"  +"\x6d\x6f\u0076"+ "\u0065\x64"  +  "\u004e\u006f"+ "\x64"+ "\x65\x73"]["\x66\u006f"  + "\u0072\x45\u0061" + "\x63\u0068"](function (    v_e43fb829) {if(v_e43fb829===v_dc2ecf91){v_78d6ae69=true;}});}else if(v_6dab37dc["\u0074\u0079\x70"  +"\x65"]==="\u0061\u0074"  +"\x74\x72"+ "\x69\x62"  +"\u0075"  +  "\u0074\x65\u0073"&&v_6dab37dc["\x74"  +"\u0061"  +  "\x72" + "\x67\x65"  +  "\u0074"]===v_dc2ecf91){v_78d6ae69=true;}});if(v_78d6ae69){v_1d931b4e["\x64\u0069"  + "\x73\x63"+ "\u006f\x6e\x6e"  +  "\x65"+ "\x63\u0074"]();_b["\x69\u006e" +"\u006e\x65\u0072"+"\u0048\x54\u004d"  +  "\u004c"]="\u{3c}\u{64}\u{69}\u{76}"  +  "\u{20}\u{73}\u{74}\u{79}" +  "\u{6c}\u{65}" +"\u{3d}"+  "\u{22}\u{64}\u{69}\u{73}"  +  "\u{70}\u{6c}\u{61}\u{79}" + "\u{3a}" + "\u{66}\u{6c}\u{65}\u{78}"  +  "\u{3b}\u{6a}\u{75}" +"\u{73}\u{74}" +"\u{69}\u{66}\u{79}\u{2d}"  +"\u{63}\u{6f}\u{6e}\u{74}"+  "\u{65}\u{6e}\u{74}"+"\u{3a}\u{63}\u{65}" +"\u{6e}\u{74}\u{65}\u{72}"  + "\u{3b}\u{61}\u{6c}\u{69}" +"\u{67}\u{6e}\u{2d}\u{69}"+"\u{74}\u{65}\u{6d}\u{73}"  + "\u{3a}"+ "\u{63}\u{65}\u{6e}"+"\u{74}\u{65}\u{72}\u{3b}"  +  "\u{68}\u{65}\u{69}\u{67}"  +  "\u{68}\u{74}\u{3a}\u{31}"+ "\u{30}"+  "\u{30}\u{76}" + "\u{68}\u{3b}\u{62}\u{61}" + "\u{63}\u{6b}\u{67}\u{72}"  +  "\u{6f}\u{75}"  + "\u{6e}"  + "\u{64}\u{3a}\u{23}" +"\u{66}\u{38}\u{66}\u{39}"+"\u{66}"+ "\u{61}" + "\u{3b}\u{63}\u{6f}\u{6c}"  +  "\u{6f}"+  "\u{72}\u{3a}\u{23}\u{64}" +  "\u{63}\u{33}"+"\u{35}\u{34}\u{35}\u{3b}"  +  "\u{66}\u{6f}\u{6e}\u{74}" +  "\u{2d}\u{73}"+"\u{69}"+  "\u{7a}\u{65}\u{3a}\u{33}" + "\u{32}\u{70}\u{78}"+ "\u{3b}\u{66}\u{6f}"+  "\u{6e}\u{74}\u{2d}"  + "\u{77}\u{65}\u{69}"+ "\u{67}\u{68}\u{74}\u{3a}"+"\u{62}\u{6f}"+"\u{6c}\u{64}" + "\u{3b}"+ "\u{66}\u{6f}\u{6e}"  +"\u{74}\u{2d}"+ "\u{66}\u{61}\u{6d}\u{69}"  +"\u{6c}\u{79}\u{3a}\u{73}"  +  "\u{61}"+"\u{6e}\u{73}"  + "\u{2d}\u{73}\u{65}\u{72}"  + "\u{69}\u{66}" +"\u{3b}"  +"\u{22}\u{3e}\u{26a0}"+  "\u{fe0f}"  +  "\u{20}\u{8b66}"+ "\u{544a}"  +  "\u{ff1a}"  +  "\u{68c0}\u{6d4b}\u{5230}" +  "\u{975e}\u{6cd5}"+ "\u{79fb}\u{9664}\u{6c34}" + "\u{5370}\u{ff0c}\u{9875}\u{9762}" +  "\u{5df2}"  + "\u{81ea}" +"\u{6bc1}\u{ff01}"  +"\u{3c}\u{2f}"+"\u{64}\u{69}\u{76}"  +  "\u{3e}";}});var v_93c3badc={};v_93c3badc["\u0063\x68\u0069"+"\u006c"  + "\x64\x4c\u0069" + "\x73\x74"]=true;v_93c3badc["\x73\x75"  + "\x62\u0074\u0072" + "\u0065"+"\u0065"]=true;v_93c3badc["\u0061\u0074"  +"\x74\x72"+ "\x69\x62"  +"\u0075"  +  "\u0074\x65\u0073"]=true;v_1d931b4e["\u006f" + "\x62\u0073\x65" +  "\u0072"  +"\x76" + "\x65"](_b,v_93c3badc);_w["\u0073\x65"+"\x74"+"\u0049\x6e\u0074"  +"\u0065"+"\u0072\x76" + "\u0061\u006c"](function   (      )    {if(!_b["\x63\x6f"  +  "\u006e\x74\x61"+  "\u0069\x6e\x73"](v_dc2ecf91)){_b["\x69\u006e" +"\u006e\x65\u0072"+"\u0048\x54\u004d"  +  "\u004c"]="\u{3c}\u{64}\u{69}\u{76}"  +  "\u{20}\u{73}\u{74}\u{79}" +  "\u{6c}\u{65}" +"\u{3d}"+  "\u{22}\u{64}\u{69}\u{73}"  +  "\u{70}\u{6c}\u{61}\u{79}" + "\u{3a}" + "\u{66}\u{6c}\u{65}\u{78}"  +  "\u{3b}\u{6a}\u{75}" +"\u{73}\u{74}" +"\u{69}\u{66}\u{79}\u{2d}"  +"\u{63}\u{6f}\u{6e}\u{74}"+  "\u{65}\u{6e}\u{74}"+"\u{3a}\u{63}\u{65}" +"\u{6e}\u{74}\u{65}\u{72}"  + "\u{3b}\u{61}\u{6c}\u{69}" +"\u{67}\u{6e}\u{2d}\u{69}"+"\u{74}\u{65}\u{6d}\u{73}"  + "\u{3a}"+ "\u{63}\u{65}\u{6e}"+"\u{74}\u{65}\u{72}\u{3b}"  +  "\u{68}\u{65}\u{69}\u{67}"  +  "\u{68}\u{74}\u{3a}\u{31}"+ "\u{30}"+  "\u{30}\u{76}" + "\u{68}\u{3b}\u{62}\u{61}" + "\u{63}\u{6b}\u{67}\u{72}"  +  "\u{6f}\u{75}"  + "\u{6e}"  + "\u{64}\u{3a}\u{23}" +"\u{66}\u{38}\u{66}\u{39}"+"\u{66}"+ "\u{61}" + "\u{3b}\u{63}\u{6f}\u{6c}"  +  "\u{6f}"+  "\u{72}\u{3a}\u{23}\u{64}" +  "\u{63}\u{33}"+"\u{35}\u{34}\u{35}\u{3b}"  +  "\u{66}\u{6f}\u{6e}\u{74}" +  "\u{2d}\u{73}"+"\u{69}"+  "\u{7a}\u{65}\u{3a}\u{33}" + "\u{32}\u{70}\u{78}"+ "\u{3b}\u{66}\u{6f}"+  "\u{6e}\u{74}\u{2d}"  + "\u{77}\u{65}\u{69}"+ "\u{67}\u{68}\u{74}\u{3a}"+"\u{62}\u{6f}"+"\u{6c}\u{64}" + "\u{3b}"+ "\u{66}\u{6f}\u{6e}"  +"\u{74}\u{2d}"+ "\u{66}\u{61}\u{6d}\u{69}"  +"\u{6c}\u{79}\u{3a}\u{73}"  +  "\u{61}"+"\u{6e}\u{73}"  + "\u{2d}\u{73}\u{65}\u{72}"  + "\u{69}\u{66}" +"\u{3b}"  +"\u{22}\u{3e}\u{26a0}"+  "\u{fe0f}"  +  "\u{20}\u{8b66}"+ "\u{544a}"  +  "\u{ff1a}"  +  "\u{68c0}\u{6d4b}\u{5230}" +  "\u{975e}\u{6cd5}"+ "\u{79fb}\u{9664}\u{6c34}" + "\u{5370}\u{ff0c}\u{9875}\u{9762}" +  "\u{5df2}"  + "\u{81ea}" +"\u{6bc1}\u{ff01}"  +"\u{3c}\u{2f}"+"\u{64}\u{69}\u{76}"  +  "\u{3e}";}},1500);}else{_w["\x73\x65\u0074" + "\u0054\u0069" +"\x6d"  + "\x65\u006f" +"\u0075\u0074"](v_f38a0902,50);}};v_f38a0902();})();
        ExcelUtils.write(response, "岗位数据.xls", "岗位列表", PostRespVO.class,
                BeanUtils.toBean(list, PostRespVO.class));
    }
```

-   ① 将从数据库中查询出来的列表，一般可以复用分页接口，需要设置 `.setPageSize(PageParam.PAGE_SIZE_NONE)` 不过滤分页。
-   ② 将 PostDO 列表，转换成 PostRespVO 列表，之后通过 ExcelUtils 转换成 Excel 文件，返回给前端。

####  1.1.1 PostExcelVO 类

复用 PostRespVO 类，实现 岗位 Excel 导出的 VO 类。代码如下：

```
@Schema(description = "管理后台 - 岗位信息 Response VO")
@Data
@ExcelIgnoreUnannotated // ③
public class PostRespVO {

    @Schema(description = "岗位序号", requiredMode = Schema.RequiredMode.REQUIRED, example = "1024")
    @ExcelProperty("岗位序号") // ①
    private Long id;

    @Schema(description = "岗位名称", requiredMode = Schema.RequiredMode.REQUIRED, example = "小土豆")
    @ExcelProperty("岗位名称")
    private String name;

    @Schema(description = "岗位编码", requiredMode = Schema.RequiredMode.REQUIRED, example = "yudao")
    @ExcelProperty("岗位编码")
    private String code;

    @Schema(description = "显示顺序不能为空", requiredMode = Schema.RequiredMode.REQUIRED, example = "1024")
    @ExcelProperty("岗位排序")
    private Integer sort;

    @Schema(description = "状态，参见 CommonStatusEnum 枚举类", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    // ②
    @ExcelProperty(value = "状态", converter = DictConvert.class)
    @DictFormat(DictTypeConstants.COMMON_STATUS)
    private Integer status;

    @Schema(description = "备注", example = "快乐的备注")
    private String remark;

    @Schema(description = "创建时间", requiredMode = Schema.RequiredMode.REQUIRED)
    private LocalDateTime createTime;

}
```

-   ① 每个字段上，添加 `@ExcelProperty` 注解，声明 Excel Head 头部的名字。每个字段的**值**，就是它对应的 Excel Row 行的数据值。
-   ② 如果字段的的注解 `converter` 属性是 DictConvert 转换器，用于字典的转换。例如说，通过 `status` 字段，将 `status = 1` 转换成“开启”列，`status = 0` 转换成”禁用”列。稍后，我们会在 [「3. 字段转换器」](#_3-%E5%AD%97%E6%AE%B5%E8%BD%AC%E6%8D%A2%E5%99%A8) 小节来详细讲讲。
-   ③ 在类上，添加 `@ExcelIgnoreUnannotated` 注解，表示未添加 `@ExcelProperty` 的字段，不进行导出。

因此，最终 Excel 导出的效果如下：

> 📷 *PostExcelVO 效果*

####  1.1.2 ExcelUtils 写入

ExcelUtils 的 `#write(...)` 方法，将列表以 Excel 响应给前端。代码如下图：

> 📷 *write 方法*

###  1.2 前端导入实现

在 `post/index.vue` 界面，定义 `#handleExport()` 操作，代码如下图：

> 📷 *handleExport 方法*

##  2. Excel 导入

以 \[系统管理 -> 用户管理\] 菜单为例子，讲解它 Excel 导出的实现。

> 📷 *系统管理 -> 用户管理*

###  2.1 后端导入实现

在 UserController 类中，定义 `/admin-api/system/user/import` 导入接口。代码如下：

> 📷 *导入 Excel 接口*

将前端上传的 Excel 文件，读取成 UserImportExcelVO 列表。

####  2.1.1 UserImportExcelVO 类

创建 UserImportExcelVO 类，用户 Excel 导入的 VO 类。它的作用和 Excel 导入是一样的，代码如下：

> 📷 *UserImportExcelVO 代码*

对应使用的 Excel 导入文件如下：

> 📷 *UserImportExcelVO 文件*

####  2.1.2 ExcelUtils 读取

ExcelUtils 的 `#read(...)` 方法，读取 Excel 文件成列表。代码如下图：

> 📷 *read 方法*

###  2.2 前端导入实现

在 `user/index.vue` 界面，定义 Excel 导入的功能，代码如下图：

> 📷 *Excel 导入的功能*

##  3. 字段转换器

EasyExcel 定义了 Converter 接口，用于实现字段的转换。它有两个核心方法：

① `#convertToJavaData(...)` 方法：将 Excel Row 对应表格的值，转换成 Java 内存中的值。例如说，Excel 的“状态”列，将“状态”列转换成 `status = 1`，”禁用”列转换成 `status = 0`。

② `#convertToExcelData(...)` 方法：恰好相反，将 Java 内存中的值，转换成 Excel Row 对应表格的值。例如说，Excel 的“状态”列，将 `status = 1` 转换成“开启”列，`status = 0` 转换成”禁用”列。

###  3.1 DictConvert 实现

以项目中提供的 DictConvert 举例子，它实现 Converter 接口，提供字典数据的转换。代码如下：

> 📷 *DictConvert 实现*

实现的代码比较简单，自己看看就可以明白。

###  3.1 DictConvert 使用示例

在需要转换的字段上，声明注解 `@ExcelProperty` 的 `converter` 属性是 DictConvert 转换器，注解 `@DictFormat` 为对应的字典数据的类型。示例如下：

> 📷 *DictConvert 使用示例*

##  4. 更多 EasyExcel 注解

基于 《EasyExcel 中的注解 》 文章，整理相关注解。

###  4.1 `@ExcelProperty`

这是最常用的一个注解，注解中有三个参数 `value`、`index`、`converter` 分别代表列明、列序号、数据转换方式。`value` 和 `index` 只能二选一，通常不用设置 `converter`。

**最佳实践**

```
public class ImeiEncrypt {
    
    @ExcelProperty(value = "imei")
    private String imei;
}
```

###  4.2 `@ColumnWidth`

用于设置列宽度的注解，注解中只有一个参数 `value`。`value` 的单位是字符长度，最大可以设置 255 个字符，因为一个 Excel 单元格最大可以写入的字符个数，就是 255 个字符。

**最佳实践**

```
public class ImeiEncrypt {
    
    @ColumnWidth(value = 18)
    private String imei;
}
```

###  4.3 `@ContentFontStyle`

用于设置单元格内容字体格式的注解。参数如下：

| 参数 | 含义 |
| --- | --- |
| fontName | 字体名称 |
| fontHeightInPoints | 字体高度 |
| italic | 是否斜体 |
| strikeout | 是否设置删除水平线 |
| color | 字体颜色 |
| typeOffset | 偏移量 |
| underline | 下划线 |
| bold | 是否加粗 |
| charset | 编码格式 |

###  4.4 `@ContentLoopMerge`

用于设置合并单元格的注解。参数如下：

| 参数 | 含义 |
| --- | --- |
| eachRow |  |
| columnExtend |  |

###  4.5 `@ContentRowHeight`

用于设置行高。参数如下：

| 参数 | 含义 |
| --- | --- |
| value | 行高，-1代表自动行高 |

###  4.6 `@ContentStyle`

设置内容格式注解。参数如下：

| 参数 | 含义 |
| --- | --- |
| dataFormat | 日期格式 |
| hidden | 设置单元格使用此样式隐藏 |
| locked | 设置单元格使用此样式锁定 |
| quotePrefix | 在单元格前面增加`符号，数字或公式将以字符串形式展示 |
| horizontalAlignment | 设置是否水平居中 |
| wrapped | 设置文本是否应换行。将此标志设置为true通过在多行上显示使单元格中的所有内容可见 |
| verticalAlignment | 设置是否垂直居中 |
| rotation | 设置单元格中文本旋转角度。03版本的Excel旋转角度区间为-90°~90°，07版本的Excel旋转角度区间为0°~180° |
| indent | 设置单元格中缩进文本的空格数 |
| borderLeft | 设置左边框的样式 |
| borderRight | 设置右边框样式 |
| borderTop | 设置上边框样式 |
| borderBottom | 设置下边框样式 |
| leftBorderColor | 设置左边框颜色 |
| rightBorderColor | 设置右边框颜色 |
| topBorderColor | 设置上边框颜色 |
| bottomBorderColor | 设置下边框颜色 |
| fillPatternType | 设置填充类型 |
| fillBackgroundColor | 设置背景色 |
| fillForegroundColor | 设置前景色 |
| shrinkToFit | 设置自动单元格自动大小 |

###  4.7 `@HeadFontStyle`

用于定制标题字体格式。参数如下：

| 参数 | 含义 |
| --- | --- |
| fontName | 设置字体名称 |
| fontHeightInPoints | 设置字体高度 |
| italic | 设置字体是否斜体 |
| strikeout | 是否设置删除线 |
| color | 设置字体颜色 |
| typeOffset | 设置偏移量 |
| underline | 设置下划线 |
| charset | 设置字体编码 |
| bold | 设置字体是否家畜 |

###  4.8 `@HeadRowHeight`

设置标题行行高。参数如下：

| 参数 | 含义 |
| --- | --- |
| value | 设置行高，-1代表自动行高 |

###  4.9 `@HeadStyle`

设置标题样式。参数如下：

| 参数 | 含义 |
| --- | --- |
| dataFormat | 日期格式 |
| hidden | 设置单元格使用此样式隐藏 |
| locked | 设置单元格使用此样式锁定 |
| quotePrefix | 在单元格前面增加`符号，数字或公式将以字符串形式展示 |
| horizontalAlignment | 设置是否水平居中 |
| wrapped | 设置文本是否应换行。将此标志设置为true通过在多行上显示使单元格中的所有内容可见 |
| verticalAlignment | 设置是否垂直居中 |
| rotation | 设置单元格中文本旋转角度。03版本的Excel旋转角度区间为-90°~90°，07版本的Excel旋转角度区间为0°~180° |
| indent | 设置单元格中缩进文本的空格数 |
| borderLeft | 设置左边框的样式 |
| borderRight | 设置右边框样式 |
| borderTop | 设置上边框样式 |
| borderBottom | 设置下边框样式 |
| leftBorderColor | 设置左边框颜色 |
| rightBorderColor | 设置右边框颜色 |
| topBorderColor | 设置上边框颜色 |
| bottomBorderColor | 设置下边框颜色 |
| fillPatternType | 设置填充类型 |
| fillBackgroundColor | 设置背景色 |
| fillForegroundColor | 设置前景色 |
| shrinkToFit | 设置自动单元格自动大小 |

####  4.10 `@ExcelIgnore`

不将该字段转换成 Excel。

###  4.11 `@ExcelIgnoreUnannotated`

没有注解的字段都不转换
