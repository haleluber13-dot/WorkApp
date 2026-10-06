#!/usr/bin/env python3
"""MotorLab — fetch the PBR surface maps.

Every material map the app dresses its generated parts with comes from
ambientCG (ambientcg.com), released CC0 1.0 — public domain. This downloads
each set at 1K and writes two tiers:

  assets/surfaces/       what the app loads: 512 px JPEGs
  assets/surfaces-lite/  the same maps at 224 px, for the single-file offline
                         build, where every byte is inlined under a 16 MB cap

The lite file keeps the full-tier name, because build-single.mjs swaps the two
by name (it asks for ./assets/surfaces/<file> and takes surfaces-lite/<file>
when it exists). The MIME type it inlines with comes from that extension, so
the lite tier stays JPEG; WebP would need '.webp' added to its MIME table.

Run from anywhere:

    python3 motorlab/tools/fetch-surfaces.py              # all of them
    python3 motorlab/tools/fetch-surfaces.py cast zinc    # just these

Needs Pillow and numpy (pip install pillow numpy). Every set's credit line goes in
assets/surfaces/CREDITS.md — keep it in step with SETS below.
"""
import io, os, sys, zipfile, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FULL = os.path.join(ROOT, 'assets', 'surfaces')
LITE = os.path.join(ROOT, 'assets', 'surfaces-lite')

# name -> (ambientCG asset id, height strength, roughness level, colour?, what it dresses).
#
# The colour map is written only where a material takes it (geo.js opts in
# with the `useColour` argument of dressSurface): the single-file build inlines
# every file in assets/surfaces, so a colour map nothing reads is dead weight
# against its 16 MB cap. Metals mostly keep MotorLab's own palette and use only
# the normal and roughness; rust bloom, forging scale, zinc spangle and braid
# are their colour, so those take it.
#
# The height strength rebuilds the normal map. ambientCG's procedural metals
# ship a normal that is almost flat at 1K — their relief lives in the
# Displacement map — so the normal is derived here from that displacement
# (Sobel slopes, scaled by the strength) and added to the shipped normal. A
# strength of 0 keeps the shipped normal as is.
#
# The roughness level is the mean the roughness map is rescaled to. three.js
# multiplies material.roughness by the map, so a map can only make a surface
# smoother than the material says; setting the map's mean to what the real
# surface measures lets every material use roughness 1.0 and read the true
# value off the map (cast iron ~0.85, machined aluminium ~0.4). None keeps
# the map as shipped.
SETS = {
    'cast':     ('Metal039', 2.4, 0.72, False, 'sand-cast aluminium: heads, covers, housings'),
    'iron':     ('Metal040', 4.0, 0.86, False, 'cast iron: blocks, iron heads, manifolds'),
    'rust':     ('Metal021', 1.6, 0.88, True , 'heat-cycled iron with a rust bloom: exhaust manifolds'),
    'hot':      ('Metal053C', 3.0, 0.80, False, 'heat-scaled steel: headers, turbine housings'),
    'machined': ('Metal011', 2.5, 0.42, False, 'fine tool marks: machined faces, anodised fittings'),
    'steel':    ('Metal009', 1.6, 0.50, False, 'brushed steel: fasteners, shafts, springs'),
    'forged':   ('Metal019', 3.5, 0.72, True , 'forged steel with dark scale: cranks, rods'),
    'zinc':     ('Metal037', 1.5, 0.52, True , 'galvanised spangle: plated hardware, brackets'),
    'powder':   ('Metal027', 1.2, 0.62, False, 'black powder coat: satin covers, brackets'),
    'wrinkle':  ('Paint001', 1.0, 0.86, False, 'wrinkle enamel: cam covers (normal map only)'),
    'braid':    ('Chainmail001', 0.0, 0.45, True , 'stainless braid over PTFE hose'),
    'rubber':   ('Rubber004', 0.8, 0.90, True , 'tyres, hoses, mounts, belts'),
    'plastic':  ('Plastic013A', 2.5, 0.55, False, 'covers, coils, trim'),
    'leather':  ('Leather030', 0.6, None, True , 'interiors'),
    'asphalt':  ('Asphalt031', 0.0, None, True , 'the ground'),
}

# map kind -> (source suffix, full px, lite px, jpeg quality)
# The lite tier is 224 px, not 256: the single-file build sits right under its
# 16 MB cap and these tiles are seen at a few hundred pixels across a part.
MAPS = {
    'nrm': ('NormalGL',  512, 224, 90),   # the normal carries the detail
    'rgh': ('Roughness', 512, 224, 84),
    'col': ('Color',     512, 224, 84),
}

UA = {'User-Agent': 'Mozilla/5.0 (MotorLab asset fetch)'}
CACHE = os.environ.get('SURFACE_CACHE', '')   # keep the zips somewhere, optional


def fetch(asset_id):
    name = f'{asset_id}_1K-JPG.zip'
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
        path = os.path.join(CACHE, name)
        if os.path.exists(path):
            return zipfile.ZipFile(path)
    url = f'https://ambientcg.com/get?file={name}'
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    if CACHE:
        with open(path, 'wb') as f:
            f.write(data)
    return zipfile.ZipFile(io.BytesIO(data))


