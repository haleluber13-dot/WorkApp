#!/usr/bin/env python3
"""MotorLab — a small copy of every catalogue photo, for the offline build.

The hosted app serves the full-size renders; the single-file build inlines
everything it uses as base64, where a hundred pictures at fifty kilobytes each
would cost more than the models do. These are the same pictures at a size that
still reads on a card.

    python3 motorlab/tools/shrink-thumbs.py            # assets/thumbs -> assets/thumbs-lite
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..')
SRC = os.path.join(APP, 'assets', 'thumbs')
DST = os.path.join(APP, 'assets', 'thumbs-lite')
SIDE = int(sys.argv[sys.argv.index('--side') + 1]) if '--side' in sys.argv else 168
QUALITY = int(sys.argv[sys.argv.index('--q') + 1]) if '--q' in sys.argv else 70


def main():
    os.makedirs(DST, exist_ok=True)
    before = after = n = 0
    for name in sorted(os.listdir(SRC)):
        if not name.endswith('.jpg'):
            continue
        s, d = os.path.join(SRC, name), os.path.join(DST, name)
        im = Image.open(s).convert('RGB')
        im.thumbnail((SIDE, SIDE), Image.LANCZOS)
        im.save(d, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        before += os.path.getsize(s); after += os.path.getsize(d); n += 1
    print(f'{n} photos: {before/1048576:.1f} MB -> {after/1048576:.1f} MB in assets/thumbs-lite')


if __name__ == '__main__':
    main()
