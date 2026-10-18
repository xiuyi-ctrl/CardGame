# 主模式流程独立美术 v1

本目录保存独立美术源素材，已接入事件、奇遇、新伙伴处理、幕间结算、通关与失败页面。运行时副本位于 public/main-flow-art，并同步到美术素材/main-flow-art。所有背景不含文字、面板或生物，属于固定装饰场景，不是可移动探索地图。

## 背景

- event-forest.png：事件，日间林地遗迹。
- encounter-shrine.png：奇遇，空置石台与林间祭坛。
- partner-camp.png：新伙伴处理，暮色营地。
- interact-sunset.png：幕间结算，落日山路。
- victory-dawn.png：通关结算，明亮山谷与远方城堡。
- defeat-dusk.png：失败结算，静谧湖畔营地。

## 图标

icons/ 内含 16 个独立 128×128 透明 PNG；命名及顺序见 manifest.json。sheet-transparent.png 为组合预览，不作为单张 UI 背景。生命、速度、金币、食物和生物立绘复用现有素材。图标中红心绷带用于阵亡统计，不替换生命图标。

由内置 image_gen 生成；背景以现有 map-act1.png 为像素风参考，逐个提示词保存在同名 .prompt.txt 中，图标提示词见 icons.prompt.txt。像素细节及色调已人工查看；图标经 generate2dsprite 去底、切分、居中和透明输出检查。仅接受了人工确认完整的原图单元边缘接触；输出无裁切、无空帧。自动产生的 animation.gif 不是运行时动画。

布局入口为 src/ui/App.tsx，共用展示组件为 src/ui/MainFlowArt.tsx，样式为 src/ui/mainFlow.css。事件分支、选择条件、替换确认、融合规则、幕间统计与最终评级算法均沿用原实现；新伙伴页面改为选中伙伴后从底部操作。图片纳入切换预加载。高内容区域可滚动但隐藏滚动条，结算标题和操作区固定可见。未提交 Git。
