import { createDocument, diagnostic } from '@revector/model';
import { near, distance } from '@revector/geometry';
import { ACI } from './aci.js';
export const decodeDxfString = s => String(s).replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, v) => String.fromCharCode(parseInt(v, 16)));
function* pairs(text, maxPairs) {
    let offset=text.charCodeAt(0)===0xFEFF?1:0, lineNumber=1, count=0;
    const readLine=()=>{const end=text.indexOf('\n',offset);let value;
        if(end<0){value=text.slice(offset);offset=text.length;}
        else{value=text.slice(offset,end>offset&&text.charCodeAt(end-1)===13?end-1:end);offset=end+1;}
        return value;
    };
    while(offset<text.length) {
        const codeText=readLine();
        if(offset>=text.length)throw new Error('DXF group/value line count is odd');
        const value=readLine();
        if(++count>maxPairs)throw new RangeError('DXF pair budget exceeded');
        const code=Number(codeText.trim());
        if(!Number.isInteger(code)||code<0||code>1071)throw new Error(`Invalid DXF group code on line ${lineNumber}`);
        yield [code,value];lineNumber+=2;
    }
}
function records(data) {
    const out = [];
    for (const p of data) {
        if (p[0] === 0)
            out.push({ type: p[1].trim(), tags: [] });
        else if (out.length)
            out.at(-1).tags.push(p);
    }
    return out;
}
function get(r, code, def) {
    // Most records ask for dozens of distinct tags. Index first occurrences once;
    // repeated point/edge codes remain in tags for ordered multi-value decoding.
    let values = r.firstValues;
    if (!values) {
        values = r.firstValues = new Map();
        for (const [c,v] of r.tags) if (!values.has(c)) values.set(c,v);
    }
    return values.get(code) ?? def;
}
const n = (r, c, d = 0) => Number(get(r, c, d));
const p = (r, c, d = [0, 0]) => [n(r, c, d[0]), n(r, c + 10, d[1])];
function readColor(r, layer) {
    const color = n(r, 420, -1);
    if (color >= 0)
        return [color >>> 16 & 255, color >>> 8 & 255, color & 255];
    const index = Math.abs(n(r, 62, 256));
    if (index === 256 || index === 0)
        return layer?.color || [0, 0, 0];
    const c = ACI[index] ?? 0;
    return [c >>> 16 & 255, c >>> 8 & 255, c & 255];
}
function parseXdata(r) {
    const index = r.tags.findIndex(t => t[0] === 1001 && t[1] === 'REVECTOR');
    if (index < 0)
        return null;
    let json = '';
    for (let i = index + 1; i < r.tags.length && r.tags[i][0] !== 1001; i++)
        if (r.tags[i][0] === 1000)
            json += decodeDxfString(r.tags[i][1]);
    try {
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
function points(r, code) {
    const out = [];
    for (let i = 0; i < r.tags.length; i++)
        if (r.tags[i][0] === code) {
            const q = [Number(r.tags[i][1]), 0];
            for (let j = i + 1; j < r.tags.length && r.tags[j][0] !== code; j++)
                if (r.tags[j][0] === code + 10) {
                    q[1] = Number(r.tags[j][1]);
                    break;
                }
            out.push(q);
        }
    return out;
}
function readHatch(r) {
    const tags = r.tags;
    let i = tags.findIndex(t => t[0] === 91), count = Number(tags[i++][1]);
    const paths = [];
    function take(c) {
        if (tags[i]?.[0] !== c)
            throw new Error(`HATCH expected code ${c}, got ${tags[i]?.[0]}`);
        return Number(tags[i++][1]);
    }
    function point(c) { return [take(c), take(c + 10)]; }
    for (let k = 0; k < count; k++) {
        const flags = take(92);
        if (flags & 2) {
            const bulge = take(72), closed = take(73), num = take(93), ps = [];
            for (let j = 0; j < num; j++) {
                ps.push(point(10));
                if (bulge && tags[i]?.[0] === 42)
                    take(42);
            }
            const refs = take(97);
            i += refs;
            paths.push({ start: ps[0], segments: ps.slice(1).map(to => ({ kind: 'L', to })), closed: !!closed });
        }
        else {
            const edgeCount = take(93);
            let start = null, segments = [];
            for (let j = 0; j < edgeCount; j++) {
                const type = take(72);
                if (type === 1) {
                    const a = point(10), b = point(11);
                    if (!start)
                        start = a;
                    segments.push({ kind: 'L', to: b });
                }
                else if (type === 4) {
                    const degree = take(94), rational = take(73);
                    take(74);
                    const nk = take(95), np = take(96), knots = [], ps = [];
                    for (let z = 0; z < nk; z++)
                        knots.push(take(40));
                    for (let z = 0; z < np; z++) {
                        ps.push(point(10));
                        if (rational && tags[i]?.[0] === 42)
                            take(42);
                    }
                    const fit = take(97);
                    for (let z = 0; z < fit; z++)
                        point(11);
                    if (fit) {
                        if (tags[i]?.[0] === 12)
                            point(12);
                        if (tags[i]?.[0] === 13)
                            point(13);
                    }
                    if (degree !== 3 || ps.length !== 4)
                        throw Error('DXF preview only accepts cubic HATCH spline edges emitted by this writer');
                    if (!start)
                        start = ps[0];
                    segments.push({ kind: 'C', c1: ps[1], c2: ps[2], to: ps[3] });
                }
                else
                    throw Error(`Unsupported HATCH edge type ${type}`);
            }
            const refs = take(97);
            i += refs;
            paths.push({ start, segments, closed: true });
        }
    }
    return paths;
}
/** Reads the writer's complete entity subset. It is not advertised as a universal DXF importer. */
export function readDxf(text, { maxPairs = 10000000 } = {}) {
    const iterator=pairs(text,maxPairs),sections=new Map();
    let name=null,last=null;
    for(const pair of iterator) {
        const [c,v]=pair;last=pair;
        if(c===0&&v==='SECTION') {
            const next=iterator.next();
            if(next.done||next.value[0]!==2)throw Error('DXF SECTION has no name');
            last=next.value;name=next.value[1];sections.set(name,[]);
        } else if(c===0&&v==='ENDSEC')name=null;
        else if(name)sections.get(name).push(pair);
    }
    if(last?.[1]!=='EOF')throw Error('DXF has no EOF marker');
    const doc = createDocument({ name: 'DXF round trip', layers: [] });
    const header = sections.get('HEADER') || [];
    for (let i = 0; i < header.length; i++)
        if (header[i][0] === 9) {
            const key = header[i][1], value = header[i + 1]?.[1];
            if (key === '$ACADVER')
                doc.acadVersion = value;
            if (key === '$INSUNITS')
                doc.units = ({ 0: 'unitless', 1: 'in', 4: 'mm', 5: 'cm', 6: 'm' })[Number(value)] || 'unitless';
            if (key === '$LIMMAX')
                doc.pageBox = [0, 0, Number(header[i + 1][1]), Number(header[i + 2][1])];
        }
    const tables = records(sections.get('TABLES') || []), styles = new Map(), linetypes = new Map();
    for (const r of tables) {
        if (r.type === 'LAYER')
            doc.layers.push({ name: decodeDxfString(get(r, 2, '0')), color: readColor(r), visible: n(r, 62, 7) >= 0 });
        else if (r.type === 'STYLE')
            styles.set(get(r, 2, ''), get(r, 3, 'Arial'));
        else if (r.type === 'LTYPE')
            linetypes.set(get(r, 2, ''), r.tags.filter(t => t[0] === 49).map(t => Math.abs(Number(t[1]))));
    }
    if (!doc.layers.some(l => l.name === '0'))
        doc.layers.push({ name: '0', color: [0, 0, 0], visible: true });
    const layerIndex=new Map(doc.layers.map(l=>[l.name,l]));
    const imageDefs=new Map();
    for(const r of records(sections.get('OBJECTS')||[]))if(r.type==='IMAGEDEF') {
        const meta=parseXdata(r),a={id:meta?.id||'image-'+get(r,5,''),path:decodeDxfString(get(r,1,'')),
            width:n(r,10),height:n(r,20),mimeType:'image/png',source:meta?.source||{}};
        doc.assets.push(a);imageDefs.set(get(r,5,''),a);
    }
    let next = 0;
    function entity(r) {
        const layer = decodeDxfString(get(r, 8, '0')), l = layerIndex.get(layer), meta = parseXdata(r);
        const e = { id: meta?.id || `dxf-${++next}`, handle: get(r, 5, ''), type: r.type, layer, color: readColor(r, l), lineweight: Math.max(0, n(r, 370, 0)) / 100, opacity: get(r, 440, null) !== null ? (n(r, 440) & 255) / 255 : 1, dash: linetypes.get(get(r, 6, 'CONTINUOUS')) || [], source: meta?.source || {}, semantic: meta?.semantic || {} };
        switch (r.type) {
            case 'IMAGE': {
                const a=imageDefs.get(get(r,340,''));
                if(!a)throw Error('IMAGE references a missing IMAGEDEF');
                e.imageId=a.id;e.position=p(r,10);e.uPixel=p(r,11);e.vPixel=p(r,12);e.imageSize=p(r,13);
                if(n(r,280)||n(r,281,50)!==50||n(r,282,50)!==50||n(r,283,0)!==0||!(n(r,70,3)&1))
                    doc.diagnostics.push(diagnostic('IMAGE_DISPLAY_UNSUPPORTED','External DXF image clipping/brightness/visibility is outside the generated-image reader contract.','error',{id:e.id}));
                break;
            }
            case 'LINE':
                e.start = p(r, 10);
                e.end = p(r, 11);
                break;
            case 'LWPOLYLINE':
                e.points = points(r, 10);
                e.bulges = Array(e.points.length).fill(0);
                {
                    let i = -1;
                    for (const [c, v] of r.tags) {
                        if (c === 10)
                            i++;
                        if (c === 42 && i >= 0)
                            e.bulges[i] = Number(v);
                    }
                }
                e.closed = !!(n(r, 70) & 1);
                e.constantWidth = n(r, 43);
                break;
            case 'CIRCLE':
            case 'ARC':
                e.center = p(r, 10);
                e.radius = n(r, 40);
                if (r.type === 'ARC') {
                    e.startAngle = n(r, 50);
                    e.endAngle = n(r, 51);
                }
                break;
            case 'ELLIPSE':
                e.center = p(r, 10);
                e.major = p(r, 11);
                e.ratio = n(r, 40);
                e.startParam = n(r, 41);
                e.endParam = n(r, 42, Math.PI * 2);
                break;
            case 'SPLINE':
                e.degree = n(r, 71);
                e.knots = r.tags.filter(t => t[0] === 40).map(t => Number(t[1]));
                e.weights = r.tags.filter(t => t[0] === 41).map(t => Number(t[1]));
                e.controlPoints = points(r, 10);
                e.closed = !!(n(r, 70) & 1);
                break;
            case 'HATCH':
                e.paths = readHatch(r);
                e.solid = n(r, 70) === 1;
                e.fillRule = 'evenodd';
                if (!e.solid)
                    e.pattern = { angle: n(r, 53), origin: [n(r, 43), n(r, 44)], offset: [n(r, 45), n(r, 46)] };
                break;
            case 'SOLID': {
                const a = p(r, 10), b = p(r, 11), c = p(r, 13), d = p(r, 12);
                e.points = near(c, d) ? [a, b, c] : [a, b, c, d];
                break;
            }
            case 'TEXT':
            case 'ATTRIB':
                e.text = decodeDxfString(get(r, 1, ''));
                e.position = p(r, 10);
                e.height = n(r, 40, 1);
                e.rotation = n(r, 50);
                e.width = n(r, 72) === 5 ? distance(e.position, p(r, 11)) : e.height * .55 * e.text.length * n(r, 41, 1);
                e.widthFactor = n(r, 41, 1);
                e.oblique = n(r, 51);
                e.mirror = n(r, 71);
                e.font = decodeDxfString(styles.get(get(r, 7, 'STANDARD')) || 'Arial');
                if (r.type === 'ATTRIB') {
                    e.tag = decodeDxfString(get(r, 2, 'VALUE'));
                    e.value = e.text;
                }
                break;
            case 'MTEXT':
                e.text = decodeDxfString(r.tags.filter(t => t[0] === 3 || t[0] === 1).map(t => t[1]).join('')).replace(/\\P/g, '\n');
                e.position = p(r, 10);
                e.height = n(r, 40, 1);
                e.width = n(r, 41);
                e.rotation = n(r, 50) * 180 / Math.PI;
                e.font = styles.get(get(r, 7, 'STANDARD')) || 'Arial';
                break;
            case 'INSERT':
                e.name = decodeDxfString(get(r, 2, ''));
                e.position = p(r, 10);
                e.scale = [n(r, 41, 1), n(r, 42, 1)];
                e.rotation = n(r, 50);
                e.attributes = [];
                break;
            case 'DIMENSION':
                e.block = decodeDxfString(get(r, 2, ''));
                e.dimensionType = n(r, 70) & 7;
                e.definition = p(r, 10);
                e.extension1 = p(r, 13);
                e.extension2 = p(r, 14);
                e.textPosition = p(r, 11);
                e.text = decodeDxfString(get(r, 1, ''));
                e.measurement = n(r, 42);
                break;
            default:
                if (!['SEQEND', 'BLOCK', 'ENDBLK'].includes(r.type))
                    doc.diagnostics.push(diagnostic('DXF_ENTITY_UNSUPPORTED', `DXF preview does not implement ${r.type}.`, 'error'));
                return null;
        }
        if (meta?.font)
            e.sourceFont = meta.font;
        return e;
    }
    function readEntities(rs, out) {
        let lastInsert = null;
        for (const r of rs) {
            const e = entity(r);
            if (!e) {
                if (r.type === 'SEQEND')
                    lastInsert = null;
                continue;
            }
            if (e.type === 'ATTRIB' && lastInsert)
                lastInsert.attributes.push(e);
            else {
                out.push(e);
                lastInsert = e.type === 'INSERT' ? e : null;
            }
        }
    }
    const blockRecords = records(sections.get('BLOCKS') || []);
    let active = null, rs = [];
    for (const r of blockRecords) {
        if (r.type === 'BLOCK') {
            active = { name: decodeDxfString(get(r, 2, '')), origin: p(r, 10), entities: [] };
            rs = [];
        }
        else if (r.type === 'ENDBLK') {
            if (active && !active.name.startsWith('*Model_Space') && !active.name.startsWith('*Paper_Space')) {
                readEntities(rs, active.entities);
                doc.blocks.push(active);
            }
            active = null;
        }
        else if (active)
            rs.push(r);
    }
    readEntities(records(sections.get('ENTITIES') || []), doc.entities);
    const handles = new Map([...doc.entities, ...doc.blocks.flatMap(b => b.entities)].map(e => [e.handle, e.id]));
    for (const r of records(sections.get('OBJECTS') || []))
        if (r.type === 'GROUP')
            doc.groups.push({ name: parseXdata(r)?.id || get(r, 5, ''), semantic: parseXdata(r)?.semantic || {}, description: decodeDxfString(get(r, 300, '')), members: r.tags.filter(t => t[0] === 340).map(t => handles.get(t[1])).filter(Boolean) });
    return doc;
}
