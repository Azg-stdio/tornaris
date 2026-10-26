"""Renders the 20 monster card faces from assets/monstruo_new.psd's layout (run from repo root).

The PSD is the template: art bleeding to the edges, the name with a divider, the category chip in the top
right corner, "Habilidad Única", reward and penalty, and life per player count at the bottom. The text comes
from game/public/js/shared/data.js (docs/REGLAS_v3.md), never from the PSD's sample text.
"""
import json
import re
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from psd_tools import PSDImage

W, H = 720, 1080          # PSD size
OUT_W, OUT_H = 600, 900   # sheet cell; 5 x 4 cells keep the sheet under 4096 px
FONTS = 'C:/Users/Miguel Arbelaez/AppData/Local/Microsoft/Windows/Fonts'
PLAYERS = [3, 4, 5, 6]
TIER = {'duende': 'Duende', 'ogro': 'Ogro', 'golem': 'Gólem', 'dragon': 'Dragón'}
DARK = (24, 24, 24)
WHITE = (255, 255, 255)
# The CSV's numbered prize list reads badly in a paragraph.
REWARD = {20: 'por apuesta, de mayor a menor: 1.º +1 maná, 2.º 3 equipamientos, 3.º 30 de oro'}


def font(weight, size):
    return ImageFont.truetype(f'{FONTS}/Bitter-{weight}.ttf', size)


def monsters():
    js = "import('./game/public/js/shared/data.js').then(D => console.log(JSON.stringify(D.MONSTERS)))"
    return json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True, encoding='utf-8').stdout)


def icons():
    psd = PSDImage.open('assets/monstruo_new.psd')
    found = {l.name: l.topil() for l in psd.descendants() if l.name in ('lives', 'users')}
    return found['lives'], found['users']


def wrap(d, text, f, width):
    # Keep "14 de oro" and "1 equipamiento" on one line: a number never ends a line, nor does "de" before "oro".
    text = re.sub(r'([\dº]) ','\\1\u00a0', text.replace(' de oro', '\u00a0de\u00a0oro'))
    lines = []
    for para in text.split('\n'):
        line = ''
        for word in para.split(' '):
            test = f'{line} {word}'.strip()
            if d.textlength(test, font=f) <= width or not line:
                line = test
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def life(m):
    hp = m['hp']
    if hp['kind'] == 'perPlayer':
        return '/'.join(str(hp['value'] * n) for n in PLAYERS)
    if hp['kind'] == 'fixed':
        return str(hp['value'])
    return 'Especial'


