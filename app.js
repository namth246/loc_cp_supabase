// Khởi tạo các biến toàn cục
const DEFAULT_SHEET_1 = "https://docs.google.com/spreadsheets/d/1m72-Px2PwWK3CNV4lu3LiX8McVTUGkrkctDBW73bqDM/edit";
const DEFAULT_SHEET_2 = "https://docs.google.com/spreadsheets/d/1HE4V8twdmGLUUCFWrQEnNmzWchCf61vzqSuq891XTDc/edit";
const DEFAULT_SHEET_3 = "";

let dataSheet1 = [];
let dataSheet2 = [];
let dataSheet3 = [];
let vnindexChange = 0;

// === PURE FUNCTIONS FOR FILTERING (TDD Friendly) ===

/**
 * Hàm hỗ trợ parse chuỗi số thành float, loại bỏ dấu phẩy
 */
function parseVol(val) {
    if (!val) return 0;
    let clean = String(val).replace(/,/g, '').trim();
    return parseFloat(clean) || 0;
}

/**
 * Xử lý dữ liệu thô từ GViz JSONP thành mảng đối tượng
 */
function parseGViz(data) {
    if (!data || !data.table || !data.table.cols || !data.table.rows) return [];
    const cols = data.table.cols.map(c => c ? (c.label || "") : "");
    let rows = data.table.rows.map(row => {
        let obj = {};
        if (row && row.c) {
            cols.forEach((colName, i) => {
                if (colName && colName.trim() !== "") {
                    let cell = row.c[i];
                    let val = "";
                    if (cell !== null && cell !== undefined) {
                        if (cell.f !== undefined && cell.f !== null) {
                            val = cell.f;
                        } else if (cell.v !== null && cell.v !== undefined) {
                            val = cell.v;
                        }
                    }
                    obj[colName.trim()] = String(val).trim();
                }
            });
        }
        return obj;
    });
    rows.headers = cols.map(c => c.trim()).filter(c => c !== "");
    return rows;
}

/**
 * Chuẩn hóa dữ liệu Sheet 1 để dễ lọc
 */
function normalizeSheet1(rawData) {
    return rawData
        .filter(obj => obj["CP"] || obj["Ticker"])
        .map(row => {
            return {
                ticker: row["Ticker"] || row["CP"],
                change26D: parseFloat(row["26D change (%)"]) || 0,
                close: parseFloat(row["Close"]) || 0,
                ma50: parseFloat(row["MA50"]) || 0,
                volume: parseVol(row["Volume"])
            };
        });
}

/**
 * Xây dựng RS Map từ Sheet 2 (lấy 3 cột gần nhất)
 */
function buildRSMap(rawData) {
    const headers = rawData.headers || (rawData.length > 0 ? Object.keys(rawData[0]) : []);
    const date1 = headers[3];
    const date2 = headers[4];
    const date3 = headers[5];

    let rsMap = {};
    rawData.forEach(row => {
        let ticker = row["CP"];
        if (ticker) {
            rsMap[ticker] = {
                rs1: parseFloat(row[date1]) || 0,
                rs2: parseFloat(row[date2]) || 0,
                rs3: parseFloat(row[date3]) || 0,
                dates: [date1, date2, date3]
            };
        }
    });
    return rsMap;
}

/**
 * Requirement 1: Top 10 cổ phiếu tiếp diễn dòng tiền
 */
function filterReq1(normSheet1, rsMap, vnidxChange) {
    // Loại trừ VNINDEX & HNXINDEX
    let valid = normSheet1.filter(s => s.ticker !== "VNINDEX" && s.ticker !== "HNXINDEX");

    // Bước 1: Sắp xếp theo 26D change giảm dần, lấy top 20 cao nhất có 26D > VNINDEX
    valid.sort((a, b) => b.change26D - a.change26D);
    let top20 = valid.slice(0, 20);

    let result = top20.filter(stock => {
        if (stock.change26D <= vnidxChange) return false;

        // Bước 2: RS > 85 trong 3 ngày
        const rs = rsMap[stock.ticker];
        if (!rs || rs.rs1 <= 85 || rs.rs2 <= 85 || rs.rs3 <= 85) return false;

        // Bước 3: Volume > 300,000
        let vol = stock.volume;
        if (vol < 10000) vol = vol * 1000; // heuristic fix cho định dạng lỗi K
        if (vol <= 300000) return false;

        return true;
    });

    // Bước 4: Sắp xếp theo RS mới nhất giảm dần
    result.sort((a, b) => (rsMap[b.ticker]?.rs1 || 0) - (rsMap[a.ticker]?.rs1 || 0));
    return result.slice(0, 10);
}

/**
 * Requirement 2: Top 10 cổ phiếu đột biến
 */
