"""Builds the Table World images for Tornaris from ../assets (run from repo root)."""
from PIL import Image, ImageDraw, ImageFont
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import monster_cards  # noqa: E402

SRC = 'assets'
OUT = 'tableworld/assets'
CLASSES = ['druida', 'nigromante', 'hombre-topo', 'mago', 'escudera', 'cazadora']

def font(name, size):
    try:
        return ImageFont.truetype(f'C:/Windows/Fonts/{name}', size)
    except OSError:
        return ImageFont.load_default()

def centered(d, w, y, txt, f, fill):
    d.text(((w - d.textlength(txt, font=f)) / 2, y), txt, fill=fill, font=f)

board = Image.open(f'{SRC}/board-final.png').convert('RGBA').resize((2048, 2048), Image.LANCZOS)
board.save(f'{OUT}/board.png', optimize=True)

# Monster faces: 5 x 4 sheet, faceIndex = monster id - 1, drawn on the layout of assets/monstruo_new.psd.
monster_cards.build(f'{OUT}/monsters.jpg')

W, H = 600, 900
back = Image.new('RGB', (W, H), (24, 24, 24))
d = ImageDraw.Draw(back)
d.rounded_rectangle([34, 34, W - 35, H - 35], radius=22, fill=(58, 14, 18), outline=(200, 160, 70), width=5)
centered(d, W, H // 2 - 60, 'Monstruo', monster_cards.font('ExtraBold', 64), (230, 195, 110))
centered(d, W, H // 2 + 30, 'Tornaris', monster_cards.font('Regular', 34), (230, 195, 110))
back.save(f'{OUT}/monster_back.jpg', quality=90)

# Character cards: 3 x 2 sheet in CLASSES order.
chars = Image.new('RGB', (1800, 800), (30, 30, 30))
for i, slug in enumerate(CLASSES):
    im = Image.open(f'{SRC}/classes/{slug}.png').convert('RGBA')
    bg = Image.new('RGBA', im.size, (240, 230, 210, 255))
    bg.alpha_composite(im)
    chars.paste(bg.convert('RGB'), ((i % 3) * 600, (i // 3) * 400))
chars.save(f'{OUT}/characters.jpg', quality=90)

import mat  # noqa: E402
mat.build(f'{OUT}/mat.png')

for slug in CLASSES + ['arrow']:
    Image.open(f'{SRC}/tokens/{slug}.png').convert('RGBA').resize((256, 256), Image.LANCZOS) \
        .save(f'{OUT}/token_{slug}.png', optimize=True)

print(sorted(os.listdir(OUT)))
