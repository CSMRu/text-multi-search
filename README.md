# Text Multi Search
| <div align="center"> <a href="https://csmru.github.io/text-multi-search/"><img src="favicon.svg" width="128"></a> <br> [![Version](https://img.shields.io/badge/Version-26.0119e-B5E853?style=for-the-badge)](https://github.com/csmru/text-multi-search/commits) [![Hosted on GitHub Pages](https://img.shields.io/badge/GitHub-Pages-2b7346?style=for-the-badge&logo=github)](https://csmru.github.io/text-multi-search/) </div> |
| :--- |

> A powerful, client-side text analysis tool for searching, highlighting, and replacing multiple keywords simultaneously. Designed for developers and data analysts who need quick, visual text manipulation without leaving the browser.

## Features

-   **⚡ Simultaneous Multi-Search**: Highlight hundreds of different keywords instantly with distinct colors.
-   **🔄 Batch Replacement**: Define `Search // Replace` rules to perform multiple substitutions in one pass.
-   **🧩 Advanced Pattern Matching**:
    -   **Regex**: Full Regular Expression support (`/pattern/`).
    -   **Wildcards**: Built-in number wildcard `[num]` support.
-   **✏️ Manual Edit Mode**: Unlink the result to make manual corrections with a distinct blue highlight.
-   **🔒 100% Private**: All processing happens locally in your browser. No data is sent to any server.
-   **🌗 Light & Dark Mode**: Automatic theme detection with manual toggle.

## How to Use

### 1. Keyword Syntax
Enter each rule on a new line in the **Search Keywords** panel:

| Syntax | Description | Example |
|---|---|---|
| `Keyword` | Highlights all occurrences of "Keyword" | `Error` |
| `Search // Replace` | Replaces "Search" with "Replace" | `fix // fixed` |
| `[num]` | Matches any sequence of digits (e.g. `User[num]` matches `User123`) | `[num]` |
| `/regex/` | Matches the Regular Expression | `/^Error.*$/` |

> **Note**: Lines starting with `//` are treated as comments and ignored.

### 2. Manual Editing
Click the **Unlink** button (<i data-lucide="link"></i>) to switch to Edit Mode. You can now type directly in the result panel. Your manual changes will be highlighted in **Blue**.

## Dependencies

-   **[Lucide Icons](https://lucide.dev/)**: For beautiful, consistent iconography.
-   **[Google Fonts](https://fonts.google.com/)**: Inter & Noto Sans JP.

## License

This project is open source and available under the [MIT License](LICENSE).
