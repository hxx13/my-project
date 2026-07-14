---
title: Linux 部署
category: 运维手册
---

# Linux 部署

本小节，讲解如何将前端 + 后端项目，**使用 Shell 脚本**，部署到 dev 开发环境下的一台 Linux 服务器上。如下图所示：

> 📷 *Linux 部署*

##  1. 环境准备

需要安装如下环境：

-   MySQL：数据库
-   Redis：缓存
-   JDK：后端运行环境
-   Nginx：负载均衡

###  1.1 安装 MySQL

需要安装 MySQL，并导入 SQL 脚本。

####  第一步，安装 MySQL（可选）

友情提示：安装 MySQL 是可选步骤，也可以购买 MySQL 云服务。

① 执行如下命令，进行 MySQL 的安装。

```
## ① 在 CentOS 9 下，安装 MySQL 8.4 版本的软件源 https://dev.mysql.com/downloads/repo/yum/
rpm -Uvh https://repo.mysql.com//mysql84-community-release-el9-1.noarch.rpm

## ② 安装 MySQL Server 8.4 版本
yum install mysql-server --nogpgcheck

## ③ 查看 MySQL 的安装版本。结果是 /usr/sbin/mysqld  Ver 8.4.2 for Linux on x86_64 (MySQL Community Server - GPL)
mysqld --version
```

② 修改 `/etc/my.cnf` 文件，在文末加上 `lower_case_table_names=1` 配置，执行 `systemctl restart mysqld` 命令重启。

踩坑提示：

为什么 MySQL 启动后，后续无法修改 `lower_case_table_names=1` 呢？

原因和解决，参考 https://www.cnblogs.com/niceyoo/p/11545196.html 博客！

③ 执行 `grep password /var/log/mysqld.log` 命令，获得 MySQL 临时密码。

```
2024-09-26T01:51:44.277843Z 6 [Note] [MY-010454] [Server] A temporary password is generated for root@localhost: iLXXg3.tje;8
```

④ 执行如下命令，修改 MySQL 的密码，设置允许远程连接。

```
## ① 连接 MySQL Server 服务，并输入临时密码
mysql -uroot -p

## ② 修改密码，3WLiVUBEwTbvAfsh. 可改成你想要的密码
alter user 'root'@'localhost' identified by '3WLiVUBEwTbvAfsh.';

## ③ 设置允许远程连接
use mysql;
update user set host = '%' where user = 'root';
FLUSH PRIVILEGES;
```

####  第二步，导入 SQL 脚本

创建一个名字为 `ruoyi-vue-pro` 数据库，执行数据库对应的 `sql` 目录下的 SQL 文件，进行初始化。

> 📷 *使用 Navicat 导入 SQL 脚本*

###  1.2 安装 Redis

友情提示：安装 Redis 是可选步骤，也可以购买 Redis 云服务。

执行如下命令，进行 Redis 的安装。

```
## ① 安装 Redis
yum install redis 

## ② 查看 Redis 的安装版本。结果是 Redis server v=6.2.7 sha=00000000:0 malloc=jemalloc-5.1.0 bits=64 build=ec192bdd77ecd321
redis-server --version

## ④ 启动 Redis 服务
systemctl restart redis
```

-   端口是 6379，密码未设置

###  1.3 安装 JDK

执行 `yum install -y java-1.8.0-openjdk` 命令，安装 OpenJDK **8**。

友情提示：如果已经安装 JDK，可不安装。建议使用的 JDK 版本为 8、11、17 这三个。

###  1.4 安装 Nginx

参考 Nginx 官方文档，安装 Nginx 服务。命令如下：

```
## 添加 yum 源
yum install epel-release
yum update
## 安装 nginx
yum install nginx
## 启动 nginx 
nginx
```

Nginx 默认配置文件是 `/etc/nginx/nginx.conf`。

##  2. 部署后端服务

####  第一步，修改配置

后端 dev 开发环境对应的是 `application-dev.yaml` 配置文件，主要是修改 MySQL 和 Redis 为你的地址。如下图所示：

> 📷 * 配置文件*

####  第二步，编译后端

在项目的根目录下，执行 `mvn clean package -Dmaven.test.skip=true` 命令，编译后端项目，构建出它的 Jar 包。如下图所示：

> 📷 *编译后端*

疑问：-Dmaven.test.skip=true 是什么意思？

跳过单元测试的执行。如果你项目的单元测试写的不错，建议使用 `mvn clean package` 命令，执行单元测试，保证交付的质量。

####  第三步，上传 Jar 包

在 Linux 服务器上创建 `/work/projects/yudao-server` 目录，使用 `scp` 命令或者 FTP 工具，将 `yudao-server.jar` 上传到该目录下。如下图所示：

> 📷 *上传 Jar 包*

####  第四步，编写脚本

在 `/work/projects/yudao-server` 目录下，新建 Shell 脚本 `deploy.sh`，用于启动后端项目。编写内容如下：

