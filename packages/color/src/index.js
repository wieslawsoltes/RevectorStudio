/** RGB here is always display-referred sRGB bytes. Never infer [0,1] from magnitude:
 * [1,0,0] is a valid near-black color in PDF.js's normalized operator stream. */
export function normalizeRgb(value, { domain = 'byte' } = {}) {
    let a = value;
    if (typeof a === 'string') {
        if (/^#[\da-f]{6}$/i.test(a)) a = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
        else if (/^#[\da-f]{3}$/i.test(a)) a = [...a.slice(1)].map(x => parseInt(x + x, 16));
        else {
            const m = a.match(/^rgb\(\s*([\d.]+)(%)?[ ,]+([\d.]+)(%)?[ ,]+([\d.]+)(%)?\s*\)$/i);
            if (!m) throw new TypeError('Unsupported RGB syntax: ' + a);
            a = [1, 3, 5].map(i => Number(m[i]) * (m[i + 1] ? 2.55 : 1));
        }
    } else if (domain === 'unit') a = Array.from(a || [], x => x * 255);
    if ((!Array.isArray(a) && !ArrayBuffer.isView(a)) || a.length !== 3 || !Array.from(a).every(Number.isFinite)) throw new TypeError('Expected three finite RGB components');
    return Array.from(a, x => Math.round(Math.max(0, Math.min(255, x))));
}
export function displayColor(rgb, mode = 'faithful') {
    const c = normalizeRgb(rgb || [0, 0, 0]);
    if (!['faithful', 'contrast'].includes(mode)) throw new RangeError('Unknown color presentation mode');
    const out = mode === 'contrast' && c.reduce((a,b) => a+b, 0) < 420 ? c.map(v => Math.min(255, Math.round(135 + v * .65))) : c;
    return `rgb(${out.join(' ')})`;
}
export function srgbToLab(rgb) {
    const [r,g,b] = normalizeRgb(rgb).map(x => (x /= 255) <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const x = f((.4124564*r+.3575761*g+.1804375*b)/.95047), y = f(.2126729*r+.7151522*g+.072175*b), z = f((.0193339*r+.119192*g+.9503041*b)/1.08883);
    return [116*y-16,500*(x-y),200*(y-z)];
}
/** CIEDE2000 with unit parametric weights; inputs are CIE Lab under the same white. */
export function deltaE2000(a, b) {
    const [l1,a1,b1]=a,[l2,a2,b2]=b, rad=Math.PI/180, pow=x=>x**7;
    const cbar=(Math.hypot(a1,b1)+Math.hypot(a2,b2))/2, g=.5*(1-Math.sqrt(pow(cbar)/(pow(cbar)+25**7)));
    const ap1=(1+g)*a1, ap2=(1+g)*a2, c1=Math.hypot(ap1,b1),c2=Math.hypot(ap2,b2);
    const hue=(x,y)=>(Math.atan2(y,x)/rad+360)%360,h1=hue(ap1,b1),h2=hue(ap2,b2);
    let dh=h2-h1;if(c1*c2===0)dh=0;else if(dh>180)dh-=360;else if(dh< -180)dh+=360;
    const dl=l2-l1,dc=c2-c1,dH=2*Math.sqrt(c1*c2)*Math.sin(dh*rad/2),lm=(l1+l2)/2,cm=(c1+c2)/2;
    const hm=c1*c2===0?h1+h2:Math.abs(h1-h2)<=180?(h1+h2)/2:(h1+h2+(h1+h2<360?360:-360))/2;
    const t=1-.17*Math.cos((hm-30)*rad)+.24*Math.cos(2*hm*rad)+.32*Math.cos((3*hm+6)*rad)-.20*Math.cos((4*hm-63)*rad);
    const sl=1+.015*(lm-50)**2/Math.sqrt(20+(lm-50)**2),sc=1+.045*cm,sh=1+.015*cm*t;
    const rt=-2*Math.sqrt(pow(cm)/(pow(cm)+25**7))*Math.sin(60*Math.exp(-(((hm-275)/25)**2))*rad);
    const x=dl/sl,y=dc/sc,z=dH/sh;return Math.sqrt(Math.max(0,x*x+y*y+z*z+rt*y*z));
}
/** Audit explicit entity paint values, including missing counterparts and alpha.
 * Quantization is reported, never repaired by altering the preview or applying ICC twice.
 * This is not a compositing/overprint proof and does not resolve BYBLOCK inheritance. */
export function auditColors(original, preview, { maxSamples = 32 } = {}) {
    if(!Number.isInteger(maxSamples)||maxSamples<0||maxSamples>4096)throw new RangeError('Invalid color audit sample budget');
    const all = d => [...d.entities,...d.blocks.flatMap(b=>b.entities)].flatMap(e=>[e,...(e.attributes||[])]);
    const targets = new Map(all(preview).map(e=>[e.id,e]));
    let compared=0,changed=0,missing=0,invalid=0,unresolved=0,maxDeltaE=0,maxChannelError=0,opacityCompared=0,opacityChanged=0,maxOpacityError=0;
    const samples=[],sample=value=>{if(samples.length<maxSamples)samples.push(value);};
    const valid=c=>(Array.isArray(c)||ArrayBuffer.isView(c))&&c.length===3&&Array.from(c).every(v=>Number.isFinite(v)&&v>=0&&v<=255);
    let rasterImages=0;
    for (const e of all(original)) {
        if(e.type==='IMAGE'){rasterImages++;continue;}
        const target=targets.get(e.id);
        if(!target){missing++;sample({id:e.id,reason:'missing-exported-entity'});continue;}
        if(e.color==null){unresolved++;sample({id:e.id,reason:'inherited-color-not-audited'});}
        else if(!valid(e.color)||!valid(target.color)){invalid++;sample({id:e.id,reason:'missing-or-invalid-rgb'});}
        else{
            const a=normalizeRgb(e.color),b=normalizeRgb(target.color),error=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));compared++;
            maxChannelError=Math.max(maxChannelError,error);
            if(error){changed++;const deltaE=deltaE2000(srgbToLab(a),srgbToLab(b));maxDeltaE=Math.max(maxDeltaE,deltaE);sample({id:e.id,reason:'rgb-quantization-or-change',source:a,exported:b,deltaE2000:deltaE});}
        }
        const a=e.opacity??1,b=target.opacity??1;
        if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>1||b<0||b>1){invalid++;sample({id:e.id,reason:'invalid-opacity'});continue;}
        opacityCompared++;const error=Math.abs(a-b);maxOpacityError=Math.max(maxOpacityError,error);
        if(error>1e-12){opacityChanged++;sample({id:e.id,reason:'opacity-quantization-or-loss',sourceOpacity:a,exportedOpacity:b,error});}
    }
    const complete=rasterImages===0&&missing===0&&invalid===0&&unresolved===0,rgbExact=complete&&changed===0,opacityExact=opacityChanged===0&&missing===0&&invalid===0;
    return {rasterImages, imagePixelsAudited:false, space:'sRGB',metric:'CIEDE2000 / D65',compared,changed,missing,invalid,unresolved,complete,rgbExact,
        maxChannelError,maxDeltaE,opacityCompared,opacityChanged,maxOpacityError,opacityExact,samples,exact:rgbExact&&opacityExact,
        profilePolicy:'PDF.js resolves supported source color spaces once; DXF receives RGB, not embedded ICC profiles.',
        scope:'Explicit entity RGB and opacity; not a proof of PDF blend modes, overprint, image profiles, or inherited CAD colors.'};
}
