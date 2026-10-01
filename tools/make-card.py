#!/usr/bin/env python3
"""Generate the AR MENU tracking card (high-feature print target).

Usage:
  python tools/make-card.py --url https://<user>.github.io/<repo>/ --out assets/target/card.png

The QR encodes the deployed URL. After regenerating the card you MUST
recompile assets/target/targets.mind (see tools/compile.html or README).

Design goals for reliable MindAR tracking:
  - lots of high-contrast corners / irregular shapes (no big flat areas)
  - asymmetric layout, fine texture/noise overlay
  - thick frame border + corner fiducials
"""
import argparse
import math
import random

from PIL import Image, ImageDraw, ImageFont
import qrcode

W, H = 1024, 768

def text_size(draw, s, font):
    b = draw.textbbox((0, 0), s, font=font)
    return b[2] - b[0], b[3] - b[1]

def load_font(size, bold=True):
    for name in (["arialbd.ttf", "arial.ttf"] if bold else ["arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://rkk572358-ship-it.github.io/ar-menu/",
                    help="URL encoded in the card QR (use your GitHub Pages URL)")
    ap.add_argument("--out", default="assets/target/card.png")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    random.seed(args.seed)

    img = Image.new("RGB", (W, H), "#141414")
    d = ImageDraw.Draw(img)

    # subtle vertical gradient
    for y in range(H):
        t = y / H
        r = int(20 + 26 * t); g = int(18 + 18 * t); b = int(16 + 10 * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))

    # random high-contrast speckle field (features!)
    for _ in range(5200):
        x, y = random.randrange(W), random.randrange(H)
        c = random.choice([(255, 255, 255), (255, 140, 26), (255, 201, 60),
                           (126, 217, 87), (90, 200, 250), (235, 69, 43)])
        r = random.choice([1, 1, 1, 2, 2, 3])
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)

    # random short line segments + triangles (more corners)
    for _ in range(260):
        x, y = random.randrange(W), random.randrange(H)
        a = random.random() * math.pi * 2
        ln = random.randint(8, 42)
        x2, y2 = x + math.cos(a) * ln, y + math.sin(a) * ln
        d.line([(x, y), (x2, y2)], fill=random.choice([(255, 255, 255), (255, 140, 26), (120, 120, 120)]), width=random.randint(1, 3))
    for _ in range(90):
        x, y = random.randrange(W), random.randrange(H)
        s = random.randint(6, 26)
        pts = [(x, y), (x + s, y + random.randint(-6, 6)), (x + random.randint(-6, 6), y + s)]
        d.polygon(pts, outline=random.choice([(255, 255, 255), (255, 201, 60), (126, 217, 87)]))

    # outer frame borders
    d.rectangle([8, 8, W - 8, H - 8], outline="#ff8c1a", width=10)
    d.rectangle([28, 28, W - 28, H - 28], outline="#f5f2ea", width=3)

    # corner fiducials (chunky L shapes = great features)
    L = 90
    for (cx, cy, sx, sy) in [(40, 40, 1, 1), (W - 40, 40, -1, 1), (40, H - 40, 1, -1), (W - 40, H - 40, -1, -1)]:
        d.line([(cx, cy), (cx + sx * L, cy)], fill="#ffc93c", width=16)
        d.line([(cx, cy), (cx, cy + sy * L)], fill="#ffc93c", width=16)

    f_big = load_font(118)
    f_med = load_font(40)
    f_small = load_font(30)
    f_tiny = load_font(24)

    # header branding
    title = "AR MENU"
    tw, th = text_size(d, title, f_big)
    # dark plate behind title for contrast + pattern dots on it
    d.rectangle([(W - tw) / 2 - 30, 52, (W + tw) / 2 + 30, 52 + th + 70], fill="#0c0c10")
    d.rectangle([(W - tw) / 2 - 30, 52, (W + tw) / 2 + 30, 52 + th + 70], outline="#ff8c1a", width=4)
    for _ in range(120):
        x = random.randint(int((W - tw) / 2 - 24), int((W + tw) / 2 + 24))
        y = random.randint(56, 56 + th + 62)
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=random.choice([(255, 140, 26), (255, 255, 255)]))
    d.text(((W - tw) / 2, 58), title, font=f_big, fill="#ffc93c")
    sub = "S C A N   •   P O I N T   •   T A S T E"
    sw, _ = text_size(d, sub, f_small)
    d.text(((W - sw) / 2, 58 + th + 22), sub, font=f_small, fill="#f5f2ea")

    # divider zigzag
    y0 = 268
    for x in range(48, W - 48, 24):
        d.line([(x, y0), (x + 12, y0 + 12)], fill="#ff8c1a", width=4)
        d.line([(x + 12, y0 + 12), (x + 24, y0)], fill="#ffc93c", width=4)

    # QR block (left)
    qx, qy, qs = 70, 310, 280
    d.rectangle([qx - 12, qy - 12, qx + qs + 12, qy + qs + 12], fill="#f5f2ea")
    d.rectangle([qx - 12, qy - 12, qx + qs + 12, qy + qs + 12], outline="#ff8c1a", width=5)
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(args.url)
    qr.make(fit=True)
    qimg = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qimg = qimg.resize((qs, qs), Image.NEAREST)
    img.paste(qimg, (qx, qy))
    cap = "SCAN TO OPEN"
    cw, _ = text_size(d, cap, f_small)
    d.text((qx + (qs - cw) / 2, qy + qs + 14), cap, font=f_small, fill="#ffc93c")
    url_show = args.url[:30] + ("\u2026" if len(args.url) > 30 else "")
    uw, _ = text_size(d, url_show, f_tiny)
    d.text((qx + (qs - uw) / 2, qy + qs + 48), url_show, font=f_tiny, fill="#b9b3a6")

    # decorative menu art (right of QR) — stylized dishes from shapes
    ax = 420
    d.text((ax, 315), "TODAY  •  2 DISHES  •  1 TAP  •  3D", font=f_small, fill="#7ed957")
    # burger icon
    bx, by = 545, 430
    d.ellipse([bx - 95, by - 40, bx + 95, by + 40], fill="#e8a94f", outline="white", width=3)
    d.rectangle([bx - 100, by - 8, bx + 100, by + 12], fill="#6b3a1f")
    d.rectangle([bx - 108, by + 12, bx + 108, by + 24], fill="#ffc93c")
    d.rectangle([bx - 100, by + 24, bx + 100, by + 44], fill="#e2452b")
    d.ellipse([bx - 90, by + 44, bx + 90, by + 78], fill="#e0a050", outline="white", width=3)
    for i in range(7):
        sx = bx - 60 + i * 20
        d.ellipse([sx - 5, by - 28, sx + 5, by - 18], fill="#fff3d6")
    lbl1 = "ROYAL BURGER \u20b9249"
    lw1, _ = text_size(d, lbl1, f_small)
    d.text((bx - lw1 / 2, by + 92), lbl1, font=f_small, fill="white")
    # pizza icon
    px, py = 835, 430
    d.polygon([(px - 90, py - 50), (px + 90, py - 50), (px, py + 90)], fill="#f0c040", outline="white")
    d.polygon([(px - 90, py - 50), (px + 90, py - 50), (px + 78, py - 32), (px - 78, py - 32)], fill="#e0a050")
    for (ox, oy) in [(-40, -10), (10, 10), (40, -20), (-5, 40), (30, 45), (-55, 30)]:
        d.ellipse([px + ox - 11, py + oy - 11, px + ox + 11, py + oy + 11], fill="#e2452b", outline="white", width=2)
    lbl2 = "FARM PIZZA \u20b9299"
    lw2, _ = text_size(d, lbl2, f_small)
    d.text((px - lw2 / 2, py + 102), lbl2, font=f_small, fill="white")

    # bottom strip: right of the QR block so nothing overlaps
    d.text((400, 648), "* HOUSE SAUCE  * FRESH BUNS  * CHEESE", font=f_tiny, fill="#b9b3a6")
    d.text((400, 676), "CARD No. 001  |  KEEP CARD FLAT", font=f_tiny, fill="#8f8a7e")
    d.text((400, 704), "mindar - three.js - static", font=f_tiny, fill="#5c574d")

    # print-safe margin note
    img.save(args.out)
    print(f"wrote {args.out} ({W}x{H}) with QR -> {args.url}")

if __name__ == "__main__":
    main()
