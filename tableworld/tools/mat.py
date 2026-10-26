"""Draws the player mat (tableworld/assets/mat.png): 0.62 x 0.22 m at 2000 px/m, top edge towards the board.

Section x ranges (metres from the mat centre, player's right positive) must match MAT in build.mjs.
"""
from PIL import Image, ImageDraw
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from monster_cards import font  # noqa: E402

PX = 2000
W, D = 0.62, 0.22
PAPER, INK, LINE, SOFT = (236, 224, 196), (58, 38, 18), (150, 112, 60), (222, 205, 168)


def px(lx, lz):
    return round((lx + W / 2) * PX), round((D / 2 - lz) * PX)


def section(d, x0, x1, z0, z1, title, sub=None):
    a, b = px(x0, z1), px(x1, z0)
    d.rounded_rectangle([a, b], radius=18, fill=SOFT, outline=LINE, width=4)
    f = font('Bold', 34)
    cx = (a[0] + b[0]) / 2
    d.text((cx - d.textlength(title, font=f) / 2, a[1] + 8), title, fill=INK, font=f)
    if sub:
        g = font('Regular', 22)
        d.text((cx - d.textlength(sub, font=g) / 2, a[1] + 46), sub, fill=LINE, font=g)


def spot(d, lx, lz, r, label):
    x, y = px(lx, lz)
    d.ellipse([x - r, y - r, x + r, y + r], outline=LINE, width=3)
    g = font('Regular', 18)
    d.text((x - d.textlength(label, font=g) / 2, y + r + 2), label, fill=LINE, font=g)


def build(out):
    im = Image.new('RGB', (round(W * PX), round(D * PX)), PAPER)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([4, 4, im.width - 5, im.height - 5], radius=26, outline=INK, width=6)
    section(d, -0.305, -0.19, -0.105, 0.10, 'Personaje')
    spot(d, -0.2475, -0.065, 48, 'Ficha')
    section(d, -0.18, -0.03, -0.06, 0.10, 'Oro', 'plata = 5')
    section(d, -0.02, 0.09, -0.06, 0.10, 'Maná')
    section(d, 0.10, 0.19, -0.06, 0.10, 'Gastado')
    section(d, 0.20, 0.305, -0.105, 0.10, 'Combate', 'total y dados')
    # Equipment slots: a reminder of how many cards the hand may hold (6, Braulia 8).
    g = font('Regular', 20)
    x0, x1 = px(-0.18, 0)[0], px(0.19, 0)[0]
    y0, y1 = px(0, -0.08)[1], px(0, -0.105)[1]
    d.text((x0, y0 - 24), 'Equipamiento en mano', fill=LINE, font=g)
    step = (x1 - x0) / 8
    for k in range(8):
        box = [x0 + k * step + 6, y0, x0 + (k + 1) * step - 6, y1]
        if k < 6:
            d.rounded_rectangle(box, radius=6, outline=INK, width=3)
        else:
            d.rounded_rectangle(box, radius=6, outline=LINE, width=2)
            d.text((box[0] + 8, box[1] + 6), 'Braulia', fill=LINE, font=font('Regular', 16))
    im.save(out, optimize=True)


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'tableworld/assets/mat.png')
