#!/usr/bin/env python3
"""MotorLab — fetch the scanned PBR surfaces.

Every material map the app dresses its generated parts with is a photogrammetry
scan from ambientCG (ambientcg.com), released CC0. This downloads them at source
resolution and writes two tiers:

  assets/surfaces/       what the app loads — normals at full detail
  assets/surfaces-lite/  the same maps, small, for the single-file offline build
                         where every byte is inlined and the file has a size cap

Run from the repository root:

    python3 motorlab/tools/fetch-surfaces.py            # all of them
    python3 motorlab/tools/fetch-surfaces.py cast steel # just these

Metals take only the normal and roughness maps, so MotorLab keeps its own
palette — a cast aluminium block should not turn the colour of whatever lump the
photographer happened to scan. Rubber, plastic, leather and asphalt take the
colour too.
"""
import io, os, sys, zipfile, urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FULL = os.path.join(ROOT, 'assets', 'surfaces')
LITE = os.path.join(ROOT, 'assets', 'surfaces-lite')

# name -> (ambientCG asset id, take the scan's own colour?)
SETS = {
    'cast':    ('Metal046A',   False),   # sand-cast aluminium — every casting
    'steel':   ('Metal029',    False),   # machined steel — crank, rods, fasteners
    'hot':     ('Metal053C',   False),   # heat-scaled steel — headers, turbines
    'rubber':  ('Rubber004',   True),    # tyres, hoses, mounts, belts
    'plastic': ('Plastic013A', True),    # covers, coils, trim
    'leather': ('Leather030',  True),    # interiors
    'asphalt': ('Asphalt031',  True),    # the ground
}

# map kind -> (source suffix, full px, lite px, jpeg quality)
MAPS = {
    'nrm': ('NormalGL',  1024, 256, 86),   # the normal carries the detail
    'rgh': ('Roughness',  512, 256, 82),
    'col': ('Color',      512, 384, 82),
}

UA = {'User-Agent': 'Mozilla/5.0 (MotorLab asset fetch)'}


def fetch(asset_id):
    url = f'https://ambientcg.com/get?file={asset_id}_1K-JPG.zip'
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return zipfile.ZipFile(io.BytesIO(r.read()))


def write(img, path, px, quality):
    im = img.convert('RGB')
    if im.width != px:
        im = im.resize((px, px), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
    return os.path.getsize(path)


def main(only):
    os.makedirs(FULL, exist_ok=True)
    os.makedirs(LITE, exist_ok=True)
    total_full = total_lite = 0
    for name, (asset_id, want_colour) in SETS.items():
        if only and name not in only:
            continue
        try:
            zf = fetch(asset_id)
        except Exception as err:
            print(f'  {name:8s} SKIP  {asset_id}: {err}')
            continue
        names = zf.namelist()
        for kind, (suffix, px_full, px_lite, q) in MAPS.items():
            if kind == 'col' and not want_colour:
                continue
            match = next((n for n in names if n.endswith(f'_{suffix}.jpg')), None)
            if not match:
                print(f'  {name:8s} no {suffix} in {asset_id}')
                continue
            img = Image.open(io.BytesIO(zf.read(match)))
            a = write(img, os.path.join(FULL, f'{name}_{kind}.jpg'), px_full, q)
            b = write(img, os.path.join(LITE, f'{name}_{kind}.jpg'), px_lite, q - 4)
            total_full += a
            total_lite += b
            print(f'  {name:8s} {kind}  {img.width}px -> {px_full}px {a//1024:4d}KB'
                  f'   lite {px_lite}px {b//1024:3d}KB   [{asset_id} CC0]')
    print(f'\nfull tier {total_full/1048576:.2f} MB   lite tier {total_lite/1048576:.2f} MB')


if __name__ == '__main__':
    main(set(a for a in sys.argv[1:] if not a.startswith('-')))
