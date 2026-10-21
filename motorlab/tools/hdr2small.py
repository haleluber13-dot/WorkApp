#!/usr/bin/env python3
"""Downscale a Radiance (.hdr) environment map.

An HDRI is what makes metal look like metal: it is the thing being reflected.
The 1K files are 1.5 MB each, which is more than a web app should spend when
the map is going through a PMREM prefilter anyway — so this decodes RGBE to
linear float, box-filters it down, and re-encodes with run-length compression.

    hdr2small.py <in.hdr> <out.hdr> [--width=512] [--gain=1.0]
"""
import array, math, os, struct, sys


def read_hdr(path):
    f = open(path, 'rb')
    if not f.readline().startswith(b'#?'):
        raise SystemExit('%s: not a Radiance HDR' % path)
    while True:                                  # header lines, then a blank
        line = f.readline()
        if line in (b'\n', b'\r\n', b''):
            break
    dims = f.readline().split()
    if dims[0] != b'-Y' or dims[2] != b'+X':
        raise SystemExit('%s: unsupported scanline order %s' % (path, dims))
    h, w = int(dims[1]), int(dims[3])
    data = f.read()
    f.close()

    px = bytearray(w * h * 4)
    p = 0
    for y in range(h):
        row = memoryview(px)[y * w * 4:(y + 1) * w * 4]
        if (w < 8 or w > 32767 or data[p] != 2 or data[p + 1] != 2
                or (data[p + 2] << 8 | data[p + 3]) != w):
            # flat, or old-style RLE
            x = 0
            while x < w:
                r, g, b, e = data[p:p + 4]; p += 4
                if r == 1 and g == 1 and b == 1:
                    n = e
                    for _ in range(n):
                        row[x*4:x*4+4] = row[(x-1)*4:x*4]; x += 1
                else:
                    row[x*4:x*4+4] = bytes((r, g, b, e)); x += 1
            continue
        p += 4
        for c in range(4):                        # four separate channel runs
            x = 0
            while x < w:
                n = data[p]; p += 1
                if n > 128:                       # a run
                    v = data[p]; p += 1
                    for _ in range(n - 128):
                        row[x * 4 + c] = v; x += 1
                else:                             # literals
                    for _ in range(n):
                        row[x * 4 + c] = data[p]; p += 1; x += 1
    return w, h, px


def write_hdr(path, w, h, px):
    out = bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
    out += b'-Y %d +X %d\n' % (h, w)
    for y in range(h):
        row = px[y * w * 4:(y + 1) * w * 4]
        out += bytes((2, 2, w >> 8, w & 255))
        for c in range(4):
            chan = row[c::4]
            x = 0
            while x < w:
                run = 1
                while x + run < w and chan[x + run] == chan[x] and run < 127:
                    run += 1
                if run > 2:
                    out += bytes((128 + run, chan[x])); x += run
                else:
                    n = 0
                    while (x + n < w and n < 128
                           and not (n + 2 < w - x and chan[x+n] == chan[x+n+1] == chan[x+n+2])):
                        n += 1
                    n = max(1, n)
                    out += bytes((n,)) + bytes(chan[x:x + n]); x += n
    open(path, 'wb').write(out)


def main(argv):
    opt = {}
    args = []
    for a in argv[1:]:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opt[k] = v or '1'
        else:
            args.append(a)
    src, dst = args[0], args[1]
    w, h, px = read_hdr(src)
    tw = int(opt.get('width', 512))
    th = tw // 2
    fx, fy = w / tw, h / th
    gain = float(opt.get('gain', 1.0))
    print('%-28s %dx%d -> %dx%d' % (os.path.basename(src), w, h, tw, th))

    out = bytearray(tw * th * 4)
    for y in range(th):
        y0, y1 = int(y * fy), max(int(y * fy) + 1, int((y + 1) * fy))
        for x in range(tw):
            x0, x1 = int(x * fx), max(int(x * fx) + 1, int((x + 1) * fx))
            r = g = b = 0.0; n = 0
            for yy in range(y0, min(y1, h)):
                base = yy * w * 4
                for xx in range(x0, min(x1, w)):
                    o = base + xx * 4
                    e = px[o + 3]
                    s = math.ldexp(1.0, e - 136) if e else 0.0   # 2^(e-128)/256
                    r += px[o] * s; g += px[o+1] * s; b += px[o+2] * s
                    n += 1
            if n:
                r, g, b = r / n * gain, g / n * gain, b / n * gain
            m = max(r, g, b)
            o = (y * tw + x) * 4
            if m < 1e-8:
                continue                                   # leave as 0,0,0,0
            mant, exp = math.frexp(m)
            k = mant * 256.0 / m
            out[o]   = min(255, int(r * k))
            out[o+1] = min(255, int(g * k))
            out[o+2] = min(255, int(b * k))
            out[o+3] = min(255, exp + 128)
    write_hdr(dst, tw, th, out)
    print('   -> %-26s %5d KB' % (os.path.basename(dst), os.path.getsize(dst) // 1024))


if __name__ == '__main__':
    main(sys.argv)
