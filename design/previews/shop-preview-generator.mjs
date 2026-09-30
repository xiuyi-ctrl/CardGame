import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outputDir = dirname(fileURLToPath(import.meta.url));
const icons = {
  berry: '<rect x="14" y="9" width="20" height="7" fill="#51b879"/><rect x="21" y="4" width="7" height="10" fill="#82d690"/><rect x="11" y="17" width="28" height="21" fill="#581c36"/><rect x="15" y="17" width="20" height="21" fill="#de5274"/><rect x="18" y="22" width="5" height="5" fill="#ff9da3"/><rect x="29" y="28" width="5" height="5" fill="#ff9da3"/><rect x="21" y="39" width="9" height="5" fill="#7a213d"/>',
  meat: '<rect x="5" y="27" width="16" height="8" fill="#efe2ba"/><rect x="6" y="22" width="7" height="7" fill="#efe2ba"/><rect x="7" y="35" width="7" height="6" fill="#efe2ba"/><rect x="18" y="12" width="27" height="27" fill="#57202e"/><rect x="21" y="15" width="21" height="21" fill="#d36a67"/><rect x="25" y="17" width="10" height="8" fill="#f09b8b"/>',
  gem: '<path d="M15 7h22l10 13-21 25L5 20z" fill="#132535"/><path d="M17 11h18l7 9-16 19L10 20z" fill="#44bdd0"/><path d="M17 11h18l-9 10H10z" fill="#95f4df"/><path d="M26 21h16L26 39z" fill="#258da9"/>',
  scout: '<rect x="13" y="8" width="27" height="33" fill="#4a3453"/><rect x="17" y="11" width="20" height="27" fill="#d8bf83"/><rect x="22" y="17" width="13" height="3" fill="#7a6156"/><rect x="22" y="23" width="9" height="3" fill="#7a6156"/><rect x="30" y="29" width="12" height="12" fill="#112435"/><rect x="32" y="31" width="8" height="8" fill="#70d8bd"/><rect x="39" y="39" width="8" height="4" fill="#70d8bd"/>',
  book: '<rect x="9" y="9" width="32" height="35" fill="#161e34"/><rect x="13" y="9" width="27" height="31" fill="#ac655f"/><rect x="18" y="12" width="18" height="25" fill="#dd8570"/><rect x="23" y="17" width="8" height="11" fill="#e8c26a"/><rect x="12" y="39" width="32" height="5" fill="#f3dfb3"/>',
  potion: '<rect x="20" y="4" width="12" height="6" fill="#d6d0b1"/><rect x="18" y="10" width="16" height="6" fill="#475f70"/><rect x="14" y="16" width="24" height="27" fill="#151e33"/><rect x="18" y="20" width="16" height="19" fill="#4cc4b3"/><rect x="21" y="22" width="6" height="12" fill="#a0f8d8"/><rect x="12" y="40" width="28" height="5" fill="#203246"/>',
  hammer: '<rect x="11" y="7" width="30" height="15" fill="#142131"/><rect x="15" y="10" width="23" height="9" fill="#a4c8ca"/><rect x="27" y="20" width="8" height="25" fill="#4d2b27"/><rect x="29" y="21" width="5" height="21" fill="#c48e5d"/><rect x="8" y="20" width="8" height="5" fill="#73d7c6"/>',
  revival: '<rect x="16" y="9" width="20" height="5" fill="#e8c26a"/><rect x="11" y="14" width="30" height="22" fill="#293449"/><rect x="15" y="15" width="22" height="21" fill="#e9e2c5"/><path d="M15 28h7v-7h5v10h10" fill="none" stroke="#70d8bd" stroke-width="3"/><rect x="18" y="37" width="17" height="6" fill="#e8c26a"/><rect x="3" y="12" width="5" height="5" fill="#70d8bd"/><rect x="41" y="8" width="5" height="5" fill="#70d8bd"/>',
};

const mainItems = [
  { name: '浆果', desc: '驯服成功率一般，生命加成低', price: 5, icon: 'berry', status: 'active' },
  { name: '鲜肉', desc: '驯服成功率较高', price: 9, icon: 'meat', status: 'sold' },
  { name: '秘晶', desc: '驯服成功率最高，大幅提升生命', price: 14, icon: 'gem', status: 'poor' },
  { name: '侦察符', desc: '查看指定一关的全部节点情报', price: 16, icon: 'scout', status: 'poor' },
];
const proficiencyItems = [
  { name: '成长之书（小）', desc: '选择一只宠物，获得 1 成长点', price: 12, icon: 'book', status: 'active' },
  { name: '治疗圣水', desc: '全队回复 50% 生命', price: 30, icon: 'potion', status: 'sold' },
  { name: '技能强化石', desc: '强化 1 个技能，无需成长点', price: 40, icon: 'hammer', status: 'poor' },
  { name: '复活石', desc: '复活 1 只死亡宠物，保留 50% 属性', price: 60, icon: 'revival', status: 'poor' },
];

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const txt = (x, y, value, size, fill = '#eae4f5', weight = 400, extra = '') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
const rect = (x, y, width, height, fill, stroke = 'none', strokeWidth = 0) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