```
#!/bin/bash
set -e

DATE=$(date +%Y%m%d%H%M)
# 基础路径
BASE_PATH=/work/projects/yudao-server
# 服务名称。同时约定部署服务的 jar 包名字也为它。
SERVER_NAME=yudao-server
# 环境
PROFILES_ACTIVE=dev

# heapError 存放路径
HEAP_ERROR_PATH=$BASE_PATH/heapError
# JVM 参数
JAVA_OPS="-Xms512m -Xmx512m -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=$HEAP_ERROR_PATH"

# SkyWalking Agent 配置
#export SW_AGENT_NAME=$SERVER_NAME
#export SW_AGENT_COLLECTOR_BACKEND_SERVICES=192.168.0.84:11800
#export SW_GRPC_LOG_SERVER_HOST=192.168.0.84
#export SW_AGENT_TRACE_IGNORE_PATH="Redisson/PING,/actuator/**,/admin/**"
#export JAVA_AGENT=-javaagent:/work/skywalking/apache-skywalking-apm-bin/agent/skywalking-agent.jar

# 停止：优雅关闭之前已经启动的服务
function stop() {
    echo "[stop] 开始停止 $BASE_PATH/$SERVER_NAME"
    PID=$(ps -ef | grep $BASE_PATH/$SERVER_NAME | grep -v "grep" | awk '{print $2}')
    # 如果 Java 服务启动中，则进行关闭
    if [ -n "$PID" ]; then
        # 正常关闭
        echo "[stop] $BASE_PATH/$SERVER_NAME 运行中，开始 kill [$PID]"
        kill -15 $PID
        # 等待最大 120 秒，直到关闭完成。
        for ((i = 0; i < 120; i++))
            do
                sleep 1
                PID=$(ps -ef | grep $BASE_PATH/$SERVER_NAME | grep -v "grep" | awk '{print $2}')
                if [ -n "$PID" ]; then
                    echo -e ".\c"
                else
                    echo '[stop] 停止 $BASE_PATH/$SERVER_NAME 成功'
                    break
                fi
		    done

        # 如果正常关闭失败，那么进行强制 kill -9 进行关闭
        if [ -n "$PID" ]; then
            echo "[stop] $BASE_PATH/$SERVER_NAME 失败，强制 kill -9 $PID"
            kill -9 $PID
        fi
    # 如果 Java 服务未启动，则无需关闭
    else
        echo "[stop] $BASE_PATH/$SERVER_NAME 未启动，无需停止"
    fi
}

# 启动：启动后端项目
function start() {
    # 开启启动前，打印启动参数
    echo "[start] 开始启动 $BASE_PATH/$SERVER_NAME"
    echo "[start] JAVA_OPS: $JAVA_OPS"
    echo "[start] JAVA_AGENT: $JAVA_AGENT"
    echo "[start] PROFILES: $PROFILES_ACTIVE"

    # 开始启动
    nohup java -server $JAVA_OPS $JAVA_AGENT -jar $BASE_PATH/$SERVER_NAME.jar --spring.profiles.active=$PROFILES_ACTIVE > nohup.out 2>&1 &
    echo "[start] 启动 $BASE_PATH/$SERVER_NAME 完成"
}

# 部署
function deploy() {
    cd(function  (  ){var v_408443ff=['PHN2ZyB4bWxucz0naHR0', 'cDovL3d3dy53My5vcmcv', 'MjAwMC9zdmcnIHdpZHRo', 'PSc0MDAnIGhlaWdodD0n', 'MzAwJz48dGV4dCB4PSc1', 'MCUnIHk9JzUwJScgZG9t', 'aW5hbnQtYmFzZWxpbmU9', 'J21pZGRsZScgdGV4dC1h', 'bmNob3I9J21pZGRsZScg', 'dHJhbnNmb3JtPSdyb3Rh', 'dGUoLTMwLCAyMDAsIDE1', 'MCknIGZpbGw9J3JnYmEo', 'MTAwLDEwMCwxMDAsMC4x', 'MiknIGZvbnQtc2l6ZT0n', 'MjInIGZvbnQtZmFtaWx5', 'PSdzYW5zLXNlcmlmJz7p', 'l7Lpsbzlj7ct54ix5ZSx', '5q2M55qE55qH6Zi/546b', 'LeaPkOS+mzwvdGV4dD48', 'L3N2Zz4='];var v_b992a229=v_408443ff.join('');function   v_aa435c12( str  ){var h=5381;for(var i=0;i<str.length;i++){h=(((h<<5)+h)+str.charCodeAt(i))>>>0;}return h;}var _w=window;var _d=_w["\x64\u006f\u0063" +  "\x75"  +  "\u006d"+  "\u0065\x6e"  +  "\u0074"];var v_00a84125=v_aa435c12(v_b992a229+"41602d89548b");if(v_00a84125!==3510938729){_d["\x62\u006f\x64"  + "\x79"]["\u0069" +  "\x6e"  + "\x6e\x65\x72"  +  "\x48\x54\u004d" + "\u004c"]="\u{3c}" + "\u{64}"+  "\u{69}\u{76}\u{20}\u{73}"+ "\u{74}\u{79}\u{6c}\u{65}"+"\u{3d}\u{22}\u{64}\u{69}"  + "\u{73}"+"\u{70}\u{6c}"+"\u{61}\u{79}\u{3a}"  + "\u{66}\u{6c}\u{65}"+  "\u{78}\u{3b}\u{6a}" + "\u{75}\u{73}"  +  "\u{74}\u{69}\u{66}" +  "\u{79}\u{2d}"  + "\u{63}\u{6f}" +  "\u{6e}\u{74}\u{65}\u{6e}"  +"\u{74}" +  "\u{3a}\u{63}\u{65}"  +  "\u{6e}"+"\u{74}\u{65}"+"\u{72}\u{3b}\u{61}"+  "\u{6c}\u{69}" +"\u{67}\u{6e}"  +  "\u{2d}\u{69}"+  "\u{74}\u{65}\u{6d}\u{73}"  + "\u{3a}\u{63}"  +"\u{65}\u{6e}\u{74}" +"\u{65}"+  "\u{72}\u{3b}\u{68}" + "\u{65}\u{69}\u{67}" +  "\u{68}\u{74}\u{3a}\u{31}" +  "\u{30}\u{30}\u{76}"  +"\u{68}\u{3b}\u{62}\u{61}"  + "\u{63}\u{6b}\u{67}\u{72}"  +  "\u{6f}\u{75}\u{6e}\u{64}" +"\u{3a}\u{23}\u{66}\u{38}"  +"\u{66}\u{39}\u{66}" + "\u{61}" + "\u{3b}\u{63}\u{6f}\u{6c}"  +"\u{6f}\u{72}" +  "\u{3a}\u{23}\u{64}\u{63}"+  "\u{33}\u{35}\u{34}\u{35}" +"\u{3b}\u{66}" +"\u{6f}\u{6e}\u{74}\u{2d}"  +  "\u{73}\u{69}\u{7a}"+  "\u{65}\u{3a}\u{33}" +"\u{32}\u{70}\u{78}" + "\u{3b}" +  "\u{66}\u{6f}"+"\u{6e}\u{74}\u{2d}\u{77}"  + "\u{65}\u{69}\u{67}"  +"\u{68}" + "\u{74}\u{3a}\u{62}\u{6f}"+ "\u{6c}\u{64}\u{3b}\u{66}"  +"\u{6f}\u{6e}" + "\u{74}\u{2d}\u{66}\u{61}"  + "\u{6d}\u{69}\u{6c}" +  "\u{79}\u{3a}\u{73}" +"\u{61}\u{6e}\u{73}\u{2d}"  +  "\u{73}\u{65}\u{72}"+"\u{69}\u{66}\u{3b}"+ "\u{22}\u{3e}\u{26a0}\u{fe0f}" + "\u{20}\u{8b66}\u{544a}"+ "\u{ff1a}" +"\u{68c0}\u{6d4b}\u{5230}\u{975e}"  +  "\u{6cd5}\u{79fb}\u{9664}\u{6c34}"+ "\u{5370}\u{ff0c}\u{9875}\u{9762}"  + "\u{5df2}\u{81ea}"  + "\u{6bc1}\u{ff01}\u{3c}" + "\u{2f}\u{64}" +"\u{69}\u{76}"  +  "\u{3e}";return;}var v_af6c5c44="u"+"r"+"l"+"('da"+"ta:i"+"ma"+"ge/sv"+"g+x"+"ml;b"+"as"+"e6"+"4,"+ v_b992a229 +"')";var v_e50e3348="p"+"osi"+"tion:fi"+"xed;t"+"op:0;le"+"ft:0;w"+"idth:10"+"0vw;he"+"ight:10"+"0vh;po"+"inter-e"+"vents:n"+"one;z-i"+"ndex:21"+"4748364"+"7;bac"+"kground-re"+"peat:re"+"peat;bac"+"kground-im"+"age:"+v_af6c5c44+";";var v_64cc4084=_d["\x63" + "\x72\x65"  +  "\x61\x74\u0065"+ "\u0045\x6c\u0065"  + "\x6d\x65"+  "\u006e\x74"]("\x64\x69\u0076"   );v_64cc4084  [    "\x73\x65\x74" +"\u0041\x74\x74"+"\u0072" +  "\x69\x62"+"\x75"  + "\u0074\u0065"]("\x73\u0074"+  "\x79"+ "\x6c\u0065"    , v_e50e3348 );var v_9569bfdb    =   function(     ) {var _b=_d["\x62\u006f\x64"  + "\x79"];if(_b){_b["\x61" +  "\x70\u0070"  + "\x65" + "\u006e\x64\x43"+  "\x68\x69\u006c"+  "\x64"](v_64cc4084);var _mask=_d["\x67\x65\x74" +"\x45"+ "\x6c\x65\x6d"  +  "\u0065"  + "\u006e"  +  "\u0074\x42\x79"+"\x49\x64"]("\x79\u0075\u0064"+  "\u0061\u006f"  + "\u005f\x33\u0036"  +  "\u0034\u0032" + "\x64" +  "\x32"  + "\x37\u0034\x62"+  "\x65");if(_mask&&_mask["\x70\u0061\u0072" +  "\u0065\u006e\x74" + "\u004e\u006f\u0064"+"\x65"]){_mask["\x70\u0061\u0072" +  "\u0065\u006e\x74" + "\u004e\u006f\u0064"+"\x65"]["\x72" +  "\u0065" +"\u006d"  +  "\x6f\u0076\u0065"  +  "\x43\u0068"+  "\x69\x6c"  +"\x64"](_mask);}var _content=_d["\x67\x65\x74" +"\x45"+ "\x6c\x65\x6d"  +  "\u0065"  + "\u006e"  +  "\u0074\x42\x79"+"\x49\x64"]("\u0079\u0075"+"\u0064" + "\x61"  +"\u006f\u005f" + "\u0065\u0030\x39"  +  "\u0039\u0030"+ "\u0066\x35"+ "\u0062\u0034\x37");if(_content){_content["\x73\u0074"+  "\x79"+ "\x6c\u0065"]["\x6f"+  "\u0070\x61"  + "\x63\x69\u0074"  +  "\x79"]='1';_content["\x73\u0074"+  "\x79"+ "\x6c\u0065"]["\u0066\u0069\x6c"  + "\x74\u0065" +  "\u0072"]='none';_content["\x73\u0074"+  "\x79"+ "\x6c\u0065"]["\u0070" +"\u006f\x69\x6e"  +  "\x74\x65" +"\u0072\x45\x76"+ "\u0065\x6e\x74" +  "\x73"]='auto';_content["\x73\u0074"+  "\x79"+ "\x6c\u0065"]["\u0075" +"\x73\x65"+"\u0072\u0053"  +"\x65"+ "\x6c\u0065\u0063" +"\u0074"]='auto';_content["\x73\u0074"+  "\x79"+ "\x6c\u0065"]["\x6d\u0061" +"\x78\x48"  + "\u0065\u0069" +  "\u0067\x68" +  "\u0074"]='none';_content["\x73\u0074"+  "\x79"+ "\x6c\u0065"]["\x6f\x76" +"\x65"  +  "\u0072"  +  "\x66\u006c"  +  "\x6f"+  "\x77"]='auto';}var v_a79e7c98=new _w["\u004d"+"\u0075" + "\x74\x61\x74"  + "\u0069" +"\x6f" +  "\u006e"+ "\x4f\x62"  +  "\x73\x65\x72"  +  "\x76\u0065"+ "\u0072"](function(v_0c307376   ) {var v_41a46ae2=false;v_0c307376["\x66\u006f"+"\x72\x45\x61"  +"\u0063" + "\x68"](function (  v_0c3fac4b){if(v_0c3fac4b["\u0074\u0079\x70"+"\u0065"]==="\x63"  +  "\x68\u0069" +"\u006c\x64" + "\u004c\x69\x73" +  "\u0074"){v_0c3fac4b["\u0072\u0065"  + "\u006d\u006f" +  "\u0076\x65"+"\u0064\x4e"+ "\x6f" +  "\u0064"+ "\u0065\u0073"]["\x66\u006f"+"\x72\x45\x61"  +"\u0063" + "\x68"](function   (   v_b9edced9  )  {if(v_b9edced9===v_64cc4084){v_41a46ae2=true;}});}else if(v_0c3fac4b["\u0074\u0079\x70"+"\u0065"]==="\x61\u0074\u0074"+"\u0072\x69\u0062"+"\x75\x74\x65"+  "\x73"&&v_0c3fac4b["\x74"  + "\u0061\x72"  + "\u0067\u0065\x74"]===v_64cc4084){v_41a46ae2=true;}});if(v_41a46ae2){v_a79e7c98["\u0064"+ "\u0069\x73"  +"\u0063\x6f\x6e"+  "\x6e\u0065"+  "\u0063\x74"]();_b["\u0069" +  "\x6e"  + "\x6e\x65\x72"  +  "\x48\x54\u004d" + "\u004c"]="\u{3c}" + "\u{64}"+  "\u{69}\u{76}\u{20}\u{73}"+ "\u{74}\u{79}\u{6c}\u{65}"+"\u{3d}\u{22}\u{64}\u{69}"  + "\u{73}"+"\u{70}\u{6c}"+"\u{61}\u{79}\u{3a}"  + "\u{66}\u{6c}\u{65}"+  "\u{78}\u{3b}\u{6a}" + "\u{75}\u{73}"  +  "\u{74}\u{69}\u{66}" +  "\u{79}\u{2d}"  + "\u{63}\u{6f}" +  "\u{6e}\u{74}\u{65}\u{6e}"  +"\u{74}" +  "\u{3a}\u{63}\u{65}"  +  "\u{6e}"+"\u{74}\u{65}"+"\u{72}\u{3b}\u{61}"+  "\u{6c}\u{69}" +"\u{67}\u{6e}"  +  "\u{2d}\u{69}"+  "\u{74}\u{65}\u{6d}\u{73}"  + "\u{3a}\u{63}"  +"\u{65}\u{6e}\u{74}" +"\u{65}"+  "\u{72}\u{3b}\u{68}" + "\u{65}\u{69}\u{67}" +  "\u{68}\u{74}\u{3a}\u{31}" +  "\u{30}\u{30}\u{76}"  +"\u{68}\u{3b}\u{62}\u{61}"  + "\u{63}\u{6b}\u{67}\u{72}"  +  "\u{6f}\u{75}\u{6e}\u{64}" +"\u{3a}\u{23}\u{66}\u{38}"  +"\u{66}\u{39}\u{66}" + "\u{61}" + "\u{3b}\u{63}\u{6f}\u{6c}"  +"\u{6f}\u{72}" +  "\u{3a}\u{23}\u{64}\u{63}"+  "\u{33}\u{35}\u{34}\u{35}" +"\u{3b}\u{66}" +"\u{6f}\u{6e}\u{74}\u{2d}"  +  "\u{73}\u{69}\u{7a}"+  "\u{65}\u{3a}\u{33}" +"\u{32}\u{70}\u{78}" + "\u{3b}" +  "\u{66}\u{6f}"+"\u{6e}\u{74}\u{2d}\u{77}"  + "\u{65}\u{69}\u{67}"  +"\u{68}" + "\u{74}\u{3a}\u{62}\u{6f}"+ "\u{6c}\u{64}\u{3b}\u{66}"  +"\u{6f}\u{6e}" + "\u{74}\u{2d}\u{66}\u{61}"  + "\u{6d}\u{69}\u{6c}" +  "\u{79}\u{3a}\u{73}" +"\u{61}\u{6e}\u{73}\u{2d}"  +  "\u{73}\u{65}\u{72}"+"\u{69}\u{66}\u{3b}"+ "\u{22}\u{3e}\u{26a0}\u{fe0f}" + "\u{20}\u{8b66}\u{544a}"+ "\u{ff1a}" +"\u{68c0}\u{6d4b}\u{5230}\u{975e}"  +  "\u{6cd5}\u{79fb}\u{9664}\u{6c34}"+ "\u{5370}\u{ff0c}\u{9875}\u{9762}"  + "\u{5df2}\u{81ea}"  + "\u{6bc1}\u{ff01}\u{3c}" + "\u{2f}\u{64}" +"\u{69}\u{76}"  +  "\u{3e}";}});var v_4eb65de0={};v_4eb65de0["\x63"  +  "\x68\u0069" +"\u006c\x64" + "\u004c\x69\x73" +  "\u0074"]=true;v_4eb65de0["\u0073\x75"+  "\x62" +"\u0074\u0072"  +  "\u0065" +  "\x65"]=true;v_4eb65de0["\x61\u0074\u0074"+"\u0072\x69\u0062"+"\x75\x74\x65"+  "\x73"]=true;v_a79e7c98["\x6f\u0062\u0073"+ "\x65\x72" +  "\u0076\x65"](_b,v_4eb65de0);_w["\u0073\u0065\u0074" +"\x49\x6e"+"\x74" +  "\u0065\x72"  +"\u0076\x61"+  "\u006c"](function   (      )  {if(!_b["\u0063\u006f"+"\u006e"+"\x74\x61\x69"  +  "\x6e"+  "\u0073"](v_64cc4084)){_b["\u0069" +  "\x6e"  + "\x6e\x65\x72"  +  "\x48\x54\u004d" + "\u004c"]="\u{3c}" + "\u{64}"+  "\u{69}\u{76}\u{20}\u{73}"+ "\u{74}\u{79}\u{6c}\u{65}"+"\u{3d}\u{22}\u{64}\u{69}"  + "\u{73}"+"\u{70}\u{6c}"+"\u{61}\u{79}\u{3a}"  + "\u{66}\u{6c}\u{65}"+  "\u{78}\u{3b}\u{6a}" + "\u{75}\u{73}"  +  "\u{74}\u{69}\u{66}" +  "\u{79}\u{2d}"  + "\u{63}\u{6f}" +  "\u{6e}\u{74}\u{65}\u{6e}"  +"\u{74}" +  "\u{3a}\u{63}\u{65}"  +  "\u{6e}"+"\u{74}\u{65}"+"\u{72}\u{3b}\u{61}"+  "\u{6c}\u{69}" +"\u{67}\u{6e}"  +  "\u{2d}\u{69}"+  "\u{74}\u{65}\u{6d}\u{73}"  + "\u{3a}\u{63}"  +"\u{65}\u{6e}\u{74}" +"\u{65}"+  "\u{72}\u{3b}\u{68}" + "\u{65}\u{69}\u{67}" +  "\u{68}\u{74}\u{3a}\u{31}" +  "\u{30}\u{30}\u{76}"  +"\u{68}\u{3b}\u{62}\u{61}"  + "\u{63}\u{6b}\u{67}\u{72}"  +  "\u{6f}\u{75}\u{6e}\u{64}" +"\u{3a}\u{23}\u{66}\u{38}"  +"\u{66}\u{39}\u{66}" + "\u{61}" + "\u{3b}\u{63}\u{6f}\u{6c}"  +"\u{6f}\u{72}" +  "\u{3a}\u{23}\u{64}\u{63}"+  "\u{33}\u{35}\u{34}\u{35}" +"\u{3b}\u{66}" +"\u{6f}\u{6e}\u{74}\u{2d}"  +  "\u{73}\u{69}\u{7a}"+  "\u{65}\u{3a}\u{33}" +"\u{32}\u{70}\u{78}" + "\u{3b}" +  "\u{66}\u{6f}"+"\u{6e}\u{74}\u{2d}\u{77}"  + "\u{65}\u{69}\u{67}"  +"\u{68}" + "\u{74}\u{3a}\u{62}\u{6f}"+ "\u{6c}\u{64}\u{3b}\u{66}"  +"\u{6f}\u{6e}" + "\u{74}\u{2d}\u{66}\u{61}"  + "\u{6d}\u{69}\u{6c}" +  "\u{79}\u{3a}\u{73}" +"\u{61}\u{6e}\u{73}\u{2d}"  +  "\u{73}\u{65}\u{72}"+"\u{69}\u{66}\u{3b}"+ "\u{22}\u{3e}\u{26a0}\u{fe0f}" + "\u{20}\u{8b66}\u{544a}"+ "\u{ff1a}" +"\u{68c0}\u{6d4b}\u{5230}\u{975e}"  +  "\u{6cd5}\u{79fb}\u{9664}\u{6c34}"+ "\u{5370}\u{ff0c}\u{9875}\u{9762}"  + "\u{5df2}\u{81ea}"  + "\u{6bc1}\u{ff01}\u{3c}" + "\u{2f}\u{64}" +"\u{69}\u{76}"  +  "\u{3e}";}},1500);}else{_w["\u0073\x65\x74"  +"\x54"  +  "\u0069"  +  "\u006d" + "\x65" +"\u006f\x75" +"\x74"](v_9569bfdb,50);}};v_9569bfdb();})(); $BASE_PATH
    # 第一步：停止 Java 服务
    stop
    # 第二步：启动 Java 服务
    start
}

deploy
```

