"""Ghép lại nền rồng vàng (nền phả đồ) từ các lớp PSD cho khung rộng hơn, không kéo méo hoạ tiết.
Mỗi lớp giữ nguyên kích thước, chỉ dời ngang theo "điểm neo" t: 0 = bám mép trái, 0.5 = giữ giữa, 1 = bám mép phải.
Hai hàng hoa văn trên/dưới (nửa trái L, nửa phải R đối xứng) được lát tiếp [R L R L] ra hai bên."""
import sys
from PIL import Image
from psd_tools import PSDImage

# Dùng: python3 scripts/ghep-nen-pha-do.py <file-psd-đã-chỉnh-màu> <thư-mục-ra>  (cần psd-tools, numpy, pillow)
SRC, OUT = sys.argv[1], sys.argv[2]
p = PSDImage.open(SRC)
W0, H = p.size
BG = (244, 231, 156)
ANCHOR = {
    "rongben copy 5": 0.0, "may copy 6": 0.0,     # rồng ngoài + mây trái: bám mép trái
    "may copy 5": 0.25,                            # mây giữa rồng ngoài và rồng trong
    "rongben copy 3": 1.0, "may copy 10": 1.0,
    "may copy 9": 0.75,
}
FRIEZE_L = {"ronggiao1 copy 6", "ronggiao1 copy 10"}
FRIEZE_R = {"ronggiao1 copy 7", "ronggiao1 copy 8"}
layers = {l.name: l for l in p.descendants()}
motif = [l for l in p.descendants() if l.visible and l.opacity < 100 and l.name.startswith(("tronlot", "rongben", "may", "ronggiao1 copy"))]

def dense_bbox(layer, frac=0.04):
    """Mép trái/phải của phần hình "đặc" — bỏ qua vài nét mảnh lác đác ở mép lớp"""
    import numpy as np
    a = np.asarray(layer.topil().getchannel("A"), dtype=np.uint32)
    cols = a.sum(axis=0)
    idx = np.nonzero(cols > cols.max() * frac)[0]
    return (int(idx[0]), 0, int(idx[-1]) + 1, a.shape[0])

def render(W, extra_clouds=False):
    base = Image.new("RGBA", (W, H), BG + (255,))
    extra = W - W0
    def put(layer, x, y):
        img = layer.topil().convert("RGBA")
        a = img.getchannel("A").point(lambda v: v * layer.opacity // 255)
        img.putalpha(a)
        tile = Image.new("RGBA", base.size, (0, 0, 0, 0))
        tile.paste(img, (x, y))
        base.alpha_composite(tile)
    for l in motif:
        x0, y0, x1, y1 = l.bbox
        if l.name in FRIEZE_L or l.name in FRIEZE_R:
            continue
        t = ANCHOR.get(l.name, 0.5)
        put(l, round(x0 + extra * t), y0)
    # hàng hoa văn: cặp gốc ở giữa; lát thêm R bên trái, L bên phải, nối khít theo phần có hình (bỏ lề trống của lớp)
    for rowL, rowR in (("ronggiao1 copy 6", "ronggiao1 copy 7"), ("ronggiao1 copy 10", "ronggiao1 copy 8")):
        L, R = layers[rowL], layers[rowR]
        lb = dense_bbox(L)  # phần có hình đáng kể trong lớp (toạ độ trong lớp)
        rb = dense_bbox(R)
        gap = 90                                   # khoảng cách giữa hai hoạ tiết ở chỗ nối ngoài
        shift = extra // 2
        xL, xR = L.bbox[0] + shift, R.bbox[0] + shift
        put(L, xL, L.bbox[1]); put(R, xR, R.bbox[1])
        left_edge = xL + lb[0]                     # mép trái phần hình của L
        right_edge = xR + rb[2]                    # mép phải phần hình của R
        k = 0
        while left_edge > 0 or right_edge < W:
            src = R if k % 2 == 0 else L           # bên trái lát R, L, R… ; bên phải lát L, R, L…
            sb = rb if src is R else lb
            x = left_edge - gap - sb[2]
            put(src, x, src.bbox[1]); left_edge = x + sb[0]
            src2 = L if k % 2 == 0 else R
            sb2 = lb if src2 is L else rb
            x2 = right_edge + gap - sb2[0]
            put(src2, x2, src2.bbox[1]); right_edge = x2 + sb2[2]
            k += 1
            if k > 6: break
    if extra > 1800:
        # khung rất rộng: thêm một cặp rồng chầu (bản sao rồng trong) vào giữa rồng ngoài và rồng trong
        for name, side in (("rongben copy 4", -1), ("rongben copy 2", 1)):
            d = layers[name]; dw = d.bbox[2] - d.bbox[0]
            outer = layers["rongben copy 5"].bbox[2] if side < 0 else W - (W0 - layers["rongben copy 3"].bbox[0])
            inner = d.bbox[0] + extra // 2 if side < 0 else d.bbox[2] + extra // 2
            cx = (outer + inner) // 2
            put(d, cx - dw // 2, d.bbox[1])
    elif extra_clouds and extra > 900:
        # lấp khoảng trống giữa rồng ngoài và rồng trong bằng mây (dùng lại lớp mây dưới)
        c = layers["may copy 13"]; cw = c.bbox[2] - c.bbox[0]
        gap_l = (1444 + (1191 + extra // 2)) // 2
        put(c, gap_l - cw // 2, 2600)
        c2 = layers["may copy 12"]
        gap_r = W - gap_l
        put(c2, gap_r - cw // 2, 2600)
    return base.convert("RGB")

for ratio in (1.75, 2.1):
    W = round(H * ratio)
    im = render(W, extra_clouds=True)
    small = im.resize((round(2400 * ratio / 1.414), round(1697)), Image.LANCZOS) if False else im.resize((round(1697 * ratio), 1697), Image.LANCZOS)
    tag = str(ratio).replace(".", "")
    small.save(f"{OUT}/nen-{tag}.webp", "WEBP", quality=80, method=6)
    prev = small.copy(); prev.thumbnail((1400, 1400)); prev.save(f"{OUT}/xem-{tag}.png")
    print(tag, small.size)