function itemCard(item, x, y, width, height, compact) {
  const disabled = item.status !== 'active';
  const border = item.status === 'active' ? '#70d8bd' : '#43566b';
  const buttonWidth = compact ? 82 : 100;
  const buttonX = x + width - buttonWidth - 14;
  const buttonY = y + height - (compact ? 42 : 48);
  const iconSize = compact ? 51 : 62;
  const iconX = x + (compact ? 14 : 18);
  const iconY = y + (compact ? 28 : 39);
  const textX = iconX + iconSize + (compact ? 12 : 15);
  const titleSize = compact ? 17 : 19;
  const descSize = compact ? 12 : 14;
  const buttonText = item.status === 'sold' ? '已购买' : item.status === 'poor' ? '金币不足' : '购买';
  const descMax = compact ? 16 : 20;
  const description = [...item.desc];
  const descLines = [description.slice(0, descMax).join(''), description.slice(descMax, descMax * 2).join('')].filter(Boolean);
  return `<g>
    ${rect(x, y, width, height, disabled ? '#101827ed' : '#102536f2', border, 3)}
    ${rect(x + 5, y + 5, width - 10, height - 10, 'none', disabled ? '#26354a' : '#315c65', 1)}
    ${rect(iconX - 4, iconY - 4, iconSize + 8, iconSize + 8, '#122336', '#3e6370', 2)}
    <g transform="translate(${iconX} ${iconY}) scale(${iconSize / 50})" shape-rendering="crispEdges" opacity="${disabled ? 0.68 : 1}">${icons[item.icon]}</g>
    ${txt(textX, y + (compact ? 34 : 45), item.name, titleSize, disabled ? '#aeb9c9' : '#fff1d0', 700)}
    ${descLines.map((line, index) => txt(textX, y + (compact ? 60 : 74) + index * (compact ? 17 : 20), line, descSize, '#b7c8d1')).join('')}
    ${rect(x + 13, y + height - (compact ? 45 : 53), compact ? 76 : 87, 29, '#172d37', '#74633f', 1)}
    ${txt(x + 23, y + height - (compact ? 25 : 32), `● ${item.price}`, compact ? 14 : 16, '#f5d681', 700)}
    ${rect(buttonX, buttonY, buttonWidth, compact ? 30 : 34, disabled ? '#3b4152' : '#e8c26a', disabled ? '#626778' : '#fff0af', 2)}
    ${txt(buttonX + buttonWidth / 2, buttonY + (compact ? 21 : 23), buttonText, compact ? 13 : 15, disabled ? '#a9b0bd' : '#172133', 700, 'text-anchor="middle"')}
    ${item.status === 'sold' ? `<path d="M${x + 3} ${y + 3}h77v22h-77z" fill="#5d3f59"/>${txt(x + 13, y + 20, '已售', 13, '#e8d0dc', 700)}` : ''}
  </g>`;
}

function actionCard(x, y, width, height, title, detail, button, compact, muted = false) {
  const buttonW = compact ? 86 : 102;
  const buttonH = compact ? 27 : 32;
  return `<g>
    ${rect(x, y, width, height, '#101d2ded', '#44636d', 2)}
    ${txt(x + 15, y + (compact ? 21 : 28), title, compact ? 15 : 17, '#e8c26a', 700)}
    ${txt(x + 15, y + (compact ? 41 : 52), detail, compact ? 11 : 13, '#b5c6d0')}
    ${rect(x + width - buttonW - 14, y + height - buttonH - (compact ? 10 : 13), buttonW, buttonH, muted ? '#41625d' : '#244b58', muted ? '#87cdb3' : '#70d8bd', 2)}
    ${txt(x + width - buttonW / 2 - 14, y + height - (compact ? 17 : 22), button, compact ? 13 : 15, '#e6f7ec', 700, 'text-anchor="middle"')}
  </g>`;
}

