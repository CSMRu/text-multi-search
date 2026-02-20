/**
 * Core Configuration & State
 * Defines the global namespace 'TMS' (Text Multi Search).
 */

// Initialize Namespace
window.TMS = window.TMS || {};

// 1. Immutable Configuration
TMS.CONFIG = {
    VERSION: 'v26.0221a',       // Application Version
    MAX_SOURCE_FILE_SIZE: 0.5 * 1024 * 1024,   // 500KB for Source Text
    MAX_KEYWORDS_FILE_SIZE: 50 * 1024,         // 50KB for Keywords (~1000-2000 lines) to prevent freezing
    DEBOUNCE_DELAY: 150,            // ms to wait before searching after typing (default fallback)
    HISTORY_DEBOUNCE: 400,          // ms to wait before saving undo snapshot
    NAV_THROTTLE: 100,               // ms minimum interval between match navigation actions
    ALLOWED_EXTENSIONS: [           // Allowed file types for upload/drop
        '.txt', '.md', '.markdown', '.js', '.jsx', '.ts', '.tsx', '.json',
        '.html', '.htm', '.css', '.scss', '.less', '.xml', '.svg', '.log',
        '.csv', '.yml', '.yaml', '.ini', '.conf', '.sh', '.bat', '.ps1'
    ]
};

// 2. Mutable Application State
TMS.STATE = {
    fontSize: 12,           // Font size in points (pt)
    isSynced: true,         // Mode: true = Auto-Search (Read-only), false = Manual Edit
    isKeywordsLocked: true, // Keywords lock: true = Read-only, false = Editable
    debounceTimer: null,    // Timer for input debouncing
    history: {              // History Stack for Undo/Redo
        stack: [],
        pointer: -1,
        limit: 50,
        timer: null
    }
};

// 3. DOM Elements Container (Populated in app.js on DOMContentLoaded)
TMS.EL = {};
