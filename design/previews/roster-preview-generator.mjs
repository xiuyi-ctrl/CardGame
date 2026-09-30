import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(dir, '../../public');
const data = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;
const art = {
  background: data(join(dir, 'roster-camp-background.png')),
  momo: data(join(publicDir, 'battle-momo.png')),
  lulu: data(join(publicDir, '03.png')),
  fifi: data(join(publicDir, '02.png')),
  kiki: data(join(publicDir, '05.png')),
  mimi: data(join(publicDir, '06.png')),
  pipi: data(join(publicDir, '04.png')),
  momoQueen: data(join(publicDir, '01-1.png')),
  luluKing: data(join(publicDir, '03-1.png')),
};
const units = [
  { name: '迅迅', key: 'momo', hp: '10/10', spd: 3, field: true },
  { name: '泡泡', key: 'lulu', hp: '14/14', spd: 1, field: true },
  { name: '铁墩', key: 'kiki', hp: '12/12', spd: 2, field: true },
  { name: '灼灼', key: 'fifi', hp: '7/7', spd: 5 },
  { name: '咪咪', key: 'mimi', hp: '10/10', spd: 3 },
  { name: '迅迅', key: 'momo', hp: '8/10', spd: 3 },
  { name: '刺刺', key: 'pipi', hp: '11/11', spd: 2 },
  { name: '泡泡', key: 'lulu', hp: '11/14', spd: 1 },
];
const overflowUnits = [
  units[0], units[1], units[2], units[3], units[4],
  { name: '刺刺', key: 'pipi', hp: '11/11', spd: 2 },
  { name: '迅牙', key: 'momoQueen', hp: '18/18', spd: 4 },
  { name: '泡泡将', key: 'luluKing', hp: '22/22', spd: 2 },
];
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const rect = (x, y, w, h, fill, stroke = 'none', sw = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const text = (x, y, s, size = 16, fill = '#e9e9ef', weight = 400, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${escape(s)}</text>`;
const img = (key, x, y, w, h) => `<image href="${art[key]}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated"/>`;
const icon = (kind, x, y, size = 17) => `<use href="#${kind}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
const stat = (x, y, u, size = 14) => `${icon('heart', x, y - size + 2, size)}${text(x + size + 3, y, u.hp, size, '#f1e4da', 700)}${icon('bolt', x + size + 72, y - size + 2, size)}${text(x + size + 91, y, u.spd, size, '#f1e4da', 700)}`;
const panel = (x, y, w, h, fill = '#0d1a2bdc') => `${rect(x, y, w, h, fill, '#46536e', 4)}${rect(x + 7, y + 7, w - 14, h - 14, 'none', '#263c54', 1)}`;
const button = (x, y, w, h, label, variant = 'dark') => {
  const palette = variant === 'gold' ? ['#e8c26a', '#fff0ae', '#172136'] : variant === 'teal' ? ['#244c54', '#70d8bd', '#e4f5e9'] : variant === 'red' ? ['#35222f', '#9f6670', '#edc6cc'] : ['#1a2b40', '#59677f', '#cbd6df'];
  return `${rect(x, y, w, h, palette[0], palette[1], 2)}${text(x + w / 2, y + h / 2 + 6, label, 16, palette[2], 700, 'text-anchor="middle"')}`;
};
const shell = (title, subtitle, right) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="860" viewBox="0 0 1280 860">
  <defs>
    <linearGradient id="shade" x2="0" y2="1"><stop stop-color="#0b1021" stop-opacity=".34"/><stop offset="1" stop-color="#080d1d" stop-opacity=".62"/></linearGradient>
    <symbol id="heart" viewBox="0 0 24 24"><path fill="#111621" d="M3 4h7v3h4V4h7v4h3v7h-3v3h-3v3h-4v3h-4v-3H7v-3H4v-3H1V8h2z"/><path fill="#f06472" d="M4 7h6v3h4V7h6v3h2v5h-3v3h-3v3H8v-3H5v-3H2v-5h2z"/></symbol>
    <symbol id="bolt" viewBox="0 0 24 24"><path fill="#101721" d="M11 1h9l-4 8h5L9 24H4l4-11H3z"/><path fill="#ffca51" d="M12 3h5l-4 8h5L8 21l3-10H6z"/></symbol>
  </defs>
  <style>text{font-family:'Microsoft YaHei','PingFang SC',system-ui,sans-serif;letter-spacing:.2px}</style>
  <image href="${art.background}" x="0" y="0" width="1280" height="860" preserveAspectRatio="xMidYMid slice"/>
  ${rect(0, 0, 1280, 860, 'url(#shade)')}
  ${panel(22, 18, 1236, 78, '#0b1429ed')}
  ${text(42, 67, '✦', 30, '#e8c26a', 700)}${text(82, 55, title, 28, '#fff1d0', 800)}${text(84, 78, subtitle, 13, '#b9cad4')}
  ${right}
`;

function rosterCard(u, index) {
  const x = 47 + (index % 4) * 197;
  const y = 282 + Math.floor(index / 4) * 258;
  const selected = index === 5;
  const border = selected ? '#e8c26a' : '#4c5c70';
  return `${rect(x, y, 181, 239, '#101d2eea', border, 3)}${rect(x + 5, y + 5, 171, 229, 'none', '#2d4555', 1)}
    ${rect(x + 17, y + 15, 147, 119, '#142337', '#3f5f69', 2)}${img(u.key, x + 38, y + 16, 105, 116)}
    ${selected ? rect(x + 10, y + 11, 59, 24, '#59492c', '#e8c26a', 1) + text(x + 20, y + 29, '当前', 13, '#fff0c3', 700) : ''}
    ${text(x + 17, y + 161, u.name, 19, '#fff1d0', 700)}
    ${stat(x + 16, y + 188, u, 14)}${rect(x + 16, y + 203, 149, 1, '#304353')}
    ${text(x + 17, y + 224, '点击查看战后状态', 12, '#a7bdc7')}`;
}

function roster() {
  const head = `${rect(960, 34, 138, 46, '#172a39', '#6d7d86', 2)}${text(1029, 64, '队伍 6/8', 17, '#bde9dc', 700, 'text-anchor="middle"')}${button(1110, 34, 128, 46, '返回首页')}`;
  return shell('战后休整', '奖励已领取；整理伙伴后继续远征。', head) + `
    ${panel(22, 112, 829, 726)}${panel(869, 112, 389, 726)}
    ${rect(48, 136, 775, 99, '#132b37', '#5a7975', 2)}
    ${text(69, 174, '战斗胜利', 23, '#e8c26a', 800)}${text(69, 205, '奖励已领取，以下仅展示仍在队伍中的伙伴。', 14, '#bcd0cf')}
    ${rect(562, 153, 238, 64, '#19263a', '#6b7789', 1)}${text(579, 178, '战后可执行', 13, '#aebcc9', 700)}${text(579, 202, '融合或释放 · 暂不换阵', 14, '#d7e6e3', 700)}
    ${text(48, 267, '存活伙伴', 19, '#fff1d0', 700)}${text(820, 267, '队伍 6 / 8', 13, '#b4c6cd', 500, 'text-anchor="end"')}
    ${units.slice(0, 6).map(rosterCard).join('')}
    ${[6, 7].map((i) => { const x = 47 + (i % 4) * 197; return `${rect(x, 540, 181, 239, '#0c1929bd', '#34485a', 2)}${text(x + 90, 668, '＋', 38, '#466b71', 400, 'text-anchor="middle"')}${text(x + 90, 696, '空位', 14, '#7f99a7', 400, 'text-anchor="middle"')}`; }).join('')}
    ${text(895, 149, '战后查看', 15, '#9db8be', 700)}${text(895, 181, '迅迅', 29, '#fff1d0', 800)}${rect(1125, 152, 97, 26, '#3a313b', '#a37b80', 1)}${text(1173, 171, '生命未满', 13, '#ead0d0', 700, 'text-anchor="middle"')}
    ${rect(895, 198, 334, 216, '#142337', '#44616b', 2)}${img('momo', 956, 203, 214, 203)}
    ${stat(902, 449, units[5], 19)}${rect(896, 466, 331, 1, '#425365')}
    ${text(895, 496, '被动 · 迅捷', 16, '#e8c26a', 700)}${text(895, 523, '战斗开始速度 +2。', 13, '#bdccd1')}
    ${text(895, 559, '技能', 17, '#fff1d0', 700)}${rect(895, 574, 154, 37, '#1b3444', '#527d7d', 1)}${text(910, 599, '爪击', 15, '#e5ebdf', 700)}${rect(1063, 574, 164, 37, '#1b3444', '#527d7d', 1)}${text(1078, 599, '叶针', 15, '#e5ebdf', 700)}
    ${text(895, 647, '融合条件：同物种 2 / 2', 13, '#b4c6cd')}
    ${button(895, 665, 158, 48, '融合进化', 'teal')}${button(1069, 665, 158, 48, '释放', 'red')}
    ${button(895, 747, 332, 59, '继续前进 →', 'gold')}
  </svg>`;
}

function overflowCard(u, index) {
  const x = 400 + (index % 4) * 211;
  const y = 231 + Math.floor(index / 4) * 263;
  const canFuse = index === 0;
  return `${rect(x, y, 198, 249, '#111f30ec', canFuse ? '#e8c26a' : '#4b5d72', 3)}
    ${rect(x + 13, y + 12, 172, 105, '#172a3b', '#405b64', 1)}${img(u.key, x + 58, y + 12, 88, 102)}
    ${text(x + 13, y + 145, u.name, 18, '#fff1d0', 700)}${stat(x + 13, y + 172, u, 13)}
    ${button(x + 13, y + 188, 80, 40, '替换', 'red')}${button(x + 103, y + 188, 82, 40, canFuse ? '融合' : '未满足', canFuse ? 'teal' : 'dark')}
    ${text(x + 13, y + 241, canFuse ? '同种 2/2 · 可融合' : '同种不足 · 无法融合', 11, canFuse ? '#a2e7d4' : '#899eaa')}`;
}

function overflow() {
  const head = `${rect(952, 34, 138, 46, '#2c233a', '#74677e', 2)}${text(1021, 64, '待处理 1 只', 16, '#e8c26a', 700, 'text-anchor="middle"')}${rect(1104, 34, 134, 46, '#172a39', '#6d7d86', 2)}${text(1171, 64, '队伍 8/8', 17, '#bde9dc', 700, 'text-anchor="middle"')}`;
  return shell('处理队伍', '新伙伴暂未入队；先决定如何安置。', head) + `
    ${panel(22, 112, 350, 643)}${panel(384, 112, 874, 643)}
    ${text(47, 149, '新伙伴', 21, '#fff1d0', 800)}${rect(251, 126, 94, 28, '#5b3d32', '#e8c26a', 1)}${text(298, 146, '待处理', 13, '#f5dba0', 700, 'text-anchor="middle"')}
    ${rect(47, 171, 300, 297, '#152637', '#46706f', 2)}${img('momo', 62, 182, 271, 274)}
    ${text(49, 507, '迅迅', 31, '#fff1d0', 800)}${stat(49, 540, { hp: '10/10', spd: 3 }, 18)}
    ${rect(48, 561, 296, 1, '#46566b')}${text(48, 590, '加入后队伍将超过上限。', 14, '#cad7d9')}${text(48, 615, '可替换现有伙伴，或用于同种融合。', 13, '#aebfca')}
    ${rect(48, 642, 297, 80, '#132c38', '#507b78', 1)}${text(63, 672, '替换：旧伙伴离队，新伙伴加入', 13, '#c9e6df')}${text(63, 700, '融合：新伙伴可作为同种材料', 13, '#c9e6df')}
    ${text(404, 148, '选择一只现有伙伴', 21, '#fff1d0', 800)}${text(404, 178, '替换会放生该伙伴；融合需满足同物种数量。', 13, '#b7c9d1')}
    ${rect(404, 200, 828, 2, '#41566c')}${overflowUnits.map(overflowCard).join('')}
    ${panel(22, 771, 1236, 65, '#0b1429ed')}${text(49, 800, '若不想留下新伙伴', 16, '#e8c26a', 700)}${text(49, 822, '放生后本次获得的迅迅将永久离开。', 13, '#adbcc9')}
    ${button(955, 784, 278, 40, '放生新宠（不加入）', 'red')}
  </svg>`;
}

writeFileSync(join(dir, 'roster-1280x860.svg'), roster(), 'utf8');
writeFileSync(join(dir, 'roster-overflow-1280x860.svg'), overflow(), 'utf8');
