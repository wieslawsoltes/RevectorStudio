/** Small framework-neutral UI primitives. All document-derived strings are text, never HTML. */
export function element(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class')
            el.className = v;
        else if (k === 'text')
            el.textContent = v;
        else if (k === 'dataset')
            Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function')
            el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in el && k !== 'style')
            el[k] = v;
        else if (v !== false && v != null)
            el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity))
        if (c != null)
            el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
}
export function button(text, onClick, { title = text, className = '', ...attrs } = {}) { return element('button', { type: 'button', text, title, class: className, onClick, ...attrs }); }
export function download(data, name, type = 'application/octet-stream') { const blob = data instanceof Blob ? data : new Blob([data], { type }), url = URL.createObjectURL(blob), a = element('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); return blob; }
export function toast(message, { error = false, timeout = 5000 } = {}) { const box = element('div', { class: 'rv-toast' + (error ? ' error' : ''), role: 'status', text: message }); document.body.append(box); setTimeout(() => box.remove(), timeout); return box; }
export function dialog({ title, content, actions = [] }) { const d = element('dialog', { class: 'rv-dialog' }, element('header', {}, element('strong', { text: title }), button('×', () => d.close(), { title: 'Close dialog' })), element('section', {}, content), element('footer', {}, actions.map(a => button(a.label, () => a.run(d), { className: a.primary ? 'primary' : '' })))); document.body.append(d); d.addEventListener('close', () => d.remove(), { once: true }); d.showModal(); return d; }
export function askValue(title, label, value = '', { type = 'text' } = {}) {
    return new Promise(resolve => {
        const input = element('input', { type, value, autocomplete: 'off' });
        const d = dialog({ title, content: element('label', {}, label, input), actions: [{ label: 'Cancel', run: d => d.close() }, { label: 'Continue', primary: true, run: d => { resolve(input.value); d.close(); } }] });
        d.addEventListener('close', () => resolve(null), { once: true });
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                resolve(input.value);
                d.close();
            }
        });
    });
}
export class DisposableStore {
    constructor() { this.items = []; }
    add(fn) { this.items.push(fn); return fn; }
    dispose() {
        for (const f of this.items.splice(0).reverse())
            f();
    }
}
const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
export function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes)
        c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
/** Standards-conforming ZIP32 stored entries. No compression dependency, no executable content. */
export function zipFiles(files) {
    const chunks = [], central = [], encoder = new TextEncoder();
    let offset = 0;
    const header = n => new DataView(new ArrayBuffer(n));
    for (const file of files) {
        if (/(^|\/)\.\.(\/|$)|^[\\/]/.test(file.name))
            throw Error('Unsafe archive path');
        const name = encoder.encode(file.name), data = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(file.data), crc = crc32(data);
        if (data.length > 0xffffffff || offset > 0xffffffff || files.length > 65535)
            throw Error('ZIP32 size limit');
        const h = header(30);
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x800, true);
        h.setUint16(12, 0x21, true);
        h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        chunks.push(h.buffer, name, data);
        const c = header(46);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x800, true);
        c.setUint16(14, 0x21, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        central.push(c.buffer, name);
        offset += 30 + name.length + data.length;
    }
    const centralSize = central.reduce((s, c) => s + c.byteLength, 0), end = header(22);
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
}
