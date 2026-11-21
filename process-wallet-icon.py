import os
from collections import deque
from PIL import Image, ImageOps

SRC = r"C:\Users\david\.gemini\antigravity\brain\05378038-56ff-4f74-915b-3d292caa0184\.user_uploaded\media_1795277556319_9dfa0024.jpg"
OUT_WEB_PNG = r"c:\Users\david\Desktop\Proyecto Redes\WalletPay\src\assets\walletpay-icon.png"
RES_DIR = r"c:\Users\david\Desktop\Proyecto Redes\WalletPay\android\app\src\main\res"

os.makedirs(os.path.dirname(OUT_WEB_PNG), exist_ok=True)

img = Image.open(SRC).convert("RGBA")
w, h = img.size
px = img.load()

# 1. Flood-fill from corners to remove the white/near-white background & soft drop shadow
# Sample blue color from the center-top of the squircle
# First find the blue pixels to determine the exact brand blue color
blue_samples = []
for y in range(h // 4, 3 * h // 4, 4):
    for x in range(w // 4, 3 * w // 4, 4):
        r, g, b, a = px[x, y]
        if b > 160 and r < 60 and g < 110:
            blue_samples.append((r, g, b))

avg_r = sum(c[0] for c in blue_samples) // len(blue_samples)
avg_g = sum(c[1] for c in blue_samples) // len(blue_samples)
avg_b = sum(c[2] for c in blue_samples) // len(blue_samples)
brand_blue = (avg_r, avg_g, avg_b)
brand_hex = f"#{avg_r:02X}{avg_g:02X}{avg_b:02X}"
print(f"Detected brand blue: {brand_blue} ({brand_hex})")

# Flood fill exterior white / light gray shadow (pixels where saturation is low and brightness is high,
# stopping cleanly at the blue squircle boundary)
visited = [[False] * w for _ in range(h)]
q = deque()

for x in range(w):
    q.append((x, 0))
    q.append((x, h - 1))
    visited[0][x] = True
    visited[h - 1][x] = True
for y in range(h):
    q.append((0, y))
    q.append((w - 1, y))
    visited[y][0] = True
    visited[y][w - 1] = True

def is_bg_or_shadow(r, g, b):
    # Background is white or grey drop-shadow: low color difference (b - r < 35) and fairly bright
    return (b - r) < 42 and r > 155 and g > 155 and b > 155

while q:
    cx, cy = q.popleft()
    r, g, b, a = px[cx, cy]
    if is_bg_or_shadow(r, g, b):
        px[cx, cy] = (0, 0, 0, 0)
        for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                q.append((nx, ny))

# Soft anti-alias cleanup on the 1-2px outer rim of the squircle:
# If a pixel is adjacent to transparent and is greyish/whitish, blend or make transparent
to_clear = []
for y in range(1, h - 1):
    for x in range(1, w - 1):
        r, g, b, a = px[x, y]
        if a > 0 and (b - r) < 65 and r > 120:
            # Check if near transparent
            if any(px[nx, ny][3] == 0 for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1))):
                to_clear.append((x, y))
for x, y in to_clear:
    px[x, y] = (0, 0, 0, 0)

# Crop tight bounding box around the squircle
bbox = img.getbbox()
cropped = img.crop(bbox)
cw, ch = cropped.size
side = max(cw, ch)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)

# Save high-res transparent PNG for Web / Auth screen (512x512)
web_icon = square.resize((512, 512), Image.Resampling.LANCZOS)
web_icon.save(OUT_WEB_PNG, "PNG")
print(f"Saved web transparent icon: {OUT_WEB_PNG} ({cw}x{ch} -> 512x512)")

# Now generate Android launcher icons:
# For adaptive icons (mipmap-anydpi-v26):
# - Background: solid brand blue (#1D4ED8 or exact detected brand_hex)
# - Foreground: the inner white+light-blue wallet symbol centered with proper 66% safe zone on transparent background!
# Extract just the inner wallet card graphic by replacing exterior brand-blue with transparent on a copy, OR
# simply placing the cropped squircle scaled nicely inside the 108dp adaptive icon foreground (since background matches brand_blue, edges blend seamlessly with 0 white border!).
# Even better: placing the squircle at 78% of the foreground canvas on top of matching brand_blue background ensures
# ANY launcher mask (circle, squircle, rounded square, teardrop) shows pure brand blue edge-to-edge with the crisp wallet centered!

densities_legacy = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

densities_fg = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

for folder, size in densities_legacy.items():
    out_dir = os.path.join(RES_DIR, folder)
    os.makedirs(out_dir, exist_ok=True)
    # ic_launcher.webp (transparent background with the squircle)
    ic = square.resize((size, size), Image.Resampling.LANCZOS)
    ic.save(os.path.join(out_dir, "ic_launcher.webp"), "WEBP", quality=95)
    ic.save(os.path.join(out_dir, "ic_launcher_round.webp"), "WEBP", quality=95)

for folder, size in densities_fg.items():
    out_dir = os.path.join(RES_DIR, folder)
    os.makedirs(out_dir, exist_ok=True)
    # Place the squircle centered at ~76% of the 108dp canvas so the white wallet sits cleanly in the safe zone
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner_size = int(size * 0.78)
    resized = square.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    offset = (size - inner_size) // 2
    fg.paste(resized, (offset, offset), resized)
    fg.save(os.path.join(out_dir, "ic_launcher_foreground.webp"), "WEBP", quality=95)

# Update ic_launcher_background.xml (both values and drawable) to match the exact brand blue!
bg_val_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">{brand_hex}</color>
</resources>
"""
with open(os.path.join(RES_DIR, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write(bg_val_xml)

bg_drawable_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="{brand_hex}" />
</shape>
"""
with open(os.path.join(RES_DIR, "drawable", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write(bg_drawable_xml)

print("All Android mipmap icons and adaptive backgrounds generated successfully!")
