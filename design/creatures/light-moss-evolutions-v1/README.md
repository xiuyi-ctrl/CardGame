# 光苔球两阶进化美术 v1

2026-10-25。对应现有进化链：光苔球light_moss→光苔兽moss_beast→日炎灵solar_spirit。仅设计美术，不更改技能、数值或进化路线。

| 生物 | 造型与成长差异 | 透明原稿 | 完整提示词 |
| --- | --- | --- | --- |
| 光苔兽 | 从圆球变为短腿四足苔兽；圆脸、短颈、背部三片卷叶和卷芽尾，保留幼年感 | [原稿](../moss-beast-pixel-v1/sprite-original.png) | [提示词](../moss-beast-pixel-v1/prompt-used.txt) |
| 日炎灵 | 从四足兽转为直立悬浮光灵；小头、成熟眼形、五瓣日叶冠、两侧叶斗篷及单根光尾 | [原稿](../solar-spirit-pixel-v1/sprite-original.png) | [提示词](../solar-spirit-pixel-v1/prompt-used.txt) |

两者保留奶白面部、苔绿配色、琥珀眼与金色菱形光核，靠身体结构和剪影体现进化，不靠提高细节密度。光苔兽不提前使用最终形态的叶冠和斗篷。

使用内置image_gen，引用已设计光苔球锁定谱系；炉甲獾仅用作同项目像素密度参考，未借用其动物结构。generate2dsprite完成透明处理并通过严格QC。

- `preview-original.png`为原稿合览，左光苔兽、右日炎灵。
- `preview-64.png`为64像素成品的最近邻合览。
- 各自目录保留raw.png、prompt-used.txt、sprite-original.png、sprite-64.png、preview-512.png、pixel-qc.json及export/pipeline-meta.json。

64像素成品均为64×64 RGBA、24种不透明颜色、透明度0／255、最长边56像素、底部y=59、四周至少4像素安全边。已查看清晰原稿合览和64像素放大，主体完整，未见品红残留。

2026-10-25已按用户要求将三阶清晰透明原稿一起接入：光苔球`public/light_moss.png`、光苔兽`public/moss_beast.png`、日炎灵`public/solar_spirit.png`，同步同名美术素材副本。战斗与布阵直接显示原稿，不经64像素画布重采样；图鉴、队伍、进化预览复用物种图片，旧存档缺失图片时仅补齐路径，不改技能、数值或投放。

本轮未重新打包APK、提交或发布。

接入验证：72项相关测试、类型检查和Windows项目构建通过。图鉴三只生物、战斗、布阵在六种横屏手机尺寸共30例、桌面三种尺寸共15例实际渲染通过；已抽查截图确认完整显示。三张图的public、dist和美术素材副本内容一致。报告及截图见`dump/light-moss-art-mobile/`、`dump/light-moss-art-desktop/`；手机真机尚未验证。
