"""Name processed item icons and compose labeled previews; never draws sprite art."""
from pathlib import Path
from shutil import copyfile
import json

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
GROUPS = {
    'foods': ('捕获食物', 2, [
        ('berry', '浆果'), ('meat', '鲜肉'), ('gem', '秘晶'), ('golden_fruit', '圣果'),
    ]),
    'main': ('常规道具', 5, [
        ('scout', '侦察符'), ('skip', '跳关道具'), ('twin', '双生符'),
        ('purify', '净化药水'), ('atk_up', '攻击药水'), ('spd_up', '速度药水'),
        ('hp_up', '生命药水'), ('atk_down', '虚弱药水'),
        ('spd_down', '缓速药水'), ('hp_down', '腐蚀药水'),
    ]),
    'growth': ('远征道具', 3, [
        ('book_small', '成长之书（小）'), ('book_medium', '成长之书（中）'),
        ('book_large', '成长之书（大）'), ('slot_unlock', '技能槽解锁'),
        ('forget_stone', '遗忘之石'), ('heal_potion', '治疗圣水'),
        ('reset_stone', '还原石'), ('skill_enhance_stone', '技能强化石'),
        ('revival_stone', '复活石'),
    ]),
}

FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
HEADING = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 26)
EXPORTS = ROOT / 'icons'
EXPORTS.mkdir(exist_ok=True)
manifest = {'aliases': {'heal_potion_g': 'heal_potion'}, 'icons': []}

for group, (title, columns, entries) in GROUPS.items():
    metadata = json.loads((ROOT / group / 'pipeline-meta.json').read_text(encoding='utf-8'))
    qc = metadata['qc_summary']
    assert qc['empty_count'] == qc['edge_touch_count'] == qc['paste_clamped_count'] == 0
    rows = (len(entries) + columns - 1) // columns
    board = Image.new('RGB', (columns * 192 + 32, rows * 190 + 64), '#fff9e9')
    draw = ImageDraw.Draw(board)
    draw.text((16, 12), title, font=HEADING, fill='#101c2c')
    for index, (item_id, name) in enumerate(entries):
        source = ROOT / group / f'icon-{index + 1}.png'
        copyfile(source, EXPORTS / f'{item_id}.png')
        icon = Image.open(source).convert('RGBA')
        assert icon.size == (128, 128) and icon.getextrema()[3][0] == 0
        column, row = index % columns, index // columns
        x, y = 16 + column * 192, 56 + row * 190
        board.paste(icon, (x + 32, y), icon)
        draw.text((x + 96, y + 140), name, font=FONT, anchor='mt', fill='#101c2c')
        manifest['icons'].append({'id': item_id, 'name': name, 'group': group, 'file': f'icons/{item_id}.png'})
    board.save(ROOT / f'{group}-preview.png')

assert len(manifest['icons']) == 23
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Exported 23 transparent 128x128 icons and 3 labeled previews. All groups passed strict QC.')
