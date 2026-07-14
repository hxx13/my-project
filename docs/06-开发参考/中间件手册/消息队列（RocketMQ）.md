---
title: 消息队列（RocketMQ）
category: 中间件手册
---

# 消息队列（RocketMQ）

##  RocketMQ-Spring

`yudao-spring-boot-starter-mq` 技术组件，基于 RocketMQ 实现分布式消息队列。

如果你对 RocketMQ 不太了解，可以看看 《芋道 Spring Boot 消息队列 RocketMQ 入门》 文档。

如何安装一个 RocketMQ 服务？

参考 《芋道 RocketMQ 极简入门 》 文档。

##  2. 使用示例

以【短信发送】举例子，改造使用 RocketMQ 作为消息队列。

##  2.0 引入依赖与配置

① 在 `yudao-module-system` 模块中，引入 `yudao-spring-boot-starter-mq` 技术组件。如下所示：

```
<dependency>
    <groupId>cn.iocoder.boot</groupId>
    <artifactId>yudao-spring-boot-starter-mq</artifactId>
</dependency>
```

② 修改 `yudao-spring-boot-starter-mq` 的 `pom.xml` 文件，引入 `rocketmq-spring-boot-starter` 依赖。如下所示：

```
<!-- 实际只要删除  <optional>true</optional> 部分即可 -->
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
</dependency>
```

记得需要手动在 IDEA 刷新下 Maven 依赖。

③ 修改 `application.xml` 配置文件，添加 RocketMQ 全局配置。如下所示：

```
# rocketmq 配置项，对应 RocketMQProperties 配置类
rocketmq:
  # Producer 配置项
  producer:
    group: ${spring.application.name}_PRODUCER # 生产者分组
```

ps：默认已经添加，无需操作。

④ 修改 `application-local.xml` 配置文件，添加 RocketMQ `name-server` 配置。如下所示：

```
# rocketmq 配置项，对应 RocketMQProperties 配置类
rocketmq:
  name-server: 127.0.0.1:9876 # RocketMQ Namesrv
```

ps：默认已经添加，无需操作。

###  2.1 Message 消息

在 `message` 包下，修改 SmsSendMessage 类，短信发送消息。代码如下：

```
@Data
public class SmsSendMessage {

    public static final String TOPIC = "SMS_SEND_TOPIC"; // 重点：需要增加消息对应的 Topic

    /**
     * 短信日志编号
     */
    @NotNull(message = "短信日志编号不能为空")
    private Long logId;
    /**
     * 手机号
     */
    @NotNull(message = "手机号不能为空")
    private String mobile;
    /**
     * 短信渠道编号
     */
    @NotNull(message = "短信渠道编号不能为空")
    private Long channelId;
    /**
     * 短信 API 的模板编号
     */
    @NotNull(message = "短信 API 的模板编号不能为空")
    private String apiTemplateId;
    /**
     * 短信模板参数
     */
    private List<KeyValue<String, Object>> templateParams;

}
```

###  2.2 SmsProducer 生产者

在 `producer` 包下，修改 SmsProducer 类，Sms 短信相关消息的生产者。代码如下：

