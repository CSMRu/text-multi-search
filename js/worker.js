/**
 * Text Multi Search - Web Worker
 * Handles heavy regex processing off the main thread.
 * Delegate all logic to TMS.Engine.
 */

importScripts('core/utils.js');
importScripts('core/engine.js');

(() => {
    self.onmessage = (e) => {
        const { id, sourceText, keywordsValue } = e.data;
        try {
            const result = TMS.Engine.processText(sourceText, keywordsValue);
            self.postMessage({ id, status: 'success', ...result });
        } catch (err) {
            self.postMessage({ id, status: 'error', message: err.message });
        }
    };
})();
