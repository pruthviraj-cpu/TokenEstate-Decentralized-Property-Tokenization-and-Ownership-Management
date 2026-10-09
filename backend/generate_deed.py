"""
generate_indian_deeds.py - makes 4 SYNTHETIC Indian-style sale deeds to test TokenEstate Module 3.

    python generate_indian_deeds.py            # writes ./test_deeds/*.pdf + manifest.json

  1. genuine_digital_deed.pdf   real text layer, clean metadata            -> should PASS
  2. genuine_scanned_deed.pdf   image-only "scan" (tilt, noise, JPEG)      -> should PASS (OCR path)
  3. fake_tampered_scan.pdf     scan where the price digits were edited    -> only ELA can catch it
  4. fake_canva_edited.pdf      digital PDF made/edited with Canva         -> should be REJECTED (Layer 1)

Everything is fictional (invented people, plots, document numbers). No government emblem, seal or
real stamp serial is reproduced, and every page carries a small "synthetic specimen" footer.
Keep that footer: these files are test data, not legal instruments.
Needs: pip install pymupdf pillow numpy
"""
import io
import os
import json
import math
import pymupdf
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = "test_deeds"
DPI = 150
SCALE = DPI / 72
FOOTER = "SYNTHETIC SPECIMEN FOR SOFTWARE TESTING - NOT A LEGAL DOCUMENT"

DEEDS = {
    "genuine_digital": dict(
        vendor="Aarav Suresh Deshmukh", purchaser="Rohan Anil Patil",
        survey="Survey No. 402/A", hissa="Hissa No. 3", village="Hinjewadi",
        taluka="Mulshi", district="Pune", area="1,200 sq. ft. (111.48 sq. mtrs.)",
        price_digits="85,00,000", price_words="Eighty Five Lakhs", docno="TEST-HVL-0412/2026",
        date="15th September 2026", w1="Mahesh Gaikwad", w2="Sneha Kamble",
    ),
    "genuine_scan": dict(
        vendor="Sunita Ramesh Kulkarni", purchaser="Vikram Dilip Joshi",
        survey="Survey No. 118/2B", hissa="Hissa No. 1", village="Gangapur",
        taluka="Nashik", district="Nashik", area="2,450 sq. ft. (227.62 sq. mtrs.)",
        price_digits="42,50,000", price_words="Forty Two Lakhs Fifty Thousand", docno="TEST-NSK-1187/2026",
        date="2nd August 2026", w1="Pravin Bhosale", w2="Kavita Salunke",
    ),
    "fake_tamper": dict(
        vendor="Prakash Namdev More", purchaser="Anita Sanjay Shinde",
        survey="Survey No. 77/1", hissa="Hissa No. 5", village="Wagholi",
        taluka="Haveli", district="Pune", area="1,800 sq. ft. (167.22 sq. mtrs.)",
        price_digits="1,20,00,000", price_words="One Crore Twenty Lakhs", docno="TEST-HVL-0977/2026",
        date="21st July 2026", w1="Ganesh Pawar", w2="Rekha Jadhav",
    ),
    "fake_canva": dict(
        vendor="Meera Subramanian Iyer", purchaser="Karan Rajiv Mehta",
        survey="Survey No. 56/3", hissa="Hissa No. 2", village="Baner",
        taluka="Haveli", district="Pune", area="950 sq. ft. (88.26 sq. mtrs.)",
        price_digits="63,00,000", price_words="Sixty Three Lakhs", docno="TEST-HVL-0655/2026",
        date="9th June 2026", w1="Nilesh Thorat", w2="Pooja Wagh",
    ),
}