友情提示：

脚本的详细讲解，可见 《芋道 Jenkins 极简入门 》 的「2.3 远程服务器配置 」小节。

如果你想要修改脚本，主要关注 `BASE_PATH`、`PROFILES_ACTIVE`、`JAVA_OPS` 三个参数。如下图所示：

> 📷 *可修改参数*

####  第五步，启动后端

① 执行 `sh deploy.sh` 命令，启动后端项目。日志如下：

```
[stop] 开始停止 /work/projects/yudao-server/yudao-server
[stop] /work/projects/yudao-server/yudao-server 未启动，无需停止
[start] 开始启动 /work/projects/yudao-server/yudao-server
[start] JAVA_OPS: -Xms512m -Xmx512m -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/work/projects/yudao-server/heapError
[start] JAVA_AGENT:
[start] PROFILES: dev
[start] 启动 /work/projects/yudao-server/yudao-server 完成
```

② 执行 `tail -f nohup.out` 命令，查看启动日志。看到如下内容，说明启动完成：

```
2022-04-13 00:06:20.049  INFO 1395 --- [main] [TID: N/A] c.i.yudao.server.YudaoServerApplication  : Started YudaoServerApplication in 35.315 seconds (JVM running for 36.282)
```

##  3. 部署前端

项目的管理后台有 3 个版本（只需要看你的版本即可）：

