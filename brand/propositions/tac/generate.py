"""TAC logo proposals (outlined SVG, Plus Jakarta Sans, OFL).
Usage: uv run --with fonttools --with uharfbuzz --with brotli python3 generate.py ../../fonts/plus-jakarta-sans-latin-wght-normal.woff2 out"""
import io, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import uharfbuzz as hb

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
NAVY, NIGHT, VIOLET, VIOLET_LIGHT, WHITE = '#17274C', '#0B152C', '#B8862B', '#D4A74C', '#FFFFFF'  # accents = Kai's gold collar


def load(w):
    f = instantiateVariableFont(TTFont(SRC), {'wght': w})
    buf = io.BytesIO(); f.flavor = None; f.save(buf)
    data = buf.getvalue()
    return TTFont(io.BytesIO(data)), hb.Font(hb.Face(data))

FONTS = {w: load(w) for w in (500, 600, 700, 800)}


def text(t, w, size, x0, y0, tracking=0.0):
    """(path d, ink box (x1,y1,x2,y2), advance) of a text at baseline y0."""
    tt, hf = FONTS[w]
    upem = tt['head'].unitsPerEm; s = size / upem
    buf = hb.Buffer(); buf.add_str(t); buf.guess_segment_properties()
    hb.shape(hf, buf, {'kern': True})
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    pen = SVGPathPen(gs); x = 0; box = [1e9, 1e9, -1e9, -1e9]
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        g = gs[order[info.codepoint]]; ox = x0 + (x + pos.x_offset) * s
        g.draw(TransformPen(pen, (s, 0, 0, -s, ox, y0)))
        bp = BoundsPen(gs); g.draw(bp)
        if bp.bounds:
            a, b, c, d = bp.bounds
            box = [min(box[0], ox + a * s), min(box[1], y0 - d * s), max(box[2], ox + c * s), max(box[3], y0 - b * s)]
        x += pos.x_advance + tracking * upem
    return pen.getCommands(), box, (x - tracking * upem) * s


def centred(t, w, size, cx, cy, tracking=0.0):
    _, b, _ = text(t, w, size, 0, 0, tracking)
    return text(t, w, size, cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2, tracking)[0]


def star(cx, cy, r, k=0.16):
    q = r * k
    return (f'M{cx:.2f} {cy - r:.2f}Q{cx + q:.2f} {cy - q:.2f} {cx + r:.2f} {cy:.2f}'
            f'Q{cx + q:.2f} {cy + q:.2f} {cx:.2f} {cy + r:.2f}Q{cx - q:.2f} {cy + q:.2f} {cx - r:.2f} {cy:.2f}'
            f'Q{cx - q:.2f} {cy - q:.2f} {cx:.2f} {cy - r:.2f}Z')


