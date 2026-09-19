"""Author deterministic color-space and mixed raster/native PDF fixtures; no OCR is used here."""
from pathlib import Path
import json, zlib
from PIL import Image, ImageDraw, ImageFont, ImageCms
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/extensions'; OUT.mkdir(parents=True,exist_ok=True)
class Pdf:
    def __init__(self): self.objects=[]
    def add(self,data): self.objects.append(data.encode() if isinstance(data,str) else data); return len(self.objects)
    def stream(self,data,extra=''):
        data=zlib.compress(data)
        return self.add(f'<< /Length {len(data)} /Filter /FlateDecode {extra} >>\nstream\n'.encode()+data+b'\nendstream')
    def save(self,path,root):
        data=bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offsets=[0]
        for i,obj in enumerate(self.objects,1):
            offsets.append(len(data)); data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
        at=len(data); data+=f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
        for n in offsets[1:]: data+=f'{n:010d} 00000 n \n'.encode()
        data+=f'trailer\n<< /Size {len(offsets)} /Root {root} 0 R >>\nstartxref\n{at}\n%%EOF\n'.encode()
        path.write_bytes(data)
def colors():
    pdf=Pdf(); root=pdf.add(''); pages=pdf.add('')
    # Generated sRGB ICC v2 profile. No proprietary printer profile is redistributed.
    icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    profile=pdf.stream(icc,'/N 3 /Alternate /DeviceRGB')
    tint=pdf.add('<< /FunctionType 2 /Domain [0 1] /C0 [1 1 1] /C1 [0.8 0.1 0.3] /N 1 >>')
    spaces=f'/IC [/ICCBased {profile} 0 R] /Cal [/CalRGB << /WhitePoint [0.95047 1 1.08883] /Gamma [2.2 2.2 2.2] /Matrix [0.4124564 0.2126729 0.0193339 0.3575761 0.7151522 0.119192 0.1804375 0.072175 0.9503041] >>] /Lab [/Lab << /WhitePoint [0.95047 1 1.08883] /Range [-128 127 -128 127] >>] /Spot [/Separation /TestInk /DeviceRGB {tint} 0 R]'
    swatches=[('near-black','0.0039215686 0 0 rg'),('navy','0.02 0.08 0.14 rg'),('RGB','0.2 0.7 0.4 rg'),('gray','0.25 g'),('CMYK cyan','1 0 0 0 k'),('CMYK composite','0.15 0.65 0.2 0.1 k'),('ICC RGB','/IC cs 0.23 0.44 0.78 scn'),('CalRGB','/Cal cs 0.23 0.44 0.78 scn'),('Lab','/Lab cs 55 35 -40 scn'),('Separation','/Spot cs 0.6 scn'),('Normal alpha','/A gs 0.1 0.2 0.8 rg')]
    commands=[]; expected=[]
    for i,(name,color) in enumerate(swatches):
        x=20+(i%4)*85; y=30+(i//4)*75
        commands.append(f'q {color} {x} {y} 65 50 re f Q')
        expected.append({'name':name,'point':[x+32,y+25]})
    content=pdf.stream('\n'.join(commands).encode())
    page=pdf.add(f'<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 360 270] /Resources << /ColorSpace << {spaces} >> /ExtGState << /A << /Type /ExtGState /ca 0.5 /CA 0.5 >> >> >> /Contents {content} 0 R >>')
    pdf.objects[pages-1]=f'<< /Type /Pages /Kids [{page} 0 R] /Count 1 >>'.encode();pdf.objects[root-1]=f'<< /Type /Catalog /Pages {pages} 0 R >>'.encode()
    pdf.save(OUT/'colors.pdf',root);(OUT/'colors.json').write_text(json.dumps(expected,indent=2)+'\n')
def raster():
    img=Image.new('RGB',(1440,1040),'white');d=ImageDraw.Draw(img)
    fonts=[Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf')]
    font=ImageFont.truetype(str(next(p for p in fonts if p.exists())),64)
    d.text((150,160),'PUMP P-101',font=font,fill=(20,40,70));d.text((150,320),'FLOW 120 L/MIN',font=font,fill=(20,40,70))
    d.rectangle((80,80,1360,960),outline=(0,0,0),width=6);d.line((80,560,1360,560),fill=(0,0,0),width=5)
    # Blank lower area receives native PDF text; OCR must not duplicate it.
    pdf=Pdf();root=pdf.add('');pages=pdf.add('');image=pdf.stream(img.tobytes(),'/Type /XObject /Subtype /Image /Width 1440 /Height 1040 /ColorSpace /DeviceRGB /BitsPerComponent 8');fontid=pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    content=pdf.stream(f'q 360 0 0 260 0 0 cm /Im Do Q\nBT /F 20 Tf 0 g 40 75 Td (NATIVE-42) Tj ET'.encode());kids=[]
    for rotation in [0,90]: kids.append(pdf.add(f'<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 360 260] /Rotate {rotation} /Resources << /XObject << /Im {image} 0 R >> /Font << /F {fontid} 0 R >> >> /Contents {content} 0 R >>'))
    pdf.objects[pages-1]=f'<< /Type /Pages /Kids [{" ".join(f"{p} 0 R" for p in kids)}] /Count 2 >>'.encode();pdf.objects[root-1]=f'<< /Type /Catalog /Pages {pages} 0 R >>'.encode();pdf.save(OUT/'raster.pdf',root)
colors();raster();print('Created ICC/CMYK/CalRGB/Lab/Separation/alpha and raster/native fixtures.')
