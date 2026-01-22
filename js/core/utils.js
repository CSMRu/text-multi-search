/**
 * Core Utilities
 * Common helper functions used across modules.
 * Compatible with Main Thread (window) and Web Worker (self).
 */

const globalScope = typeof window !== 'undefined' ? window : self;
globalScope.TMS = globalScope.TMS || {};
globalScope.TMS.Utils = {};

// HTML Entity Map
const htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

/** Safely escapes text to prevent HTML injection */
TMS.Utils.escapeHtml = function (text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, (m) => htmlMap[m]);
};

/** Escapes characters for Regular Expressions */
TMS.Utils.escapeRegExp = function (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/** Re-initializes Lucide icons */
TMS.Utils.refreshIcons = function () {
    if (window.lucide) window.lucide.createIcons();
};

/** Checks if a DOM element is a diff span */
TMS.Utils.isStyledSpan = function (el) {
    return el && (
        el.classList.contains('diff-add') ||
        el.classList.contains('diff-replace') ||
        el.classList.contains('diff-original')
    );
};

/** Calculates dynamic debounce delay based on text length */
TMS.Utils.getSmartDebounceDelay = function () {
    // Requires TMS.EL.sourceInput to be initialized
    if (!TMS.EL.sourceInput) return TMS.CONFIG.DEBOUNCE_DELAY;

    const len = TMS.EL.sourceInput.value.length;
    if (len < 5000) return 100;      // < 5KB: Very fast
    if (len < 50000) return 300;     // < 50KB: Moderate
    if (len < 200000) return 450;    // < 200KB: Slower
    return 600;                      // Large: Slowest
};

/** Schedules a search update */
TMS.Utils.requestUpdate = function () {
    const delay = TMS.Utils.getSmartDebounceDelay();
    if (TMS.STATE.debounceTimer) clearTimeout(TMS.STATE.debounceTimer);
    // Note: processText will be defined in Main or WorkerManager, 
    // but here we assume a global or TMS method reference.
    // For better decoupling, we might want to just expose this logic or bind it later.
    // Ideally, TMS.WorkerManager.processText should be called.
    if (TMS.WorkerManager && TMS.WorkerManager.processText) {
        TMS.STATE.debounceTimer = setTimeout(() => TMS.WorkerManager.processText(), delay);
    }
};
