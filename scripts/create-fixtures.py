"""Self-authored PDF fixtures. No font files, raster scans, or external assets."""
from pathlib import Path
import zlib, math
from reportlab.pdfbase.pdfmetrics import stringWidth
root=Path(__file__).resolve().parents[1]
class PDF:
 def __init__(self): self.objects=[b'',b''];self.pages=[]
 def add(self,s): self.objects.append(s.encode('ascii') if isinstance(s,str) else s);return len(self.objects)
 def stream(self,s,extra=''):
  b=zlib.compress(s.encode('ascii'));return self.add(f'<< /Length {len(b)} /Filter /FlateDecode {extra} >>\nstream\n'.encode()+b+b'\nendstream')
 def finish(self,ocgs):
  self.objects[0]=f'<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [{" ".join(f"{n} 0 R" for n in ocgs)}] /D << /Order [{" ".join(f"{n} 0 R" for n in ocgs)}] /ON [{" ".join(f"{n} 0 R" for n in ocgs)}] >> >> >>'.encode()
  self.objects[1]=f'<< /Type /Pages /Kids [{" ".join(f"{n} 0 R" for n in self.pages)}] /Count {len(self.pages)} >>'.encode()
  data=b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';offsets=[0]
  for i,obj in enumerate(self.objects,1):offsets.append(len(data));data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
  start=len(data);data+=f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
  data+=b''.join(f'{n:010d} 00000 n \n'.encode() for n in offsets[1:]);data+=f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode();return data
class Draw:
 def __init__(self):self.out=[]
 def raw(self,s):self.out.append(s)
 def color(self,rgb):self.raw(' '.join(f'{x/255:.5f}' for x in rgb)+' RG');self.raw(' '.join(f'{x/255:.5f}' for x in rgb)+' rg')
 def width(self,w):self.raw(f'{w} w')
 def line(self,a,b):self.raw(f'{a[0]} {a[1]} m {b[0]} {b[1]} l S')
 def poly(self,p,close=False,fill=False):self.raw(f'{p[0][0]} {p[0][1]} m '+' '.join(f'{x} {y} l' for x,y in p[1:])+(' h' if close else '')+(' f' if fill else ' S'))
 def rect(self,x,y,w,h,fill=False):self.raw(f'{x} {y} {w} {h} re '+('f' if fill else 'S'))
 def circle(self,x,y,r,fill=False):
  k=r*.5522847498307936;self.raw(f'{x+r} {y} m {x+r} {y+k} {x+k} {y+r} {x} {y+r} c {x-k} {y+r} {x-r} {y+k} {x-r} {y} c {x-r} {y-k} {x-k} {y-r} {x} {y-r} c {x+k} {y-r} {x+r} {y-k} {x+r} {y} c h '+('f' if fill else 'S'))
 def text(self,x,y,text,size=8,bold=False,angle=0):
  a=math.radians(angle);text=text.replace('\\','\\\\').replace('(','\\(').replace(')','\\)');self.raw(f'BT /F{2 if bold else 1} {size} Tf {math.cos(a)} {math.sin(a)} {-math.sin(a)} {math.cos(a)} {x} {y} Tm ({text}) Tj ET')
 def layer(self,n):self.raw(f'/OC /L{n} BDC')
 def end(self):self.raw('EMC')
 def form(self,x,y,angle=0,s=1):a=math.radians(angle);self.raw(f'q {s*math.cos(a):.9f} {s*math.sin(a):.9f} {-s*math.sin(a):.9f} {s*math.cos(a):.9f} {x} {y} cm /Valve Do Q')
 def dim(self,a,b,y,label):
  self.line((a,y-10),(a,y+6));self.line((b,y-10),(b,y+6));self.line((a,y),(b,y));self.poly([(a,y),(a+6,y+2),(a+6,y-2)],True,True);self.poly([(b,y),(b-6,y+2),(b-6,y-2)],True,True);w=stringWidth(label,'Helvetica',8);self.text((a+b-w)/2,y+5,label)
 def __str__(self):return '\n'.join(self.out)
