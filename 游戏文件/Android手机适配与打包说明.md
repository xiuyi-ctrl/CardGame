# Android手机适配与打包说明

核对日期：2026-10-27。以下为当前代码规则；待设计内容另行标注。

## 显示和操作约定

Android使用sensorLandscape，支持两个横屏方向；不提供竖屏游戏功能，竖屏仅提示旋转。启动隐藏状态栏和导航栏，恢复前台／分享返回后恢复全屏；边缘滑动可暂时唤出系统栏，安全区仍保护按钮。

手机样式限定`html.mobile-ui`，不得影响电脑布局。按实际宽高、安全区与横纵比调整组件，不整体缩放页面；正文原则上不小于12px，主要触点至少44×44px。标题、返回、确认、购买、继续和结束回合固定可达，空间不足先缩装饰、立绘和间距。

常规页一屏优先；图鉴、背包、地图、成就、测试长列表和完整详情允许必要滚动。保留条件、价格、风险、冷却与次数，不能用隐藏溢出代替可达。熟练度开局选宠页保留原布局，不纳入内容精简。

手机战斗长按生物查看详情，不显示详情按钮；布阵保留点击／拖动，无“调整站位”按钮。技能双列、商店四件两列两行、招募两候选；招募不添加技能描述、下一形态或融合信息。存档导入／导出／关闭同排。

自动提示按内容决定高度，仅从底部定位，不继承桌面top入场动画；首帧到淡出不得闪高。菜单不得遮挡主要操作；手机与电脑的滚动条隐藏不能裁掉正文内容。

## 返回、存档与升级

Android返回优先关闭可关闭弹窗和详情，再取消目标／站位；不能绕过招募锁定、胜负等强制步骤。后台保存最新逻辑状态、暂停表现计时，恢复不重算战斗。双模式存档按槽隔离，导出备份后再进行覆盖升级或更换签名安装。

首页左下角每次冷启动检查GitHub仓库正式Release中的APK，排除草稿／预发布／无APK版本，按数字比较版本；失败可重试且不阻止游戏。检查更新只提示并打开发布页，不自动替换安装。只有把APK上传对应正式Release才可被发现，Actions测试产物不等同正式发布。

## 本地工具链与命令

安装项目Node依赖、Android Studio、JDK21及SDK Platform36、Build Tools36.0.0、Platform Tools和命令行工具，接受许可。系统JDK17可保留，为本项目终端设置独立JDK21。

```powershell
$env:JAVA_HOME = 'E:\Java\jdk-21\jdk-21.0.12.1+1'
$env:ANDROID_HOME = 'E:\Android\Sdk'
npm run android:doctor
npm run android:debug
```

路径为本机示例，可改为实际安装目录。`android/local.properties`的sdk.dir也可指定SDK；该文件不提交。首次构建需下载Gradle和Maven依赖；Gradle分发地址见`android/gradle/wrapper/gradle-wrapper.properties`，网络失败优先检查镜像和连接，不改业务代码。

`npm run android:sync`重新构建并同步网页资源，`npm run android:open`打开原生工程。调试APK输出`android/app/build/outputs/apk/debug/app-debug.apk`；仅打开Android Studio不会自动同步刚改的网页。

正式包运行`npm run android:release`，需安全提供ANDROID_KEYSTORE_PATH、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD；缺失时工具拒绝正式打包。包名`com.petcardrogue.game`，版本来自package.json，versionCode=主版本×1000000＋次版本×1000＋修订号。同签名、同包名及符合系统版本规则才能覆盖；不要为解决签名冲突直接卸载而丢失存档。密钥、密码和APK不入Git。

Windows继续使用`npm run build`／`npm run dist`；标签发布工作流与手动Android测试工作流分开维护。生成新版APK后逐文件核对`assets/public/`与最新dist，记录提交、文件名和SHA-256；不在本说明固化会过期的“最新APK”哈希。

## 页面覆盖

下表列举全部游戏 Screen，并补充图鉴覆盖层与弹窗。括号内为源码状态名，可与独立渲染夹具核对。

| 页面组 | 页面与内容分区 |
| --- | --- |
| 开局 | 首页（title）、难度与遗物（difficulty-select）、初始伙伴（starter）、熟练度选宠（proficiency-select）；确认操作不随详情正文滚动 |
| 战斗准备 | 布阵（formation）、车轮战顺序（gauntlet-order）；常规满队伍紧凑显示，资料按需打开，确认出战固定 |
| 战斗 | 战斗（battle）；四行战场、技能列表、捕获／道具／换位、结束回合、菜单与详情 |
| 路线 | 地图（map）、瞭望塔（watchtower）；地图必要滑动、情报正文、节点尺寸与标题栏 |
| 战后 | 奖励及双候选招募（reward）、普通队伍及战后修整（roster）、新伙伴满员处理（tame-overflow） |
| 补给 | 主线／熟练度商店（shop）、背包物品／伙伴及列表／详情（backpack） |
| 事件 | 事件及孵化（event）、奇遇（special）、宝箱结果（chest）、营火休整（rest） |
| 常规成长 | 进化选宠／预览（roster 的 evolve 分支）、属性强化（boost）、造物（custom）、复活／空列表（revive-select） |
| 熟练度成长 | 技能学习／替换（skill-pick）、成长点分配／转移（growth-menu）、铁匠铺（blacksmith）、强化石（enhance-stone）、还原石（enhance-reset） |
| 熟练度其他 | 营火融合（rest-fusion）、融合选技能（rest-fusion-skill）、特殊效果选宠（roster 的 specialPending 分支）、竞技场三模式（arena3） |
| 结算 | 幕间（inter_act）、失败（gameover）、胜利（victory）、熟练度胜／负（proficiency-result）；评级和核心统计常驻，评分、记录和队伍按需查看，离开操作固定 |
| 辅助 | 图鉴覆盖层、成就（achievements）、存档管理、测试关卡类型（test-type）、测试选宠（test-pick）、测试配置（test-config） |

## 压力状态与弹窗

- 满队伍、全种类背包、空背包、无复活对象、空宝箱结果。
- 长事件正文、传奇长被动、多技能、多 Buff、三位数生命值。
- 商品已购买、金币不足、禁用的成长／招募／操作按钮。
- 捕获食物、战斗道具、敌我详情、技能详情、战斗记录、菜单、战斗胜负提示。
- 强化确认、成长转移确认、融合确认、侦查结果、孵化结果。
- 存档管理上叠加删除、覆盖和备份导入确认；验收使用隔离的内存存档桥，不接触真实存档。


## 验证矩阵与边界

横屏CSS视口640×320、640×360、740×360、844×390、915×412、1024×600；桌面1280×720、1600×900、1920×1080。复查运行中调整尺寸和选择保留，不提供竖屏功能验收。地区页及生态覆盖层、新事件硬币／选宠弹窗、造物七技能候选、八件遗物和最新测试入口也须纳入。

工具入口为`tools/mobile-layout/check.cjs`、`tools/mobile-layout/preview.tsx`，使用当前脚本支持的参数；全页面与弹窗都应覆盖。禁止把模拟DOM／静态CSS测试当视觉验收，不启动agent-browser；使用实际渲染截图，动画首帧使用真实动画采样。

自动测试、构建、桌面渲染不等于Android真机通过。仍需设备验证刘海／挖孔、字体放大、触控拖动／长按、系统返回、两个横屏、切后台、存档导入、覆盖升级及长时间连续游玩。历史不同版本的测试总数和旧APK报告不作为当前版本验收证明。
