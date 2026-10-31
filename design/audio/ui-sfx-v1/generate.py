"""Original, deterministic UI sound sketches; Python standard library only."""
from pathlib import Path
import json
import math
import random
import struct
import wave

ROOT = Path(__file__).resolve().parent
RATE = 48000
TAU = math.tau


def tone(length, start, end=None, gain=1.0, texture=0.0, seed=0):
    rng = random.Random(seed)
    phase = filtered = 0.0
    output = []
    for i in range(round(length * RATE)):
        t = i / RATE
        fraction = t / length
        frequency = start + ((end if end is not None else start) - start) * fraction
        phase += TAU * frequency / RATE
        filtered += .3 * (rng.uniform(-1, 1) - filtered)
        body = (math.sin(phase) + .12 * math.sin(phase * 3) + .035 * math.sin(phase * 5)) / 1.155
        envelope = min(1, t / .0018) * (1 - fraction) ** 2.3 * min(1, (length - t) / .006)
        output.append((body + texture * filtered) * envelope * gain)
    return output


def compose(length, layers, target_peak):
    output = [0.0] * round(length * RATE)
    for offset, samples in layers:
        first = round(offset * RATE)
        for i, sample in enumerate(samples):
            if first + i < len(output):
                output[first + i] += sample
    # Gentle fade and DC removal prevent clicks at the file boundary.
    mean = sum(output) / len(output)
    output = [(sample - mean) * min(1, i / 96, (len(output) - 1 - i) / 240)
              for i, sample in enumerate(output)]
    scale = target_peak / max(abs(sample) for sample in output)
    return [sample * scale for sample in output]


def write(name, samples):
    with wave.open(str(ROOT / name), 'wb') as file:
        file.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        file.writeframes(struct.pack(f'<{len(samples)}h', *(round(max(-1, min(1, value)) * 32767) for value in samples)))


specs = [
    ('ui_click', '轻点', '按钮按下：轻木质短击，适合高频操作。', .065,
     [(0, tone(.045, 820, 520, texture=.6, seed=1)), (.004, tone(.038, 1560, 1210, gain=.12))], .28),
    ('ui_confirm', '确认', '执行成功：两颗向上跳动的暖色音符。', .24,
     [(0, tone(.12, 587.33, gain=.82)), (.075, tone(.155, 880, gain=.72)), (.082, tone(.13, 1174.66, gain=.15))], .34),
    ('ui_back', '返回', '关闭或退回：两颗下行音符，收尾柔和。', .18,
     [(0, tone(.105, 659.25, gain=.72)), (.055, tone(.12, 440, gain=.65))], .30),
    ('ui_select', '切换', '选项变化：清脆小拨片，比确认更轻更短。', .075,
     [(0, tone(.065, 1174.66, 1046.5, gain=.6, texture=.08, seed=2)), (.002, tone(.04, 1760, gain=.11))], .23),
    ('ui_unavailable', '不可用', '条件不足：低音双敲，提示而不刺耳。', .21,
     [(0, tone(.085, 220, 196, texture=.18, seed=3)), (.095, tone(.10, 196, 174.61, gain=.7, texture=.12, seed=4))], .29),
]

manifest = []
sequence = [0.0] * round(.3 * RATE)
for identifier, name, description, duration, layers, peak in specs:
    samples = compose(duration, layers, peak)
    filename = identifier + '.wav'
    write(filename, samples)
    manifest.append({'id': identifier, 'name': name, 'description': description,
                     'file': filename, 'duration_ms': round(duration * 1000),
                     'sequence_start_seconds': round(len(sequence) / RATE, 3),
                     'peak_dbfs': round(20 * math.log10(max(abs(s) for s in samples)), 1)})
    sequence.extend(samples)
    sequence.extend([0.0] * round(.65 * RATE))
write('ui_preview_sequence.wav', sequence)
(ROOT / 'manifest.json').write_text(json.dumps({'sample_rate': RATE, 'channels': 1, 'bits': 16, 'sounds': manifest}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'sounds': len(manifest), 'sequence_seconds': round(len(sequence) / RATE, 3), 'directory': str(ROOT)}, ensure_ascii=False))