function filterReq2(normSheet1, rsMap) {
    let valid = normSheet1.filter(s => s.ticker !== "VNINDEX" && s.ticker !== "HNXINDEX");
    valid.sort((a, b) => b.change26D - a.change26D);

    // Bước 1: Top 21 - 50 (30 cổ phiếu)
    let top21to50 = valid.slice(20, 50);

    let result = top21to50.filter(stock => {
        // Bước 2: RS trong khoảng 75-85 trong 3 ngày
        const rs = rsMap[stock.ticker];
        if (!rs) return false;
        if (rs.rs1 < 75 || rs.rs1 > 85 || rs.rs2 < 75 || rs.rs2 > 85 || rs.rs3 < 75 || rs.rs3 > 85) return false;

        // Bước 3: Close > MA50
        if (stock.close <= stock.ma50) return false;

        // Bước 4: Volume > 300,000
        let vol = stock.volume;
        if (vol < 10000) vol = vol * 1000;
        if (vol <= 300000) return false;

        return true;
    });

    // Bước 5: Sắp xếp theo RS mới nhất giảm dần
    result.sort((a, b) => (rsMap[b.ticker]?.rs1 || 0) - (rsMap[a.ticker]?.rs1 || 0));
    return result.slice(0, 10);
}

// Export functions for test environment (if applicable)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseVol, parseGViz, normalizeSheet1, buildRSMap, filterReq1, filterReq2 };
}

// === DOM AND APP LOGIC ===

document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    document.getElementById('btn-save-config').addEventListener('click', saveLinksAndRefresh);
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('config-modal').classList.add('hidden');
    });
    document.getElementById('btn-open-config').addEventListener('click', () => {
        document.getElementById('config-modal').classList.remove('hidden');
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = e.currentTarget.dataset.tab;
            switchTab(tabId);
        });
    });

    fetchDataAndProcess();
    setInterval(() => fetchDataAndProcess(true), 60000);
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active', 'border-primary', 'text-primary');
            btn.classList.remove('border-transparent', 'text-gray-400');
        } else {
            btn.classList.remove('active', 'border-primary', 'text-primary');
            btn.classList.add('border-transparent', 'text-gray-400');
        }
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        if (panel.id === `panel-${tabId}`) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

function loadJSONP(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'gviz_' + Math.round(100000 * Math.random());
        window[callbackName] = function (data) {
            delete window[callbackName];
            resolve(data);
        };
        const script = document.createElement('script');
        script.src = url + "&tqx=out:json;responseHandler:" + callbackName;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function convertToGVizUrl(url) {
    if (!url) return "";
    if (url.includes("/gviz/tq")) return url;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
        let base = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?headers=1`;
        const gidMatch = url.match(/[#&]gid=([0-9]+)/);
        if (gidMatch && gidMatch[1]) {
            base += `&gid=${gidMatch[1]}`;
        }
        return base;
    }
    return url;
}

function saveLinksAndRefresh() {
    const l1 = document.getElementById('link-sheet1').value.trim();
    const l2 = document.getElementById('link-sheet2').value.trim();
    const l3 = document.getElementById('link-sheet3').value.trim();

    if (l1) localStorage.setItem('link_sheet1', l1);
    if (l2) localStorage.setItem('link_sheet2', l2);
    if (l3) localStorage.setItem('link_sheet3', l3);

    document.getElementById('config-modal').classList.add('hidden');
    fetchDataAndProcess();
}

async function fetchDataAndProcess(isSilent = false) {
    const loader = document.getElementById('global-loader');
    const statusText = document.getElementById('sync-status');

    if (!isSilent && loader) loader.classList.remove('hidden');
    if (statusText) statusText.innerHTML = '<span class="flex items-center text-yellow-400"><i data-lucide="refresh-cw" class="w-4 h-4 mr-2 animate-spin"></i> Đang đồng bộ...</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const link1 = localStorage.getItem('link_sheet1') || DEFAULT_SHEET_1;
        const link2 = localStorage.getItem('link_sheet2') || DEFAULT_SHEET_2;
        const link3 = localStorage.getItem('link_sheet3') || DEFAULT_SHEET_3;

        document.getElementById('link-sheet1').value = link1;
        document.getElementById('link-sheet2').value = link2;
        document.getElementById('link-sheet3').value = link3;

        const promises = [
            loadJSONP(convertToGVizUrl(link1)),
            loadJSONP(convertToGVizUrl(link2))
        ];
        if (link3) promises.push(loadJSONP(convertToGVizUrl(link3)));

        const results = await Promise.all(promises);

        dataSheet1 = parseGViz(results[0]);
        dataSheet2 = parseGViz(results[1]);
        dataSheet3 = results[2] ? parseGViz(results[2]) : [];

        // Tìm giá trị VNINDEX
        const vnindexRow = dataSheet1.find(row => row["Ticker"] === "VNINDEX" || row["CP"] === "VNINDEX");
        vnindexChange = vnindexRow ? (parseFloat(vnindexRow["26D change (%)"]) || 0) : 0;
        document.getElementById('vnindex-val').textContent = vnindexChange.toFixed(2) + '%';

        const normSheet1 = normalizeSheet1(dataSheet1);
        const rsMap = buildRSMap(dataSheet2);

        const resReq1 = filterReq1(normSheet1, rsMap, vnindexChange);
        const resReq2 = filterReq2(normSheet1, rsMap);

        renderReq1(resReq1, rsMap);
        renderReq2(resReq2, rsMap);
        renderReq3(dataSheet3);

        if (statusText) statusText.innerHTML = '<span class="flex items-center text-green-400"><i data-lucide="check-circle" class="w-4 h-4 mr-2"></i> Đã đồng bộ</span>';
    } catch (e) {
        console.error(e);
        if (statusText) statusText.innerHTML = '<span class="flex items-center text-red-500"><i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i> Lỗi kết nối</span>';
    } finally {
        if (!isSilent && loader) loader.classList.add('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// === RENDER FUNCTIONS ===

function renderReq1(data, rsMap) {
    const tbody = document.getElementById('tbody-req1');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">Không có cổ phiếu thỏa mãn tiêu chí</td></tr>';
        return;
    }

    // Set table headers based on RS dates
    const someTicker = Object.keys(rsMap)[0];
    const dates = someTicker ? rsMap[someTicker].dates : ['Gần nhất', 'Trước 1 ngày', 'Trước 2 ngày'];
    document.getElementById('req1-date1').textContent = dates[0] || 'D1';
    document.getElementById('req1-date2').textContent = dates[1] || 'D2';
    document.getElementById('req1-date3').textContent = dates[2] || 'D3';

    data.forEach((item, idx) => {
        const rs = rsMap[item.ticker];
        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${idx + 1}</td>
                <td class="py-3 px-4 font-bold text-green-400">${item.ticker}</td>
                <td class="py-3 px-4 text-right font-mono">${item.change26D.toFixed(2)}%</td>
                <td class="py-3 px-4 text-right font-mono">${item.close.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.volume.toLocaleString()}</td>
                <td class="py-3 px-4 text-right font-mono text-slate-300">${rs.rs3.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono text-slate-300">${rs.rs2.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-green-400">${rs.rs1.toFixed(2)}</td>
            </tr>
        `;
    });
}

