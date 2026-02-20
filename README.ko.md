# Text Multi Search
[![Version](https://img.shields.io/badge/Version-26.0221a-B5E853?style=flat-square)](https://github.com/csmru/text-multi-search/commits) [![Hosted on GitHub Pages](https://img.shields.io/badge/GitHub-Pages-2b7346?style=flat-square&logo=github)](https://csmru.github.io/text-multi-search/) [![English](https://img.shields.io/badge/Guide-English-white?style=flat-square&logo=google-translate&logoColor=white)](README.md) [![한국어](https://img.shields.io/badge/Guide-한국어-blue?style=flat-square&logo=google-translate&logoColor=blue)](README.ko.md)

> 다중 키워드 동시 검색, 일괄 치환 및 패턴 분석을 위한 **클라이언트 측 텍스트 프로세서**입니다.

## 🧩 구문 치트 시트

각 규칙을 새 줄에 입력하세요.

| 키워드 | 설명 | 예시 | 결과 |
| :--- | :--- | :--- | :--- |
| **`Text`** | **기본 일치**. 텍스트를 강조합니다. | `Hello` | "Hello" 강조 |
| **`A///B`** | **치환**. A를 B로 바꿉니다. | `fix///fixed` | "fix" → "fixed"로 변경 |
| **`[line]`** | **라인 모드**. 일치하는 항목이 있으면 해당 라인 전체를 선택합니다. | `[line]Hello` | "Hello"가 포함된 전체 라인 선택 |
| **`[del]`** | **삭제**. 일치하는 항목(또는 라인)을 제거합니다. | `[line]Log///[del]` | "Log"가 포함된 라인 삭제 |
| **`[or]`** | **논리**. A 또는 B와 일치합니다. | `App[or]Web` | "App" 또는 "Web" 일치 |
| **`[num]`** | **숫자**. 숫자를 캡처합니다 (`$1`). | `ID:[num]` | "ID:123" 일치 |
| **`[cjk]`** | **한자**. 한자를 캡처합니다 (`$1`). | `[cjk]` | "山", "文" 일치 |
| **`[kor]`** | **한글**. 한글 문자를 캡처합니다 (`$1`). | `[kor]` | "가", "힣", "ㄴ", "ㅟ" 일치 |
| **`///`** | **주석**. 무시되는 라인입니다. | `/// 제목` | (무시됨) |

### 치환 변수
캡처된 와일드카드 (`[num]`, `[cjk]`, `[kor]`)는 치환에 사용할 수 있습니다.
*   `Item [num]///Item #$1` → "Item 10"이 "Item #10"이 됩니다.
*   `[num]-[num]///$2.$1` → "2024-01"이 "01.2024"가 됩니다.

---

## ⚖️ 매칭 우선순위 (3가지 법칙)

엔진은 텍스트를 **단일 패스(single pass)**로 스캔합니다. 동일한 텍스트 부분에 여러 규칙이 일치할 수 있는 경우, 다음 법칙에 따라 우선순위가 결정됩니다.

0.  **`[line]` 모드 (최우선 법칙)**: `[line]`으로 시작하는 규칙은 항상 단어 수준 규칙보다 우선합니다. 라인이 일치하면 전체가 먼저 처리됩니다.
1.  **왼쪽 우선 (Leftmost First)**: 텍스트에서 **가장 먼저** 시작되는 매칭이 승리합니다.
    *   *입력:* `Banana` | *규칙:* `na`, `Ba` → **`Ba`** 승리 (인덱스 0에서 시작).
2.  **가장 긴 매칭 우선 (Longest First)**: 시작 위치가 동일하면 **더 긴** 매칭이 승리합니다.
    *   *입력:* `AppleJuice` | *규칙:* `Apple`, `AppleJuice` → **`AppleJuice`** 승리 (10자 vs 5자).
3.  **먼저 정의된 규칙 우선 (First Defined)**: 위치와 길이가 모두 동일하면 목록에서 **더 위**에 정의된 규칙이 승리합니다.
    *   *입력:* `Test` | *규칙:* 1. `Test` 2. `Test///Done` → **첫 번째 규칙** 승리 (치환이 수행되지 않음).

---

## ⚡ 자주 사용되는 패턴

| 목표 | 패턴 규칙 | 설명 |
| :--- | :--- | :--- |
| **로그 요약** | `[line]Info [or] Debug///[del]` | Info/Debug 라인을 삭제하고 Error만 남깁니다. |
| **전화번호 마스킹** | `010-[num]-[num]///010-****-$2` | 중간 자릿수 숨기기: `010-1234-5678` → `010-****-5678`. |
| **용어 통일** | `Signin[or]Log-in///Login` | 일치하지 않는 용어를 `Login`으로 통일합니다. |
| **ID 추출** | `[line]User_id: [num]///$1` | 전체 라인을 ID 번호로만 바꿉니다. |
| **이름 마스킹** | `[cjk][cjk][cjk]///$1*$3` | 중간 한자 숨기기: `金閣寺` → `金*寺`. |
| **데이터 포맷 변경** | `[num]x[num]///W:$1 H:$2` | `1920x1080` → `W:1920 H:1080`으로 변경. |

## ⌨️ 단축키 및 모드
*   **수동 편집**: <i data-lucide="unlink"></i> (Unlink)를 클릭하여 결과에서 직접 입력할 수 있습니다.
*   **소스 복사**: `Ctrl` + `Alt` + `C` (개발 중).

## 라이선스
MIT 라이선스. [소스 보기](https://github.com/csmru/text-multi-search).
