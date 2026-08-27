#!/usr/bin/env python3
"""Convert TrueVision TGA files to PNG.

Handles the uncompressed and RLE truecolour/greyscale variants that the
supplied vehicle texture sets use (types 2, 3, 10 and 11).  Pure standard
library so it runs anywhere python3 does.
"""
import struct, sys, zlib, os


def decode(path):
    d = open(path, 'rb').read()
    idlen, cmtype, imtype, cmfirst, cmlen, cmdepth, x, y, w, h, bpp, desc = \
        struct.unpack_from('<BBBHHBHHHHBB', d, 0)
    if imtype not in (2, 3, 10, 11):
        raise SystemExit('%s: unsupported TGA image type %d' % (path, imtype))
    if cmtype:
        raise SystemExit('%s: colour-mapped TGA not supported' % path)
    px = bpp // 8
    p = 18 + idlen
    n = w * h
    out = bytearray()
    if imtype in (2, 3):
        out = bytearray(d[p:p + n * px])
    else:                                    # run-length encoded
        while len(out) < n * px:
            hdr = d[p]; p += 1
            count = (hdr & 0x7f) + 1
            if hdr & 0x80:                   # run packet
                out += d[p:p + px] * count
                p += px
            else:                            # raw packet
                out += d[p:p + count * px]
                p += count * px
        del out[n * px:]

    # TGA truecolour is BGR(A); greyscale is a single channel.
    rows = []
    stride = w * px
    for r in range(h):
        row = out[r * stride:(r + 1) * stride]
        if px == 1:
            rows.append(bytes(row))
        elif px == 3:
            rows.append(bytes(b for i in range(0, stride, 3)
                              for b in (row[i + 2], row[i + 1], row[i])))
        elif px == 4:
            rows.append(bytes(b for i in range(0, stride, 4)
                              for b in (row[i + 2], row[i + 1], row[i], row[i + 3])))
        else:
            raise SystemExit('%s: %d bpp not supported' % (path, bpp))
    if not (desc & 0x20):                    # bottom-left origin -> flip
        rows.reverse()
    colour = {1: 0, 3: 2, 4: 6}[px]
    return w, h, colour, rows


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))


def write_png(path, w, h, colour, rows):
    raw = b''.join(b'\x00' + r for r in rows)   # filter type 0 per scanline
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, colour, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)


def main(argv):
    if len(argv) < 3:
        raise SystemExit('usage: tga2png.py <out-dir> <file.tga> [name=file.tga ...]')
    outdir = argv[1]
    os.makedirs(outdir, exist_ok=True)
    for spec in argv[2:]:
        name, _, src = spec.partition('=')
        if not src:
            src, name = name, os.path.splitext(os.path.basename(name))[0].lower()
        w, h, colour, rows = decode(src)
        dst = os.path.join(outdir, name + '.png')
        write_png(dst, w, h, colour, rows)
        print('%-28s %4dx%-4d -> %s (%d KB)' % (name, w, h, dst, os.path.getsize(dst) // 1024))


if __name__ == '__main__':
    main(sys.argv)
