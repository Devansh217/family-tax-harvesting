"""Writes a tiny unencrypted PDF whose text mimics a CAMS detailed CAS, for testing the PDF reader. Usage: python3 make-test-pdf.py out.pdf"""
import sys

lines = [
    "Consolidated Account Statement",
    "CAMS",
    "Folio No: 1234567 / 89   PAN: ABCDE1234F",
    "PPFAS-Parag Parikh Flexi Cap Fund - Direct Plan Growth - ISIN: INF879O01027(Advisor: DIRECT)  Registrar : CAMS",
    "Opening Unit Balance: 0.000",
    "10-Jan-2022    Purchase - via Internet    10,000.00    200.000    50.0000    200.000",
    "10-Jan-2022    *** Stamp Duty ***    0.50",
    "15-Feb-2023    Systematic Investment Purchase    5,000.00    100.000    50.0000    300.000",
    "20-Jun-2026    Redemption    (4,000.00)    (50.000)    80.0000    250.000",
    "Closing Unit Balance: 250.000   NAV on 13-Nov-2026: INR 85.1234   Total Cost Value: 12,500.00",
]
esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
ops = ["BT", "/F1 9 Tf", "40 800 Td", "14 TL"]
for l in lines:
    ops.append(f"({esc(l)}) Tj T*")
ops.append("ET")
stream = "\n".join(ops).encode("latin-1")
objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
out = bytearray(b"%PDF-1.4\n")
offsets = []
for i, o in enumerate(objs, 1):
    offsets.append(len(out))
    out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
xref = len(out)
out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
for off in offsets:
    out += b"%010d 00000 n \n" % off
out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
open(sys.argv[1], "wb").write(out)
