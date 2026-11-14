# -*- coding: utf-8 -*-
r"""生成 PWA 图标（192/512/180、maskable）。依赖 Pillow。"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets", "icons")
os.makedirs(OUT, exist_ok=True)

BG_TOP = (26, 38, 54)
BG_BOTTOM = (9, 13, 20)
BARS = [(47, 191, 107), (88, 166, 255), (240, 183, 47)]


def gradient(size):
    img = Image.new("RGB", (size, size), BG_BOTTOM)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=color)
    return img


def draw_icon(size, maskable=False):
    img = gradient(size).convert("RGBA")

    # 圆角遮罩（maskable 用满铺方形，交给系统裁切）
    if not maskable:
        radius = int(size * 0.22)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
        img.putalpha(mask)

    d = ImageDraw.Draw(img)
    scale = 0.62 if maskable else 0.72
    w = size * scale
    left = (size - w) / 2
    bottom = size / 2 + w * 0.30
    bar_w = w * 0.20
    gap = w * 0.11
    heights = [w * 0.34, w * 0.55, w * 0.80]

    x = left
    for i, h in enumerate(heights):
        color = BARS[i]
        radius = bar_w * 0.34
        d.rounded_rectangle(
            [x, bottom - h, x + bar_w, bottom],
            radius=radius,
            fill=color + (255,),
        )
        x += bar_w + gap

    # 底部基线
    line_y = bottom + w * 0.06
    d.rounded_rectangle(
        [left, line_y, left + w, line_y + max(2, int(size * 0.012))],
        radius=size * 0.01,
        fill=(125, 138, 154, 110),
    )
    return img


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, "PNG", optimize=True)
    print("wrote", path, img.size)


save(draw_icon(192), "icon-192.png")
save(draw_icon(512), "icon-512.png")
save(draw_icon(180), "apple-touch-icon.png")
save(draw_icon(192, maskable=True), "maskable-192.png")
save(draw_icon(512, maskable=True), "maskable-512.png")