CSS = """
body { font-family: serif; font-size: 10.5pt; line-height: 1.45; text-align: justify; }
h1 { text-align: center; font-size: 17pt; margin: 6px 0 2px 0; letter-spacing: 2px; }
h3 { text-align: center; font-size: 10pt; font-weight: normal; margin: 0 0 8px 0; }
p { margin: 0 0 7px 0; }
.stamp { border: 1.5px solid #333; padding: 4px; text-align: center; font-size: 9pt; margin-bottom: 8px; }
.tbl td { padding: 2px 8px; font-size: 10pt; }
"""


def page1_html(d):
    return f"""
<div class="stamp"><b>NON-JUDICIAL STAMP PAPER (SPECIMEN) &nbsp;|&nbsp; Rs. 500/-</b><br/>
Document No. {d['docno']}</div>
<h1>SALE DEED</h1>
<h3>(Conveyance of Immovable Property)</h3>
<p>THIS DEED OF SALE is made and executed at {d['district']} on this <b>{d['date']}</b>
BETWEEN <b>{d['vendor']}</b>, adult, Indian Inhabitant, residing at {d['village']},
Taluka {d['taluka']}, District {d['district']}, hereinafter called the <b>"VENDOR"</b>
(which expression shall, unless repugnant to the context, include his/her heirs, executors,
administrators and assigns) of the ONE PART;</p>
<p>AND <b>{d['purchaser']}</b>, adult, Indian Inhabitant, residing at {d['district']},
hereinafter called the <b>"PURCHASER"</b> (which expression shall include his/her heirs,
executors, administrators and assigns) of the OTHER PART.</p>
<p><b>WHEREAS</b> the Vendor is the sole and absolute owner of, and well and sufficiently entitled to,
the land and property described in the Schedule written hereunder, bearing
<b>{d['survey']}, {d['hissa']}</b>, situated at Village {d['village']}, Taluka {d['taluka']},
District {d['district']}, admeasuring {d['area']}, hereinafter referred to as the "said property".</p>
<p><b>AND WHEREAS</b> the Vendor has agreed to sell, transfer and convey the said property to the
Purchaser, free from all encumbrances, for a total consideration of
<b>Rs. {d['price_digits']}/-</b> (Rupees {d['price_words']} only), and the Purchaser has agreed to
purchase the same on the terms and conditions recorded below.</p>
<p><b>NOW THIS DEED WITNESSETH AS FOLLOWS:</b></p>
<p>1. In consideration of the sum of Rs. {d['price_digits']}/- paid by the Purchaser to the Vendor
by account payee cheque / bank transfer, the receipt whereof the Vendor doth hereby admit and
acknowledge, the Vendor doth hereby sell, convey, transfer and assign unto the Purchaser the said
property, together with all rights, easements and appurtenances thereto.</p>
"""


def page2_html(d):
    return f"""
<p>2. The Vendor hereby declares that the said property is free from all encumbrances, charges, liens,
litigation, mortgages and attachments, and that the Vendor has a clear and marketable title thereto.</p>
<p>3. The Vendor has handed over vacant and peaceful possession of the said property to the Purchaser
on the date of execution of this Deed, and the Purchaser shall hereafter hold and enjoy the same
without any interruption or claim by the Vendor or any person claiming through the Vendor.</p>
<p>4. All taxes, cesses and outgoings in respect of the said property up to the date of this Deed shall
be borne by the Vendor and thereafter by the Purchaser.</p>
<p>5. The stamp duty and registration charges payable on this Deed have been borne by the Purchaser.</p>
<p style="text-align:center"><b>SCHEDULE OF THE PROPERTY</b></p>
<table class="tbl" border="1" width="100%">
<tr><td>Village</td><td>{d['village']}</td></tr>
<tr><td>Taluka / District</td><td>{d['taluka']} / {d['district']}</td></tr>
<tr><td>Survey / Hissa No.</td><td>{d['survey']}, {d['hissa']}</td></tr>
<tr><td>Area</td><td>{d['area']}</td></tr>
<tr><td>Boundaries</td><td>East: Village road &nbsp; West: Survey No. 403 &nbsp; North: Nala &nbsp; South: Survey No. 401</td></tr>
</table>
<p>&nbsp;</p>
<p><b>IN WITNESS WHEREOF</b> the parties hereto have set their respective hands on the day and year first
hereinabove written.</p>
<table width="100%"><tr>
<td><b>VENDOR</b><br/><br/><br/>{d['vendor']}</td>
<td><b>PURCHASER</b><br/><br/><br/>{d['purchaser']}</td></tr></table>
<p>&nbsp;</p>
<p><b>WITNESSES:</b><br/>1. {d['w1']} ........................ &nbsp;&nbsp;&nbsp; 2. {d['w2']} ........................</p>
<p style="border:1px solid #444; padding:4px; font-size:9pt">REGISTRATION ENDORSEMENT (SPECIMEN):
Presented at the Sub-Registrar Office, {d['district']}. Document No. {d['docno']}.
Fee paid as per schedule. Thumb impressions and photographs of the parties affixed.</p>
"""


