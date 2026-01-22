/**
 * File Manager Module
 * Handles file uploads, drag & drop, and validation.
 */
window.TMS = window.TMS || {};

const ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.markdown',
    '.js', '.jsx', '.ts', '.tsx', '.json',
    '.html', '.htm', '.css', '.scss', '.less',
    '.xml', '.svg', '.log', '.csv', '.yml', '.yaml',
    '.ini', '.conf', '.sh', '.bat', '.ps1'
];

TMS.FileManager = {
    isValidTextFile(file) {
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
    },

    readFileContent(file, callback, maxSize = TMS.CONFIG.MAX_SOURCE_FILE_SIZE) {
        if (file.size > maxSize) {
            return TMS.UIManager.showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Limit is ${(maxSize / 1024 / 1024).toFixed(1)}MB.`);
        }

        if (!this.isValidTextFile(file)) {
            return TMS.UIManager.showToast('Unsupported file type. Please upload a Text file.', 'error');
        }

        const r = new FileReader();
        r.onload = e => {
            callback(e.target.result);
            TMS.WorkerManager.processText();
        };
        r.readAsText(file);
    },

    handleFileUpload(input, area, display, maxSize) {
        if (input.files[0]) {
            this.readFileContent(input.files[0], txt => {
                if (display) display.textContent = input.files[0].name;
                area.value = txt;
                input.value = '';
                if (area === TMS.EL.keywordsInput) {
                    TMS.STATE.isKeywordsDirty = true;
                    // Trigger highlighting immediately
                    if (TMS.UIManager.syncBackdrop) setTimeout(TMS.UIManager.syncBackdrop, 0);
                }
            }, maxSize);
        }
    },

    initDragAndDrop() {
        const handleDrop = (e, area, nameDisplay, limit) => {
            e.preventDefault();
            e.target.closest('.input-wrapper')?.classList.remove('drag-active');
            const file = e.dataTransfer.files[0];
            if (file) {
                this.readFileContent(file, txt => {
                    if (nameDisplay) nameDisplay.textContent = file.name;
                    area.value = txt;
                    if (area === TMS.EL.keywordsInput) {
                        TMS.STATE.isKeywordsDirty = true;
                        if (TMS.UIManager.syncBackdrop) setTimeout(TMS.UIManager.syncBackdrop, 0);
                    }
                }, limit);
            }
        };

        [
            { el: TMS.EL.sourceInput, name: TMS.EL.fileNameSource, limit: TMS.CONFIG.MAX_SOURCE_FILE_SIZE },
            { el: TMS.EL.keywordsInput, name: TMS.EL.fileNameKeywords, limit: TMS.CONFIG.MAX_KEYWORDS_FILE_SIZE }
        ].forEach(({ el, name, limit }) => {
            const wrap = el.closest('.input-wrapper');
            if (!wrap) return;

            wrap.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrap.classList.add('drag-active');
            });
            wrap.addEventListener('dragleave', (e) => {
                if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-active');
            });
            wrap.addEventListener('drop', e => handleDrop(e, el, name, limit));
        });
    }
};