function preview({ width, height, mode, filename }) {
  const compact = width < 1100;
  const prof = mode === 'proficiency';
  const gold = prof ? 35 : 12;
  const items = prof ? proficiencyItems : mainItems;
  const margin = compact ? 10 : 16;
  const topHeight = compact ? 66 : 82;
  const panelX = compact ? 354 : 552;
  const panelW = width - panelX - margin;
  const panelY = compact ? 88 : 112;
  const panelH = height - panelY - margin;
  const gridX = panelX + (compact ? 13 : 18);
  const gridW = panelW - (compact ? 26 : 36);
  const gap = compact ? 10 : 15;
  const cardW = (gridW - gap) / 2;
  const cardH = compact ? 151 : 202;
  const firstY = compact ? 145 : 192;
  const secondY = firstY + cardH + gap;
  const actionsY = secondY + cardH + (compact ? 13 : 19);
  const actionsH = compact ? 73 : 89;
  const sceneWidth = panelX + 40;
  const title = prof ? '远征补给站' : '林间商铺';
  const route = prof ? '熟练度远征 · 第 12 层' : '第一幕 · 翠绿之径';
  const footer = prof
    ? actionCard(gridX, actionsY, gridW, actionsH, '刷新货架', '花费 5 金币 · 剩余 3 次', '刷新', compact)
    : actionCard(gridX, actionsY, cardW, actionsH, '立即休整', '免费为全队恢复生命', '休整', compact, true)
      + actionCard(gridX + cardW + gap, actionsY, cardW, actionsH, '刷新货架', '花费 10 金币 · 剩余 2 次', '刷新', compact);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="sceneFade"><stop offset="0" stop-color="#101325" stop-opacity="0"/><stop offset="0.75" stop-color="#0b1020" stop-opacity=".38"/><stop offset="1" stop-color="#0b1020" stop-opacity=".7"/></linearGradient></defs>
    <style>text{font-family:'Microsoft YaHei','PingFang SC',system-ui,sans-serif;letter-spacing:.2px}</style>
    <image href="shop-stall-background.png" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMinYMid slice"/>
    ${rect(sceneWidth - 90, 0, width - sceneWidth + 90, height, 'url(#sceneFade)')}
    ${rect(margin, margin, width - margin * 2, topHeight, '#0b1429ef', '#47526a', 3)}
    ${rect(margin + 7, margin + 7, width - margin * 2 - 14, topHeight - 14, 'none', '#263b54', 1)}
    ${txt(margin + 25, margin + (compact ? 30 : 36), '✦', compact ? 24 : 30, '#e8c26a', 700)}
    ${txt(margin + (compact ? 60 : 72), margin + (compact ? 31 : 37), title, compact ? 23 : 29, '#fff1d0', 800)}
    ${txt(margin + (compact ? 62 : 74), margin + (compact ? 52 : 62), route, compact ? 12 : 14, '#b7cad3')}
    ${rect(width - margin - (compact ? 330 : 420), margin + (compact ? 13 : 18), compact ? 105 : 130, compact ? 41 : 46, '#14243a', '#53647b', 2)}
    ${txt(width - margin - (compact ? 315 : 403), margin + (compact ? 39 : 48), `金币  ${gold}`, compact ? 15 : 18, '#f4d47f', 700)}
    ${rect(width - margin - (compact ? 213 : 277), margin + (compact ? 13 : 18), compact ? 100 : 124, compact ? 41 : 46, '#14243a', '#53647b', 2)}
    ${txt(width - margin - (compact ? 196 : 258), margin + (compact ? 39 : 48), `队伍 ${prof ? '3' : '2'}/5`, compact ? 14 : 17, '#bde9dc', 700)}
    ${rect(width - margin - (compact ? 104 : 140), margin + (compact ? 13 : 18), compact ? 90 : 126, compact ? 41 : 46, '#1b2941', '#7a88a6', 2)}
    ${txt(width - margin - (compact ? 59 : 77), margin + (compact ? 39 : 48), '离开 →', compact ? 15 : 18, '#eae4f5', 700, 'text-anchor="middle"')}
    ${rect(panelX, panelY, panelW, panelH, '#0c1727eb', '#37475f', 4)}
    ${rect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, 'none', '#223c52', 1)}
    ${txt(gridX, compact ? 121 : 153, '今日货架', compact ? 20 : 24, '#fff1d0', 800)}
    ${txt(panelX + panelW - (compact ? 13 : 18), compact ? 120 : 152, '随机上架 · 4 件', compact ? 12 : 14, '#a6c6c8', 500, 'text-anchor="end"')}
    ${items.map((item, index) => itemCard(item, gridX + (index % 2) * (cardW + gap), firstY + Math.floor(index / 2) * (cardH + gap), cardW, cardH, compact)).join('')}
    ${footer}
  </svg>`;
  writeFileSync(join(outputDir, filename), svg, 'utf8');
}

preview({ width: 1280, height: 860, mode: 'main', filename: 'shop-main-1280x860.svg' });
preview({ width: 1280, height: 860, mode: 'proficiency', filename: 'shop-proficiency-1280x860.svg' });
preview({ width: 960, height: 640, mode: 'main', filename: 'shop-main-960x640.svg' });
