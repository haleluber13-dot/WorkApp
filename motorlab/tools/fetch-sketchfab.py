#!/usr/bin/env python3
"""MotorLab — pull licence-clean models from Sketchfab and bundle them.

Sketchfab hosts a large collection of vehicles and engines released under CC0
and CC-BY, free to redistribute. Its search and metadata are open, but the
download endpoint needs an account, so this needs an API token — a free one,
from https://sketchfab.com/settings/password (the "API token" box).

    export SKETCHFAB_TOKEN=xxxxxxxx
    python3 motorlab/tools/fetch-sketchfab.py --list            # what it would take
    python3 motorlab/tools/fetch-sketchfab.py                   # take all of it
    python3 motorlab/tools/fetch-sketchfab.py veh:bmw-m3-e46    # just these targets
    python3 motorlab/tools/fetch-sketchfab.py --search "rotary engine"
    python3 motorlab/tools/fetch-sketchfab.py --into /tmp/raw   # keep the raw .glb

Every catalogue entry names one model by its id. That is deliberate. Searching
by title looked like it would do: it does not. A search for "bmw m3" returns
an E30 above the E46 because the E30 is the more popular upload, "ferrari v12"
returns a Formula One car, and "diesel engine" returns a locomotive. Titles do
not say which generation a car is, popularity does not say which one is right,
and no filter fixes that — someone has to look. So someone looked, and the id
of the model that was actually the right car is written down here.

`--search` is what the looking was done with, and is how a new entry gets its
id: run it, read the candidates, pick one, paste it in.

What it does per target: fetches the model's metadata, refuses anything whose
licence does not permit redistribution, downloads the glTF, converts it to a
.glb with Blender, and hands it to import-model.mjs — which records the licence
and the author in assets/models/CREDITS.md.
"""
import io, json, os, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile

ROOT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
API   = 'https://api.sketchfab.com/v3'
TOKEN = os.environ.get('SKETCHFAB_TOKEN', '')

# Only licences that permit redistribution, by the API's own slug. Anything
# else — Standard, non-commercial, no-derivatives, editorial — is refused, so a
# model can only be bundled if its terms actually allow it.
OK_LICENCES = {
    'cc0':   'CC0 1.0 (public domain)',
    'by':    'CC BY 4.0',
    'by-sa': 'CC BY-SA 4.0',
}