def write(img, path, px, quality):
    im = img.convert('RGB')
    if im.width != px:
        im = im.resize((px, px), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
    return os.path.getsize(path)


def slopes(nrm):
    """An OpenGL normal map as (x, y) slope arrays in -1..1."""
    a = np.asarray(nrm.convert('RGB'), dtype=np.float32) / 255.0
    return a[..., 0] * 2 - 1, a[..., 1] * 2 - 1


def from_slopes(x, y):
    """Back to an 8-bit OpenGL normal map, renormalised."""
    x = np.clip(x, -0.98, 0.98); y = np.clip(y, -0.98, 0.98)
    z = np.sqrt(np.clip(1.0 - x * x - y * y, 0.02, 1.0))
    n = np.stack([x, y, z], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.uint8(np.clip((n * 0.5 + 0.5) * 255 + 0.5, 0, 255)), 'RGB')


def level(img, mean):
    """The roughness map rescaled so its mean is `mean`, contrast kept."""
    if mean is None:
        return img
    a = np.asarray(img.convert('L'), dtype=np.float32) / 255.0
    a = np.clip(a * (mean / max(float(a.mean()), 1e-3)), 0.0, 1.0)
    return Image.fromarray(np.uint8(a * 255 + 0.5), 'L')


def build_normal(nrm, disp, strength, px, spread_to=None):
    """The shipped normal plus slopes derived from the displacement map, both
    at `px`. Downscaling a normal map averages its slopes toward flat, so the
    shipped part is scaled back up to the slope spread it had at source size:
    the surface keeps its relief at every tier instead of going smooth."""
    sx0, sy0 = slopes(nrm)
    spread0 = float(np.std(sx0) + np.std(sy0)) + 1e-6
    small = nrm.convert('RGB').resize((px, px), Image.LANCZOS) if nrm.width != px else nrm.convert('RGB')
    sx, sy = slopes(small)
    spread = float(np.std(sx) + np.std(sy)) + 1e-6
    k = min(3.0, spread0 / spread)
    sx, sy = sx * k, sy * k
    if strength > 0 and disp is not None:
        h = disp.convert('L').resize((px, px), Image.LANCZOS) if disp.width != px else disp.convert('L')
        h = np.asarray(h, dtype=np.float32) / 255.0
        # Sobel slopes, in texels; tiling wraps so the seam stays seamless
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 2 \
           + (np.roll(np.roll(h, -1, 1), 1, 0) - np.roll(np.roll(h, 1, 1), 1, 0)) \
           + (np.roll(np.roll(h, -1, 1), -1, 0) - np.roll(np.roll(h, 1, 1), -1, 0))
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 2 \
           + (np.roll(np.roll(h, -1, 0), 1, 1) - np.roll(np.roll(h, 1, 0), 1, 1)) \
           + (np.roll(np.roll(h, -1, 0), -1, 1) - np.roll(np.roll(h, 1, 0), -1, 1))
        # the texel step shrinks with resolution; scale so relief is the same
        # physical height whatever the tier
        g = strength * px / 1024.0 * 3.0
        # OpenGL convention: +x right, +y up (image rows run down)
        sx = sx - dx * g / 8.0
        sy = sy + dy * g / 8.0
    spread = float(np.std(sx) + np.std(sy)) + 1e-6
    if spread_to:
        # the small tier loses the fine relief in the resize; scale what is
        # left so it reads as bumpy as the full tier
        k = min(2.5, spread_to / spread)
        sx, sy = sx * k, sy * k
    return from_slopes(sx, sy), spread


def main(only):
    os.makedirs(FULL, exist_ok=True)
    os.makedirs(LITE, exist_ok=True)
    total_full = total_lite = 0
    for name, (asset_id, strength, rough, colour, _what) in SETS.items():
        if only and name not in only:
            continue
        try:
            zf = fetch(asset_id)
        except Exception as err:
            print(f'  {name:8s} SKIP  {asset_id}: {err}')
            continue
        names = zf.namelist()
        pick = lambda suffix: next((n for n in names if n.endswith(f'_{suffix}.jpg')), None)
        disp = pick('Displacement')
        disp = Image.open(io.BytesIO(zf.read(disp))) if disp else None
        for kind, (suffix, px_full, px_lite, q) in MAPS.items():
            if kind == 'col' and not colour:
                for d in (FULL, LITE):            # a stale one from an earlier run
                    stale = os.path.join(d, f'{name}_col.jpg')
                    if os.path.exists(stale):
                        os.remove(stale)
                continue
            match = pick(suffix)
            if not match:
                print(f'  {name:8s} no {suffix} in {asset_id}')
                continue
            img = Image.open(io.BytesIO(zf.read(match)))
            if kind == 'nrm':
                full, spread = build_normal(img, disp, strength, px_full)
                lite, _ = build_normal(img, disp, strength, px_lite, spread)
                a = write(full, os.path.join(FULL, f'{name}_{kind}.jpg'), px_full, q)
                b = write(lite, os.path.join(LITE, f'{name}_{kind}.jpg'), px_lite, q - 8)
            elif kind == 'rgh':
                img = level(img, rough)
                a = write(img, os.path.join(FULL, f'{name}_{kind}.jpg'), px_full, q)
                b = write(img, os.path.join(LITE, f'{name}_{kind}.jpg'), px_lite, q - 8)
            else:
                a = write(img, os.path.join(FULL, f'{name}_{kind}.jpg'), px_full, q)
                b = write(img, os.path.join(LITE, f'{name}_{kind}.jpg'), px_lite, q - 6)
            total_full += a
            total_lite += b
            print(f'  {name:8s} {kind}  {img.width}px -> {px_full}px {a//1024:4d}KB'
                  f'   lite {px_lite}px {b//1024:3d}KB   [{asset_id} CC0]')
    print(f'\nfull tier {total_full/1048576:.2f} MB   lite tier {total_lite/1048576:.2f} MB')


if __name__ == '__main__':
    main(set(a for a in sys.argv[1:] if not a.startswith('-')))