def card(m, heart, users):
    art = Image.open(f"assets/img/monster_{m['id']}.png").convert('RGB')
    s = max(W / art.width, H / art.height)
    art = art.resize((round(art.width * s), round(art.height * s)), Image.LANCZOS)
    left = (art.width - W) // 2
    im = art.crop((left, 0, left + W, H)).convert('RGBA')
    d = ImageDraw.Draw(im)

    # Body text, laid out from the bottom up so long abilities grow towards the art.
    body_w = W - 84
    for size in (30, 28, 26, 24, 22, 20):
        f_txt, f_bold = font('Regular', size), font('Bold', size)
        gap = round(size * 1.25)
        hab = wrap(d, m['ability'], f_txt, body_w)
        rec = wrap(d, 'Recompensa: ' + REWARD.get(m['id'], m['reward']), f_txt, body_w)
        pen = wrap(d, 'Penitencia: ' + m['penalty'], f_txt, body_w)
        height = 36 + 22 + gap * len(hab) + 22 + gap * (len(rec) + len(pen))
        top = 975 - height
        if top >= 560:
            break

    # Darken the lower part so the text reads over any art (the PSD's "Layer 3").
    fade_top = top - 160
    shade = Image.new('L', (1, H), 0)
    for y in range(H):
        t = min(1, max(0, (y - fade_top) / 200))
        shade.putpixel((0, y), round(215 * t))
    im.alpha_composite(Image.merge('RGBA', [Image.new('L', (W, H), 18)] * 3 + [shade.resize((W, H))]))
    # Light top shade behind the name.
    top_shade = Image.new('L', (1, H), 0)
    for y in range(260):
        top_shade.putpixel((0, y), round(110 * (1 - y / 260)))
    im.alpha_composite(Image.merge('RGBA', [Image.new('L', (W, H), 10)] * 3 + [top_shade.resize((W, H))]))

    d = ImageDraw.Draw(im)
    y = top
    d.text((42, y), 'Habilidad Única:', font=font('Bold', 36), fill=WHITE)
    y += 36 + 22
    for line in hab:
        d.text((42, y), line, font=f_txt, fill=WHITE)
        y += gap
    y += 22
    for label, lines in (('Recompensa:', rec), ('Penitencia:', pen)):
        for i, line in enumerate(lines):
            if i == 0:
                d.text((42, y), label, font=f_bold, fill=WHITE)
                d.text((42 + d.textlength(label + ' ', font=f_bold), y), line[len(label) + 1:], font=f_txt, fill=WHITE)
            else:
                d.text((42, y), line, font=f_txt, fill=WHITE)
            y += gap

    # Bottom row: life per player count and the player counts.
    f36 = font('Regular', 36)
    im.alpha_composite(heart, (42, 1001))
    d.text((99, 1004), life(m), font=f36, fill=WHITE)
    players = '/'.join(map(str, PLAYERS))
    px = 679 - d.textlength(players, font=f36)
    im.alpha_composite(users, (round(px) - 62, 1003))
    d.text((px, 1004), players, font=f36, fill=WHITE)

    # Name with a dark outline, then the divider.
    name = m['name']
    for size in range(60, 34, -2):
        f_name = font('ExtraBold', size)
        if d.textlength(name, font=f_name) <= W - 90:
            break
    nw = d.textlength(name, font=f_name)
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text(((W - nw) / 2, 163), name, font=f_name, fill=(0, 0, 0, 200), anchor='lm',
                              stroke_width=6, stroke_fill=(0, 0, 0, 200))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(4)))
    d.text(((W - nw) / 2, 163), name, font=f_name, fill=WHITE, anchor='lm', stroke_width=3, stroke_fill=DARK)
    d.rounded_rectangle((37, 203, 329, 216), radius=6, fill=DARK)
    d.rounded_rectangle((383, 203, 675, 216), radius=6, fill=DARK)
    d.ellipse((344, 198, 368, 222), fill=DARK)

    # Category chip, top right.
    f_chip = font('Regular', 36)
    tier = TIER[m['tier']]
    cw = d.textlength(tier, font=f_chip) + 70
    d.rounded_rectangle((W - cw, -40, W + 40, 90), radius=34, fill=DARK)
    d.text((W - cw / 2 - 10, 44), tier, font=f_chip, fill=WHITE, anchor='mm')

    # Frame: dark rounded border, transparent-safe corners filled dark (cards are opaque).
    frame = Image.new('L', (W, H), 255)
    ImageDraw.Draw(frame).rounded_rectangle((12, 12, W - 13, H - 13), radius=30, fill=0)
    im.paste(Image.new('RGBA', (W, H), DARK + (255,)), (0, 0), frame)
    return im.convert('RGB').resize((OUT_W, OUT_H), Image.LANCZOS)


def build(out_sheet, preview=None):
    heart, users = icons()
    ms = monsters()
    sheet = Image.new('RGB', (OUT_W * 5, OUT_H * 4))
    for i, m in enumerate(ms):
        c = card(m, heart, users)
        sheet.paste(c, ((i % 5) * OUT_W, (i // 5) * OUT_H))
    sheet.save(out_sheet, quality=90)
    if preview:
        sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save(preview, quality=85)


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'tableworld/assets/monsters.jpg',
          sys.argv[2] if len(sys.argv) > 2 else None)
