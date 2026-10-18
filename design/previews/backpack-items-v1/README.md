# 背包物品独立美术 v1

素材已接入新版背包的物品网格与右侧详情，运行时副本位于 `public/backpack-item-icons/`，合集副本位于 `美术素材/backpack-item-icons/`。其他界面仍使用原素材路径；物品效果、消耗和存档结构不变。

- `foods-preview.png`：4 种捕获食物。
- `main-preview.png`：10 种常规道具。
- `growth-preview.png`：9 种远征道具。
- `icons/`：23 张按实际物品 ID 命名的 128×128 透明 PNG。
- `manifest.json`：名称、分组及文件映射。`heal_potion_g` 和 `heal_potion` 为同一种治疗圣水外观，共用 `heal_potion.png`。

原画使用内置 imagegen，采用统一深墨色像素描边、左上光源及 3/4 视角；色彩与轮廓均用于区分用途。三个分组的完整生成提示词保留于 `foods-prompt.txt`、`main-prompt.txt`、`growth-prompt.txt`。

`guides/` 仅为生成时的布局参考；`foods/`、`main/`、`growth/` 保留原始洋红底图、透明图集、拆分结果及检查记录，均不作为运行时动画。使用 generate2dsprite 处理器去底、缩放及拆分，`prepare_previews.py` 仅用于文件命名和添加中文预览标签，不绘制图标本体。

药水以颜色、瓶形和符号区分：攻击为交叉剑，速度为闪电，生命为心形，虚弱为断剑，缓速为蛛网，腐蚀为骷髅。成长书按装帧与厚度区分，遗忘石为灰色旋纹，还原石为青色回转纹，强化石为金色锤纹，复活石为羽翼绿石。
