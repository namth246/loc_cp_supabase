# Bộ lọc Cổ Phiếu - Implementation Plan

## Phase 1: Requirements Analysis (EARS)
- **REQ-1**: WHEN the web app loads, THE SYSTEM SHALL fetch data from the configured Google Sheets URLs using Google Visualization API (JSONP).
- **REQ-2**: WHEN filtering for "Top 10 cổ phiếu tiếp diễn dòng tiền", THE SYSTEM SHALL:
  1. Filter out VNINDEX and get VNINDEX `26D change (%)`.
  2. Take top 20 stocks with highest `26D change (%)` > VNINDEX.
  3. Filter those with RS > 85 in the last 3 days.
  4. Filter those with Volume > 300,000.
  5. Sort by latest RS descending and display top 10.
- **REQ-3**: WHEN filtering for "Top 10 cổ phiếu đột biến", THE SYSTEM SHALL:
  1. Take stocks ranked 21 to 50 by `26D change (%)`.
  2. Filter those with RS between 75 and 85 in the last 3 days.
  3. Filter those with Close > MA50.
  4. Filter those with Volume > 300,000.
  5. Sort by latest RS descending and display top 10.
- **REQ-4**: WHEN viewing the Sector Strength, THE SYSTEM SHALL read data from Google Sheet 3 and display a ranked dashboard based on columns "Ngành" (X) and "TB(%)" (Y).
- **REQ-5**: WHEN the user updates configuration links, THE SYSTEM SHALL save them to LocalStorage and auto-refresh.
- **REQ-6**: WHEN 60 seconds pass, THE SYSTEM SHALL auto-refresh data silently.

## Phase 2: Specification

### Trade-off Analysis
| Approach | Pros | Cons | Complexity | Security | Recommendation |
|----------|------|------|------------|----------|----------------|
| **GViz JSONP (Current)** | Bypasses CORS, no backend needed | Relies on unofficial Google endpoint | Low | Low | ✅ |
| **Node.js Backend** | Hides sheet IDs, more control | Requires hosting, setup overhead | Medium | Medium | ❌ (YAGNI for static app) |
| **Google Apps Script** | Official API, clean JSON | Needs deployment per sheet | Medium | Medium | ❌ |

### Edge Cases
| Edge Case | Trigger Condition | Expected Behavior | Impact if Ignored |
|-----------|-------------------|-------------------|-------------------|
| Empty/Invalid Google Sheet | User enters wrong URL | Show clear error message on UI | App crashes silently |
| Missing VNINDEX row | Sheet doesn't have Ticker=VNINDEX | Use a fallback value (e.g., 0%) or notify user | Filtering logic breaks |
| Volume string with commas | Volume column comes as "1,234,500" | Parse string to integer correctly | Volume check fails (NaN) |

### Exception Handling
| Exception Type | Source | Handling Strategy | Recovery Action |
|----------------|--------|-------------------|-----------------|
| Network Error | `fetch` or JSONP | Catch error, update UI status | Retry after 60s automatically |
| Parse Error | Missing columns in Sheet | Fallback to default values (0) | Skip invalid rows |

### Race Conditions
*No shared write state or concurrent database access exists (read-only from Google Sheets).*

## Phase 3: Implementation Planning

### Directory Structure
```
bo_loc_co_phieu/
├── index.html        # Entry point: Layout & UI elements
├── style.css         # Styling: Glassmorphism, animations
└── app.js            # Logic: Data fetching, parsing, filtering
```

### Proposed Changes

#### [MODIFY] [index.html](file:///c:/Users/long.DESKTOP-DCLSBL3/Documents/workspace/bo_loc_co_phieu/index.html)
- Rewrite semantic HTML structure.
- Add tabs for Requirement 1, Requirement 2, and Sector Dashboard.
- Add configuration modal/section for Google Sheet links.

#### [MODIFY] [style.css](file:///c:/Users/long.DESKTOP-DCLSBL3/Documents/workspace/bo_loc_co_phieu/style.css)
- Implement modern, premium aesthetics (dark mode, glassmorphism).
- Ensure responsive tables and smooth tab transitions.

#### [MODIFY] [app.js](file:///c:/Users/long.DESKTOP-DCLSBL3/Documents/workspace/bo_loc_co_phieu/app.js)
- Implement modular functions: `fetchData`, `parseGViz`, `filterReq1`, `filterReq2`, `renderTables`.
- Implement TDD-friendly pure functions for the filtering logic so they can be tested.

## User Review Required
> [!IMPORTANT]
> - Do you approve this architecture (Vanilla HTML/CSS/JS with GViz JSONP) and the directory structure? 
> - I will overwrite the existing 3 files to build it cleanly from scratch. Is that okay?

## Verification Plan
### Automated Tests
- I will create a `tests/filter.test.js` file to run simple Node.js unit tests for the filtering logic (`filterReq1` and `filterReq2`) using mock JSON data.
### Manual Verification
- Open `index.html` in the browser.
- Verify data loads properly.
- Check UI responsiveness and console errors.
