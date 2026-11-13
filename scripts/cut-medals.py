"""Cut the medal sheet (6 rows x 5 columns, painted checkerboard background) into transparent WebPs."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sheet = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

im = Image.open(sheet).convert('RGB')
a = np.asarray(im).astype(np.int16)
lo, hi = a.min(axis=2), a.max(axis=2)
# Background candidates: light and colourless (the white / light-grey checker squares).
# The soft grey drop shadow counts too: every medal has a dark outline, so the fill from outside
# stops there and never reaches the medal's own light greys (silver).
# The shadow is neutral grey, the silver medals' rims slightly blue – so darker greys only when colourless.
# Only the checkerboard itself (light and colourless); the shadow below each disc is cut away by shape.
cand = (lo > 200) & (hi - lo < 20)

# Flood fill from the image border through candidate pixels (iterative dilation, 4-neighbours).
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
    """Ranges where the profile is non-zero, merging gaps shorter than min_gap."""
    on = profile > 0
    ranges, start, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None:
                start = i
            gap = 0
            end = i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                ranges.append((start, end))
                start, gap = None, 0
    if start is not None:
        ranges.append((start, end))
    return ranges

# Ignore stray specks when finding the grid.
cols = runs((fg.sum(axis=0) > 3).astype(int), 15)
# Rows sit close together (ribbons almost touch the medal above), so split at the emptiest line
# between the first and last medal row, near each sixth of the content.
prof = fg.sum(axis=1)
filled = np.nonzero(prof > 3)[0]
top, bottom = int(filled[0]), int(filled[-1])
step = (bottom - top) / 6
cuts = [top] + [int(top + step * k - 30 + np.argmin(prof[int(top + step * k - 30):int(top + step * k + 30)])) for k in range(1, 6)] + [bottom]
rows = [(cuts[i], cuts[i + 1]) for i in range(6)]
print('columns', len(cols), cols)
print('rows', len(rows), rows)
assert len(cols) == 5 and len(rows) == 6, 'unexpected grid'

# Soft edges: blur the mask a little, but keep the inside fully opaque.
mask = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
rgba = im.copy()
rgba.putalpha(mask)

tracks = ['learned', 'longterm', 'streak', 'goal', 'answers', 'tests']
tiers = ['bronze', 'silver', 'gold', 'diamond']
specials = ['perfect-day', 'night-owl', 'early-bird', 'course-done', 'ace', 'polyglot']
size = 256
for r, (y0, y1) in enumerate(rows):
    for c, (x0, x1) in enumerate(cols):
        cell = rgba.crop((x0, y0, x1 + 1, y1 + 1))
        # Keep the medal itself: the tallest band of rows with content (drops slivers of neighbours).
        alpha = np.asarray(cell.getchannel('A')) > 8
        band = max(runs(alpha.sum(axis=1), 1), key=lambda r: alpha[r[0]:r[1] + 1].sum())
        keep = np.zeros_like(alpha)
        keep[band[0]:band[1] + 1] = True
        # The disc: its widest row gives the centre and radius. Below the centre keep only the circle,
        # which drops the drop shadow under the medal; above it, the ribbon stays.
        widths = (alpha & keep).sum(axis=1)
        cy = int(np.argmax(widths))
        xs = np.nonzero((alpha & keep)[cy])[0]
        cx, rad = (xs[0] + xs[-1]) / 2, (xs[-1] - xs[0]) / 2
        yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
        keep &= (yy <= cy) | ((xx - cx) ** 2 + (yy - cy) ** 2 <= (rad + 1.5) ** 2)
        cell.putalpha(Image.fromarray((np.asarray(cell.getchannel('A')) * keep).astype(np.uint8)))
        box = cell.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        cell = cell.crop(box)
        # Centre on a square canvas, the medal filling it.
        w, h = cell.size
        scale = (size - 8) / max(w, h)
        cell = cell.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        canvas.paste(cell, ((size - cell.width) // 2, (size - cell.height) // 2), cell)
        name = specials[r] if c == 4 else f'{tracks[r]}-{tiers[c]}'
        canvas.save(out / f'{name}.webp', 'WEBP', quality=90, method=6)
print('saved', len(list(out.glob('*.webp'))))