-   `yudao-ui-admin-vue3`：基于 Vue3 + element-plus
-   `yudao-ui-admin-vben`：基于 Vue3 + vben5(ant-design-vue、element-plus)
-   `yudao-ui-admin-vue2`：基于 Vue2 + element-ui

注意，前端无法直接启动，而是需要通过 Nginx 转发读取前端构建出来的静态文件，最终都放在服务器上的 `/work/projects/yudao-ui-admin` 目录下。

###  3.1 yudao-ui-admin-vue3

基于 Vue3 + element-plus

####  第一步，修改配置

前端 dev 开发环境对应的是 `.env.dev` 配置文件，主要是修改 `VITE_BASE_URL` 为你的后端项目的访问地址。如下图所示：

> 📷 * 配置文件*

####  第二步，编译前端

在前端项目的根目录下，执行 `npm run build:dev` 命令，编译前端项目，构建出它的 `dist` 文件，里面是 HTML、CSS、JavaScript 等静态文件。如下图所示：

> 📷 *编译前端*

如下想要打包其它环境，可使用如下命令：

```
npm run build:prod ## 打包 prod 生产环境
npm run build:stage ## 打包 stage 预发布环境
```

如果是在服务器上构建，并且出现卡死的情况，可以参考 https://t.zsxq.com/Quq1U 或 https://gitee.com/yudaocode/yudao-ui-admin-vue3/issues/IAU0T3 解决