pdf=PDF();font=pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');bold=pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
ocgs=[pdf.add(f'<< /Type /OCG /Name ({name}) >>') for name in ['A-SHEET','P-EQUIPMENT','P-PIPEWORK','I-INSTRUMENTS','A-ANNOTATION','H-HATCH']]
f=Draw();f.width(.9);f.poly([(-8,-5),(8,5),(8,-5),(-8,5)],True);f.line((0,0),(0,10));f.line((-4,10),(4,10));valve=pdf.stream(str(f),'/Type /XObject /Subtype /Form /BBox [-9 -6 9 11] /Resources << >>')
resources=f'<< /Font << /F1 {font} 0 R /F2 {bold} 0 R >> /XObject << /Valve {valve} 0 R >> /Properties << '+ ' '.join(f'/L{i} {v} 0 R' for i,v in enumerate(ocgs))+' >> >>'
d=Draw();d.layer(0);d.color((30,45,60));d.width(.6);d.rect(24,24,794,547);d.line((24,520),(818,520));d.text(42,546,'NORTHLINE  /  PROCESS ENGINEERING',11,True);d.text(42,531,'COOLING WATER DISTRIBUTION  -  PROCESS & INSTRUMENTATION DIAGRAM',7.5);d.text(688,546,'P&ID  /  CW-104',10,True);d.text(698,531,'ISSUE FOR REVIEW     REV C',7);d.line((24,103),(818,103));d.line((550,24),(550,103));d.line((676,24),(676,103));d.line((550,63),(818,63));d.text(42,82,'DRAWING NOTES',8,True)
for i,t in enumerate(['1. All dimensions in millimetres unless noted otherwise.','2. Verify equipment and line tags against the approved schedule.','3. Vector source fixture: layers, reusable forms, text and cubic paths.']):d.text(42,68-i*12,t,7)
d.text(561,86,'DRAWING NUMBER',6);d.text(561,72,'NL-CW-104-PID',11,True);d.text(561,49,'SCALE',6);d.text(561,35,'NTS',9,True);d.text(688,86,'REVISION',6);d.text(688,72,'C  /  18 SEP 2026',10,True);d.text(688,49,'SHEET',6);d.text(688,35,'01 OF 02',9,True);d.end()
d.layer(1);d.color((27,68,89));d.width(1.4)
# Vessel TK-101
x,y,w,h=104,207,110,177;d.raw(f'{x} {y+17} m {x} {y} {x+w} {y} {x+w} {y+17} c {x+w} {y+h-17} l {x+w} {y+h} {x} {y+h} {x} {y+h-17} c h S');d.line((116,208),(110,188));d.line((203,208),(209,188));d.line((101,188),(218,188))
# Pumps and equipment
for py in (292,202):
 d.circle(354,py,21);d.poly([(341,py-15),(370,py),(341,py+15)],True);d.line((342,py-19),(338,py-32));d.line((366,py-19),(370,py-32));d.line((331,py-32),(377,py-32))
d.rect(607,240,66,135);d.circle(640,307,21);d.raw('615 299 m 625 331 655 282 665 314 c S');d.line((617,240),(617,220));d.line((663,240),(663,220));d.line((605,220),(675,220));d.end()
d.layer(2);d.color((28,103,124));d.width(1.6);d.poly([(55,360),(104,360)]);d.poly([(214,290),(266,290),(266,292),(333,292)]);d.poly([(266,290),(266,202),(333,202)]);d.poly([(375,292),(475,292),(475,307),(607,307)]);d.poly([(375,202),(475,202),(475,292)]);d.poly([(673,307),(758,307),(758,423),(166,423),(166,384)])
for x,y,tag in [(293,292,'V-101'),(414,292,'V-102'),(293,202,'V-103'),(414,202,'V-104'),(560,307,'V-105'),(714,307,'V-106')]:d.form(x,y)
for x,y in [(77,360),(527,307),(709,423)]:d.poly([(x-5,y-3),(x+2,y),(x-5,y+3)],True,True)
d.end()
d.layer(3);d.color((141,91,52));d.width(.65);d.raw('[5 2 1 2] 0 d');d.line((159,211),(159,388));d.line((94,296),(224,296));d.raw('[] 0 d')
for x,y,name,num in [(235,354,'LT','101'),(511,365,'PT','101'),(722,367,'TT','101')]:
 d.circle(x,y,13);d.line((x-13,y),(x+13,y));d.text(x-6,y+3,name,7);d.text(x-6,y-9,num,7);d.raw('[3 2] 0 d');d.line((x,y-13),(x,307 if x>400 else 290));d.raw('[] 0 d')
