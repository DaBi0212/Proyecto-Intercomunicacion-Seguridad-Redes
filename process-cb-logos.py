import os
from PIL import Image

IMG1_MARK = r"C:\Users\david\.gemini\antigravity\brain\05378038-56ff-4f74-915b-3d292caa0184\.user_uploaded\media_1795472825321_6c77cb7a.png"
IMG2_HORIZ = r"C:\Users\david\.gemini\antigravity\brain\05378038-56ff-4f74-915b-3d292caa0184\.user_uploaded\media_1795472848627_50ac9c91.png"
IMG3_VERT = r"C:\Users\david\.gemini\antigravity\brain\05378038-56ff-4f74-915b-3d292caa0184\.user_uploaded\media_1795472951998_12e355ba.png"

ASSETS_DIR = r"c:\Users\david\Desktop\Proyecto Redes\CentralBank\Assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

def remove_white_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # Check how close to white the pixel is
            # The logo is deep navy blue (~#0E3A7E). White background has high R, G, B.
            # Using red channel (since logo has very low red < 40, while white is 255):
            if r > 240 and g > 240 and b > 240:
                px[x, y] = (0, 0, 0, 0)
            elif r > 140 and (b - r) < 40:
                # Smooth edge anti-aliasing
                alpha = max(0, min(255, int((255 - r) * 2.2)))
                px[x, y] = (14, 58, 126, alpha)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    return im

mark = remove_white_bg(Image.open(IMG1_MARK))
horiz = remove_white_bg(Image.open(IMG2_HORIZ))
vert = remove_white_bg(Image.open(IMG3_VERT))

# 1. Save square padded mark for PNG & multi-resolution ICO
mw, mh = mark.size
side = int(max(mw, mh) * 1.12)
square_mark = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square_mark.paste(mark, ((side - mw) // 2, (side - mh) // 2), mark)

mark_512 = square_mark.resize((512, 512), Image.Resampling.LANCZOS)
mark_png_path = os.path.join(ASSETS_DIR, "centralbank-mark.png")
mark_512.save(mark_png_path, "PNG")

ico_path = os.path.join(ASSETS_DIR, "centralbank.ico")
mark_512.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# Also create a white-tinted version of the mark for dark cards (like tickets in the vault)
mark_white = mark_512.copy()
wpx = mark_white.load()
for y in range(512):
    for x in range(512):
        r, g, b, a = wpx[x, y]
        if a > 0:
            wpx[x, y] = (255, 255, 255, a)
mark_white.save(os.path.join(ASSETS_DIR, "centralbank-mark-white.png"), "PNG")

# 2. Save horizontal logo ("C Central Bank")
horiz_path = os.path.join(ASSETS_DIR, "centralbank-horizontal.png")
horiz.save(horiz_path, "PNG")

# 3. Save vertical stacked logo ("C" above "Central Bank")
vert_path = os.path.join(ASSETS_DIR, "centralbank-vertical.png")
vert.save(vert_path, "PNG")

print(f"Generated CentralBank assets in {ASSETS_DIR}:")
print(f" - Icon (.ico): {ico_path}")
print(f" - Mark (.png): {mark_png_path} ({mark.size})")
print(f" - Horizontal (.png): {horiz_path} ({horiz.size})")
print(f" - Vertical (.png): {vert_path} ({vert.size})")