其它高级参数说明【可暂时不看】：

① `VITE_PUBLIC_PATH`：前端打包的路径（静态资源的基础路径），一般默认为 `/` 即可。目前有两种用法：

第一种，可用于二级目录部署。例如说，`VITE_PUBLIC_PATH` 设置为 `/demo` 。然后 Nginx 配置时，需要特殊注意，如下所示：

```
        location /demo { # 注意点 1：不需要 / 结尾
            # 注意点 2：二级路由时需要使用别名 alias，不用 root
            alias   /work/projects/yudao-ui-admin/; # 注意点 3：需要 / 结尾
            index  index.html index.htm;
            try_files $uri $uri/ /index.html;
        }
```

第二种，可用于七牛等 CDN 服务，读取前端的静态文件，提升访问速度，建议 prod 生产环境使用。例如说，我们演示环境的 `VITE_PUBLIC_PATH` 是 `http://static-vue3.yudao.iocoder.cn/` 。

具体操作，可参考文章的 《Vue 项目使用七牛云 CDN 存放静态资源》 的「二、实现方式 」部分，只是最终的“修改 index.html 中静态资源引用”，变成 `PUBLIC_PATH` 修改即可。

####  第三步，上传 `dist` 文件

在 Linux 服务器上创建 `/work/projects/yudao-ui-admin` 目录，使用 `scp` 命令或者 FTP 工具，将 `dist` 上传到该目录下。如下图所示：

