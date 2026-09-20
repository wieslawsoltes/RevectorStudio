"""Small authored PDF: RGB + intrinsic alpha, repeated/mirrored/sheared placement,
constant alpha, clipping, vector occlusion, rotation, CropBox and UserUnit.
No text or font programs are embedded in this fixture.
"""
from pathlib import Path
import zlib

def fixture():
    objects=[]
    def obj(b): objects.append(b);return len(objects)
    def stream(dictionary,data):return dictionary+b' /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream'
    obj(b'<< /Type /Catalog /Pages 2 0 R >>')
    obj(b'<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>')
    page=b' /MediaBox [0 0 360 260] /Resources << /XObject << /Im0 5 0 R >> /ExtGState << /A << /ca .5 >> >> >> /Contents 4 0 R '
    obj(b'<< /Type /Page /Parent 2 0 R'+page+b' >>')
    content=b'''q 80 0 0 80 20 150 cm /Im0 Do Q
q -80 0 0 80 200 150 cm /Im0 Do Q
q 70 15 20 70 245 150 cm /Im0 Do Q
q 20 30 50 60 re W n /A gs 80 0 0 80 20 20 cm /Im0 Do Q
q 1 0 1 RG 3 w 20 180 m 100 180 l S Q
'''
    obj(stream(b'<<',content))
    colors=[(180,25,35),(20,150,60),(25,65,200),(230,155,20)]
    rgb=bytes(v for y in range(16) for x in range(16) for v in colors[(y//8)*2+x//8])
    obj(stream(b'<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /BitsPerComponent 8 /ColorSpace /DeviceRGB /SMask 6 0 R /Filter /FlateDecode',zlib.compress(rgb)))
    alpha=bytes(128 if x>=8 and y>=8 else 255 for y in range(16) for x in range(16))
    obj(stream(b'<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /FlateDecode',zlib.compress(alpha)))
    obj(b'<< /Producer (Revector regression fixture) >>')
    obj(b'<< /Type /Page /Parent 2 0 R'+page+b'/CropBox [10 10 350 250] /Rotate 90 /UserUnit 2 >>')
    out=bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');offsets=[0]
    for i,b in enumerate(objects,1):offsets.append(len(out));out.extend(f'{i} 0 obj\n'.encode()+b+b'\nendobj\n')
    offset=len(out);out.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for value in offsets[1:]:out.extend(f'{value:010} 00000 n \n'.encode())
    out.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R /Info 7 0 R >>\nstartxref\n{offset}\n%%EOF\n'.encode());return bytes(out)
if __name__=='__main__':
    import sys
    p=Path(sys.argv[1] if len(sys.argv)>1 else 'assets/raster-placement.pdf');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(fixture())

def profile_fixture():
    """Raster ICCBased RGB, DeviceCMYK and explicit interpolation test paints."""
    from PIL import ImageCms
    profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    def stream(dictionary,data):return dictionary+b' /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
     b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources << /XObject << /ICC 5 0 R /CMYK 7 0 R /INTERPOLATE 8 0 R >> >> /Contents 4 0 R >>',
     stream(b'<<',b'q 80 0 0 80 10 10 cm /ICC Do Q q 80 0 0 80 110 10 cm /CMYK Do Q q 80 0 0 80 210 10 cm /INTERPOLATE Do Q'),
     stream(b'<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace [/ICCBased 6 0 R] /BitsPerComponent 8 /Filter /FlateDecode',zlib.compress(bytes([4,18,64,120,45,200,200,60,23,30,170,65]))),
     stream(b'<< /N 3 /Alternate /DeviceRGB',profile),
     stream(b'<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /FlateDecode',zlib.compress(bytes([255,0,0,0,0,255,0,0,0,0,255,0,0,0,0,200]))),
     stream(b'<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /Interpolate true /BitsPerComponent 8 /Filter /FlateDecode',zlib.compress(bytes([255,0,0,0,255,0,0,0,255,255,255,0])))]
    out=bytearray(b'%PDF-1.7\n');offsets=[0]
    for i,data in enumerate(objects,1):offsets.append(len(out));out.extend(f'{i} 0 obj\n'.encode()+data+b'\nendobj\n')
    start=len(out);out.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:out.extend(f'{offset:010} 00000 n \n'.encode())
    out.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode());return bytes(out)
