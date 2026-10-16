# Generates the sail-cart assembly instructions (Hebrew, RTL) as HTML with inline SVG drawings.
# All cart coordinates are in cm. x = along the cart (0 = front end of spine, + = backwards),
# y = sideways (+ = right side), z = height above ground.
import sys

OUT = sys.argv[1]

ORANGE = "#e8552a"
NAVY = "#1f3a5f"
GRAY_F = "#dfe4ea"
GRAY_S = "#8592a0"
INK = "#1d2733"

# ---------- helpers ----------
def tx(x):  # top view: front on the left
    return x + 45

def ty(y):
    return y + 105

def sx(x):  # side view
    return x + 45

def sz(z):
    return 130 - z

def style(key, hl, existing_only=False):
    if key in hl:
        return f'fill="{ORANGE}" stroke="#a63a17" stroke-width="0.5"'
    return f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.5"'

def lstyle(key, hl, w=1.2, dash=None):
    c = ORANGE if key in hl else GRAY_S
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'stroke="{c}" stroke-width="{w}" fill="none"{d}'

def tag(x, y, letter, hl_key=None, hl=()):
    c = ORANGE if (hl_key and hl_key in hl) else NAVY
    return (f'<circle cx="{x}" cy="{y}" r="5" fill="{c}"/>'
            f'<text x="{x}" y="{y + 1.9}" font-size="5.6" font-weight="800" fill="#fff" '
            f'text-anchor="middle" font-family="Heebo, sans-serif" direction="ltr">{letter}</text>')

def lead(x1, y1, x2, y2):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{NAVY}" stroke-width="0.35"/>'

def label(x, y, text, size=4.2, anchor="middle", color=INK, weight=600):
    anchor = {"start": "end", "end": "start"}.get(anchor, anchor)  # text inherits dir=rtl
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" '
            f'text-anchor="{anchor}" font-family="Heebo, sans-serif">{text}</text>')

def num(x, y, text, size=4, anchor="middle", color=NAVY):
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="700" '
            f'text-anchor="{anchor}" font-family="Heebo, sans-serif" direction="ltr">{text}</text>')

def svg(w, h, body, cls="dwg"):
    return f'<svg class="{cls}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'