def svg(name, w, h, body):
    open(f'{OUT}/{name}', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">{body}</svg>')


# ---------- A · Sceau : carré arrondi, TAC en blanc, étoile violette en exposant ----------
def mark_a(bg=NAVY, ink=WHITE, accent=VIOLET_LIGHT):
    d = centred('TAC', 800, 47, 60, 70, tracking=-0.02)
    return (f'<rect width="128" height="128" rx="30" fill="{bg}"/>'
            f'<path d="{d}" fill="{ink}"/><path d="{star(105, 25, 11)}" fill="{accent}"/>')

# ---------- B · Médaille : cercle avec double anneau, comme un sceau de certificat ----------
def mark_b(bg=NAVY, ink=WHITE, accent=VIOLET_LIGHT):
    d = centred('TAC', 800, 44, 64, 70, tracking=-0.02)
    return (f'<circle cx="64" cy="64" r="64" fill="{bg}"/>'
            f'<circle cx="64" cy="64" r="55" fill="none" stroke="{accent}" stroke-width="2.5"/>'
            f'<circle cx="64" cy="64" r="49.5" fill="none" stroke="{ink}" stroke-opacity=".25" stroke-width="1"/>'
            f'<path d="{d}" fill="{ink}"/><path d="{star(64, 33, 8.5)}" fill="{accent}"/>')

# ---------- C · Monogramme : TAC sans cadre, la barre du A remplacée par l'étoile ----------
def mark_c(ink=NAVY, accent=VIOLET):
    # Letter by letter: the star sits on the A's crossbar.
    size = 96; base = 104
    t_d, t_b, t_adv = text('T', 800, size, 4, base)
    a_x = 4 + t_adv - 6
    a_d, a_b, a_adv = text('A', 800, size, a_x, base)
    c_d, c_b, _ = text('C', 800, size, a_x + a_adv - 4, base)
    sx = (a_b[0] + a_b[2]) / 2; sy = a_b[1] + (a_b[3] - a_b[1]) * 0.70
    width = c_b[2] + 4
    body = (f'<path d="{t_d}" fill="{ink}"/><path d="{a_d}" fill="{ink}"/><path d="{c_d}" fill="{ink}"/>'
            f'<path d="{star(sx, sy, 15)}" fill="{accent}"/>')
    return body, width, base + 6

def lockup(mark_body, mark_w, name_ink, accent, sub_ink, file, h=128, mark_h=128):
    """Mark + 'The AI Certification' on two lines, for the site header and the banner."""
    s = h / 128
    ms = h / mark_h
    gap = 26 * s
    x = mark_w * ms + gap
    l1, b1, a1 = text('The AI', 800, 46 * s, x, 58 * s, tracking=-0.01)
    l2, b2, a2 = text('Certification', 500, 46 * s, x, 108 * s, tracking=-0.01)
    w = max(b1[2], b2[2]) + 4
    body = (f'<g transform="scale({ms})">{mark_body}</g>'
            f'<path d="{l1}" fill="{accent}"/><path d="{l2}" fill="{name_ink}"/>')
    svg(file, w, h, body)

# Marks, light + dark backgrounds
svg('A-mark.svg', 128, 128, mark_a())
svg('B-mark.svg', 128, 128, mark_b())
c_body, c_w, c_h = mark_c()
svg('C-mark.svg', c_w, c_h, c_body)
c_dark, _, _ = mark_c(ink=WHITE, accent=VIOLET_LIGHT)
svg('C-mark-white.svg', c_w, c_h, c_dark)

lockup(mark_a(), 128, NAVY, VIOLET, NAVY, 'A-lockup.svg')
lockup(mark_a(bg=WHITE, ink=NAVY, accent=VIOLET), 128, WHITE, VIOLET_LIGHT, WHITE, 'A-lockup-white.svg')
lockup(mark_b(), 128, NAVY, VIOLET, NAVY, 'B-lockup.svg')
lockup(mark_b(bg=WHITE, ink=NAVY, accent=VIOLET), 128, WHITE, VIOLET_LIGHT, WHITE, 'B-lockup-white.svg')
lockup(c_body, c_w, NAVY, VIOLET, NAVY, 'C-lockup.svg', 128, c_h)
lockup(c_dark, c_w, WHITE, VIOLET_LIGHT, WHITE, 'C-lockup-white.svg', 128, c_h)
print('ok')


# ---------- Final set for option C (chosen 2026-11-13) ----------
import json
FINAL = sys.argv[3] if len(sys.argv) > 3 else None
if FINAL:
    os.makedirs(FINAL, exist_ok=True)
    ink, acc = 'currentColor', 'var(--logo-accent, currentColor)'

    def mono(ink_fill, star_fill, size=96, base=104, x0=4):
        t_d, t_b, t_adv = text('T', 800, size, x0, base)
        a_x = x0 + t_adv - 6 * size / 96
        a_d, a_b, a_adv = text('A', 800, size, a_x, base)
        c_d, c_b, _ = text('C', 800, size, a_x + a_adv - 4 * size / 96, base)
        sx = (a_b[0] + a_b[2]) / 2; sy = a_b[1] + (a_b[3] - a_b[1]) * 0.70
        body = f'<path d="{t_d} {a_d} {c_d}" fill="{ink_fill}"/><path d="{star(sx, sy, 15 * size / 96)}" fill="{star_fill}"/>'
        return body, (t_b[0], t_b[1], c_b[2], t_b[3])

    # Monogram alone (tight box)
    m_body, (x1, y1, x2, y2) = mono(ink, acc)
    pad = 2
    mono_vb = f'{x1 - pad:.1f} {y1 - pad:.1f} {x2 - x1 + 2 * pad:.1f} {y2 - y1 + 2 * pad:.1f}'

    # Lockup: monogram + “The AI / Certification”, baseline-aligned to the monogram
    mh = y2 - y1
    gap = mh * 0.28
    tx = x2 + gap
    l1, b1, _ = text('The AI', 800, mh * 0.47, tx, y1 + mh * 0.45, tracking=-0.01)
    l2, b2, _ = text('Certification', 500, mh * 0.47, tx, y2, tracking=-0.01)
    lock_body = m_body + f'<path d="{l1}" fill="{acc}"/><path d="{l2}" fill="{ink}"/>'
    lock_vb = f'{x1 - pad:.1f} {y1 - pad:.1f} {max(b1[2], b2[2]) - x1 + 2 * pad:.1f} {y2 - y1 + 2 * pad + mh * 0.06:.1f}'

    # Square icon: rounded square, monogram centred
    def square(bg, ink_fill, star_fill, n=128):
        body, (a, b, c, d) = mono(ink_fill, star_fill)
        w, h = c - a, d - b
        s = n * 0.70 / w
        tx_, ty_ = (n - w * s) / 2 - a * s, (n - h * s) / 2 - b * s
        return f'<rect width="{n}" height="{n}" rx="{n * 0.234:.1f}" fill="{bg}"/><g transform="translate({tx_:.2f} {ty_:.2f}) scale({s:.4f})">{body}</g>'

    json.dump({
        'full': {'viewBox': lock_vb, 'body': lock_body},
        'wordmark': {'viewBox': mono_vb, 'body': m_body},
        'mark': {'viewBox': '0 0 128 128', 'body': square('currentColor', 'var(--logo-cut, #FFFFFF)', 'var(--logo-accent-on-mark, #9F8CFF)')},
    }, open(f'{FINAL}/logo-art.json', 'w'))

    def file(name, vb, body):
        _, _, w, h = map(float, vb.split())
        open(f'{FINAL}/{name}', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w:.0f}" height="{h:.0f}"><title>The AI Certification</title>{body}</svg>')

    sub = lambda s, i, a: s.replace('currentColor', i).replace('var(--logo-accent, currentColor)', a)
    file('logo.svg', lock_vb, lock_body.replace('var(--logo-accent, currentColor)', VIOLET).replace('currentColor', NAVY))
    file('logo-white.svg', lock_vb, lock_body.replace('var(--logo-accent, currentColor)', VIOLET_LIGHT).replace('currentColor', WHITE))
    file('wordmark.svg', mono_vb, m_body.replace('var(--logo-accent, currentColor)', VIOLET).replace('currentColor', NAVY))
    file('wordmark-white.svg', mono_vb, m_body.replace('var(--logo-accent, currentColor)', VIOLET_LIGHT).replace('currentColor', WHITE))
    file('mark.svg', '0 0 128 128', square(NAVY, WHITE, VIOLET_LIGHT))
    file('mark-white.svg', '0 0 128 128', square(WHITE, NAVY, VIOLET))
    file('favicon.svg', '0 0 128 128', square(NAVY, WHITE, VIOLET_LIGHT))
    file('icon-maskable.svg', '0 0 128 128', f'<rect width="128" height="128" fill="{NAVY}"/><g transform="translate(19.2 19.2) scale(.7)">{square(NAVY, WHITE, VIOLET_LIGHT)}</g>')
    print('final ok')