def build_digital_pdf(d, producer, creator, cdate, mdate):
    doc = pymupdf.open()
    rect = pymupdf.Rect(50, 45, 545, 790)
    for html in (page1_html(d), page2_html(d)):
        page = doc.new_page(width=595, height=842)
        page.insert_htmlbox(rect, html, css=CSS)
        page.insert_text((50, 825), FOOTER, fontsize=7, color=(0.5, 0.5, 0.5))
    # simple hand-drawn "signatures" on page 2
    pg = doc[1]
    for x in (62, 330):
        s = pg.new_shape()
        s.draw_bezier((x, 600), (x + 25, 570), (x + 45, 625), (x + 90, 590))
        s.finish(color=(0.1, 0.1, 0.5), width=1.2)
        s.commit()
    doc.set_metadata({"producer": producer, "creator": creator, "title": "Sale Deed (synthetic)",
                      "creationDate": cdate, "modDate": mdate})
    return doc.tobytes(garbage=3, deflate=True)


def scan_effect(img, angle, seed):
    """Fake a flatbed scan: slight tilt, paper tint, sensor noise, soft focus."""
    rng = np.random.default_rng(seed)
    img = img.convert("L").convert("RGB")
    img = img.rotate(angle, resample=Image.BICUBIC, fillcolor=(236, 232, 218))
    arr = np.array(img).astype(np.float32)
    arr *= np.array([1.0, 0.985, 0.93])                       # warm paper tint
    arr += rng.normal(0, 4.0, arr.shape)                      # noise
    yy = np.linspace(0, 1, arr.shape[0])[:, None, None]
    arr *= (0.96 + 0.04 * np.cos(yy * math.pi))               # uneven lighting
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def to_jpeg(img, quality):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def images_to_pdf(jpegs, producer="Flatbed Scanner Driver 2.1", creator="Scanner"):
    doc = pymupdf.open()
    for jb in jpegs:
        page = doc.new_page(width=595, height=842)
        page.insert_image(page.rect, stream=jb)
    doc.set_metadata({"producer": producer, "creator": creator,
                      "creationDate": "D:20260915101500+05'30'", "modDate": "D:20260915101500+05'30'"})
    return doc.tobytes(garbage=3, deflate=True)


def render_pages(pdf_bytes):
    src = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    imgs = [Image.open(io.BytesIO(p.get_pixmap(dpi=DPI).tobytes("png"))).convert("RGB") for p in src]
    return src, imgs


