"""Copies and optimises art from ../../assets into public/assets.

The source board is 4000x4000 / 15 MB, which is far more than a browser needs and
slow to ship on a phone. Everything here is downscaled and written as WebP with
alpha preserved. Run: python scripts/build-assets.py
"""

import os
import shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'assets'))
DST = os.path.normpath(os.path.join(HERE, '..', 'public', 'assets'))

CHARACTER_SLUGS = ['druida', 'nigromante', 'hombre-topo', 'mago', 'escudera', 'cazadora']


def out_dir(*parts):
    p = os.path.join(DST, *parts)
    os.makedirs(p, exist_ok=True)
    return p


def save_webp(im, path, max_size, quality=86):
    im = im.copy()
    im.thumbnail((max_size, max_size), Image.LANCZOS)
    im.save(path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(path)


def main():
    total = 0

    # Board: 2048 is plenty even on a desktop, and it scales cleanly.
    board = Image.open(os.path.join(SRC, 'board-final.png')).convert('RGBA')
    p = os.path.join(out_dir(), 'board.webp')
    size = save_webp(board, p, 2048, quality=90)
    total += size
    print(f'board.webp            {size/1024:7.0f} KB')

    # Monsters: shown one at a time in the dungeon panel.
    d = out_dir('monsters')
    msize = 0
    for i in range(1, 21):
        src = os.path.join(SRC, 'img', f'monster_{i}.png')
        im = Image.open(src).convert('RGBA')
        msize += save_webp(im, os.path.join(d, f'monster_{i}.webp'), 768)
    total += msize
    print(f'monsters/ (20)        {msize/1024:7.0f} KB')

    # Tokens: rendered small on the board, but keep 2x for retina.
    d = out_dir('tokens')
    tsize = 0
    for slug in CHARACTER_SLUGS + ['arrow']:
        src = os.path.join(SRC, 'tokens', f'{slug}.png')
        im = Image.open(src).convert('RGBA')
        tsize += save_webp(im, os.path.join(d, f'{slug}.webp'), 256)
    total += tsize
    print(f'tokens/ (7)           {tsize/1024:7.0f} KB')

    # Portraits: character select and the player rail.
    d = out_dir('portraits')
    psize = 0
    for slug in CHARACTER_SLUGS:
        src = os.path.join(SRC, 'portraits', f'{slug}.png')
        im = Image.open(src).convert('RGB')
        psize += save_webp(im, os.path.join(d, f'{slug}.webp'), 512)
    total += psize
    print(f'portraits/ (6)        {psize/1024:7.0f} KB')

    # Full class cards, for the character-select detail view.
    d = out_dir('classes')
    csize = 0
    for slug in CHARACTER_SLUGS:
        src = os.path.join(SRC, 'classes', f'{slug}.png')
        im = Image.open(src).convert('RGB')
        csize += save_webp(im, os.path.join(d, f'{slug}.webp'), 800)
    total += csize
    print(f'classes/ (6)          {csize/1024:7.0f} KB')

    print(f'{"-"*32}\ntotal                 {total/1024:7.0f} KB')


if __name__ == '__main__':
    main()