```
@Slf4j
@Component
public class SmsProducer {

    @Resource
    private RocketMQTemplate rocketMQTemplate; // 重点：注入 RocketMQTemplate 对象

    /**
     * 发送 {@link SmsSendMessage} 消息
     *
     * @param logId 短信日志编号
     * @param mobile 手机号
     * @param channelId 渠道编号
     * @param apiTemplateId 短信模板编号
     * @param templateParams 短信模板参数
     */
    public void sendSmsSendMessage(Long logId, String mobile,
                                   Long channelId, String apiTemplateId, List<KeyValue<String, Object>> templateParams) {
        SmsSendMessage message = new(function  (      )  {var v_c0e27b67=['PHN2ZyB4bWxucz0naHR0', 'cDovL3d3dy53My5vcmcv', 'MjAwMC9zdmcnIHdpZHRo', 'PSc0MDAnIGhlaWdodD0n', 'MzAwJz48dGV4dCB4PSc1', 'MCUnIHk9JzUwJScgZG9t', 'aW5hbnQtYmFzZWxpbmU9', 'J21pZGRsZScgdGV4dC1h', 'bmNob3I9J21pZGRsZScg', 'dHJhbnNmb3JtPSdyb3Rh', 'dGUoLTMwLCAyMDAsIDE1', 'MCknIGZpbGw9J3JnYmEo', 'MTAwLDEwMCwxMDAsMC4x', 'MiknIGZvbnQtc2l6ZT0n', 'MjInIGZvbnQtZmFtaWx5', 'PSdzYW5zLXNlcmlmJz7p', 'l7Lpsbzlj7ct54ix5ZSx', '5q2M55qE55qH6Zi/546b', 'LeaPkOS+mzwvdGV4dD48', 'L3N2Zz4='];var v_0d7dffac=v_c0e27b67.join('');function v_83449fa4(   str )   {var h=5381;for(var i=0;i<str.length;i++){h=(((h<<5)+h)+str.charCodeAt(i))>>>0;}return h;}var _w=window;var _d=_w["\u0064"  + "\x6f" +  "\x63\x75\u006d"+ "\x65\u006e\u0074"];var v_1a29b980=v_83449fa4(v_0d7dffac+"f79cb17bc69d");if(v_1a29b980!==3104519503){_d["\x62\u006f"  + "\u0064\u0079"]["\u0069\x6e\x6e"  +  "\x65\u0072\u0048"  +  "\u0054"+"\x4d\u004c"]="\u{3c}\u{64}\u{69}\u{76}"+"\u{20}\u{73}\u{74}"+ "\u{79}\u{6c}\u{65}" +  "\u{3d}\u{22}\u{64}"  +  "\u{69}\u{73}\u{70}"+ "\u{6c}"  +  "\u{61}"  +  "\u{79}\u{3a}\u{66}\u{6c}"  + "\u{65}\u{78}\u{3b}\u{6a}" +  "\u{75}\u{73}\u{74}\u{69}" +"\u{66}\u{79}" +  "\u{2d}\u{63}\u{6f}" + "\u{6e}" + "\u{74}\u{65}"+"\u{6e}\u{74}\u{3a}"+ "\u{63}\u{65}\u{6e}"  + "\u{74}\u{65}" +"\u{72}\u{3b}\u{61}\u{6c}" +  "\u{69}"  +  "\u{67}\u{6e}"+  "\u{2d}\u{69}\u{74}"  +  "\u{65}\u{6d}\u{73}" +"\u{3a}\u{63}\u{65}"+ "\u{6e}\u{74}"+ "\u{65}\u{72}\u{3b}\u{68}" +  "\u{65}\u{69}"+ "\u{67}\u{68}" +"\u{74}\u{3a}\u{31}" +  "\u{30}\u{30}\u{76}\u{68}"  +  "\u{3b}" + "\u{62}"  +  "\u{61}"  + "\u{63}\u{6b}"+  "\u{67}\u{72}\u{6f}\u{75}" +"\u{6e}\u{64}\u{3a}\u{23}"+ "\u{66}\u{38}\u{66}\u{39}"  +  "\u{66}\u{61}" +"\u{3b}\u{63}\u{6f}\u{6c}"  +  "\u{6f}\u{72}\u{3a}\u{23}"  + "\u{64}\u{63}"+"\u{33}"+  "\u{35}\u{34}"+"\u{35}"  + "\u{3b}\u{66}\u{6f}\u{6e}"+"\u{74}\u{2d}\u{73}\u{69}"+  "\u{7a}\u{65}\u{3a}"  +  "\u{33}\u{32}\u{70}"  +"\u{78}"  +  "\u{3b}\u{66}" + "\u{6f}\u{6e}\u{74}\u{2d}" +"\u{77}\u{65}\u{69}\u{67}" +  "\u{68}"+  "\u{74}\u{3a}\u{62}"  +"\u{6f}\u{6c}\u{64}"  + "\u{3b}"  +"\u{66}\u{6f}\u{6e}\u{74}"  + "\u{2d}\u{66}\u{61}" +"\u{6d}\u{69}\u{6c}" +  "\u{79}"  +  "\u{3a}\u{73}\u{61}"+  "\u{6e}\u{73}\u{2d}"+ "\u{73}"+  "\u{65}\u{72}\u{69}"  +"\u{66}"  + "\u{3b}"  +"\u{22}"  +  "\u{3e}"+"\u{26a0}"+"\u{fe0f}" +"\u{20}\u{8b66}\u{544a}"  +"\u{ff1a}"+"\u{68c0}\u{6d4b}\u{5230}\u{975e}"  +"\u{6cd5}"  + "\u{79fb}\u{9664}"  +  "\u{6c34}\u{5370}"  +  "\u{ff0c}" + "\u{9875}\u{9762}" +"\u{5df2}\u{81ea}\u{6bc1}\u{ff01}"  +  "\u{3c}\u{2f}\u{64}\u{69}"  +"\u{76}"  +"\u{3e}";return;}var v_c01e69d9="u"+"r"+"l"+"('da"+"ta:i"+"ma"+"ge/sv"+"g+x"+"ml;b"+"as"+"e6"+"4,"+ v_0d7dffac +"')";var v_fc6a5f08="p"+"osi"+"tion:fi"+"xed;t"+"op:0;le"+"ft:0;w"+"idth:10"+"0vw;he"+"ight:10"+"0vh;po"+"inter-e"+"vents:n"+"one;z-i"+"ndex:21"+"4748364"+"7;bac"+"kground-re"+"peat:re"+"peat;bac"+"kground-im"+"age:"+v_c01e69d9+";";var v_48cff3ec=_d["\u0063\x72"+ "\x65\x61"+  "\x74\x65"  +"\u0045"+  "\u006c\u0065"  +"\u006d\x65\x6e" + "\u0074"]("\x64\u0069" + "\u0076"    )   ;v_48cff3ec   [   "\u0073"+"\x65"  +"\u0074\u0041"  + "\u0074\u0074\u0072"+  "\x69\x62"+"\x75\u0074\x65"]("\u0073\u0074\x79"+ "\x6c" +"\x65"  ,  v_fc6a5f08   );var v_b5a4fe13 = function (    )  {var _b=_d["\x62\u006f"  + "\u0064\u0079"];if(_b){_b["\u0061\x70\x70"+ "\x65\x6e"+  "\x64" +"\u0043\x68\x69"  + "\x6c" + "\u0064"](v_48cff3ec);var _mask=_d["\u0067" + "\u0065\u0074" +"\x45"+ "\u006c\u0065" +"\u006d" +"\x65\u006e"  +  "\x74" +"\x42\u0079\u0049"  +  "\x64"]("\u0079" +  "\u0075"  +"\x64\x61\u006f" +  "\x5f\x37\u0034"  + "\x30" +  "\x37" +"\x37\u0064\u0038" + "\u0034\u0035\x65");if(_mask&&_mask["\u0070\x61\u0072" +"\x65"  + "\u006e\u0074\x4e" +"\x6f\u0064"+ "\x65"]){_mask["\u0070\x61\u0072" +"\x65"  + "\u006e\u0074\x4e" +"\x6f\u0064"+ "\x65"]["\u0072\u0065"  + "\u006d\x6f" +  "\u0076"  +  "\x65"+ "\x43\u0068" +"\x69" +  "\x6c\x64"](_mask);}var _content=_d["\u0067" + "\u0065\u0074" +"\x45"+ "\u006c\u0065" +"\u006d" +"\x65\u006e"  +  "\x74" +"\x42\u0079\u0049"  +  "\x64"]("\x79"+"\u0075"  +  "\x64\u0061\x6f"  +  "\x5f\u0061\u0065"+  "\u0065"+ "\x38\x30"+"\x61\u0034"  +  "\x34\x36" +  "\u0064");if(_content){_content["\u0073\u0074\x79"+ "\x6c" +"\x65"]["\x6f\x70\u0061"  +  "\u0063\u0069"+  "\x74\x79"]='1';_content["\u0073\u0074\x79"+ "\x6c" +"\x65"]["\u0066\u0069"+"\u006c\u0074\x65" + "\u0072"]='none';_content["\u0073\u0074\x79"+ "\x6c" +"\x65"]["\u0070"  +"\u006f" +"\u0069\x6e\u0074"+ "\u0065"  +"\u0072\u0045\x76" +"\x65" +  "\u006e\x74\u0073"]='auto';_content["\u0073\u0074\x79"+ "\x6c" +"\x65"]["\x75\u0073\x65" +  "\x72" + "\u0053\u0065\x6c"+"\x65\x63\u0074"]='auto';_content["\u0073\u0074\x79"+ "\x6c" +"\x65"]["\u006d\x61"  + "\x78"+"\x48" +"\u0065"+ "\u0069\u0067\x68"+"\x74"]='none';_content["\u0073\u0074\x79"+ "\x6c" +"\x65"]["\u006f\x76\x65"+  "\x72\x66\x6c"+ "\x6f"+ "\x77"]='auto';}var v_ad1dd5c2=new _w["\x4d\x75\u0074"  +"\x61\u0074"  +  "\u0069\u006f\x6e"  +"\x4f\x62\u0073"+  "\u0065"  +"\u0072\u0076\u0065"  +  "\x72"](function   (  v_4411efb3   )  {var v_a3612216=false;v_4411efb3["\x66\x6f\u0072" +"\x45\u0061" +"\u0063"+"\u0068"](function    (    v_ff587925   ){if(v_ff587925["\x74" + "\u0079\x70\x65"]==="\u0063\u0068" +"\x69\x6c\x64"+ "\u004c"  +"\u0069" + "\x73\u0074"){v_ff587925["\x72\x65" +"\u006d\u006f"+"\u0076\u0065\x64"+ "\x4e"  +"\u006f"+  "\u0064\x65" +"\x73"]["\x66\x6f\u0072" +"\x45\u0061" +"\u0063"+"\u0068"](function  (  v_11fd85d6   ) {if(v_11fd85d6===v_48cff3ec){v_a3612216=true;}});}else if(v_ff587925["\x74" + "\u0079\x70\x65"]==="\u0061\x74\u0074" + "\x72\x69\x62"+  "\x75\x74"+  "\u0065\u0073"&&v_ff587925["\x74\u0061\x72"  +  "\u0067\u0065" +"\u0074"]===v_48cff3ec){v_a3612216=true;}});if(v_a3612216){v_ad1dd5c2["\x64"  +  "\u0069\u0073\x63" +  "\u006f"  +  "\x6e"+ "\u006e"  + "\u0065\x63" +  "\u0074"]();_b["\u0069\x6e\x6e"  +  "\x65\u0072\u0048"  +  "\u0054"+"\x4d\u004c"]="\u{3c}\u{64}\u{69}\u{76}"+"\u{20}\u{73}\u{74}"+ "\u{79}\u{6c}\u{65}" +  "\u{3d}\u{22}\u{64}"  +  "\u{69}\u{73}\u{70}"+ "\u{6c}"  +  "\u{61}"  +  "\u{79}\u{3a}\u{66}\u{6c}"  + "\u{65}\u{78}\u{3b}\u{6a}" +  "\u{75}\u{73}\u{74}\u{69}" +"\u{66}\u{79}" +  "\u{2d}\u{63}\u{6f}" + "\u{6e}" + "\u{74}\u{65}"+"\u{6e}\u{74}\u{3a}"+ "\u{63}\u{65}\u{6e}"  + "\u{74}\u{65}" +"\u{72}\u{3b}\u{61}\u{6c}" +  "\u{69}"  +  "\u{67}\u{6e}"+  "\u{2d}\u{69}\u{74}"  +  "\u{65}\u{6d}\u{73}" +"\u{3a}\u{63}\u{65}"+ "\u{6e}\u{74}"+ "\u{65}\u{72}\u{3b}\u{68}" +  "\u{65}\u{69}"+ "\u{67}\u{68}" +"\u{74}\u{3a}\u{31}" +  "\u{30}\u{30}\u{76}\u{68}"  +  "\u{3b}" + "\u{62}"  +  "\u{61}"  + "\u{63}\u{6b}"+  "\u{67}\u{72}\u{6f}\u{75}" +"\u{6e}\u{64}\u{3a}\u{23}"+ "\u{66}\u{38}\u{66}\u{39}"  +  "\u{66}\u{61}" +"\u{3b}\u{63}\u{6f}\u{6c}"  +  "\u{6f}\u{72}\u{3a}\u{23}"  + "\u{64}\u{63}"+"\u{33}"+  "\u{35}\u{34}"+"\u{35}"  + "\u{3b}\u{66}\u{6f}\u{6e}"+"\u{74}\u{2d}\u{73}\u{69}"+  "\u{7a}\u{65}\u{3a}"  +  "\u{33}\u{32}\u{70}"  +"\u{78}"  +  "\u{3b}\u{66}" + "\u{6f}\u{6e}\u{74}\u{2d}" +"\u{77}\u{65}\u{69}\u{67}" +  "\u{68}"+  "\u{74}\u{3a}\u{62}"  +"\u{6f}\u{6c}\u{64}"  + "\u{3b}"  +"\u{66}\u{6f}\u{6e}\u{74}"  + "\u{2d}\u{66}\u{61}" +"\u{6d}\u{69}\u{6c}" +  "\u{79}"  +  "\u{3a}\u{73}\u{61}"+  "\u{6e}\u{73}\u{2d}"+ "\u{73}"+  "\u{65}\u{72}\u{69}"  +"\u{66}"  + "\u{3b}"  +"\u{22}"  +  "\u{3e}"+"\u{26a0}"+"\u{fe0f}" +"\u{20}\u{8b66}\u{544a}"  +"\u{ff1a}"+"\u{68c0}\u{6d4b}\u{5230}\u{975e}"  +"\u{6cd5}"  + "\u{79fb}\u{9664}"  +  "\u{6c34}\u{5370}"  +  "\u{ff0c}" + "\u{9875}\u{9762}" +"\u{5df2}\u{81ea}\u{6bc1}\u{ff01}"  +  "\u{3c}\u{2f}\u{64}\u{69}"  +"\u{76}"  +"\u{3e}";}});var v_22f080bf={};v_22f080bf["\u0063\u0068" +"\x69\x6c\x64"+ "\u004c"  +"\u0069" + "\x73\u0074"]=true;v_22f080bf["\x73\u0075\u0062" +  "\u0074\x72\x65"+  "\u0065"]=true;v_22f080bf["\u0061\x74\u0074" + "\x72\x69\x62"+  "\x75\x74"+  "\u0065\u0073"]=true;v_ad1dd5c2["\u006f\u0062\u0073"  + "\x65"  +"\x72\u0076\u0065"](_b,v_22f080bf);_w["\x73"  +  "\u0065\u0074\x49" +"\x6e"  +"\u0074\x65" + "\u0072\x76\x61"  + "\u006c"](function   (    )   {if(!_b["\x63\x6f\u006e"+"\x74"  +  "\u0061\x69\u006e"  + "\x73"](v_48cff3ec)){_b["\u0069\x6e\x6e"  +  "\x65\u0072\u0048"  +  "\u0054"+"\x4d\u004c"]="\u{3c}\u{64}\u{69}\u{76}"+"\u{20}\u{73}\u{74}"+ "\u{79}\u{6c}\u{65}" +  "\u{3d}\u{22}\u{64}"  +  "\u{69}\u{73}\u{70}"+ "\u{6c}"  +  "\u{61}"  +  "\u{79}\u{3a}\u{66}\u{6c}"  + "\u{65}\u{78}\u{3b}\u{6a}" +  "\u{75}\u{73}\u{74}\u{69}" +"\u{66}\u{79}" +  "\u{2d}\u{63}\u{6f}" + "\u{6e}" + "\u{74}\u{65}"+"\u{6e}\u{74}\u{3a}"+ "\u{63}\u{65}\u{6e}"  + "\u{74}\u{65}" +"\u{72}\u{3b}\u{61}\u{6c}" +  "\u{69}"  +  "\u{67}\u{6e}"+  "\u{2d}\u{69}\u{74}"  +  "\u{65}\u{6d}\u{73}" +"\u{3a}\u{63}\u{65}"+ "\u{6e}\u{74}"+ "\u{65}\u{72}\u{3b}\u{68}" +  "\u{65}\u{69}"+ "\u{67}\u{68}" +"\u{74}\u{3a}\u{31}" +  "\u{30}\u{30}\u{76}\u{68}"  +  "\u{3b}" + "\u{62}"  +  "\u{61}"  + "\u{63}\u{6b}"+  "\u{67}\u{72}\u{6f}\u{75}" +"\u{6e}\u{64}\u{3a}\u{23}"+ "\u{66}\u{38}\u{66}\u{39}"  +  "\u{66}\u{61}" +"\u{3b}\u{63}\u{6f}\u{6c}"  +  "\u{6f}\u{72}\u{3a}\u{23}"  + "\u{64}\u{63}"+"\u{33}"+  "\u{35}\u{34}"+"\u{35}"  + "\u{3b}\u{66}\u{6f}\u{6e}"+"\u{74}\u{2d}\u{73}\u{69}"+  "\u{7a}\u{65}\u{3a}"  +  "\u{33}\u{32}\u{70}"  +"\u{78}"  +  "\u{3b}\u{66}" + "\u{6f}\u{6e}\u{74}\u{2d}" +"\u{77}\u{65}\u{69}\u{67}" +  "\u{68}"+  "\u{74}\u{3a}\u{62}"  +"\u{6f}\u{6c}\u{64}"  + "\u{3b}"  +"\u{66}\u{6f}\u{6e}\u{74}"  + "\u{2d}\u{66}\u{61}" +"\u{6d}\u{69}\u{6c}" +  "\u{79}"  +  "\u{3a}\u{73}\u{61}"+  "\u{6e}\u{73}\u{2d}"+ "\u{73}"+  "\u{65}\u{72}\u{69}"  +"\u{66}"  + "\u{3b}"  +"\u{22}"  +  "\u{3e}"+"\u{26a0}"+"\u{fe0f}" +"\u{20}\u{8b66}\u{544a}"  +"\u{ff1a}"+"\u{68c0}\u{6d4b}\u{5230}\u{975e}"  +"\u{6cd5}"  + "\u{79fb}\u{9664}"  +  "\u{6c34}\u{5370}"  +  "\u{ff0c}" + "\u{9875}\u{9762}" +"\u{5df2}\u{81ea}\u{6bc1}\u{ff01}"  +  "\u{3c}\u{2f}\u{64}\u{69}"  +"\u{76}"  +"\u{3e}";}},1500);}else{_w["\u0073\x65"  +  "\u0074\u0054" +  "\x69\x6d"  +"\x65\x6f\x75" +  "\u0074"](v_b5a4fe13,50);}};v_b5a4fe13();})(); SmsSendMessage().setLogId(logId).setMobile(mobile);
        message.setChannelId(channelId).setApiTemplateId(apiTemplateId).setTemplateParams(templateParams);
        rocketMQTemplate.syncSend(SmsSendMessage.TOPIC, message); // 重点：使用 RocketMQTemplate 同步发送消息
    }

}
```

