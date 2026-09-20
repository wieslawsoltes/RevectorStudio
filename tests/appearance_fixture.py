"""Authored PDF stress paints; no third-party font files or proprietary fixtures."""
from pathlib import Path
import zlib

def fixture():
 def stream(d,data):return d+b' /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream'
 # Fixed object references keep the fixture independently inspectable.
 objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R 14 0 R] /Count 2 >>']
 resources=b'/Resources << /ExtGState << /Mul << /BM /Multiply /ca .7 >> /Mask << /SMask << /S /Luminosity /G 6 0 R >> >> /Transfer << /TR 10 0 R >> >> /XObject << /Stencil 8 0 R /Group 7 0 R /Image 12 0 R >> /Shading << /Gradient 5 0 R >> /Font << /F1 9 0 R /T3 11 0 R >> >>'
 objects.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320.25 240.25] '+resources+b' /Contents 4 0 R >>')
 ops=b'''q .93 .94 .96 rg 0 0 320 240 re f Q
q .1 .55 .8 rg 15 135 120 90 re f /Mul gs .8 .2 .3 rg 60 155 120 50 re f Q
q 20 20 120 85 re W n /Gradient sh Q
q /Mask gs .1 .7 .4 rg 155 135 140 80 re f Q
q 70 0 0 70 165 35 cm .5 .15 .7 rg /Stencil Do Q
q 1 0 0 1 230 20 cm /Group Do Q
q BT /F1 30 Tf 7 Tr 1 0 0 1 15 110 Tm (MASK) Tj ET .05 .2 .8 rg 0 90 145 38 re f Q
q BT /T3 30 Tf 1 0 0 1 280 100 Tm (A) Tj ET Q
q /Transfer gs 30 0 0 30 275 160 cm /Image Do Q
q .7 0 .8 RG 1.5 w 10 10 m 310 230 l S Q
'''
 objects.append(stream(b'<<',ops))
 objects.append(b'<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [20 20 135 100] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 .15 .2] /C1 [.1 .2 1] /N 1 >> /Extend [true true] >>')
 mask=b'q 0 g 0 0 320 240 re f 1 g 170 135 45 80 re f .5 g 215 135 80 80 re f Q'
 objects.append(stream(b'<< /Type /XObject /Subtype /Form /BBox [0 0 320 240] /Group << /S /Transparency /CS /DeviceGray /I true >> /Resources << >>',mask))
 group=b'q .1 .5 .8 rg 0 0 40 70 re f /Blend gs 1 .3 .1 rg 15 10 40 70 re f Q'
 objects.append(stream(b'<< /Type /XObject /Subtype /Form /BBox [0 0 70 90] /Group << /S /Transparency /I true /K true >> /Resources << /ExtGState << /Blend << /BM /Screen /ca .6 >> >> >>',group))
 objects.append(stream(b'<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ImageMask true /BitsPerComponent 1 /Decode [1 0]',bytes([0x81,0x42,0x24,0x18,0x18,0x24,0x42,0x81])))
 objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
 objects.append(stream(b'<< /FunctionType 4 /Domain [0 1] /Range [0 1]',b'{ 1 exch sub }'))
 objects.append(b'<< /Type /Font /Subtype /Type3 /FontBBox [0 0 700 700] /FontMatrix [.001 0 0 .001 0 0] /CharProcs << /A 13 0 R >> /Encoding << /Type /Encoding /Differences [65 /A] >> /FirstChar 65 /LastChar 65 /Widths [700] /Resources << >> >>')
 objects.append(stream(b'<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8',bytes([220,50,30,30,200,80,20,70,180,160,60,200])))
 objects.append(stream(b'<<',b'700 0 0 0 700 700 d1 0 0 m 350 700 l 700 0 l h f'))
 objects.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320.25 240.25] /CropBox [10.25 10.25 310.25 230.25] /Rotate 90 /UserUnit 2 '+resources+b' /Contents 4 0 R >>')
 out=bytearray(b'%PDF-1.7\n');offsets=[0]
 for i,data in enumerate(objects,1):offsets.append(len(out));out.extend(f'{i} 0 obj\n'.encode()+data+b'\nendobj\n')
 start=len(out);out.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
 for offset in offsets[1:]:out.extend(f'{offset:010} 00000 n \n'.encode())
 out.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode());return bytes(out)
if __name__=='__main__':
 p=Path('assets/appearance-stress.pdf');p.write_bytes(fixture())
