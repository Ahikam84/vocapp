"""Puts a how-to video together: each scene's screen in a phone frame with its caption (rendered as a
1080x1920 frame by the browser, so Hebrew lays out properly), its narration, and a short fade.

    python -I scripts/video/assemble.py student|teacher  → video-build/VocApp-<name>.mp4"""
import base64
import html
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from scenes import STUDENT, TEACHER  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
which = sys.argv[1]
base = ROOT / 'video-build' / which
scenes = STUDENT if which == 'student' else TEACHER
title = 'VocApp · מדריך לתלמידים' if which == 'student' else 'VocApp · מדריך למורים'
LEAD, TAIL, FADE = 0.35, 0.75, 0.25

FRAME = """<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  html, body {{ margin: 0; width: 1080px; height: 1920px; }}
  body {{ background: linear-gradient(165deg, #12a2b3 0%, #0e8a9a 45%, #0a6c79 100%); font-family: Heebo, Arial, sans-serif;
         display: flex; flex-direction: column; align-items: center; color: #fff; overflow: hidden; }}
  header {{ margin-top: 70px; display: flex; align-items: center; gap: 22px; font-size: 44px; font-weight: 800; }}
  header img {{ width: 64px; height: 64px; border-radius: 16px; background: #fff; }}
  .step {{ font-size: 30px; font-weight: 500; opacity: .8; margin-top: 8px; }}
  .phone {{ margin-top: 40px; padding: 18px; background: #12202a; border-radius: 74px; box-shadow: 0 40px 90px rgb(0 0 0 / .35); }}
  .phone img {{ display: block; width: 560px; height: 1212px; border-radius: 58px; }}
  .caption {{ position: absolute; bottom: 70px; left: 60px; right: 60px; min-height: 220px; box-sizing: border-box;
              display: grid; place-items: center; text-align: center; padding: 32px 44px; background: #fff; color: #23343a;
              border-radius: 44px; font-size: 44px; font-weight: 700; line-height: 1.4; box-shadow: 0 20px 50px rgb(0 0 0 / .2); }}
</style></head><body>
  <header><img src="{icon}">{title}</header>
  <div class="step" dir="ltr">{n} / {total}</div>
  <div class="phone"><img src="{screen}"></div>
  <div class="caption">{caption}</div>
</body></html>"""


def duration(mp3: Path) -> float:
    err = subprocess.run([FFMPEG, '-i', str(mp3)], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


frames, clips = base / 'frames', base / 'clips'
frames.mkdir(exist_ok=True)
clips.mkdir(exist_ok=True)


def data_uri(path: Path, mime: str) -> str:
    # Embedded: a page set from a string may not load local files.
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


icon = data_uri(ROOT / 'public' / 'icon.svg', 'image/svg+xml')

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1080, 'height': 1920})
    for i, (name, text) in enumerate(scenes, 1):
        page.set_content(FRAME.format(icon=icon, title=title, n=i, total=len(scenes),
                                      screen=data_uri(base / 'screens' / f'{name}.png', 'image/png'), caption=html.escape(text)))
        page.wait_for_load_state('networkidle')
        page.screenshot(path=str(frames / f'{name}.png'))
    browser.close()

for name, _ in scenes:
    d = duration(base / 'audio' / f'{name}.mp3') + LEAD + TAIL
    subprocess.run([
        FFMPEG, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-i', str(frames / f'{name}.png'),
        '-i', str(base / 'audio' / f'{name}.mp3'),
        '-filter_complex',
        f'[0:v]fade=t=in:st=0:d={FADE},fade=t=out:st={d - FADE:.2f}:d={FADE},format=yuv420p[v];'
        f'[1:a]adelay={int(LEAD * 1000)}:all=1,apad,atrim=0:{d:.2f},aresample=44100[a]',
        '-map', '[v]', '-map', '[a]', '-t', f'{d:.2f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-r', '30', '-c:a', 'aac', '-b:a', '160k', str(clips / f'{name}.mp4'),
    ], check=True)
    print('clip', name, f'{d:.1f}s')

(clips / 'list.txt').write_text(''.join(f"file '{name}.mp4'\n" for name, _ in scenes), encoding='utf-8')
final = ROOT / 'video-build' / f'VocApp-{which}.mp4'
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(clips / 'list.txt'),
                '-c', 'copy', '-movflags', '+faststart', str(final)], check=True)
print('video', final, f'{sum(duration(base / "audio" / f"{n}.mp3") + LEAD + TAIL for n, _ in scenes):.0f}s')
