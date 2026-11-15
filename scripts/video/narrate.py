"""Records the narration for each scene with ElevenLabs (key from .env.local), Hebrew via eleven_v3.
Only scenes whose text changed are recorded again.

    python -I scripts/video/narrate.py student|teacher"""
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scenes import STUDENT, TEACHER  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
VOICE = 'Ughw9ouHSYmmbRa0am9u'  # Rami
which = sys.argv[1]
out = ROOT / 'video-build' / which / 'audio'
out.mkdir(parents=True, exist_ok=True)
key = next(l.split('=', 1)[1].strip().strip('"') for l in (ROOT / '.env.local').read_text(encoding='utf-8').splitlines() if l.startswith('ELEVENLABS_API_KEY='))

for name, text in STUDENT if which == 'student' else TEACHER:
    mp3, txt = out / f'{name}.mp3', out / f'{name}.txt'
    if mp3.exists() and txt.exists() and txt.read_text(encoding='utf-8') == text:
        continue
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128', method='POST',
        headers={'xi-api-key': key, 'Content-Type': 'application/json'},
        data=json.dumps({'text': text, 'model_id': 'eleven_v3', 'language_code': 'he'}).encode())
    mp3.write_bytes(urllib.request.urlopen(req).read())
    txt.write_text(text, encoding='utf-8')
    print('recorded', name)