# id in the app  ->  the Sketchfab model that is that thing.
TARGETS = {
    # ---- cars, by marque -------------------------------------------------
    'veh:bmw-m3-e46':          '74916396475b414f8dbcb580621a5010',
    'veh:bmw-m5':              '5478e978bd634337adc8e3dc413fbfa3',
    'veh:mazda-rx7':           '8ac0df459f514950ab83ac37109a06ab',
    'veh:mazda-mx5':           '25fc4c8bd4494fe0b9e456644b269c6f',
    'veh:audi-r8':             'e17e438f076f4427a58d93aa779edaed',
    'veh:audi-rs3':            '77d3dcacacb7413e9685a27f77f651f8',
    'veh:audi-quattro-s1':     '2c3209a22a274cc389ce3b0c77caed6a',
    'veh:maserati-mc20':       '013ce35092394d328dc2099fe2841ac0',
    'veh:maserati-granturismo':'c4aa1cf6461048e3b75a77ff027f90c6',
    'veh:toyota-supra-a80':    'eb9bb1eb41db431cb078088ae1ce45f8',
    'veh:toyota-ae86':         'a5737bf3cc9b4179a6e5ebe173ff70d9',
    'veh:toyota-lfa':          '05900382647c42d19ab925f23eabca62',
    'veh:toyota-gr-yaris':     '44cb958908b94aa5aad0d856994f35a3',
    'veh:ford-mustang-gt':     '0eaa7a16796540f29461ddae05ecdeb3',
    'veh:ford-gt':             'dd6c3effdb1e43ecadace447ccbda68d',
    'veh:ferrari-812':         'cd7dfc79a98244ca81d86d82ce2b49a7',
    'veh:porsche-911-gt3':     '78d5c47ab2554c2592b7e499179a0792',
    'veh:nissan-gtr-r35':      '7b142ea3376e4811a326256c59bbc7a2',
    'veh:nissan-skyline-r34':  'ff8fb2251dfa4bb9979e7022c5a6666c',
    'veh:honda-nsx-na1':       '1cc15628a00a4739a6b6c01128927c8d',
    'veh:lambo-v12':           '36eb1fa54a0d4be695d4cd90c30f4ff1',
    'veh:bugatti-w16':         '6da5092ee455446cb050e4c6b4a3ac05',
    'veh:subaru-wrx-sti':      '08296bc950364621b6174a3078bb19e0',
    'veh:koenigsegg':          'c657f51fb0db43e38fea172dfa385287',
    'veh:super':               '3f22c626f5274455a90a14801e62527c',
    'veh:concept':             'b5466f263aef4f8c8f370547f7a8a84e',
    'veh:coupe':               '0fe7cb6fb9e047cd99284c5b4a7f7d5e',
    'veh:hatch':               '2b741e9b9c3a48b1871b0531de331210',
    'veh:sedan':               '83be21e3c816418bb4f21be68f61c70c',

    # ---- cars by discipline ----------------------------------------------
    'veh:formula':             'fefcd94bface4f2ebcd5750e6c408f6a',
    'veh:awd-rally':           '1c2ce5ff548f4ab49d72183d1e0f2afe',
    'veh:drift':               '67613c6c3f8941479fb38b2c3506d319',
    'veh:nns':                 'e0ed6ec9fdfc4a1abdfa3e94d14a787d',
    'veh:stockcar':            '9ec83315f04c4d219fcb5baf4b373486',
    'veh:dragster':            '41256345adb74f9ca1525f35d4f0c9e6',
    'veh:kart':                '35ed6acb8016410d9b2a32d41ef2ca54',

    # ---- trucks -----------------------------------------------------------
    'veh:pickup':              '365df0fbda074221aeed52a91a3f6d00',
    'veh:semi':                '0599b3d7f9a5437fa905b20674d16d17',

    # ---- bikes ------------------------------------------------------------
    'veh:sportbike':           '0ab38d6e39664b25bfaf9f5c3e0c767c',
    'veh:harley':              '94c9d48a23a1407190e973001da63e50',
    'veh:cruiser':             'a38557914e324e418a407071eaedf6ec',
    'veh:mx':                  'eb01f118459e4074b55034ec5907c4de',
    'veh:adv':                 '58419276f8d3406cab5524b20124271e',

    # ---- engines ----------------------------------------------------------
    'eng:v8-57-sb':            'f20acef709b847eb98839b89c5ef916c',
    'eng:v8-50-ohv':           '4ec40400a93546d4aa6b7dd24393e9a5',
    'eng:i6-30-legend':        '7ebc9741434540c4831453066d7ae057',
    'eng:rotary-13b-t':        'b4feef96666a4bc494caae6c98fb9b83',
    'eng:f6-30-t':             '5700259eeb494b8f8a0b8f63486c59cc',
    'eng:f4-25-t':             '55e22b0e48f440c8a00ea1385e2c09ab',
    'eng:v12-65-na':           '16d4a2d9ee954bdd8ccf71fcf647b52b',
    'eng:v6-35-na':            '7309cf5e6b07435c962f954513ca170e',
    'eng:d-i6-67':             '8a08e2a4c2da49b69536f39d021c9ac7',
    'eng:m-triple-765':        'ad2416e341cb4beca3f86b0b00e84749',
    'eng:m-i4-1000':           '33db399c34ef4d61bd93d422b1c0c92e',
}

NEVER = ('locomotive', 'train', 'airplane', 'aircraft', 'plane', 'boat', 'ship',
         'rocket', 'lego', 'minecraft', 'low poly', 'lowpoly', 'cartoon')


def api(path, need_token=True, **params):
    """Search and metadata are open; only downloading needs the token."""
    if need_token and not TOKEN:
        sys.exit('No token. Get a free one at https://sketchfab.com/settings/password '
                 '(the "API token" box) and set SKETCHFAB_TOKEN.')
    url = f'{API}/{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    headers = {'User-Agent': 'MotorLab asset fetch'}
    if TOKEN:
        headers['Authorization'] = 'Token ' + TOKEN
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def licence_of(model):
    """The redistributable slug for a model, or None if we may not ship it."""
    lic = model.get('license') or {}
    slug = lic.get('slug') or lic.get('uid') or ''
    return slug if slug in OK_LICENCES else None


