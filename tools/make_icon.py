"""Генерирует иконку приложения Nex (Pillow + numpy). Запуск: python3 tools/make_icon.py"""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'android_overrides', 'res')
SS = 4  # суперсэмплинг

def lerp(a, b, t): return a + (b - a) * t

def bez3(p0, p1, p2, p3, n=48):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return out

def bez2(p0, p1, p2, n=16):
    return [((1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0], (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1])
            for t in [i / n for i in range(n + 1)]]

def shield_poly(cx, cy, w, h):
    top, r = -0.85, 0.17
    n = []
    n += bez2((-1, top + r), (-1, top), (-1 + r, top))
    n += [(1 - r, top)]
    n += bez2((1 - r, top), (1, top), (1, top + r))
    n += [(1, 0.10)]
    n += bez3((1, 0.10), (1, 0.62), (0.38, 0.88), (0, 1.0))
    n += bez3((0, 1.0), (-0.38, 0.88), (-1, 0.62), (-1, 0.10))
    n += [(-1, top + r)]
    pts = []
    for x, y in n:
        pts.append((cx + x * w / 2, cy - h / 2 + (y + 0.85) / 1.85 * h))
    return pts

def grad_img(size, c1, c2, direction='diag'):
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    if direction == 'diag': t = (xx / w + yy / h) / 2
    else: t = yy / h
    t = t[..., None]
    a = np.array(c1, dtype=np.float32); b = np.array(c2, dtype=np.float32)
    arr = (a + (b - a) * t).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGB')

def mask_poly(size, pts):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m

def n_mask(size, cx, cy, nw, nh, bar, rad):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    L, R, T, B = cx - nw / 2, cx + nw / 2, cy - nh / 2, cy + nh / 2
    d.rounded_rectangle([L, T, L + bar, B], radius=rad, fill=255)
    d.rounded_rectangle([R - bar, T, R, B], radius=rad, fill=255)
    d.polygon([(L, T), (L + bar * 1.25, T), (R, B), (R - bar * 1.25, B)], fill=255)
    return m

def render(S, shield_w, shield_h, bg=None, mono=False, glow=True):
    """bg: None (прозрачный), 'square' (скруглённый квадрат), 'full' (сплошной фон)."""
    W = S * SS
    size = (W, W)
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    cx, cy = W / 2, W / 2
    sw, sh = shield_w * SS, shield_h * SS

    if bg:
        base = grad_img(size, (9, 15, 28), (22, 44, 92)).convert('RGBA')
        # мягкое свечение за щитом
        gl = Image.new('RGBA', size, (0, 0, 0, 0))
        ImageDraw.Draw(gl).ellipse([cx - W*0.42, cy - W*0.42, cx + W*0.42, cy + W*0.42], fill=(88, 120, 255, 90))
        gl = gl.filter(ImageFilter.GaussianBlur(W * 0.12))
        base = Image.alpha_composite(base, gl)
        if bg == 'square':
            m = Image.new('L', size, 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.225), fill=255)
            base.putalpha(m)
        img = Image.alpha_composite(img, base)

    pts = shield_poly(cx, cy, sw, sh)
    smask = mask_poly(size, pts)

    if mono:
        white = Image.new('RGBA', size, (255, 255, 255, 255))
        nm = n_mask(size, cx, cy - sh * 0.03, sw * 0.50, sw * 0.56, sw * 0.135, sw * 0.03)
        cut = Image.fromarray((np.array(smask, dtype=np.int16) - np.array(nm, dtype=np.int16)).clip(0, 255).astype(np.uint8), 'L')
        out = Image.new('RGBA', size, (0, 0, 0, 0)); out.paste(white, (0, 0), cut)
        return out.resize((S, S), Image.LANCZOS)

    if glow:
        g = Image.new('RGBA', size, (0, 0, 0, 0))
        gm = smask.filter(ImageFilter.GaussianBlur(sw * 0.06))
        g.paste(Image.new('RGBA', size, (100, 140, 255, 150)), (0, 0), gm)
        img = Image.alpha_composite(img, g)

    # внешний градиентный щит
    outer = grad_img(size, (76, 141, 255), (160, 107, 255)).convert('RGBA')
    layer = Image.new('RGBA', size, (0, 0, 0, 0)); layer.paste(outer, (0, 0), smask)
    img = Image.alpha_composite(img, layer)

    # внутренний тёмный щит
    ipts = shield_poly(cx, cy + sh * 0.004, sw * 0.80, sh * 0.80)
    imask = mask_poly(size, ipts)
    inner = grad_img(size, (14, 24, 46), (9, 15, 30), 'vert').convert('RGBA')
    layer = Image.new('RGBA', size, (0, 0, 0, 0)); layer.paste(inner, (0, 0), imask)
    img = Image.alpha_composite(img, layer)

    # буква N
    ncy = cy - sh * 0.035
    nm = n_mask(size, cx, ncy, sw * 0.46, sw * 0.52, sw * 0.125, sw * 0.028)
    ng = grad_img(size, (255, 255, 255), (186, 214, 255), 'vert').convert('RGBA')
    layer = Image.new('RGBA', size, (0, 0, 0, 0)); layer.paste(ng, (0, 0), nm)
    img = Image.alpha_composite(img, layer)

    # «узлы сети» на концах диагонали
    d = ImageDraw.Draw(img)
    r = sw * 0.040
    for (px, py) in [(cx - sw * 0.23, ncy - sw * 0.26), (cx + sw * 0.23, ncy + sw * 0.26)]:
        d.ellipse([px - r, py - r, px + r, py + r], fill=(92, 225, 255, 255))
    return img.resize((S, S), Image.LANCZOS)

def save(img, *path):
    p = os.path.join(RES, *path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)

if __name__ == '__main__':
    # Классические иконки (до Android 8): квадрат + щит
    for folder, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        save(render(px, px * 0.58, px * 0.72, bg='square'), f'mipmap-{folder}', 'ic_launcher.png')
    # Адаптивная иконка: фон и передний план по 432 px (108dp @4x), щит внутри безопасной зоны
    save(render(432, 0, 0, bg='full').convert('RGB') if False else render(432, 1, 1, bg='full', glow=False).convert('RGB'), 'drawable-nodpi', 'ic_launcher_background.png')
    save(render(432, 432 * 0.40, 432 * 0.50), 'drawable-nodpi', 'ic_launcher_foreground.png')
    save(render(432, 432 * 0.40, 432 * 0.50, mono=True), 'drawable-nodpi', 'ic_launcher_monochrome.png')
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
'''
    os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
    open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w').write(xml)
    # Логотип внутри приложения и большой предпросмотр
    big = render(1024, 1024 * 0.60, 1024 * 0.75, bg='square')
    big.save(os.path.join(ROOT, 'assets', 'icon', 'nex_icon_1024.png'), optimize=True)
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'icon', 'nex_logo.png'), optimize=True)
    print('icons ok')