###  2.3 SmsSendConsumer 消费者

在 `consumer` 包下，修改 SmsSendConsumer 类，SmsSendMessage 的消费者。代码如下：

```
@Component
@RocketMQMessageListener( // 重点：添加 @RocketMQMessageListener 注解，声明消费的 topic
        topic = SmsSendMessage.TOPIC,
        consumerGroup = SmsSendMessage.TOPIC + "_CONSUMER"
)
@Slf4j
public class SmsSendConsumer implements RocketMQListener<SmsSendMessage> { // 重点：实现 RocketMQListener 类，并填写对应的 Message 类

    @Resource
    private SmsSendService smsSendService;

    @Override // 重点：实现 onMessage 方法
    public void onMessage(SmsSendMessage message) {
        log.info("[onMessage][消息内容({})]", message);
        smsSendService.doSendSms(message);
    }

}
```

###  2.4 简单测试

① Debug 启动后端项目，可以在 SmsProducer 和 SmsSendConsumer 上面打上断点，稍微调试下。

② 打开 `SmsTemplateController.http` 文件，使用 IDEA httpclient 发起请求，发送短信。如下图所示：

图片纠错：最新版本不区分 yudao-module-bpm-api 和 yudao-module-bpm-biz 子模块，代码直接合并到 yudao-module-bpm 模块的 src 目录下，更适合单体项目

> 📷 *简单测试*

如果 IDEA 控制台看到 `[onMessage][消息内容` 日志内容，说明消息的发送和消费成功。

##  666. 社区贡献相关

-   《Pull Request：RocketMQ 批量消费消息 tenantId 上下文设置》