function renderReq2(data, rsMap) {
    const tbody = document.getElementById('tbody-req2');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">Không có cổ phiếu thỏa mãn tiêu chí</td></tr>';
        return;
    }

    const someTicker = Object.keys(rsMap)[0];
    const dates = someTicker ? rsMap[someTicker].dates : ['Gần nhất'];
    document.getElementById('req2-date1').textContent = dates[0] || 'D1';

    data.forEach((item, idx) => {
        const rs = rsMap[item.ticker];
        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${idx + 1}</td>
                <td class="py-3 px-4 font-bold text-yellow-400">${item.ticker}</td>
                <td class="py-3 px-4 text-right font-mono">${item.change26D.toFixed(2)}%</td>
                <td class="py-3 px-4 text-right font-mono">${item.ma50.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono text-green-400">${item.close.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.volume.toLocaleString()}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-yellow-400">${rs.rs1.toFixed(2)}</td>
            </tr>
        `;
    });
}

function renderReq3(data) {
    const tbody = document.getElementById('tbody-req3');
    tbody.innerHTML = '';

    const validData = data.filter(item => Object.values(item).some(v => v !== ""));
    if (validData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-gray-500">Chưa có dữ liệu. Vui lòng cấu hình Link Google Sheet 3.</td></tr>';
        return;
    }

    const keys = data.headers || Object.keys(validData[0]);
    let colX = keys.find(k => k.trim().toLowerCase() === "ngành") || keys[0];
    let colY = keys.find(k => k.trim().toLowerCase() === "tb(%)") || keys[1];

    if (!colX || !colY) return;

    document.getElementById('req3-colX').textContent = colX;
    document.getElementById('req3-colY').textContent = colY;

    const parseNum = val => parseFloat(String(val).replace(/%/g, '').replace(/,/g, '.').trim()) || 0;

    let sortedData = [...validData].sort((a, b) => parseNum(b[colY]) - parseNum(a[colY]));
    let maxY = Math.max(...sortedData.map(item => parseNum(item[colY])));
    if (maxY <= 0) maxY = 100;

    sortedData.forEach((item, idx) => {
        const yVal = parseNum(item[colY]);
        const width = Math.min(100, Math.max(0, (yVal / maxY) * 100));

        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 relative">
                <td class="py-3 px-4 text-center font-mono text-slate-400 relative z-10">${idx + 1}</td>
                <td class="py-3 px-4 font-bold text-blue-400 relative z-10">${item[colX] || ''}</td>
                <td class="py-3 px-4 text-right font-mono relative z-10 w-1/2">
                    <div class="absolute right-4 top-2 bottom-2 bg-blue-500/20 rounded z-0" style="width: ${width}%;"></div>
                    <span class="relative z-10 pr-2">${item[colY] || ''}</span>
                </td>
            </tr>
        `;
    });
}
