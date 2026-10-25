# 炉甲獾、灯翅蛾改形 v2

2026-10-25。用户认为v1变化太小，要求重做，并要求以后进化体变化更明显。v1保留为历史稿，本目录为新的设计候选，尚未接入游戏。

| 生物 | 明显结构变化 | 保留谱系标记 | 成品与提示词 |
| --- | --- | --- | --- |
| 炉甲獾 | 从伏地四足幼兽转为双足挺立重甲护卫；小头宽肩、展开的肩背炉甲、盾形粗壮前臂 | 奶白面纹、琥珀眼、炭黑煤甲与橙色炉缝 | [透明原稿](../coal-guard-pixel-v2/sprite-original.png)、[64像素](../coal-guard-pixel-v2/sprite-64.png)、[提示词](../coal-guard-pixel-v2/prompt-used.txt) |
| 灯翅蛾 | 从圆头圆翼幼蛾转为小头宽尖翼成蛾；加长垂直灯囊、下垂双尾与羽状触角 | 奶油绒毛、金黄翅纹、琥珀灯腹 | [透明原稿](../lantern-moth-pixel-v2/sprite-original.png)、[64像素](../lantern-moth-pixel-v2/sprite-64.png)、[提示词](../lantern-moth-pixel-v2/prompt-used.txt) |

通过内置image_gen重绘，引用v1仅锁定谱系与像素风格；generate2dsprite做透明清理与严格QC。`preview-original.png`为清晰原稿合览，左炉甲獾、右灯翅蛾；`preview-64.png`为64像素版最近邻合览。

每只目录保留原稿raw.png、提示词、透明原稿sprite-original.png、64×64成品sprite-64.png、512预览及QC。64像素版透明度均为0／255、最长边56像素、底部y=59、四周安全边至少4像素；炉甲獾24色，灯翅蛾23色。已查看原稿合览与64像素预览，主体完整，未见裁切和品红残留；处理器严格QC通过。

后续规则已写入AGENTS.md及生物像素美术统一规范.md：进化通过身体结构、体态和剪影产生明显变化，不以加细节或提高像素密度替代成长差异。

未覆盖public或美术素材，未修改游戏数值、技能或进化路线，未生成APK、提交或发布。
