"""Export generated, already-cleaned creature art on the shared 64px grid."""
import argparse
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
args = parser.parse_args()
source = Image.open(args.folder / 'export' / 'raw-sheet-clean.png').convert('RGBA')
source.putalpha(source.getchannel('A').point(lambda value: 255 if value >= 128 else 0))
box = source.getbbox()
if not box:
    raise ValueError('Empty creature')
body = source.crop(box)
scale = 56 / max(body.size)
body = body.resize(tuple(max(1, round(value * scale)) for value in body.size), Image.Resampling.NEAREST)
alpha = body.getchannel('A')
body = body.convert('RGB').quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
body.putalpha(alpha)
output = Image.new('RGBA', (64, 64))
output.alpha_composite(body, ((64 - body.width) // 2, 60 - body.height))
bbox = output.getbbox()
assert bbox and bbox[0] >= 4 and bbox[1] >= 4 and bbox[2] <= 60 and bbox[3] == 60
output.save(args.folder / 'sprite-64.png')
output.resize((512, 512), Image.Resampling.NEAREST).save(args.folder / 'preview-512.png')
report = {'size': list(output.size), 'bbox': list(bbox), 'feet_baseline_exclusive': 60,
          'opaque_colors': len({pixel[:3] for pixel in output.getdata() if pixel[3]}),
          'alpha_values': sorted(set(output.getchannel('A').getdata())),
          'resampling': 'nearest', 'source': 'export/raw-sheet-clean.png'}
(args.folder / 'pixel-qc.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
