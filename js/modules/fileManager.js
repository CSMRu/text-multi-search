/**
 * File Manager Module
 * Handles file uploads, drag & drop, and validation.
 */
window.TMS = window.TMS || {};

const ALLOWED_EXTENSIONS = [
    // Text documents
    '.txt', '.md', '.markdown',
    // Code & Data
    '.js', '.jsx', '.ts', '.tsx', '.json',
    '.html', '.htm', '.css', '.scss', '.less',
    '.xml', '.svg', '.log', '.csv', '.yml', '.yaml',
    // Scripts & Configs
    '.ini', '.conf', '.sh', '.bat', '.ps1'
];

TMS.FileManager = {
    // =========================================================================
    // [1] Public Initialization & Handlers
    // =========================================================================

    initDragAndDrop(zones) {
        const handleDrop = (e, callback, limit) => {
            e.preventDefault();
            e.target.closest('.input-wrapper')?.classList.remove('drag-active');
            const file = e.dataTransfer.files[0];
            if (file) {
                this._readFileContent(file, txt => {
                    if (callback) callback(file.name, txt);
                }, limit);
            }
        };

        zones.forEach(({ element, limit, onDrop }) => {
            const wrap = element.closest('.input-wrapper');
            if (!wrap) return;

            wrap.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrap.classList.add('drag-active');
            });
            wrap.addEventListener('dragleave', (e) => {
                if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-active');
            });
            wrap.addEventListener('drop', e => handleDrop(e, onDrop, limit));
        });
    },

    handleFileUpload(input, maxSize, onLoaded) {
        if (input.files[0]) {
            this._readFileContent(input.files[0], txt => {
                if (onLoaded) onLoaded(input.files[0].name, txt);
                input.value = '';
            }, maxSize);
        }
    },

    // =========================================================================
    // [2] Internal Helpers
    // =========================================================================

    _readFileContent(file, callback, maxSize = TMS.CONFIG.MAX_SOURCE_FILE_SIZE) {
        if (file.size > maxSize) {
            return TMS.UIManager.showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Limit is ${(maxSize / 1024 / 1024).toFixed(1)}MB.`);
        }

        if (!this._isValidTextFile(file)) {
            return TMS.UIManager.showToast('Unsupported file type. Please upload a Text file.', 'error');
        }

        const r = new FileReader();
        r.onload = e => {
            callback(e.target.result);
        };
        r.readAsText(file);
    },

    _isValidTextFile(file) {
        if (file.type.startsWith('text/') ||
            file.type === 'application/json' ||
            file.type === 'application/xml' ||
            file.type === 'image/svg+xml' ||
            file.type.includes('javascript') ||
            file.type.includes('ecmascript')) {
            return true;
        }
        if (!file.name) return false;
        const lowerName = file.name.toLowerCase();
        return ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    }
};