def candidates(query):
    """Search hits worth a human look, best first.

    Only for finding an id to paste into TARGETS — nothing downloads off the
    back of a search, because a search cannot tell an E30 from an E46."""
    out = []
    for lic in OK_LICENCES:
        try:
            res = api('search', need_token=False, type='models', q=query,
                      downloadable='true', license=lic, count=24)
        except Exception as err:
            print(f'    search ({lic}) failed: {err}')
            continue
        for m in res.get('results', []):
            tris = m.get('faceCount') or 0
            title = (m.get('name') or '').lower()
            if tris < 15_000 or any(w in title for w in NEVER):
                continue
            out.append((m.get('likeCount') or 0, lic, tris, m.get('name'), m['uid']))
    out.sort(reverse=True)
    return out


def download_gltf(uid, into):
    urls = api(f'models/{uid}/download')
    link = (urls.get('gltf') or {}).get('url')
    if not link:
        raise RuntimeError('no glTF download for this model')
    with urllib.request.urlopen(link, timeout=900) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    z.extractall(into)
    for name in z.namelist():
        if name.endswith('.gltf') or name.endswith('.glb'):
            return os.path.join(into, name)
    raise RuntimeError('no .gltf inside the archive')


BLENDER_CONVERT = r'''
import bpy, sys
src, dst = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                          export_draco_mesh_compression_enable=False,
                          export_apply=True, export_yup=True)
'''


def to_glb(src, dst):
    """glTF to GLB, at full size. Making it small is shrink-glb.py's job, and
    keeping the two apart means the raw download can be re-shrunk to a
    different budget without fetching it again."""
    if src.endswith('.glb'):
        os.replace(src, dst)
        return dst
    script = os.path.join(tempfile.gettempdir(), '_ml_convert.py')
    with open(script, 'w') as f:
        f.write(BLENDER_CONVERT)
    subprocess.run([sys.executable, script, src, dst],
                   stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    if not os.path.exists(dst):
        raise RuntimeError('Blender produced no .glb')
    return dst


def bundle(target, glb, licence, credit, source):
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'import-model.mjs'),
                    target, glb, '--licence', licence, '--credit', credit,
                    '--source', source], check=True)


VALUED = ('--into', '--search')       # options that swallow the word after them


def main(argv):
    only, skip = [], False
    for a in argv:
        if skip:
            skip = False
        elif a in VALUED:
            skip = True
        elif not a.startswith('--'):
            only.append(a)
    dry  = '--list' in argv
    into = argv[argv.index('--into') + 1] if '--into' in argv else None

    if '--search' in argv:
        query = argv[argv.index('--search') + 1]
        for likes, lic, tris, name, uid in candidates(query)[:30]:
            print(f'  [{lic:5s}] {tris:>9} tris {likes:>4} likes  {(name or "")[:56]:56s} {uid}')
        return

    if into:
        os.makedirs(into, exist_ok=True)
    todo = {k: v for k, v in TARGETS.items() if not only or k in only}
    taken = 0
    for target, uid in todo.items():
        try:
            m = api(f'models/{uid}', need_token=False)
        except Exception as err:
            print(f'{target:28s} metadata failed: {err}')
            continue
        slug = licence_of(m)
        credit = (m.get('user') or {}).get('displayName') or 'unknown'
        name = m.get('name') or ''
        if not slug:
            lab = ((m.get('license') or {}).get('label') or 'unknown')
            print(f'{target:28s} SKIPPED — "{name[:40]}" is {lab}, not redistributable')
            continue
        print(f'{target:28s} {name[:46]:46s} [{slug}] by {credit} {m.get("faceCount")} tris')
        if dry:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            try:
                src = download_gltf(uid, tmp)
                glb = os.path.join(tmp, 'out.glb')
                to_glb(src, glb)
                if into:
                    keep = os.path.join(into, target.replace(':', '-') + '.glb')
                    with open(glb, 'rb') as a, open(keep, 'wb') as b:
                        b.write(a.read())
                    glb = keep
                bundle(target, glb, OK_LICENCES[slug], f'{credit} — "{name}"',
                       f'https://sketchfab.com/3d-models/{uid}')
                taken += 1
            except Exception as err:
                print(f'    failed: {err}')
    print(f'\n{taken} model(s) bundled. See motorlab/assets/models/CREDITS.md.')


if __name__ == '__main__':
    main(sys.argv[1:])