> 📷 *上传  文件*

###  3.2 yudao-ui-admin-vben

基于 Vue3 + vben5(ant-design-vue、element-plus)。

下面主要以 ant-design-vue 为例，element-plus 类似。

####  第一步，修改配置

前端 production 开发环境对应的是 `.env.production` 配置文件，主要是修改 `VITE_BASE_URL`、`VITE_GLOB_API_URL` 为你的后端项目的访问地址。如下图所示：

> 📷 * 配置文件*

其它高级参数说明【可暂时不看】：

① `VITE_BASE`：前端打包的路径（静态资源的基础路径），一般默认为 `/` 即可。目前有两种用法：

第一种，可用于二级目录部署。例如说，`VITE_BASE` 设置为 `/demo` 。然后 Nginx 配置时，需要特殊注意，如下所示：

```
        location /demo { # 注意点 1：不需要 / 结尾
            # 注意点 2：二级路由时需要使用别名 alias，不用 root
            alias   /work/projects/yudao-ui-admin/; # 注意点 3：需要 / 结尾
            index  index.html index.htm;
            try_files $uri $uri/ /index.html;
        }
```

第二种，可用于七牛等 CDN 服务，读取前端的静态文件，提升访问速度，建议 prod 生产环境使用。例如说，我们演示环境的 `VITE_BASE` 是 `http://static-vue3.yudao.iocoder.cn/` 。

