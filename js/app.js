/**
 * Text Multi Search - Application Entry Point
 * 
 * Responsibilities:
 * 1. Initialize DOM Element References (TMS.EL)
 * 2. Initialize Feature Modules (Worker, File, etc.)
 * 3. Bind Event Listeners to UI interactions
 * 4. Final Polish (Initial States & Icons)
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
        countReplace: document.getElementById('count-replace'),

        loadingBar: document.getElementById('loading-bar'),
        toastContainer: document.getElementById('toast-container'),

        btnScrollTop: document.getElementById('btn-scroll-top'),
        btnScrollBottom: document.getElementById('btn-scroll-bottom'),
        btnPrevMatch: document.getElementById('btn-prev-match'),
        btnNextMatch: document.getElementById('btn-next-match')
    };

    /* ==========================================================================
       [2] Module Initialization
       Bootstraps Worker threads and File Drag & Drop handlers.
       ========================================================================== */
    TMS.WorkerManager.init();

    if (window.lucide) window.lucide.createIcons();

    const handleSourceLoad = (name, content) => {
        if (TMS.EL.fileNameSource) TMS.EL.fileNameSource.textContent = name;
        TMS.EL.sourceInput.value = content;
        TMS.WorkerManager.scheduleProcessing();
    };

    const handleKeywordsLoad = (name, content) => {
        TMS.EL.keywordsInput.value = content;
        TMS.WorkerManager.scheduleProcessing();
        TMS.UIManager.syncBackdrop();
    };

    TMS.FileManager.initDragAndDrop([
        {
            element: TMS.EL.sourceInput,
            limit: TMS.CONFIG.MAX_SOURCE_FILE_SIZE,
            onDrop: handleSourceLoad
        },
        {
            element: TMS.EL.keywordsInput,
            limit: TMS.CONFIG.MAX_KEYWORDS_FILE_SIZE,
            onDrop: handleKeywordsLoad
        }
    ]);

    /* ==========================================================================
       [3] Event Listeners
       Connects UI interactions to Module methods.
       ========================================================================== */

    // --- Input Handling ---
    TMS.EL.sourceInput.addEventListener('input', () => TMS.WorkerManager.scheduleProcessing());

    TMS.EL.keywordsInput.addEventListener('input', () => {
        TMS.WorkerManager.scheduleProcessing();
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
        TMS.FileManager.handleFileUpload(TMS.EL.uploadSource, TMS.CONFIG.MAX_SOURCE_FILE_SIZE, handleSourceLoad));

    TMS.EL.uploadKeywords.addEventListener('change', () =>
        TMS.FileManager.handleFileUpload(TMS.EL.uploadKeywords, TMS.CONFIG.MAX_KEYWORDS_FILE_SIZE, handleKeywordsLoad));

    // --- Toolbar & Actions ---
    if (TMS.EL.btnTheme) TMS.EL.btnTheme.addEventListener('click', () => TMS.UIManager.toggleTheme());
    if (TMS.EL.btnFontInc) TMS.EL.btnFontInc.addEventListener('click', () => TMS.UIManager.updateFontSize(1));
    if (TMS.EL.btnFontDec) TMS.EL.btnFontDec.addEventListener('click', () => TMS.UIManager.updateFontSize(-1));
    if (TMS.EL.btnKeywordsLock) TMS.EL.btnKeywordsLock.addEventListener('click', () => TMS.UIManager.toggleKeywordsLock());

    TMS.EL.btnCopySource.addEventListener('click', () => {
        navigator.clipboard.writeText(TMS.EL.sourceInput.value)
            .then(() => TMS.UIManager.showToast('Source text copied!', 'success'));
    });

    TMS.EL.btnCopyResult.addEventListener('click', () => {
        navigator.clipboard.writeText(TMS.EL.outputDiv.innerText)
            .then(() => TMS.UIManager.showToast('Result text copied!', 'success'));
    });

    TMS.EL.btnDownloadResult.addEventListener('click', () => {
        const timestamp = TMS.Utils.getFormattedTimestamp();
        const filename = `tms-result_${timestamp}.txt`;
        TMS.FileManager.downloadFile(TMS.EL.outputDiv.innerText, filename);
    });

    // --- Sync Toggle (Mode Switch) ---
    TMS.EL.btnSyncToggle.addEventListener('click', () => {
        TMS.STATE.isSynced = !TMS.STATE.isSynced;

        if (TMS.STATE.isSynced) {
            TMS.UIManager.updateButtonIcon(TMS.EL.btnSyncToggle, 'link');
            TMS.EL.btnSyncToggle.title = 'Current: Auto-Sync (Click to Unlink)';
            TMS.EL.btnSyncToggle.classList.remove('active');
            TMS.EL.outputDiv.contentEditable = 'false';
            TMS.EL.outputDiv.style.outline = 'none';
            TMS.WorkerManager.processText();
        } else {
            TMS.UIManager.updateButtonIcon(TMS.EL.btnSyncToggle, 'unlink');
            TMS.EL.btnSyncToggle.title = 'Current: Manual Edit (Click to Link)';
            TMS.EL.btnSyncToggle.classList.add('active');
            TMS.EL.outputDiv.contentEditable = 'true';
            TMS.WorkerManager.stopRendering();
            TMS.EL.outputDiv.focus();
            TMS.STATE.history.stack = [{ content: TMS.EL.outputDiv.innerHTML, cursor: 0 }];
            TMS.STATE.history.pointer = 0;
        }

        TMS.UIManager.updateActionButtonsState();
    });

    // --- Manual Edit Mode (Input Handling) ---
    // Event order: beforeinput → keydown → input → paste

    // Standard Input: Wrap text in blue span.
    TMS.EL.outputDiv.addEventListener('beforeinput', (e) => {
        if (TMS.STATE.isSynced) return;
        if (e.inputType === 'insertText' && e.data) {
            e.preventDefault();
            TMS.HistoryManager.insertUserText(e.data);
            TMS.HistoryManager.debouncedSave();
        }
    });

    // IME Start: Force blue span creation.
    TMS.EL.outputDiv.addEventListener('compositionstart', () => {
        if (!TMS.STATE.isSynced) {
            TMS.HistoryManager.startComposition();
        }
    });

    // IME End: Clean ZWS artifacts.
    TMS.EL.outputDiv.addEventListener('compositionend', () => {
        if (!TMS.STATE.isSynced) {
            TMS.HistoryManager.cleanZeroWidth();
            TMS.HistoryManager.debouncedSave();
        }
    });

    // Handle Undo/Redo (Ctrl+Z) and Enter key
    TMS.EL.outputDiv.addEventListener('keydown', (e) => {
        if (TMS.STATE.isSynced) return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) TMS.HistoryManager.performAction(false); // Redo
                else TMS.HistoryManager.performAction(true); // Undo
                return;
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            TMS.HistoryManager.insertUserText('\n');
        }

        TMS.HistoryManager.debouncedSave();
    });

    // Save snapshot after input (debounced)
    TMS.EL.outputDiv.addEventListener('input', () => {
        if (!TMS.STATE.isSynced) {
            TMS.HistoryManager.debouncedSave();
            TMS.UIManager.updateActionButtonsState();
        }
    });

    // Handle paste with diff-user styling
    TMS.EL.outputDiv.addEventListener('paste', (e) => {
        if (TMS.STATE.isSynced) return;
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        TMS.HistoryManager.insertUserText(text);
        TMS.HistoryManager.saveSnapshot();
    });

    // --- D-pad Navigation Controls ---
    const addNavigationListener = (button, action) => {
        if (!button) return;
        button.addEventListener('click', () => {
            button.blur();
            action();
        });
    };

    // Smooth Scroll
    addNavigationListener(TMS.EL.btnScrollTop, () => TMS.UIManager.scrollToTop());
    addNavigationListener(TMS.EL.btnScrollBottom, () => TMS.UIManager.scrollToBottom());

    // Match Navigation
    addNavigationListener(TMS.EL.btnNextMatch, () => TMS.UIManager.navigateMatch('next'));
    addNavigationListener(TMS.EL.btnPrevMatch, () => TMS.UIManager.navigateMatch('prev'));

    // Global Keyboard Shortcuts (Esc, Arrow Keys, WASD)
    document.addEventListener('keydown', (e) => {
        const currentEl = document.activeElement;

        // Escape: Unfocus input to enable WASD navigation
        if (e.key === 'Escape') {
            currentEl.blur();
            return;
        }

        // Block shortcuts while in Input or Edit mode
        const activeTag = currentEl.tagName.toLowerCase();
        const isOutputFocused = (currentEl === TMS.EL.outputDiv);

        if (activeTag === 'textarea' || activeTag === 'input' || isOutputFocused) return;

        const k = e.key.toLowerCase();

        // Match Navigation (Left/Right)
        if (k === 'arrowleft' || k === 'a') {
            e.preventDefault();
            TMS.UIManager.navigateMatch('prev');
        } else if (k === 'arrowright' || k === 'd') {
            e.preventDefault();
            TMS.UIManager.navigateMatch('next');
        }
        // Scroll (Up/Down)
        else if (k === 'arrowup' || k === 'w') {
            e.preventDefault();
            TMS.UIManager.scrollToTop();
        } else if (k === 'arrowdown' || k === 's') {
            e.preventDefault();
            TMS.UIManager.scrollToBottom();
        }
    });

    /* ==========================================================================
       [4] Final Polish
       Refresh icons and set initial state.
       ========================================================================== */
    TMS.Utils.refreshIcons();
    TMS.UIManager.updateFontSize(0);
    TMS.UIManager.updateActionButtonsState();

    // Set Version
    TMS.UIManager.setVersion(TMS.CONFIG.VERSION);

    // Apply initial lock state to DOM
    TMS.EL.keywordsInput.readOnly = TMS.STATE.isKeywordsLocked;
});
