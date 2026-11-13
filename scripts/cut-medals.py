"""Cut a medal sheet into the app's 30 medal images (transparent WebP, 256x256).

    python scripts/cut-medals.py <sheet> <out-dir> [--rows=tiers]

The sheet is a grid on a plain light background (white, or a painted checkerboard).
Default layout: 6 rows (tracks) x 5 columns (bronze, silver, gold, diamond, special).
--rows=tiers: 5 rows (bronze, silver, gold, diamond, special) x 6 columns (tracks).
Tracks, in order: learned, longterm, streak, goal, answers, tests.
Special medals, in order: perfect-day, night-owl, early-bird, course-done, ace, polyglot.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

args = [a for a in sys.argv[1:] if not a.startswith('--')]
by_tier_rows = '--rows=tiers' in sys.argv
sheet, out = Path(args[0]), Path(args[1])
out.mkdir(parents=True, exist_ok=True)

TRACKS = ['learned', 'longterm', 'streak', 'goal', 'answers', 'tests']
TIERS = ['bronze', 'silver', 'gold', 'diamond']
SPECIALS = ['perfect-day', 'night-owl', 'early-bird', 'course-done', 'ace', 'polyglot']
n_rows, n_cols = (5, 6) if by_tier_rows else (6, 5)

im = Image.open(sheet).convert('RGB')
a = np.asarray(im).astype(np.int16)
lo, hi = a.min(axis=2), a.max(axis=2)
# Background: light and colourless (white, light-grey checker squares, the faint drop shadow).
cand = (lo > 200) & (hi - lo < 20)

# Flood fill from the border through background pixels (iterative dilation, 4-neighbours).
bg = np.zeros_like(cand)
bg[0, :], bg[-1, :], bg[:, 0], bg[:, -1] = cand[0, :], cand[-1, :], cand[:, 0], cand[:, -1]
while True:
    grown = bg.copy()
    grown[1:, :] |= bg[:-1, :]
    grown[:-1, :] |= bg[1:, :]
    grown[:, 1:] |= bg[:, :-1]
    grown[:, :-1] |= bg[:, 1:]
    grown &= cand
    if (grown == bg).all():
        break
    bg = grown
fg = ~bg


def runs(profile, min_gap):
    """Index ranges where the profile is non-zero, merging gaps shorter than min_gap."""
    ranges, start, gap, end = [], None, 0, 0
    for i, v in enumerate(profile > 0):
        if v:
            start = i if start is None else start
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                ranges.append((start, end))
                start, gap = None, 0
    if start is not None:
        ranges.append((start, end))
    return ranges


def split(profile, count):
    """`count` bands: by empty gaps when there are that many, else at the emptiest lines."""
    found = runs((profile > 3).astype(int), 6)
    if len(found) == count:
        return found
    filled = np.nonzero(profile > 3)[0]
    top, bottom = int(filled[0]), int(filled[-1])
    step = (bottom - top) / count
    cuts = [top] + [int(top + step * k - 30 + np.argmin(profile[int(top + step * k - 30):int(top + step * k + 30)])) for k in range(1, count)] + [bottom]
    return [(cuts[i], cuts[i + 1]) for i in range(count)]


cols = split(fg.sum(axis=0), n_cols)
rows = split(fg.sum(axis=1), n_rows)
print('columns', cols)
print('rows', rows)

mask = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
rgba = im.copy()
rgba.putalpha(mask)

size = 256
for r, (y0, y1) in enumerate(rows):
    for c, (x0, x1) in enumerate(cols):
        cell = rgba.crop((x0, y0, x1 + 1, y1 + 1))
        # Keep the medal itself: the band of rows with the most content (drops slivers of neighbours).
        alpha = np.asarray(cell.getchannel('A')) > 8
        band = max(runs(alpha.sum(axis=1), 1), key=lambda b: alpha[b[0]:b[1] + 1].sum())
        keep = np.zeros_like(alpha)
        keep[band[0]:band[1] + 1] = True
        cell.putalpha(Image.fromarray((np.asarray(cell.getchannel('A')) * keep).astype(np.uint8)))
        cell = cell.crop(cell.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
        w, h = cell.size
        scale = (size - 8) / max(w, h)
        cell = cell.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        canvas.paste(cell, ((size - cell.width) // 2, (size - cell.height) // 2), cell)
        if by_tier_rows:
            name = SPECIALS[c] if r == 4 else f'{TRACKS[c]}-{TIERS[r]}'
        else:
            name = SPECIALS[r] if c == 4 else f'{TRACKS[r]}-{TIERS[c]}'
        canvas.save(out / f'{name}.webp', 'WEBP', quality=90, method=6)
print('saved', len(list(out.glob('*.webp'))))