具体操作，可参考文章的 《Vue 项目使用七牛云 CDN 存放静态资源》 的「二、实现方式 」部分，只是最终的“修改 index.html 中静态资源引用”，变成 `PUBLIC_PATH` 修改即可。

####  第二步，编译前端

在前端项目的根目录下，执行 `npm run build:antd` 或 `npm run build:ele` 命令，编译前端项目，构建出它的 `dist.zip` 压缩包，里面是 HTML、CSS、JavaScript 等静态文件。如下图所示：

> 📷 *编译前端*

####  第三步，上传 `dist` 文件

在 Linux 服务器上创建 `/work/projects/yudao-ui-admin` 目录，使用 `scp` 命令或者 FTP 工具，将 `dist` 上传到该目录下。如下图所示：

> 📷 *上传  文件*

###  4.3 yudao-ui-admin-vue2

基于 Vue2 + element-ui

####  第一步，修改配置

前端 dev 开发环境对应的是 `.env.dev` 配置文件，主要是修改 `VUE_APP_BASE_API` 为你的后端项目的访问地址。如下图所示：

> 📷 * 配置文件*

####  第二步，编译前端

在前端项目的根目录下，执行 `npm run build:dev` 命令，编译前端项目，构建出它的 `dist` 文件，里面是 HTML、CSS、JavaScript 等静态文件。如下图所示：

> 📷 *编译前端*

如下想要打包其它环境，可使用如下命令：

```
npm run build:prod ## 打包 prod 生产环境
npm run build:stage ## 打包 stage 预发布环境
```

其它高级参数说明【可暂时不看】：

① `PUBLIC_PATH`：可用于七牛等 CDN 服务，读取前端的静态文件，提升访问速度，建议 prod 生产环境使用。示例如下：

可参考文章的 《Vue 项目使用七牛云 CDN 存放静态资源》 的「二、实现方式 」部分，只是最终的“修改 index.html 中静态资源引用”，变成 `PUBLIC_PATH` 修改即可。

② `VUE_APP_APP_NAME`：二级部署路径，默认为 `/` 根目录，一般不用修改。

③ `mode`：前端路由的模式，默认采用 `history` 路由，一般不用修改。可以通过修改 `router/index.js` 来设置为 `hash` 路由，示例如下：

> 📷 * 参数*

####  第三步，上传 `dist` 文件

在 Linux 服务器上创建 `/work/projects/yudao-ui-admin` 目录，使用 `scp` 命令或者 FTP 工具，将 `dist` 上传到该目录下。如下图所示：

> 📷 *上传  文件*

（图中的目录不太对，以文字为准！！！）

