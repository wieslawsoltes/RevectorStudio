import { convertScene } from './index.js';
self.onmessage = async ({ data: { id, scene, options } }) => {
    try {
        const result = await convertScene(scene, { ...options, onProgress: progress => self.postMessage({ id, kind: 'progress', progress }) });
        self.postMessage({ id, kind: 'result', result });
    }
    catch (error) {
        self.postMessage({ id, kind: 'error', error: { name: error.name, message: error.message, stack: error.stack } });
    }
};