def _font(size):
    for name in ("DejaVuSerif.ttf", "times.ttf", "Times New Roman.ttf", "LiberationSerif-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def tamper_price(page1_img, src_doc, old_digits, new_digits):
    """Edit the price on the SCANNED image (white-out + retype) and paste a fake stamp."""
    hits = src_doc[0].search_for(old_digits)
    if not hits:
        raise RuntimeError("price text not found on page 1")
    r = hits[0]
    x0, y0, x1, y1 = [int(v * SCALE) for v in (r.x0, r.y0, r.x1, r.y1)]
    draw = ImageDraw.Draw(page1_img)
    draw.rectangle([x0 - 8, y0 - 3, x1 + 10, y1 + 4], fill=(238, 234, 220))     # white-out
    draw.text((x0, y0 - 1), new_digits, fill=(25, 25, 25), font=_font(22))      # retyped digits
    cx, cy, rad = 190, 1650, 75                                                 # pasted "stamp"
    draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=(30, 60, 170), width=4)
    draw.ellipse([cx - rad + 12, cy - rad + 12, cx + rad - 12, cy + rad - 12], outline=(30, 60, 170), width=2)
    draw.text((cx - 48, cy - 12), "REGISTERED", fill=(30, 60, 170), font=_font(24))
    return page1_img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ok_dates = ("D:20260915101500+05'30'", "D:20260915101500+05'30'")
    files = {}

    # 1) genuine digital
    d = DEEDS["genuine_digital"]
    files["genuine_digital_deed.pdf"] = build_digital_pdf(
        d, "TokenEstate Test Generator", "Synthetic Deed Writer", *ok_dates)

    # 2) genuine scan
    d = DEEDS["genuine_scan"]
    src = build_digital_pdf(d, "x", "x", *ok_dates)
    _, pages = render_pages(src)
    jpgs = [to_jpeg(scan_effect(p, 0.5, 10 + i), 78) for i, p in enumerate(pages)]
    files["genuine_scanned_deed.pdf"] = images_to_pdf(jpgs)

    # 3) fake: edited scan (price 1,20,00,000 -> 12,00,000, fake stamp pasted)
    d = DEEDS["fake_tamper"]
    src_bytes = build_digital_pdf(d, "x", "x", *ok_dates)
    src_doc, pages = render_pages(src_bytes)
    scanned = [scan_effect(p, 0.3, 20 + i) for i, p in enumerate(pages)]
    # A real scan is already a JPEG. The forger opens it, edits it, and saves it AGAIN, so the
    # untouched background is compressed twice while the new digits/stamp are compressed once.
    page1 = Image.open(io.BytesIO(to_jpeg(scanned[0], 78))).convert("RGB")
    page1 = tamper_price(page1, src_doc, d["price_digits"], "12,00,000")
    jpgs = [to_jpeg(page1, 88)] + [to_jpeg(p, 78) for p in scanned[1:]]
    files["fake_tampered_scan.pdf"] = images_to_pdf(jpgs)

    # 4) fake: made/edited in Canva
    d = DEEDS["fake_canva"]
    files["fake_canva_edited.pdf"] = build_digital_pdf(
        d, "Canva", "Canva", "D:20260601090000+05'30'", "D:20260918183000+05'30'")

    for name, data in files.items():
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)

    manifest = {
        "genuine_digital_deed.pdf": {"expect": "PASSED_VERIFIED", "survey_number": "Survey No. 402/A", "owner_name": "Aarav Deshmukh"},
        "genuine_scanned_deed.pdf": {"expect": "PASSED_VERIFIED", "survey_number": "Survey No. 118/2B", "owner_name": "Sunita Kulkarni"},
        "fake_tampered_scan.pdf": {"expect": "REJECTED (only ELA can notice the edited price; survey/owner still match)", "survey_number": "Survey No. 77/1", "owner_name": "Prakash More"},
        "fake_canva_edited.pdf": {"expect": "REJECTED (Layer 1: Canva)", "survey_number": "Survey No. 56/3", "owner_name": "Meera Iyer"},
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Wrote {len(files)} PDFs to ./{OUT_DIR}/\n")
    for name, m in manifest.items():
        print(f"{name:28} survey={m['survey_number']!r:22} owner={m['owner_name']!r:22} -> {m['expect']}")


if __name__ == "__main__":
    main()