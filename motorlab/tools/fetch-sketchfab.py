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

What it does per target: searches downloadable models under the licences we are
allowed to redistribute, picks the best candidate, downloads the glTF, converts
it to a .glb with Blender, and hands it to import-model.mjs — which records the
licence and the author in assets/models/CREDITS.md. Nothing is bundled without
those two, and any licence outside the allow-list below is skipped rather than
guessed at.
"""
import io, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile

ROOT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
API   = 'https://api.sketchfab.com/v3'
TOKEN = os.environ.get('SKETCHFAB_TOKEN', '')

# Only licences that permit redistribution, as the API's own filter values.
# Anything else — non-commercial, no-derivatives, editorial — is never fetched,
# because the search asks for these and nothing else.
OK_LICENCES = {
    'cc0':   'CC0 1.0 (public domain)',
    'by':    'CC BY 4.0',
    'by-sa': 'CC BY-SA 4.0',
}

# What to look for, per catalogue entry. Queries are deliberately plain: the
# search is over user-supplied titles, so an over-specific query finds nothing.
TARGETS = {
    # id                     : (search query, words the title must contain)
    'veh:bmw-m3-e46':          ('bmw m3',                  ['bmw', 'm3'], []),
    'veh:bmw-m5':              ('bmw m5',                  ['bmw', 'm5'], []),
    'veh:mazda-rx7':           ('mazda rx7',               ['rx-7', 'rx7'], []),
    'veh:mazda-mx5':           ('mazda miata mx5',         ['miata', 'mx-5', 'mx5'], []),
    'veh:audi-r8':             ('audi r8',                 ['r8'], []),
    'veh:audi-rs3':            ('audi rs3',                ['rs3', 'rs 3'], []),
    'veh:audi-quattro-s1':     ('audi quattro',            ['quattro'], []),
    'veh:maserati-mc20':       ('maserati mc20',           ['mc20'], []),
    'veh:maserati-granturismo':('maserati granturismo',    ['granturismo'], []),
    'veh:toyota-supra-a80':    ('toyota supra',            ['supra'], []),
    'veh:toyota-ae86':         ('toyota ae86 corolla',     ['ae86', 'trueno', 'corolla'], []),
    'veh:toyota-lfa':          ('lexus lfa',               ['lfa'], []),
    'veh:toyota-gr-yaris':     ('toyota gr yaris',         ['yaris'], []),
    'veh:ford-mustang-gt':     ('ford mustang',            ['mustang'], []),
    'veh:ford-gt':             ('ford gt',                 ['ford gt'], []),
    'veh:ferrari-812':         ('ferrari v12',             ['ferrari'], []),
    'veh:porsche-911-gt3':     ('porsche 911 gt3',         ['911', 'gt3'], []),
    'veh:nissan-gtr-r35':      ('nissan gtr r35',          ['r35'], []),
    'veh:nissan-skyline-r34':  ('nissan skyline r34',      ['r34'], []),
    'veh:honda-nsx-na1':       ('honda nsx',               ['nsx'], []),
    'veh:lambo-v12':           ('lamborghini aventador',   ['aventador', 'countach', 'murcielago'], []),
    'veh:bugatti-w16':         ('bugatti chiron',          ['bugatti'], []),
    'veh:subaru-wrx-sti':      ('subaru impreza wrx',      ['impreza', 'wrx'], []),
    'eng:v8-57-sb':            ('v8 engine',               ['v8'], ['engine']),
    'eng:i6-30-legend':        ('2jz engine',              ['2jz'], []),
    'eng:rotary-13b-t':        ('rotary engine',           ['rotary', 'wankel', '13b'], ['engine']),
    'eng:bmw-s54':             ('straight six engine',     ['inline', 'straight', 'i6', 'rb26', 'six', '6'], ['engine']),
    'eng:f6-30-t':             ('boxer engine',            ['boxer', 'flat'], ['engine']),
    'eng:m-vtwin-1200':        ('harley motorcycle engine',['harley', 'v-twin', 'vtwin', 'motorcycle', 'bike'], ['engine']),
    'eng:d-i6-67':             ('truck diesel engine',     ['diesel'], ['engine']),
}



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
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


NEVER = ('locomotive', 'train', 'airplane', 'aircraft', 'plane', 'boat', 'ship',
         'rocket', 'lego', 'minecraft', 'low poly', 'lowpoly', 'cartoon')


def best(query, want_licences, any_of=(), all_of=()):
    """The most usable downloadable model for a query.

    The licence is filtered server-side — the search is asked for one licence at
    a time and nothing outside the allow-list is ever requested. Among the hits,
    prefer real geometry that a browser can still carry: below about 20k
    triangles a car is a block, above about 600k it is a download nobody waits
    for."""
    best_hit, best_score, best_lic = None, -1.0, None
    for lic in want_licences:
        try:
            res = api('search', need_token=False, type='models', q=query,
                      downloadable='true', license=lic, count=24)
        except Exception as err:
            print(f'    search ({lic}) failed: {err}')
            continue
        for m in res.get('results', []):
            tris = m.get('faceCount') or 0
            if tris < 20_000 or tris > 6_000_000:
                continue
            # Search matches tags and descriptions as well as titles, so asking
            # for a Ferrari happily returns a Countach. The title has to say
            # what the thing is, or it is not what was asked for.
            title = (m.get('name') or '').lower()
            if any_of and not any(w in title for w in any_of):
                continue
            if all_of and not all(w in title for w in all_of):
                continue
            # a search for a diesel engine returns locomotives and aeroplanes,
            # and a search for a car returns brick versions of it
            if any(w in title for w in NEVER):
                continue
            span = 1.0 if 40_000 <= tris <= 900_000 else 0.45
            # public domain first where it is a close call, then popularity
            score = span * (1.25 if lic == 'cc0' else 1.0) * (1 + (m.get('likeCount') or 0)) ** 0.5
            if score > best_score:
                best_hit, best_score, best_lic = m, score, lic
    if best_hit is not None:
        best_hit['_licence'] = best_lic
    return best_hit


def download_gltf(uid, into):
    urls = api(f'models/{uid}/download')
    link = (urls.get('gltf') or {}).get('url')
    if not link:
        raise RuntimeError('no glTF download for this model')
    with urllib.request.urlopen(link, timeout=600) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    z.extractall(into)
    for name in z.namelist():
        if name.endswith('.gltf') or name.endswith('.glb'):
            return os.path.join(into, name)
    raise RuntimeError('no .gltf inside the archive')


BUDGET = 320_000        # triangles a browser can carry alongside everything else

BLENDER_CONVERT = r'''
import bpy, sys
src, dst, budget = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data]
for o in meshes:
    o.data.calc_loop_triangles()
total = sum(len(o.data.loop_triangles) for o in meshes)

# A model authored for a renderer can be millions of triangles. Decimating the
# whole scene by one ratio keeps the proportions of the thing intact — shrinking
# each object to its own budget would flatten the small parts and leave the big
# ones untouched.
if total > budget and total > 0:
    ratio = max(0.05, budget / total)
    for o in meshes:
        m = o.modifiers.new('ml_decimate', 'DECIMATE')
        m.ratio = ratio
        m.use_collapse_triangulate = True
    print('MLDECIMATE %d -> %d (%.3f)' % (total, budget, ratio))

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                          export_draco_mesh_compression_enable=False,
                          export_apply=True, export_yup=True)
'''


def to_glb(src, dst):
    if src.endswith('.glb'):
        os.replace(src, dst)
        return dst
    script = os.path.join(tempfile.gettempdir(), '_ml_convert.py')
    open(script, 'w').write(BLENDER_CONVERT)
    subprocess.run([sys.executable, script, src, dst, str(BUDGET)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    return dst


def bundle(target, glb, licence, credit, source):
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'import-model.mjs'),
                    target, glb, '--licence', licence, '--credit', credit,
                    '--source', source], check=True)


def main(argv):
    only = [a for a in argv if not a.startswith('--')]
    dry  = '--list' in argv
    search = None
    if '--search' in argv:
        search = argv[argv.index('--search') + 1]
    want = list(OK_LICENCES)
    if '--cc0-only' in argv:
        want = ['cc0']

    if search:
        hit = best(search, want)
        print(json.dumps({k: hit.get(k) for k in ('name', 'uid', 'faceCount')} if hit
                         else {'found': None}, indent=1))
        if hit:
            print('licence:', (hit.get('license') or {}).get('slug'))
            print('by:', (hit.get('user') or {}).get('displayName'))
        return

    todo = {k: v for k, v in TARGETS.items() if not only or k in only}
    taken = 0
    for target, (query, any_of, all_of) in todo.items():
        print(f'{target:28s} "{query}"')
        hit = best(query, want, any_of, all_of)
        if not hit:
            print('    nothing usable under a redistributable licence')
            continue
        slug = hit['_licence']
        credit = (hit.get('user') or {}).get('displayName') or 'unknown'
        name = hit.get('name') or ''
        print(f'    -> {name[:50]}  [{slug}]  by {credit}  {hit.get("faceCount")} tris')
        if dry:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            try:
                src = download_gltf(hit['uid'], tmp)
                glb = os.path.join(tmp, 'out.glb')
                to_glb(src, glb)
                bundle(target, glb, OK_LICENCES[slug],
                       f'{credit} — "{name}"', hit.get('viewerUrl') or '')
                taken += 1
            except Exception as err:
                print(f'    failed: {err}')
    print(f'\n{taken} model(s) bundled. See motorlab/assets/models/CREDITS.md.')


if __name__ == '__main__':
    main(sys.argv[1:])