def rect(x, y, w, h, st, rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" {st}/>'

# ---------- TOP VIEW ----------
def top_view(show, hl=(), tags=True, dims=False, extra=""):
    b = []
    b.append(label(tx(-30), 12, "◀ חזית", 4.6, "start", NAVY, 800))
    # rear wheels (under everything)
    if "Nr" in show:
        for s in (-1, 1):
            b.append(rect(tx(165), ty(s * 77 - 5), 40, 10, style("Nr", hl), 3))
    if "Nf" in show:
        b.append(rect(tx(-24), ty(-5), 40, 10, style("Nf", hl), 3))
    if "B" in show:
        b.append(rect(tx(182.5), ty(-85), 5, 170, style("B", hl)))
    if "L" in show:
        for yy in (-84, -70, 70, 84):
            b.append(rect(tx(181), ty(yy - 0.7), 8, 1.4, style("L", hl)))
    if "M" in show:
        for s in (-1, 1):
            b.append(f'<line x1="{tx(185)}" y1="{ty(s*67)}" x2="{tx(185)}" y2="{ty(s*87)}" {lstyle("M", hl, 1.4)}/>')
    if "C" in show:
        for s in (-1, 1):
            b.append(f'<line x1="{tx(185)}" y1="{ty(s*60)}" x2="{tx(126)}" y2="{ty(s*2.5)}" '
                     f'stroke="{ORANGE if "C" in hl else GRAY_S}" stroke-width="3" stroke-linecap="butt"/>')
            b.append(f'<line x1="{tx(185)}" y1="{ty(s*60)}" x2="{tx(126)}" y2="{ty(s*2.5)}" '
                     f'stroke="{"#ffb38f" if "C" in hl else GRAY_F}" stroke-width="2" stroke-linecap="butt"/>')
    if "A" in show:
        b.append(rect(tx(0), ty(-2.5), 230, 5, style("A", hl)))
    if "IJ" in show:
        for s in (-1, 1):
            b.append(rect(tx(-6), ty(s * 7 - 0.7), 4, 1.4, style("IJ", hl)))
        b.append(rect(tx(-6), ty(-15), 4, 30, style("IJ", hl)))
        for s in (-1, 1):
            b.append(f'<circle cx="{tx(-4)}" cy="{ty(s*13.5)}" r="0.8" fill="#fff" stroke="{GRAY_S}" stroke-width="0.3"/>')
    if "H" in show:
        b.append(f'<circle cx="{tx(-4)}" cy="{ty(0)}" r="1.9" {style("H", hl)}/>')
    if "cable" in show:
        for s in (-1, 1):
            b.append(f'<line x1="{tx(60)}" y1="{ty(s*28)}" x2="{tx(-4)}" y2="{ty(s*13.5)}" {lstyle("cable", hl, 0.7, "2 1.2")}/>')
    if "K" in show:
        b.append(rect(tx(58.75), ty(-30), 2.5, 60, style("K", hl)))
        b.append(f'<circle cx="{tx(60)}" cy="{ty(0)}" r="1" fill="{NAVY}"/>')
    if "F" in show:
        if "G" in show:
            for (dx, dy, w, h) in ((-8, -0.3, 6, 0.6), (2, -0.3, 6, 0.6), (-0.3, -8, 0.6, 6), (-0.3, 2, 0.6, 6)):
                b.append(rect(tx(30 + dx), ty(dy), w, h if h > 0.6 else 1, style("G", hl)))
        b.append(f'<circle cx="{tx(30)}" cy="{ty(0)}" r="3" {style("F", hl)}/>')
        b.append(f'<circle cx="{tx(30)}" cy="{ty(0)}" r="2.2" fill="#fff" stroke="{GRAY_S}" stroke-width="0.3"/>')
    if "E" in show:
        for xx in (125, 155):
            b.append(rect(tx(xx - 1.5), ty(-22.5), 3, 45, style("E", hl)))
    if "D" in show:
        for s in (-1, 1):
            b.append(rect(tx(155), ty(s * 20 - 1.5), 13, 3, style("D", hl)))
        b.append(rect(tx(166.5), ty(-22.5), 3, 45, style("D", hl)))
    if "O" in show:
        b.append(rect(tx(224), ty(-1), 6, 2, style("O", hl)))
        b.append(rect(tx(112), ty(2.5), 6, 3, style("O", hl)))
    if "sheet" in show:
        b.append(f'<path d="M{tx(205)},{ty(-12)} L{tx(227)},{ty(0)} L{tx(115)},{ty(4)} L{tx(108)},{ty(10)}" {lstyle("sheet", hl, 0.8, "3 1.5")}/>')
    if tags:
        T = []
        def t(key, letter, px, py, lx, ly):
            if key in show:
                T.append(lead(px, py, lx, ly) + tag(lx, ly, letter, key, hl))
        t("A", "A", tx(95), ty(0), tx(95), ty(-30))
        t("B", "B", tx(185), ty(-45), tx(205), ty(-45))
        t("C", "C", tx(150), ty(35), tx(140), ty(52))
        t("D", "D", tx(170), ty(20), tx(168), ty(38))
        t("E", "E", tx(125), ty(-20), tx(112), ty(-36))
        t("F", "F", tx(30), ty(-3), tx(30), ty(-30))
        t("H", "H", tx(-4), ty(-1.5), tx(-14), ty(-26))
        t("IJ", "J", tx(-4), ty(14), tx(-16), ty(26))
        t("K", "K", tx(60), ty(29), tx(72), ty(40))
        t("L", "L", tx(189), ty(84), tx(205), ty(98))
        t("Nr", "N", tx(165), ty(-77), tx(150), ty(-94))
        t("Nf", "N", tx(-24), ty(0), tx(-34), ty(10))
        t("O", "O", tx(229), ty(1), tx(238), ty(18))
        t("cable", "P", tx(30), ty(21), tx(40), ty(36))
        b.extend(T)
    if dims:
        y0 = 205
        def dline(x1, x2, txt, yy):
            return (f'<line x1="{tx(x1)}" y1="{yy}" x2="{tx(x2)}" y2="{yy}" stroke="{NAVY}" stroke-width="0.35" marker-start="url(#ar)" marker-end="url(#ar)"/>'
                    f'<line x1="{tx(x1)}" y1="{yy-3}" x2="{tx(x1)}" y2="{yy+3}" stroke="{NAVY}" stroke-width="0.3"/>'
                    f'<line x1="{tx(x2)}" y1="{yy-3}" x2="{tx(x2)}" y2="{yy+3}" stroke="{NAVY}" stroke-width="0.3"/>'
                    + num((tx(x1) + tx(x2)) / 2, yy - 1.6, txt, 3.8))
        b.append(dline(0, 30, "30", 196))
        b.append(dline(30, 60, "30", 196))
        b.append(dline(60, 125, "65", 196))
        b.append(dline(125, 185, "60", 196))
        b.append(dline(185, 230, "45", 196))
        b.append(dline(0, 230, "230", 206))
        # beam width
        b.append(f'<line x1="{tx(215)}" y1="{ty(-85)}" x2="{tx(215)}" y2="{ty(85)}" stroke="{NAVY}" stroke-width="0.35" marker-start="url(#ar)" marker-end="url(#ar)"/>')
        b.append(num(tx(219), ty(-50), "170", 3.8, "start"))
        b.append(f'<line x1="{tx(160)}" y1="{ty(-77)}" x2="{tx(160)}" y2="{ty(77)}" stroke="{NAVY}" stroke-width="0.3" stroke-dasharray="1.5 1"/>')
        b.append(num(tx(158), ty(-40), "~155", 3.4, "end"))
        h = 214
    else:
        h = 212
    b.append(extra)
    defs = (f'<defs><marker id="ar" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">'
            f'<path d="M0,0 L6,3 L0,6 z" fill="{NAVY}"/></marker></defs>')
    return svg(300, h, defs + "".join(b))

# ---------- SIDE VIEW ----------
def side_view(show, hl=(), tags=True, dims=False, rider=False):
    b = []
    b.append(f'<line x1="5" y1="{sz(0)}" x2="295" y2="{sz(0)}" stroke="{GRAY_S}" stroke-width="0.6"/>')
    b.append(label(sx(-30), 12, "◀ חזית", 4.6, "start", NAVY, 800))
    if "Nr" in show:
        b.append(f'<circle cx="{sx(185)}" cy="{sz(20)}" r="20" {style("Nr", hl)}/>')
        b.append(f'<circle cx="{sx(185)}" cy="{sz(20)}" r="7" fill="#fff" stroke="{GRAY_S}" stroke-width="0.4"/>')
    if "Nf" in show:
        b.append(f'<circle cx="{sx(-4)}" cy="{sz(20)}" r="20" {style("Nf", hl)}/>')
        b.append(f'<circle cx="{sx(-4)}" cy="{sz(20)}" r="7" fill="#fff" stroke="{GRAY_S}" stroke-width="0.4"/>')
    if "L" in show:
        b.append(rect(sx(181), sz(43), 8, 27, style("L", hl)))
    if "M" in show:
        b.append(f'<circle cx="{sx(185)}" cy="{sz(20)}" r="1.4" fill="{ORANGE if "M" in hl else NAVY}"/>')
    if "B" in show:
        b.append(rect(sx(182.5), sz(48), 5, 5, style("B", hl)))
    if "C" in show:
        b.append(rect(sx(126), sz(48), 57, 3, style("C", hl)))
    if "A" in show:
        b.append(rect(sx(0), sz(53), 230, 5, style("A", hl)))
    if "IJ" in show:
        b.append(rect(sx(-6), sz(46), 4, 30, style("IJ", hl)))
        b.append(rect(sx(-6), sz(46.2), 4, 1.2, style("IJ", hl)))
        b.append(f'<circle cx="{sx(-4)}" cy="{sz(20)}" r="1.4" fill="{NAVY}"/>')
    if "H" in show:
        b.append(rect(sx(-5.6), sz(63), 3.2, 15, style("H", hl)))
        b.append(rect(sx(-6), sz(48), 4, 1.8, f'fill="{NAVY}"'))
        b.append(f'<line x1="{sx(-4)}" y1="{sz(65)}" x2="{sx(-4)}" y2="{sz(43.5)}" stroke="{NAVY}" stroke-width="0.8"/>')
    if "K" in show:
        b.append(rect(sx(58.75), sz(55.5), 2.5, 2.5, style("K", hl)))
    if "F" in show:
        if "G" in show:
            for (x1, x2) in ((21, 27), (39, 33)):
                b.append(f'<polygon points="{sx(x1)},{sz(53)} {sx(x2)},{sz(53)} {sx(x2)},{sz(65)}" {style("G", hl)}/>')
        b.append(rect(sx(27), sz(78), 6, 25, style("F", hl)))
    if "E" in show:
        for xx in (125, 155):
            b.append(rect(sx(xx - 1.5), sz(56), 3, 3, style("E", hl)))
    if "D" in show:
        b.append(f'<line x1="{sx(155)}" y1="{sz(56)}" x2="{sx(168)}" y2="{sz(113)}" stroke="{ORANGE if "D" in hl else GRAY_S}" stroke-width="3"/>')
        b.append(rect(sx(166.5), sz(116), 3, 3, style("D", hl)))
    if "seat" in show:
        b.append(f'<path d="M{sx(124)},{sz(57)} Q{sx(145)},{sz(52)} {sx(162)},{sz(56)} L{sx(166)},{sz(110)}" {lstyle("seat", hl, 1.2, "2.5 1.2")}/>')
    if "O" in show:
        b.append(rect(sx(224), sz(57), 6, 4, style("O", hl)))
        b.append(rect(sx(112), sz(57), 6, 4, style("O", hl)))
    if rider:
        b.append(f'<g stroke="{NAVY}" stroke-width="1.3" fill="none" opacity="0.55" stroke-linecap="round">'
                 f'<circle cx="{sx(178)}" cy="{sz(140)}" r="9"/>'
                 f'<path d="M{sx(173)},{sz(130)} L{sx(158)},{sz(62)} L{sx(110)},{sz(68)} L{sx(64)},{sz(58)}"/>'
                 f'<path d="M{sx(168)},{sz(110)} L{sx(140)},{sz(95)} L{sx(118)},{sz(80)}"/></g>')
    if tags:
        T = []
        def t(key, letter, px, py, lx, ly):
            if key in show:
                T.append(lead(px, py, lx, ly) + tag(lx, ly, letter, key, hl))
        t("A", "A", sx(95), sz(53), sx(95), sz(75))
        t("B", "B", sx(185), sz(45), sx(205), sz(60))
        t("C", "C", sx(140), sz(46.5), sx(132), sz(30))
        t("D", "D", sx(169), sz(80), sx(190), sz(95))
        t("E", "E", sx(125), sz(57), sx(112), sz(90))
        t("F", "F", sx(30), sz(70), sx(48), sz(90))
        t("G", "G", sx(23), sz(56), sx(12), sz(78))
        t("H", "H", sx(-4), sz(58), sx(-20), sz(78))
        t("IJ", "I", sx(-6), sz(32), sx(-30), sz(50))
        t("K", "K", sx(60), sz(57), sx(66), sz(78))
        t("L", "L", sx(189), sz(32), sx(205), sz(36))
        t("M", "M", sx(185), sz(20), sx(208), sz(8))
        t("Nr", "N", sx(170), sz(10), sx(155), sz(10))
        t("O", "O", sx(227), sz(61), sx(236), sz(78))
        b.extend(T)
    if dims:
        b.append(f'<line x1="{sx(-28)}" y1="{sz(0)}" x2="{sx(-28)}" y2="{sz(53)}" stroke="{NAVY}" stroke-width="0.35" marker-start="url(#ar2)" marker-end="url(#ar2)"/>')
        b.append(num(sx(-30), sz(26), "53", 3.8, "end"))
        b.append(f'<line x1="{sx(-4)}" y1="{sz(-6)}" x2="{sx(185)}" y2="{sz(-6)}" stroke="{NAVY}" stroke-width="0.35" marker-start="url(#ar2)" marker-end="url(#ar2)"/>')
        b.append(num(sx(90), sz(-6) + 5, "~190", 3.8))
    defs = (f'<defs><marker id="ar2" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">'
            f'<path d="M0,0 L6,3 L0,6 z" fill="{NAVY}"/></marker></defs>')
    return svg(300, 145 if dims else 138, defs + "".join(b), "dwg side")

# ---------- RIGGED OVERVIEW ----------
def rigged():
    k = 0.42
    def X(x): return 70 + x * k
    def Z(z): return 215 - z * k
    b = [f'<line x1="10" y1="{Z(0)}" x2="290" y2="{Z(0)}" stroke="{GRAY_S}" stroke-width="0.6"/>']
    # chassis
    b.append(rect(X(0), Z(53), 230 * k, 5 * k, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.5"'))
    for cx in (-4, 185):
        b.append(f'<circle cx="{X(cx)}" cy="{Z(20)}" r="{20*k}" fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.5"/>')
    # mast
    b.append(f'<line x1="{X(30)}" y1="{Z(60)}" x2="{X(38)}" y2="{Z(500)}" stroke="{NAVY}" stroke-width="1.6"/>')
    # sail
    b.append(f'<polygon points="{X(31)},{Z(100)} {X(38)},{Z(495)} {X(205)},{Z(150)}" fill="#fff4ec" stroke="{ORANGE}" stroke-width="0.8"/>')
    for i in range(1, 5):
        z1 = 100 + i * 75
        b.append(f'<line x1="{X(31 + i*1.5)}" y1="{Z(z1)}" x2="{X(205 - i*38)}" y2="{Z(150 + i*70)}" stroke="#f3c2a8" stroke-width="0.5"/>')
    # boom (wishbone)
    b.append(f'<line x1="{X(32)}" y1="{Z(185)}" x2="{X(210)}" y2="{Z(150)}" stroke="{NAVY}" stroke-width="1.2"/>')
    # sheet
    b.append(f'<path d="M{X(205)},{Z(150)} L{X(227)},{Z(58)} L{X(115)},{Z(60)}" stroke="{ORANGE}" stroke-width="0.6" fill="none" stroke-dasharray="2 1"/>')
    # rider
    b.append(f'<g stroke="{NAVY}" stroke-width="1" fill="none" opacity="0.6" stroke-linecap="round">'
             f'<circle cx="{X(178)}" cy="{Z(140)}" r="{9*k*1.1}"/>'
             f'<path d="M{X(173)},{Z(130)} L{X(158)},{Z(62)} L{X(110)},{Z(68)} L{X(64)},{Z(58)}"/></g>')
    b.append(label(X(120), Z(330), "מפרש 4.5–5.5 מ״ר", 4.6, "middle", ORANGE, 800))
    b.append(label(X(-10), Z(420), "תורן", 4.4, "end", NAVY, 800))
    b.append(lead(X(36), Z(420), X(-8), Z(420)))
    b.append(label(X(150), Z(205), "בום", 4.4, "middle", NAVY, 800))
    b.append(label(X(250), Z(95), "חבל שליטה", 4.2, "start", ORANGE, 700))
    b.append(lead(X(222), Z(95), X(248), Z(95)))
    b.append(label(X(-40), Z(10), "◀ חזית", 4.6, "start", NAVY, 800))
    b.append(num(X(60), Z(470), "~4.6 m", 3.8, "start"))
    return svg(300, 225, "".join(b), "dwg detail")

# ---------- DETAILS ----------
def cut_layout():
    b = []
    def bar(y, length, segs, title):
        k = 280 / 600
        out = [label(290, y - 3, title, 4.4, "end", NAVY, 800)]
        x = 10
        for (L, name, hl) in segs:
            w = L * k
            out.append(rect(x, y, w, 9, f'fill="{ORANGE if hl else "#f1f3f5"}" stroke="{GRAY_S}" stroke-width="0.4"'))
            if hl:
                out.append(num(x + w / 2, y + 6.3, name, 3.8, "middle", "#fff"))
            else:
                out.append(label(x + w / 2, y + 6.3, name, 3.6, "middle", GRAY_S))
            x += w
        return "".join(out)
    b.append(bar(14, 600, [(230, "A 230", True), (170, "B 170", True), (200, "שארית", False)], "צינור מרובע 50×50 (6 מטר)"))
    b.append(bar(42, 600, [(90, "C 90", True), (90, "C 90", True), (60, "D 60", True), (60, "D 60", True),
                           (45, "E 45", True), (45, "E 45", True), (45, "E 45", True), (165, "שארית", False)], "צינור מרובע 30×30 (6 מטר)"))
    b.append(bar(70, 600, [(31, "I 31", True), (31, "I 31", True), (30, "J 30", True), (508, "", False)], "פלח 40×6 (1.2 מטר)"))
    b.append(bar(98, 600, [(60, "K 60", True), (540, "", False)], "צינור מרובע 25×25 (1 מטר)"))
    b.append(bar(126, 600, [(25, "M", True), (25, "M", True), (25, "M", True), (25, "M", True), (500, "", False)], "מוט הברגה M20 (1 מטר)"))
    b.append(label(150, 148, "המספרים בס״מ. חותכים עם משחזת זווית ודיסק חיתוך, ומסירים גרדים (שבבים חדים).", 4, "middle", INK, 400))
    return svg(300, 154, "".join(b), "dwg detail")

def axle_detail():
    # exploded front view of a rear wheel mount: plate | washer | spacer | wheel | spacer | washer | plate + nylocks
    b = []
    cy = 52
    parts = [
        (14, "אום ניילוק", "nut"), (34, "דסקית", "w"), (52, "L פלטה", "plate"), (72, "ספייסר", "sp"),
        (110, "N גלגל", "wheel"), (148, "ספייסר", "sp"), (168, "L פלטה", "plate"), (186, "דסקית", "w"), (206, "אום ניילוק", "nut"),
    ]
    b.append(f'<line x1="6" y1="{cy}" x2="232" y2="{cy}" stroke="{NAVY}" stroke-width="1.6" stroke-dasharray="4 2"/>')
    b.append(label(250, cy + 1.5, "M ציר", 4.4, "start", NAVY, 800))
    for (x, name, kind) in parts:
        if kind == "nut":
            b.append(rect(x - 4, cy - 6, 8, 12, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"', 1))
        elif kind == "w":
            b.append(rect(x - 1.2, cy - 7, 2.4, 14, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
        elif kind == "plate":
            b.append(rect(x - 1.5, cy - 30, 3, 40, f'fill="{ORANGE}" stroke="#a63a17" stroke-width="0.5"'))
        elif kind == "sp":
            b.append(rect(x - 5, cy - 5, 10, 10, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
        elif kind == "wheel":
            b.append(rect(x - 14, cy - 34, 28, 68, f'fill="#3b4652" stroke="{INK}" stroke-width="0.6"', 7))
            b.append(rect(x - 9, cy - 9, 18, 18, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"', 2))
        b.append(label(x, cy + 44 if kind != "wheel" else cy + 44, name, 3.7, "middle", INK, 600))
    b.append(rect(28, 4, 152, 8, f'fill="#f1f3f5" stroke="{GRAY_S}" stroke-width="0.4"'))
    b.append(label(104, 10, "B ציר אחורי (מלמעלה, הפלטות מרותכות מתחתיו)", 3.8, "middle", INK, 600))
    b.append(label(120, 104, "סדר ההרכבה על הציר, משמאל לימין. מהדקים את האומים עד שאין רעידות, אבל הגלגל עדיין מסתובב חופשי.", 3.9, "middle", INK, 400))
    return svg(300, 110, "".join(b), "dwg detail")

def fork_detail():
    b = []
    cx = 120
    # exploded vertical stack
    items = [
        (12, "M קינגפין (מוט הברגה) + אום ניילוק", "bolt"),
        (28, "דסקית רחבה", "w"),
        (44, "תותב ברונזה/ניילון", "bush"),
        (66, "H צינור ציר ההגה (מרותך לשדרה)", "head"),
        (88, "תותב ברונזה/ניילון", "bush"),
        (104, "2 דסקיות (מרווח)", "w"),
        (122, "J גשר המזלג + I רגליים", "fork"),
        (150, "דסקית + אום ניילוק", "nut"),
    ]
    b.append(f'<line x1="{cx}" y1="4" x2="{cx}" y2="160" stroke="{NAVY}" stroke-width="0.6" stroke-dasharray="3 2"/>')
    for (y, name, kind) in items:
        if kind == "bolt":
            b.append(rect(cx - 6, y - 4, 12, 5, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"', 1))
            b.append(rect(cx - 2, y + 1, 4, 10, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
        elif kind == "w":
            b.append(rect(cx - 7, y - 1, 14, 2.4, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
        elif kind == "bush":
            b.append(rect(cx - 4, y - 4, 8, 8, f'fill="#e9c46a" stroke="#b08a2e" stroke-width="0.6"'))
        elif kind == "head":
            b.append(rect(cx - 5, y - 12, 10, 24, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
            b.append(rect(cx + 5, y - 8, 40, 10, f'fill="#f1f3f5" stroke="{GRAY_S}" stroke-width="0.4"'))
            b.append(label(cx + 25, y - 1, "A שדרה", 4.6, "middle", GRAY_S))
        elif kind == "fork":
            b.append(rect(cx - 30, y - 2, 60, 4, f'fill="{ORANGE}" stroke="#a63a17" stroke-width="0.5"'))
            for s in (-1, 1):
                b.append(rect(cx + s * 14 - 2, y + 2, 4, 16, f'fill="{ORANGE}" stroke="#a63a17" stroke-width="0.5"'))
                b.append(f'<circle cx="{cx + s*27}" cy="{y}" r="1" fill="#fff"/>')
            b.append(label(cx + 22, y + 14, "חורים לכבלי ההגה P", 4.6, "start", INK, 400))
        elif kind == "nut":
            b.append(rect(cx - 5, y - 4, 10, 8, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"', 1))
        b.append(label(cx - 34, y + 2, name, 5.2, "end", INK, 600))
    return svg(240, 162, "".join(b), "dwg detail")

def mast_detail():
    b = []
    cx = 150
    b.append(rect(60, 120, 180, 14, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
    b.append(label(225, 129.5, "A שדרה", 4, "end", GRAY_S))
    b.append(rect(cx - 12, 60, 24, 60, f'fill="{ORANGE}" stroke="#a63a17" stroke-width="0.6"'))
    b.append(rect(cx - 9, 64, 18, 56, f'fill="#fff" stroke="#a63a17" stroke-width="0.4"'))
    for s in (-1, 1):
        b.append(f'<polygon points="{cx + s*12},{120} {cx + s*40},{120} {cx + s*12},{82}" fill="{ORANGE}" stroke="#a63a17" stroke-width="0.5"/>')
    # insert + extension (exploded above)
    b.append(rect(cx - 8.5, 28, 17, 24, f'fill="#e9c46a" stroke="#b08a2e" stroke-width="0.6"', 2))
    b.append(rect(cx - 5, 2, 10, 30, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.6"'))
    b.append(f'<path d="M{cx+30},40 L{cx+30},70" stroke="{NAVY}" stroke-width="0.8" marker-end="url(#ar3)"/>')
    b.append(label(cx + 14, 16, "מאריך התורן של הגלשן", 4, "start", INK, 600))
    b.append(label(cx + 14, 42, "פקק עץ/ניילון מותאם (התורן מסתובב בתוכו)", 4, "start", INK, 600))
    b.append(label(cx - 16, 90, "F בית התורן Ø60", 4, "end", INK, 600))
    b.append(label(cx + 44, 112, "G סנפירי חיזוק ×4", 4, "start", INK, 600))
    b.append(f'<defs><marker id="ar3" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="{NAVY}"/></marker></defs>')
    return svg(300, 138, "".join(b), "dwg detail")

def steer_detail():
    b = []
    # top view mini: fork bridge and foot bar with cables
    def X(x): return 20 + x * 3.6
    def Y(y): return 60 + y * 1.5
    b.append(rect(X(-6), Y(-15), 4 * 3.6, 30 * 1.5, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.5"'))
    b.append(rect(X(0), Y(-2.5), 70 * 3.6, 5 * 1.5, f'fill="{GRAY_F}" stroke="{GRAY_S}" stroke-width="0.5"'))
    b.append(rect(X(58.75), Y(-30), 2.5 * 3.6, 60 * 1.5, f'fill="{ORANGE}" stroke="#a63a17" stroke-width="0.5"'))
    b.append(f'<circle cx="{X(60)}" cy="{Y(0)}" r="2" fill="{NAVY}"/>')
    for s in (-1, 1):
        b.append(f'<line x1="{X(60)}" y1="{Y(s*28)}" x2="{X(-4)}" y2="{Y(s*13.5)}" stroke="{ORANGE}" stroke-width="0.9" stroke-dasharray="3 1.5"/>')
        b.append(f'<circle cx="{X(-4)}" cy="{Y(s*13.5)}" r="1.4" fill="#fff" stroke="{NAVY}" stroke-width="0.5"/>')
        b.append(f'<circle cx="{X(60)}" cy="{Y(s*28)}" r="1.4" fill="#fff" stroke="{NAVY}" stroke-width="0.5"/>')
    b.append(label(X(60) + 12, Y(0) + 1.5, "בורג M10 (ציר)", 3.9, "start", INK, 600))
    b.append(label(X(30), Y(-24), "P כבל פלדה 3 מ״מ + טלוריות", 3.9, "middle", ORANGE, 700))
    b.append(label(X(-4), Y(-15) - 4, "J", 4.5, "middle", NAVY, 800))
    b.append(label(X(60), Y(-30) - 4, "K", 4.5, "middle", NAVY, 800))
    b.append(label(X(33), Y(40), "מבט מלמעלה. דוחפים רגל ימין קדימה: הגלגל הקדמי מסתובב. מותחים את שני הכבלים עד שאין חופש.", 3.8, "middle", INK, 400))
    return svg(300, 128, "".join(b), "dwg detail")

# ---------- PARTS SHEET ----------
PARTS = [
    ("A", "שדרה", "צינור מרובע 50×50×2.5", "230 ס״מ", "1"),
    ("B", "ציר אחורי", "צינור מרובע 50×50×2.5", "170 ס״מ", "1"),
    ("C", "חיזוק אלכסוני", "צינור מרובע 30×30×2", "90 ס״מ", "2"),
    ("D", "עמוד משענת", "צינור מרובע 30×30×2", "60 ס״מ", "2"),
    ("E", "מוט רוחב למושב", "צינור מרובע 30×30×2", "45 ס״מ", "3"),
    ("F", "בית התורן", "צינור עגול Ø60×3", "25 ס״מ", "1"),
    ("G", "סנפיר חיזוק", "פלטה 5 מ״מ, משולש", "10×15 ס״מ", "4"),
    ("H", "צינור ציר ההגה", "צינור עגול Ø32×3", "15 ס״מ", "1"),
    ("I", "רגל מזלג", "פלח 40×6", "31 ס״מ", "2"),
    ("J", "גשר מזלג", "פלח 40×6", "30 ס״מ", "1"),
    ("K", "מוט רגליים (הגה)", "צינור מרובע 25×25×2", "60 ס״מ", "1"),
    ("L", "פלטת ציר אחורי", "פלטה 6 מ״מ", "8×27 ס״מ", "4"),
    ("M", "ציר גלגל / קינגפין", "מוט הברגה M20", "25 ס״מ", "4"),
    ("N", "גלגל", "4.00-8, מיסב 20 מ״מ", "Ø40 ס״מ", "3"),
    ("O", "אוזן לגלגלת", "פלח 30×5", "8 ס״מ", "2"),
    ("P", "כבל הגה", "כבל פלדה 3 מ״מ + 4 טלוריות", "~70 ס״מ", "2"),
]

HARDWARE = [
    ("h1", "אום ניילוק M20 + דסקית", "8 + 10", "צירים וקינגפין"),
    ("h2", "ספייסר 20 מ״מ", "6", "בצדי כל גלגל"),
    ("h4", "תותב ברונזה/ניילון 20×26", "2", "בתוך H"),
    ("h5", "בורג M10 ×100 + ניילוק + 2 דסקיות", "1", "ציר מוט הרגליים K"),
    ("h6", "בורג M6 + ניילוק + דסקית רחבה", "8", "גלגלות ועיני קיבוע"),
    ("h7", "בורג עין M8 + ניילוק", "2", "חגורת בטיחות"),
    ("h8", "שאקל", "4", "חיבור גלגלות"),
]

def parts_sheet():
    rows = "".join(
        f'<tr><td class="ltr-c"><span class="pt">{a}</span></td><td><b>{b}</b></td><td>{c}</td><td class="n">{d}</td><td class="n">×{e}</td></tr>'
        for a, b, c, d, e in PARTS)
    hw = "".join(
        f'<tr><td class="ltr-c"><span class="pt hw">{a}</span></td><td><b>{b}</b></td><td class="n">×{c}</td><td>{d}</td></tr>'
        for a, b, c, d in HARDWARE)
    return f'''
<table class="parts"><tr><th></th><th>חלק</th><th>חומר</th><th>מידה</th><th>כמות</th></tr>{rows}</table>
<h3>🔩 שקית ברגים (העיקריים)</h3>
<table class="parts"><tr><th></th><th>פריט</th><th>כמות</th><th>איפה</th></tr>{hw}</table>'''

# ---------- STEPS ----------
def step(n, title, drawing, items, warn=None):
    li = "".join(f"<li>{x}</li>" for x in items)
    w = f'<div class="warn">⚠️ {warn}</div>' if warn else ""
    return f'''<div class="step"><div class="sh"><span class="sn">{n}</span><span class="st">{title}</span></div>
<div class="sd">{drawing}</div><ol>{li}</ol>{w}</div>'''

ALL = {"A", "B", "C", "L", "M", "Nr", "Nf", "H", "IJ", "K", "cable", "F", "G", "E", "D", "O", "sheet", "seat"}

steps = []
steps.append(step(1, "חיתוך כל החלקים", cut_layout(), [
    "מסמנים כל חתיכה עם טוש ומטר, ורושמים עליה את האות שלה (A, B, C…).",
    "חותכים ישר (בזווית 90°). את C חותכים בסוף, אחרי שמודדים במקום (שלב 4).",
    "מהפלטות חותכים: 4 משולשים G (5 מ״מ) ו-4 מלבנים L (6 מ״מ, 8×27 ס״מ).",
    "בכל L קודחים חור Ø20.5, 4 ס״מ מהקצה התחתון. בכל I חור Ø20.5, 5 ס״מ מהקצה. ב-J חור Ø20.5 באמצע וחור Ø5 בכל קצה.",
]))
steps.append(step(2, "סימון השדרה A", top_view({"A"}, {"A"}, tags=True, dims=True), [
    "מניחים את A על משטח ישר. מסמנים מהקצה הקדמי (x=0): <b>30</b> בית התורן, <b>60</b> ציר הרגליים, <b>125</b> ו-<b>155</b> מושב, <b>185</b> הציר האחורי.",
    "בנקודה 60 קודחים חור אנכי Ø10.5 דרך השדרה (לבורג של K). אפשר לקדוח עוד חורים ב-50 וב-70, כדי להתאים לאורך הרגליים.",
]))
steps.append(step(3, "בונים את ה-T: שדרה + ציר אחורי", top_view({"A", "B"}, {"B"}), [
    "מניחים את B מתחת ל-A בנקודה 185, כשהמרכז של B בדיוק מתחת לשדרה.",
    "בודקים שהזווית ישרה: מודדים אלכסון מהקצה הקדמי של A לשני הקצוות של B. שני המספרים חייבים להיות שווים.",
    "מנקדים (ריתוך נקודה קטן), בודקים שוב, ורק אז מרתכים מסביב.",
], "מרתכים רק עם מסכת ריתוך, כפפות ובגדים ארוכים. אם אין לך ניסיון בריתוך, כדאי שרתך יעשה את הריתוכים."))
steps.append(step(4, "חיזוקים אלכסוניים C", top_view({"A", "B", "C"}, {"C"}), [
    "מניחים כל C מנקודה 60 ס״מ מהמרכז על B עד השדרה (בערך בנקודה 125).",
    "מסמנים את זווית החיתוך בשני הקצוות במקום, חותכים ומרתכים.",
    "עכשיו השלדה כבר קשיחה ולא זזה.",
]))
steps.append(step(5, "גלגלים אחוריים: L + M + N", top_view({"A", "B", "C", "L", "M", "Nr"}, {"L", "M", "Nr"}) + axle_detail(), [
    "מרתכים 2 פלטות L מתחת לכל קצה של B: אחת 70 ס״מ מהמרכז ואחת 84 ס״מ. הפלטות מקבילות לשדרה והחורים בגובה שווה.",
    "בכל צד: מכניסים את מוט ההברגה M דרך הפלטה, ספייסר, גלגל, ספייסר ופלטה (ראה ציור). סוגרים עם דסקית ואום ניילוק בשני הצדדים.",
    "בודקים שהגלגלים מסתובבים חופשי ועומדים ישר (לא בזווית).",
]))
steps.append(step(6, "חזית: ציר ההגה H, מזלג I+J וגלגל קדמי", side_view({"A", "B", "C", "L", "M", "Nr", "H", "IJ", "Nf"}, {"H", "IJ", "Nf"}) + fork_detail(), [
    "מרתכים את H אנכי בקצה הקדמי של A. החלק התחתון של H בגובה התחתית של השדרה. מכניסים את התותבים בשני הקצוות.",
    "מרתכים את שתי הרגליים I מתחת לגשר J, 7 ס״מ מהמרכז לכל צד. הרגליים חייבות להיות מקבילות.",
    "מכניסים את הגלגל הקדמי בין הרגליים עם ציר M, ספייסרים ואומי ניילוק (כמו מאחור).",
    "הקינגפין הוא החתיכה הרביעית של מוט ההברגה M. מרכיבים לפי הסדר בציור, עם אום ניילוק בשני הקצוות. בודקים שהמזלג מסתובב חלק, ושיש לפחות 3 ס״מ בין הגלגל לגשר.",
]))
steps.append(step(7, "הגה לרגליים: K + כבלים P", top_view({"A", "B", "C", "L", "M", "Nr", "H", "IJ", "Nf", "K", "cable"}, {"K", "cable"}) + steer_detail(), [
    "קודחים חור Ø10.5 באמצע K ובשני הקצוות שלו (2 ס״מ מהקצה).",
    "מחברים את K על השדרה עם בורג M10, ניילוק ושתי דסקיות. מהדקים כך שהוא מסתובב, אבל בלי רעידות.",
    "מחברים כבל מכל קצה של K לקצה של J באותו צד. סוגרים כל קצה בלולאה עם טלורית ולוחץ טלוריות.",
    "מיישרים את הגלגל הקדמי ואת K ומותחים את הכבלים. שבו על השלדה ובדקו שהרגליים מגיעות בנוחות. אם לא, מעבירים את K לחור אחר (50 או 70).",
], "לפני כל נסיעה בודקים שהכבלים מתוחים ולא שחוקים. כבל שנקרע = אין הגה."))
steps.append(step(8, "בית התורן F + סנפירים G", side_view({"A", "B", "C", "L", "M", "Nr", "H", "IJ", "Nf", "K", "F", "G"}, {"F", "G"}) + mast_detail(), [
    "מעמידים את F על השדרה בנקודה 30. בודקים עם פלס שהוא אנכי בשני הכיוונים.",
    "מרתכים מסביב, ואז מרתכים 4 סנפירים G (קדימה, אחורה ולצדדים).",
    "מכינים פקק עץ או ניילון שנכנס בדיוק ל-F, עם חור שמאריך התורן של הגלשן נכנס אליו. התורן צריך להסתובב בפקק.",
], "זה החיבור הכי חזק בעגלה: כל הכוח של המפרש עובר דרכו. ריתוך מלא בלבד, לא נקודות."))
steps.append(step(9, "מושב: E + D", side_view({"A", "B", "C", "L", "M", "Nr", "H", "IJ", "Nf", "K", "F", "G", "E", "D", "seat"}, {"E", "D", "seat"}), [
    "מרתכים 2 מוטות E לרוחב על השדרה בנקודות 125 ו-155.",
    "מרתכים 2 עמודים D על הקצוות של ה-E האחורי (נקודה 155, 20 ס״מ מהמרכז), נוטים אחורה 13°. מרתכים את ה-E השלישי לרוחב למעלה.",
    "מותחים ברזנט עם אילתות ושורכים בחבל 5 מ״מ (או מבריגים מושב קארטינג עם ברגי M6).",
    "מבריגים 2 ברגי עין M8 לחגורת הבטיחות.",
]))
steps.append(step(10, "אוזניים O + גלגלות + חבל השליטה", top_view(ALL - {"seat"}, {"O", "sheet"}), [
    "מרתכים אוזן O אחת בקצה האחורי של השדרה, ואחת בצד השדרה בנקודה 115 (ליד הידיים).",
    "מחברים עם שאקלים: גלגלת בודדת באוזן האחורית, גלגלת ראצ׳ט ותפס קאם באוזן הקדמית.",
    "מסלול החבל: קצה הבום ← הגלגלת האחורית ← גלגלת הראצ׳ט ← התפס ← היד שלך. קושרים כדור עצירה בקצה.",
]))
steps.append(step(11, "צביעה", "", [
    "מורידים את הגלגלים ואת הכבלים. משייפים את הריתוכים ומנקים שומן עם טרפנטין.",
    "מורחים ממיר חלודה איפה שיש חלודה, ואחרי זה שכבת צבע יסוד.",
    "צובעים 2 שכבות צבע למתכת. כדאי צבע בולט, כדי שיראו אותך. מדביקים סרט מחזיר אור.",
    "מחכים 24 שעות, ומרכיבים בחזרה את הגלגלים ואת הכבלים.",
]))
steps.append(step(12, "הרכבת המפרש", rigged(), [
    "מרכיבים את המפרש על התורן כמו בגלשן רוח: תורן בתוך שרוול המפרש, מאריך בתחתית, מתיחה למטה (Downhaul).",
    "מכניסים את המאריך לפקק שבתוך F.",
    "מחברים את הבום בגובה שלא פוגע בראש כשאתה יושב (בערך 1.6–1.8 מטר מהקרקע).",
    "מחברים את חבל השליטה לקצה הבום.",
]))
steps.append(step(13, "בדיקת בטיחות ונסיעה ראשונה", "", [
    "בודקים: כל אומי הניילוק סגורים, אין סדקים בריתוכים, הגלגלים מסתובבים חלק, ההגה עובד לשני הצדדים, הכבלים מתוחים.",
    "בפעם הראשונה: רוח חלשה (8–12 קשר), מקום ריק ושטוח (חוף רחב או מגרש), רחוק מאנשים, מכוניות ומים.",
    "חובה: קסדה, כפפות, משקפיים. חוגרים חגורה.",
    "לעצור: מסובבים את העגלה מול הרוח ומשחררים את חבל השליטה.",
], "זה תכנון ביתי, לא מוצר מאושר. נוסעים לאט בהתחלה, ובודקים את העגלה אחרי כל נסיעה."))

# ---------- HTML ----------
html = f'''<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>עגלת מפרש: שרטוטים והוראות הרכבה</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&display=swap" rel="stylesheet">
<style>
@page {{ size: A4; margin: 11mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Heebo','Liberation Sans','DejaVu Sans',sans-serif; color:{INK}; font-size:10.3pt; line-height:1.45; margin:0; }}
h1 {{ font-size:22pt; margin:0; font-weight:800; }}
h2 {{ font-size:15pt; margin:0 0 4px; font-weight:800; color:{NAVY}; }}
h3 {{ font-size:12pt; margin:10px 0 4px; font-weight:800; }}
header {{ border-bottom:3px solid {ORANGE}; padding-bottom:6px; margin-bottom:8px; }}
.sub {{ color:#5a6573; font-size:10pt; }}
.page {{ break-after: page; }}
.dwg {{ width:100%; height:auto; display:block; }}
.box {{ border:1px solid #d5dbe2; border-radius:8px; padding:6px 10px; margin-bottom:8px; break-inside:avoid; }}
.legend span {{ display:inline-block; width:14px; height:10px; border-radius:2px; vertical-align:middle; margin-inline-end:4px; }}
.note {{ background:#fff4ec; border-right:4px solid {ORANGE}; padding:5px 9px; font-size:9.6pt; margin:6px 0; }}
table.parts {{ width:100%; border-collapse:collapse; font-size:9.2pt; }}
table.parts th, table.parts td {{ border-bottom:1px solid #d5dbe2; padding:1.5px 6px; text-align:right; }}
table.parts th {{ background:{NAVY}; color:#fff; font-weight:600; }}
td.n {{ white-space:nowrap; font-weight:600; }}
.pt {{ display:inline-block; min-width:17px; height:17px; border-radius:9px; background:{NAVY}; color:#fff; font-weight:800; text-align:center; line-height:17px; font-size:8.5pt; padding:0 4px; direction:ltr; }}
.pt.hw {{ background:#5a6573; }}
.step {{ border:1px solid #d5dbe2; border-radius:8px; padding:7px 10px; margin-bottom:9px; break-inside:avoid; }}
.sh {{ display:flex; align-items:center; gap:8px; margin-bottom:3px; }}
.sn {{ background:{ORANGE}; color:#fff; font-weight:800; border-radius:50%; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; font-size:13pt; flex:none; }}
.st {{ font-weight:800; font-size:13pt; }}
.sd svg {{ display:block; width:100%; height:60mm; margin:2px 0; }}
.sd svg.detail {{ height:auto; max-height:80mm; }}
.box .dwg {{ max-height:100mm; margin:0 auto; }}
.box .dwg.side {{ max-height:64mm; }}
ol {{ margin:4px 0 0; padding-inline-start:22px; }}
li {{ margin:1px 0; }}
.warn {{ background:#fdecea; border-right:4px solid #c0392b; padding:4px 9px; font-size:9.5pt; margin-top:5px; }}
.ltr {{ direction:ltr; unicode-bidi:isolate; }}
.order {{ display:flex; flex-wrap:wrap; gap:4px; font-size:9.6pt; }}
.order span {{ background:#eef2f6; border-radius:10px; padding:1px 8px; }}
</style></head><body>

<div class="page">
<header><h1>⛵ עגלת מפרש: שרטוטים והוראות הרכבה</h1>
<div class="sub">עגלה לאדם אחד, 3 גלגלים, הגה ברגליים, מפרש של גלשן רוח. כל המידות בס״מ.</div></header>
<div class="box"><h2>מבט מלמעלה</h2>{top_view(ALL - {"seat"}, (), tags=True, dims=True)}</div>
<div class="box"><h2>מבט מהצד</h2>{side_view(ALL, (), tags=True, dims=True)}</div>
<div class="note"><b>איך לקרוא את הציורים:</b> כל חלק מסומן באות (A, B, C…) שמופיעה ברשימת החלקים. בכל שלב, <b style="color:{ORANGE}">החלקים החדשים בכתום</b> ומה שכבר בנית באפור.</div>
</div>

<div class="page">
<h2>🧩 רשימת החלקים</h2>
{parts_sheet()}
<div class="note"><b>שינויים קטנים לרשימת הקניות</b> (גיליתי אותם בזמן התכנון):<br>
• פלח 40×6: לקנות <b>1.2 מטר</b> (לא 1 מטר), כי הגשר J הוא 30 ס״מ.<br>
• פלטה 6 מ״מ: לקנות <b>35×30 ס״מ</b> (לא 30×30), בשביל 4 פלטות L של 8×27.<br>
• כבל פלדה 3 מ״מ: <b>2 מטר + 4 טלוריות</b>. עכשיו זה חובה, כי זה ההגה (יש במ.נ.מ, עם הלוחץ).<br>
• בורג <b>M10×100</b> אחד, לציר של מוט הרגליים.</div>
<h3>🗺️ סדר ההרכבה</h3>
<div class="order"><span>1 חיתוך</span><span>2 סימון</span><span>3 שלדת T</span><span>4 חיזוקים</span><span>5 גלגלים אחוריים</span><span>6 הגה וגלגל קדמי</span><span>7 הגה רגליים</span><span>8 בית התורן</span><span>9 מושב</span><span>10 גלגלות וחבל</span><span>11 צבע</span><span>12 מפרש</span><span>13 בדיקה ונסיעה</span></div>
<div class="note">💡 <b>למה בסדר הזה?</b> קודם בונים שלדה ישרה (ה-T), כי כל השאר נמדד ממנה. אחר כך הגלגלים, כדי שהעגלה תעמוד ותוכל להמשיך לעבוד עליה. בית התורן והמושב באים אחרי שבדקת ישיבה ואורך רגליים. וצובעים רק בסוף, כשכל הריתוכים גמורים.</div>
<h3>🧰 כלים</h3>
<div>משחזת זווית + דיסקים · רתכת (או רתך) · מקדחה + מקדחים 5–20 מ״מ · מטר, זווית, פלס, טוש · מלחציים · מפתחות 10/13/17/30 · לוחץ טלוריות · מסכת ריתוך, כפפות, משקפי מגן.</div>
</div>

{"".join(steps)}
</body></html>'''

open(OUT, "w", encoding="utf-8").write(html)
print("ok")
