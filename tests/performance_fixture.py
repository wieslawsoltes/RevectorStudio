"""Authored vector stress PDFs; deterministic streams, no OCR and no external fonts."""
from pathlib import Path
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
def build(target: Path) -> None:
    with pymupdf.open() as pdf:
        page=pdf.new_page(width=1200,height=800)
        font=page.insert_font(fontname='helv')
        stream=['0.0941176471 0.4039215686 0.5921568627 RG','0.3 w']
        for i in range(400):
            x=10+(i%40)*28;y=10+(i//40)*35
            stream.extend([f'{x} {y} m {x+8} {y} l S',f'{x+8} {y} m {x+8} {y+7+i%3} l S'])
        xref=pdf.get_new_xref();pdf.update_object(xref,'<<>>');pdf.update_stream(xref,'\n'.join(stream).encode());page.set_contents(xref)
        page=pdf.new_page(width=1200,height=800)
        page.insert_font(fontname='helv')
        stream=['0.05 0.08 0.11 rg','BT /helv 8 Tf']
        for i in range(800):
            x=10+(i%20)*58;y=10+(i//20)*19
            stream.append(f'1 0 0 1 {x} {y} Tm (TAG-{i:04}) Tj')
        stream.extend(['ET','0.2 0.4 0.6 rg'])
        for i in range(320):
            x=5+(i%40)*29;y=5+(i//40)*90
            stream.append(f'{x} {y} 2 2 re')
        stream.append('f')
        xref=pdf.get_new_xref();pdf.update_object(xref,'<<>>');pdf.update_stream(xref,'\n'.join(stream).encode());page.set_contents(xref)
        target.parent.mkdir(parents=True,exist_ok=True);pdf.save(target,garbage=4,deflate=True,no_new_id=True)
if __name__=='__main__':build(ROOT/'assets/performance-stress.pdf')