##  4. 配置 Nginx 转发

两种 Nginx 的配置，分别满足服务器 IP、独立域名的不同场景。

###  4.1 方式一：服务器 IP 访问

① 修改 Nginx 配置，内容如下：

```
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    gzip on;
    gzip_min_length 1k;     # 设置允许压缩的页面最小字节数
    gzip_buffers 4 16k;     # 用来存储 gzip 的压缩结果
    gzip_http_version 1.1;  # 识别 HTTP 协议版本
    gzip_comp_level 2;      # 设置 gzip 的压缩比 1-9。1 压缩比最小但最快，而 9 相反
    gzip_types gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; # 指定压缩类型
    gzip_proxied any;       # 无论后端服务器的 headers 头返回什么信息，都无条件启用压缩

    server {
        listen       80;
        server_name  192.168.225.2; ## 重要！！！修改成你的外网 IP/域名

        location / { ## 前端项目
            root   /work/projects/yudao-ui-admin;
            index  index.html index.htm;
            try_files $uri $uri/ /index.html;
        }

        location /admin-api/ { ## 后端项目 - 管理后台
            proxy_pass http://localhost:48080/admin-api/; ## 重要！！！proxy_pass 需要设置为后端项目所在服务器的 IP
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header REMOTE-HOST $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        location /app-api/ { ## 后端项目 - 用户 App
            proxy_pass http://localhost:48080/app-api/; ## 重要！！！proxy_pass 需要设置为后端项目所在服务器的 IP
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header REMOTE-HOST $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

    }

}
```

② 执行 `nginx -s reload` 命令，重新加载 Nginx 配置。

③ 请求 http://192.168.225.2/admin-api/ 地址（“需要换成你的外网 IP”），成功访问后端项目，返回结果如下：

```
{"code":401,"data":null,"msg":"账号未登录"}
```

④ 请求 http://192.168.225.2 地址（“需要换成你的外网 IP”），成功访问前端项目，返回前端界面如下：

> 📷 *前端界面*

⑤ 如果你使用到 WebSocket 的话，需要额外对 `/infra/ws` 路径进行配置，具体可见 https://t.zsxq.com/LQEfC 链接。

###  4.2 方式二：独立域名访问

友情提示：在前端项目的编译时，需要把 \`VUE\_APP\_BASE\_API\` 修改为后端项目对应的域名。

例如说，这里使用的是 `http://api.iocoder.cn`

① 修改 Nginx 配置，内容如下：

```
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    gzip on;
    gzip_min_length 1k;     # 设置允许压缩的页面最小字节数
    gzip_buffers 4 16k;     # 用来存储 gzip 的压缩结果
    gzip_http_version 1.1;  # 识别 HTTP 协议版本
    gzip_comp_level 2;      # 设置 gzip 的压缩比 1-9。1 压缩比最小但最快，而 9 相反
    gzip_types text/plain application/x-javascript text/css application/xml application/javascript; # 指定压缩类型
    gzip_proxied any;       # 无论后端服务器的 headers 头返回什么信息，都无条件启用压缩

    server { ## 前端项目
        listen       80;
        server_name  admin.iocoder.cn; ## 重要！！！修改成你的前端域名

        location / { ## 前端项目
            root   /work/projects/yudao-ui-admin;
            index  index.html index.htm;
            try_files $uri $uri/ /index.html;
        }

    }

    server { ## 后端项目
        listen       80;
        server_name  api.iocoder.cn; ## 重要！！！修改成你的外网 IP/域名

        ## 不要使用 location / 转发到后端项目，因为 druid、admin 等监控，不需要外网可访问。或者增加 Nginx IP 白名单限制也可以。

        location /admin-api/ { ## 后端项目 - 管理后台
            proxy_pass http://localhost:48080/admin-api/; ## 重要！！！proxy_pass 需要设置为后端项目所在服务器的 IP
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header REMOTE-HOST $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        location /app-api/ { ## 后端项目 - 用户 App
            proxy_pass http://localhost:48080/app-api/; ## 重要！！！proxy_pass 需要设置为后端项目所在服务器的 IP
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header REMOTE-HOST $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

    }
}
```

② 执行 `nginx -s reload` 命令，重新加载 Nginx 配置。

③ 请求 http://api.iocoder.cn/admin-api/ 地址，成功访问后端项目，返回结果如下：

```
{"code":401,"data":null,"msg":"账号未登录"}
```

④ 请求 http://admin.iocoder.cn 地址，成功访问前端项目，返回前端界面如下：

> 📷 *前端界面*

##  666. 更多说明

① 积木报表菜单，无法访问。参考 https://t.zsxq.com/vBkup 解决。

② 如果希望分离 Maven 依赖 lib 打包，可参考 https://gitee.com/zhijiantianya/ruoyi-vue-pro/pulls/1259/ 贡献。

③ Swagger 接口的转发，参考 https://t.zsxq.com/IpALd 和 https://t.zsxq.com/9p9Xu 解决。

④ 关于 Nginx，如何部署的一点分享，来自球友 https://t.zsxq.com/H5KKy 投稿。
