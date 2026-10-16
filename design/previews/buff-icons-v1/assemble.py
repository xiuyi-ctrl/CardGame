"""Name generated icon exports and compose a labelled art-review sheet."""
import json
import re
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
GROUPS = [
    ('debuffs', '异常与减益', 'status', [
        ('burn', '灼烧'), ('poison', '中毒'), ('atkDown', '攻击降低'),
        ('stun', '眩晕'), ('taunt', '嘲讽'), ('spdDown', '速度降低'),
        ('shadowMark', '暗影印记'), ('fear', '恐惧'),
    ]),
    ('defense', '增益与防护', 'status', [
        ('atkUp', '攻击提升'), ('healTick', '持续治疗'), ('shield', '护盾'),
        ('thorns', '荆棘反伤'), ('shieldCounter', '盾反'),
        ('thornSpikes', '复仇棘甲'), ('rageThorn', '怒棘'), ('windSpd', '风羽'),
    ]),
    ('special', '特殊战斗状态', 'status', [
        ('waterCurtain', '水幕'), ('flameShield', '烈焰护盾'),
        ('comboBoost', '连击增幅'), ('sporeShield', '孢子防护'),
        ('toxicBurstReady', '毒性爆发蓄力'), ('chainLink', '锁链连接'),
        ('skillSeal', '技能封印'), ('skillSealPending', '封印即将生效'),
    ]),
    ('modifiers', '药水、技能加成与诅咒', None, [
        ('battleBuffs.atkUp', '药水·伤害提升'), ('battleBuffs.spdUp', '药水·速度提升'),
        ('battleBuffs.atkDown', '药水·伤害降低'), ('battleBuffs.spdDown', '药水·速度降低'),
        ('battleBuffs.skillSpd', '技能速度加成'), ('curse.hpDown', '血脆诅咒'),
        ('curse.atkDown', '虚弱诅咒'), ('curse.spdDown', '迟缓诅咒'),
    ]),
]

FONT = 'C:/Windows/Fonts/msyh.ttc'
title_font = ImageFont.truetype(FONT, 28)
heading_font = ImageFont.truetype(FONT, 18)
label_font = ImageFont.truetype(FONT, 16)
note_font = ImageFont.truetype(FONT, 14)
preview = Image.new('RGB', (1280, 912), '#fff9e9')
draw = ImageDraw.Draw(preview)
draw.text((24, 16), '战斗状态图标  /  32 枚', font=title_font, fill='#0b1930')
draw.text((24, 57), '透明 PNG · 大图预览与下方 24px 实际尺寸 · 层数及回合由界面叠加', font=note_font, fill='#52636c')
icons_dir = ROOT / 'icons'
icons_dir.mkdir(exist_ok=True)
entries = []
for group_index, (pack, heading, category, items) in enumerate(GROUPS):
    pack_dir = ROOT / 'packs' / pack
    qc = json.loads((pack_dir / 'pipeline-meta.json').read_text(encoding='utf-8'))
    for field in ('empty_frames', 'source_edge_touch_frames', 'output_edge_touch_frames', 'paste_clamped_frames'):
        if qc[field]:
            raise RuntimeError(f'{pack}: failed QC: {field}={qc[field]}')
    y = 96 + group_index * 200
    draw.line((24, y, 1256, y), fill='#a0aba8', width=1)
    draw.text((24, y + 8), heading, font=heading_font, fill='#0b1930')
    for index, (key, label) in enumerate(items):
        source = pack_dir / f'icon-{index + 1}.png'
        image = Image.open(source).convert('RGBA')
        if image.size != (128, 128) or not image.getbbox():
            raise RuntimeError(f'Invalid export: {source}')
        slug = re.sub(r'(?<!^)(?=[A-Z])', '-', key).lower().replace('battle-buffs.', 'potion-').replace('curse.', 'curse-')
        filename = f'{slug}.png'
        shutil.copyfile(source, icons_dir / filename)
        entry_category = category or ('curse' if key.startswith('curse.') else 'battleBuffs')
        entries.append({'category': entry_category, 'key': key.split('.')[-1], 'label': label, 'file': f'icons/{filename}'})
        x = index * 160
        preview.paste(image.resize((96, 96), Image.Resampling.NEAREST), (x + 32, y + 34), image.resize((96, 96), Image.Resampling.NEAREST))
        draw.text((x + 80, y + 140), label, font=label_font, fill='#0b1930', anchor='mm')
        small = image.resize((24, 24), Image.Resampling.NEAREST)
        preview.paste(small, (x + 68, y + 158), small)

manifest = {'version': 1, 'size': [128, 128], 'transparent': True, 'icons': entries}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
preview.save(ROOT / 'preview.png')
types = (ROOT.parents[2] / 'src/game/types.ts').read_text(encoding='utf-8')
status_line = types.split('export interface StatusEffect {', 1)[1].split('\n', 2)[1]
expected = set(re.findall(r"'([^']+)'", status_line))
actual = {entry['key'] for entry in entries if entry['category'] == 'status'}
if expected != actual:
    raise RuntimeError(f'Status coverage mismatch: missing={expected - actual}, extra={actual - expected}')
with zipfile.ZipFile(ROOT / 'buff-icons-v1.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(icons_dir.glob('*.png')):
        archive.write(path, path.relative_to(ROOT))
    for name in ('manifest.json', 'preview.png'):
        archive.write(ROOT / name, name)
print(f'Exported {len(entries)} transparent icons; complete coverage of {len(expected)} status kinds; all packs passed QC.')