d.end()
d.layer(4);d.color((42,53,64));d.width(.5)
for x,y,tag in [(293,292,'V-101'),(414,292,'V-102'),(293,202,'V-103'),(414,202,'V-104'),(560,307,'V-105'),(714,307,'V-106')]:d.text(x-12,y+16,tag,7)
for x,y,t in [(140,315,'TK-101'),(333,327,'P-101 A'),(333,237,'P-101 B'),(621,394,'HX-101')]:d.text(x,y,t,10,True)
d.text(131,275,'BUFFER TANK',7.5);d.text(136,261,'CAP.  2.5 m3',7);d.text(597,408,'PLATE HEAT EXCHANGER',7);d.text(59,371,'MAKE-UP',7);d.text(279,459,'CW SUPPLY HEADER  /  DN 100  /  6.0 bar',9,True);d.text(497,282,'100-CW-104-A1',7);d.text(560,436,'80-CW-105-A1',7);d.text(65,135,'DESIGN PRESSURE   10 bar     /     OPERATING TEMP.   12-18 C',7)
d.dim(104,214,164,'110');d.dim(333,475,145,'142');d.end()
d.layer(5);d.color((105,127,133));d.width(.35)
for i in range(12):d.line((118+i*7,244),(125+i*7,250))
d.end()
content=pdf.stream(str(d));page=pdf.add(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources {resources} /Contents {content} 0 R >>');pdf.pages.append(page)
# Dedicated vector-feature sheet: clipping, fills with islands, affine text, dash and forms.
e=Draw();e.layer(0);e.color((35,50,65));e.width(.7);e.rect(24,24,794,547);e.text(42,542,'VECTOR CONVERSION  /  FEATURE VALIDATION',14,True);e.text(42,523,'Original authored test sheet. Includes curves, clips, fill rules, layers, forms, text and patterns.',8);e.end()
e.layer(1);e.color((28,103,124));e.width(1.1)
for x,y in [(160,414),(380,414),(600,414)]:e.circle(x,y,48)
e.text(98,345,'CUBIC CIRCLE: EXACT SPLINES',8);e.text(320,345,'CLIPPED CUBIC PATH',8);e.text(548,345,'NONZERO / EVEN-ODD FILL',8)
e.raw('q 334 378 85 74 re W n 302 378 m 361 541 430 263 470 449 c S Q')
e.raw('q 0.14 0.45 0.53 rg 570 388 60 52 re 587 401 26 26 re f* Q');e.circle(743,283,15,fill=True);e.text(716,256,'CUBIC FILL',7);e.end()
e.layer(4);e.color((50,60,70));e.text(64,254,'Editable PDF text',18,True);e.text(64,229,'TJ spacing / font metrics / source IDs',9);e.text(333,212,'ROTATED TEXT',12,angle=23);e.raw('BT /F1 12 Tf 1 0.2 0.3 1 530 222 Tm (AFFINE TEXT) Tj ET');e.text(65,172,'FORM XOBJECTS',8,True)
for i in range(8):e.form(86+i*70,141,angle=(i%2)*90,s=1.5)
e.text(42,65,'NO OCR   /   NO RASTER TRACING   /   SOURCE PROVENANCE RETAINED',8,True);e.text(705,42,'SHEET 02 OF 02',8);e.end()
content=pdf.stream(str(e));page=pdf.add(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources {resources} /Contents {content} 0 R >>');pdf.pages.append(page)
(root/'assets'/'cooling-water.pdf').write_bytes(pdf.finish(ocgs))
print('Created vector PDF:',(root/'assets'/'cooling-water.pdf').stat().st_size)
# Independent source rendering (for visual QA only, never used by the conversion pipeline).
import fitz
source=fitz.open(root/'assets'/'cooling-water.pdf')
for i,page in enumerate(source):page.get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save(str(root/'artifacts'/f'source-page-{i+1}.png'))
