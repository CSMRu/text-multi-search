/**
 * Text Multi Search - Application Entry Point
 * 
 * Responsibilities:
 * 1. Initialize DOM Element References (TMS.EL)
 * 2. Initialize Feature Modules (Worker, File, etc.)
 * 3. Bind Event Listeners to UI interactions
 * 
 * Note: Core logic resides in `js/core` and `js/modules`.
 * This file acts as the coordinator (Controller).
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       [1] DOM Initialization
       Populate TMS.EL with references to HTML elements.
       ========================================================================== */
    TMS.EL = {
        sourceInput: document.getElementById('text-source'),
        keywordsInput: document.getElementById('text-keywords'),
        keywordsBackdrop: document.getElementById('keywords-backdrop'),
        outputDiv: document.getElementById('search-output'),

        uploadSource: document.getElementById('upload-source'),
        btnUploadSource: document.getElementById('btn-upload-source'),
        fileNameSource: document.getElementById('file-name-source'),
        uploadKeywords: document.getElementById('upload-keywords'),
        btnUploadKeywords: document.getElementById('btn-upload-keywords'),
        fileNameKeywords: document.getElementById('file-name-keywords'),

        btnTheme: document.getElementById('btn-theme'),
        btnFontInc: document.getElementById('font-increase'),
        btnFontDec: document.getElementById('font-decrease'),
        fontSizeDisplay: document.getElementById('font-size-display'),
        btnSyncToggle: document.getElementById('btn-sync-toggle'),

        btnKeywordsLock: document.getElementById('btn-keywords-lock'),
        btnCopySource: document.getElementById('btn-copy-source'),
        btnCopyResult: document.getElementById('btn-copy-result'),
        btnDownloadResult: document.getElementById('btn-download-result'),

        countMatch: document.getElementById('count-match'),
        countReplace: document.getElementById('count-replace')
    };

    /* ==========================================================================
       [2] Module Initialization
       Bootstraps Worker threads and File Drag & Drop handlers.
       ========================================================================== */
    TMS.WorkerManager.init();
    TMS.FileManager.initDragAndDrop();

    /* ==========================================================================
       [3] Event Listeners
       Connects UI interactions to Module methods.
       ========================================================================== */

    // --- Input Handling ---
    TMS.EL.sourceInput.addEventListener('input', () => TMS.Utils.requestUpdate());

    TMS.EL.keywordsInput.addEventListener('input', () => {
        TMS.STATE.isKeywordsDirty = true;
        TMS.Utils.requestUpdate();
        TMS.UIManager.syncBackdrop();
    });

    TMS.EL.keywordsInput.addEventListener('scroll', () => {
        TMS.UIManager.syncBackdrop();
    });

    // --- File Operations ---
    if (TMS.EL.btnUploadSource) {
        TMS.EL.btnUploadSource.addEventListener('click', () => TMS.EL.uploadSource.click());
    }
    if (TMS.EL.btnUploadKeywords) {
        TMS.EL.btnUploadKeywords.addEventListener('click', () => TMS.EL.uploadKeywords.click());
    }

    TMS.EL.uploadSource.addEventListener('change', () =>
        TMS.FileManager.handleFileUpload(TMS.EL.uploadSource, TMS.EL.sourceInput, TMS.EL.fileNameSource, TMS.CONFIG.MAX_SOURCE_FILE_SIZE));

    TMS.EL.uploadKeywords.addEventListener('change', () =>
        TMS.FileManager.handleFileUpload(TMS.EL.uploadKeywords, TMS.EL.keywordsInput, TMS.EL.fileNameKeywords, TMS.CONFIG.MAX_KEYWORDS_FILE_SIZE));

    // --- Toolbar & Actions ---
    if (TMS.EL.btnTheme) TMS.EL.btnTheme.addEventListener('click', TMS.UIManager.toggleTheme);
    if (TMS.EL.btnFontInc) TMS.EL.btnFontInc.addEventListener('click', () => TMS.UIManager.updateFontSize(1));
    if (TMS.EL.btnFontDec) TMS.EL.btnFontDec.addEventListener('click', () => TMS.UIManager.updateFontSize(-1));
    if (TMS.EL.btnKeywordsLock) TMS.EL.btnKeywordsLock.addEventListener('click', TMS.UIManager.toggleKeywordsLock);

    TMS.EL.btnCopySource.addEventListener('click', () => {
        navigator.clipboard.writeText(TMS.EL.sourceInput.value)
            .then(() => TMS.UIManager.showToast('Source text copied!', 'success'));
    });

    TMS.EL.btnCopyResult.addEventListener('click', () => {
        navigator.clipboard.writeText(TMS.EL.outputDiv.innerText)
            .then(() => TMS.UIManager.showToast('Result text copied!', 'success'));
    });

    TMS.EL.btnDownloadResult.addEventListener('click', () => {
        const blob = new Blob([TMS.EL.outputDiv.innerText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'search-result.txt';
        a.click();
        URL.revokeObjectURL(url);
    });

    // --- Sync Toggle (Mode Switch) ---
    TMS.EL.btnSyncToggle.addEventListener('click', () => {
        TMS.STATE.isSynced = !TMS.STATE.isSynced;

        if (TMS.STATE.isSynced) {
            TMS.EL.btnSyncToggle.innerHTML = '<i data-lucide="link"></i>';
            TMS.EL.btnSyncToggle.title = 'Current: Auto-Sync (Click to Unlink)';
            TMS.EL.btnSyncToggle.classList.remove('active');
            TMS.EL.outputDiv.contentEditable = 'false';
        } else {
            TMS.EL.btnSyncToggle.innerHTML = '<i data-lucide="unlink"></i>';
            TMS.EL.btnSyncToggle.title = 'Current: Manual Edit (Click to Link)';
            TMS.EL.btnSyncToggle.classList.add('active');
            TMS.EL.outputDiv.contentEditable = 'true';
        }

        if (TMS.STATE.isSynced) {
            TMS.EL.outputDiv.style.outline = 'none';
            TMS.WorkerManager.processText();
        } else {
            TMS.WorkerManager.stopRendering();
            TMS.EL.outputDiv.focus();
            TMS.STATE.history.stack = [{ content: TMS.EL.outputDiv.innerHTML, cursor: 0 }];
            TMS.STATE.history.pointer = 0;
        }

        TMS.UIManager.updateActionButtonsState();
        TMS.Utils.refreshIcons();
    });

    // --- Manual Edit Mode (Undo/Redo/Paste) ---
    TMS.EL.outputDiv.addEventListener('keydown', (e) => {
        if (TMS.STATE.isSynced) return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) TMS.HistoryManager.performAction(false); // Redo
                else TMS.HistoryManager.performAction(true); // Undo
                return;
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            TMS.HistoryManager.insertNodeAtCursor(document.createTextNode('\n'));
        }

        TMS.HistoryManager.debouncedSave();
    });

    TMS.EL.outputDiv.addEventListener('input', () => {
        if (!TMS.STATE.isSynced) {
            TMS.HistoryManager.debouncedSave();
            TMS.UIManager.updateActionButtonsState();
        }
    });

    TMS.EL.outputDiv.addEventListener('paste', (e) => {
        if (TMS.STATE.isSynced) return;
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        TMS.HistoryManager.insertNodeAtCursor(document.createTextNode(text));
        TMS.HistoryManager.saveSnapshot();
    });

    // --- Scroll Controls ---
    const btnScrollTop = document.getElementById('btn-scroll-top');
    const btnScrollBottom = document.getElementById('btn-scroll-bottom');
    if (btnScrollTop) btnScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    if (btnScrollBottom) btnScrollBottom.addEventListener('click', () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

    /* ==========================================================================
       [4] Final Polish
       Refresh icons and set initial state.
       ========================================================================== */
    TMS.Utils.refreshIcons();
    TMS.UIManager.updateFontSize(0);
    TMS.UIManager.updateActionButtonsState();
});
