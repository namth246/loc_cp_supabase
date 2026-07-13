// Khởi tạo các biến toàn cục
const DEFAULT_SHEET = "https://docs.google.com/spreadsheets/d/1ZLx75NBs-OszJ618M4zvrYfhAxWhxz_AdZ87tD9yUkE/edit";
const GID_DATA_CLEAN = "0";
const GID_TOP_10 = "1972065177";
const GID_NGANH = "1950627905";

let dataSheet1 = [];
let dataSheet2 = [];
let dataSheet3 = [];

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
    const cols = data.table.cols.map((c, i) => c ? (c.label || c.id || `Col${i}`) : `Col${i}`);
    let rows = data.table.rows.map(row => {
        let obj = {};
        if (row && row.c) {
            cols.forEach((colName, i) => {
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
            });
        }
        return obj;
    });
    rows.headers = cols.map(c => c.trim());
    return rows;
}

/**
 * Chuẩn hóa dữ liệu Sheet 1 để dễ lọc
 */
function normalizeSheet1(rawData) {
    return rawData
        .filter(row => {
            const ticker = row["Thông tin định danh và Ngành"];
            return ticker && ticker !== "Cổ Phiếu" && ticker !== "Ticker";
        })
        .map(row => {
            return {
                ticker: row["Thông tin định danh và Ngành"],
                sector: row["B"] || "",
                close: parseFloat(row["C"]) || 0,
                high_tb4d: parseFloat(row["D"]) || 0,
                volume: parseVol(row["Khối lượng giao dịch"]),
                vol_tb10d: parseVol(row["F"]),
                rs1: parseFloat(row["Chỉ Số Sức Mạnh và Biến Động"]) || 0,
                rs2: parseFloat(row["I"]) || 0,
                rs3: parseFloat(row["J"]) || 0,
                rs_avg: parseFloat(row["K"]) || 0,
                roc26: parseFloat(row["L"]) || 0,
                ma10: parseFloat(row["Các đường trung bình động"]) || 0,
                ma20: parseFloat(row["N"]) || 0,
                ma50: parseFloat(row["O"]) || 0,
                ma50_tb5d: parseFloat(row["MA50-TB5D"]) || 0
            };
        });
}

/**
 * Xây dựng RS Map từ Sheet 2 (lấy 3 cột gần nhất)
 */
function buildVNIMap(rawData) {
    let vniMap = {};
    rawData.forEach(row => {
        let ticker = row["CP"];
        if (ticker) {
            vniMap[ticker] = {
                rocGreaterVni: row["ROC26 > VNI"] === "TRUE" || row["ROC26 > VNI"] === "True" || row["ROC26 > VNI"] === true
            };
        }
    });
    return vniMap;
}

/**
 * Requirement 1: Top 10 cổ phiếu tiếp diễn dòng tiền
 */
function filterReq1(normSheet1, vniMap) {
    let valid = normSheet1.filter(s => s.ticker !== "VNINDEX" && s.ticker !== "HNXINDEX");

    let filtered = valid.filter(stock => {
        if (stock.volume <= 300000) return false;

        const mapped = vniMap[stock.ticker];
        const rocGreaterVni = mapped ? mapped.rocGreaterVni : (stock.roc26 > 0);
        if (!rocGreaterVni) return false;

        return true;
    });

    filtered.sort((a, b) => b.rs1 - a.rs1);
    return filtered.slice(0, 10);
}

function filterReq2(normSheet1, vniMap) {
    let valid = normSheet1.filter(s => s.ticker !== "VNINDEX" && s.ticker !== "HNXINDEX");

    let matching = valid.filter(stock => {
        if (stock.volume <= 300000) return false;
        if (stock.close <= stock.high_tb4d) return false;
        if (stock.vol_tb10d <= 0 || (stock.volume / stock.vol_tb10d) <= 1.5) return false;
        if (stock.roc26 < 10 || stock.roc26 > 20) return false;

        return true;
    });

    matching.forEach(stock => {
        stock.cond1 = stock.volume > 300000;

        // Đồng bộ với công thức Excel: Chỉ số RS_avg nằm trong khoảng [75, 90]
        stock.cond2 = stock.rs_avg >= 75 && stock.rs_avg <= 90;

        // Đồng bộ với công thức Excel: ROC26 > VNINDEX
        const mapped = vniMap[stock.ticker];
        stock.cond3 = mapped ? mapped.rocGreaterVni : (stock.roc26 > 0);

        stock.cond4 = stock.close > stock.ma20;
        stock.cond5 = stock.ma20 > stock.ma50;
        stock.cond6 = stock.ma50_tb5d > 0;

        stock.sScore = [stock.cond1, stock.cond2, stock.cond3, stock.cond4, stock.cond5, stock.cond6].filter(Boolean).length;
    });

    // Chỉ lấy những cổ phiếu thỏa mãn từ 4 tiêu chí trở lên (S-Score >= 4/6)
    let filteredMatching = matching.filter(stock => stock.sScore >= 4);

    filteredMatching.sort((a, b) => {
        if (b.sScore !== a.sScore) {
            return b.sScore - a.sScore;
        }
        return b.rs_avg - a.rs_avg;
    });

    return filteredMatching.slice(0, 10);
}

// Export functions for test environment (if applicable)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseVol, parseGViz, normalizeSheet1, buildVNIMap, filterReq1, filterReq2 };
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
        const currentTabId = btn.dataset.tab;
        
        let activeClasses = ['border-emerald-500', 'text-emerald-400', 'bg-emerald-500/10'];
        if (currentTabId === 'req2') {
            activeClasses = ['border-yellow-500', 'text-yellow-400', 'bg-yellow-500/10'];
        } else if (currentTabId === 'req3') {
            activeClasses = ['border-blue-500', 'text-blue-400', 'bg-blue-500/10'];
        }

        if (currentTabId === tabId) {
            btn.classList.add('active', ...activeClasses);
            btn.classList.remove('border-transparent', 'text-gray-400');
        } else {
            btn.classList.remove('active', ...activeClasses);
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

function convertToGVizUrl(url, gid) {
    if (!url) return "";
    let base = url;
    if (url.includes("/gviz/tq")) {
        base = url.split("?")[0];
    } else {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
            base = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq`;
        }
    }
    return `${base}?headers=1&gid=${gid}`;
}

function saveLinksAndRefresh() {
    const link = document.getElementById('link-sheet').value.trim();
    if (link) localStorage.setItem('link_sheet', link);
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
        const mainLink = localStorage.getItem('link_sheet') || DEFAULT_SHEET;
        document.getElementById('link-sheet').value = mainLink;

        const promises = [
            loadJSONP(convertToGVizUrl(mainLink, GID_DATA_CLEAN)),
            loadJSONP(convertToGVizUrl(mainLink, GID_TOP_10)),
            loadJSONP(convertToGVizUrl(mainLink, GID_NGANH))
        ];

        const results = await Promise.all(promises);

        dataSheet1 = parseGViz(results[0]);
        dataSheet2 = parseGViz(results[1]);
        dataSheet3 = parseGViz(results[2]);

        const normSheet1 = normalizeSheet1(dataSheet1);
        const vniMap = buildVNIMap(dataSheet2);

        // Extract date headers from GID 0
        const headerRow = dataSheet1.find(row => row["Thông tin định danh và Ngành"] === "Cổ Phiếu");
        const rsDates = [
            headerRow ? headerRow["Chỉ Số Sức Mạnh và Biến Động"] : "D1 RS",
            headerRow ? headerRow["I"] : "D2 RS",
            headerRow ? headerRow["J"] : "D3 RS"
        ];



        const resReq1 = filterReq1(normSheet1, vniMap);
        const resReq2 = filterReq2(normSheet1, vniMap);

        renderReq1(resReq1, rsDates);
        renderReq2(resReq2);
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

function renderReq1(data, rsDates) {
    const tbody = document.getElementById('tbody-req1');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">Không có cổ phiếu thỏa mãn tiêu chí</td></tr>';
        return;
    }

    document.getElementById('req1-date1').textContent = rsDates[0] || 'D1 RS';
    document.getElementById('req1-date2').textContent = rsDates[1] || 'D2 RS';
    document.getElementById('req1-date3').textContent = rsDates[2] || 'D3 RS';

    data.forEach((item, idx) => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${idx + 1}</td>
                <td class="py-3 px-4 font-bold text-green-400">${item.ticker}</td>
                <td class="py-3 px-4 text-right font-mono">${item.roc26.toFixed(2)}%</td>
                <td class="py-3 px-4 text-right font-mono">${item.close.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.volume.toLocaleString()}</td>
                <td class="py-3 px-4 text-right font-mono text-slate-300">${item.rs3.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono text-slate-300">${item.rs2.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-green-400">${item.rs1.toFixed(2)}</td>
            </tr>
        `;
    });
}

function renderReq2(data) {
    const tbody = document.getElementById('tbody-req2');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-gray-500">Không có cổ phiếu thỏa mãn tiêu chí (>= 4/6)</td></tr>';
        return;
    }

    data.forEach((item, idx) => {
        // Tránh tooltip bị che khuất ở đầu hoặc cuối bảng bằng cách đổi vị trí top-0 / bottom-0 sang trái (right-full)
        const tooltipPos = idx < 2 ? 'top-0 right-full mr-2' : 'bottom-0 right-full mr-2';

        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${idx + 1}</td>
                <td class="py-3 px-4 font-bold text-yellow-400">${item.ticker}</td>
                <td class="py-3 px-4 text-right font-mono">${item.close.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.volume.toLocaleString()}</td>
                <td class="py-3 px-4 text-right font-mono">${item.roc26.toFixed(2)}%</td>
                <td class="py-3 px-4 text-right font-mono">${item.ma20.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.ma50.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.ma50_tb5d.toFixed(4)}</td>
                <td class="py-3 px-4 text-right font-mono">${item.rs_avg.toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-yellow-400 relative">
                    <div class="relative group inline-block cursor-help select-none">
                        <span class="border-b border-dashed border-yellow-500/50">${item.sScore}/6</span>
                        <div class="absolute ${tooltipPos} hidden group-hover:block bg-slate-900 border border-slate-700/85 text-xs text-slate-300 rounded-lg p-3 w-60 shadow-2xl z-50 font-sans text-left space-y-1 backdrop-blur-md">
                            <div class="font-bold text-white mb-1.5 border-b border-slate-800 pb-1 flex items-center justify-between">
                                <span>Tiêu chí kỹ thuật</span>
                                <span class="text-yellow-400">${item.sScore}/6</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>1. Vol > 300K:</span>
                                <span class="${item.cond1 ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${item.cond1 ? 'Đạt' : 'Không'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>2. RS [75-90] (3P & TB):</span>
                                <span class="${item.cond2 ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${item.cond2 ? 'Đạt' : 'Không'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>3. ROC26 > VNI & [10-20%]:</span>
                                <span class="${item.cond3 ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${item.cond3 ? 'Đạt' : 'Không'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>4. Giá > MA20:</span>
                                <span class="${item.cond4 ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${item.cond4 ? 'Đạt' : 'Không'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>5. MA20 > MA50:</span>
                                <span class="${item.cond5 ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${item.cond5 ? 'Đạt' : 'Không'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>6. MA50 Hướng lên:</span>
                                <span class="${item.cond6 ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${item.cond6 ? 'Đạt' : 'Không'}</span>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderReq3(data) {
    const tbody = document.getElementById('tbody-req3');
    tbody.innerHTML = '';

    const validData = data.filter(row => {
        const sectorEnglish = row["B"];
        const sectorVietnamese = row["RS Rating"];
        const avgVal = row["C"];
        return sectorEnglish && sectorEnglish !== "Row Labels" && 
               sectorVietnamese && sectorVietnamese !== "NGÀNH" && 
               avgVal && avgVal !== "";
    });

    if (validData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-gray-500">Chưa có dữ liệu hoặc định dạng không đúng.</td></tr>';
        return;
    }

    const colX = "Ngành";
    const colY = "Sức mạnh RS";

    document.getElementById('req3-colX').textContent = colX;
    document.getElementById('req3-colY').textContent = colY;

    const parseNum = val => parseFloat(String(val).replace(/%/g, '').replace(/,/g, '.').trim()) || 0;

    let sortedData = [...validData].sort((a, b) => parseNum(b["C"]) - parseNum(a["C"]));
    let maxY = Math.max(...sortedData.map(item => parseNum(item["C"])));
    if (maxY <= 0) maxY = 100;

    sortedData.forEach((item, idx) => {
        const yVal = parseNum(item["C"]);
        const width = Math.min(100, Math.max(0, (yVal / maxY) * 100));
        const displayName = item["RS Rating"] || item["B"];

        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 relative">
                <td class="py-3 px-4 text-center font-mono text-slate-400 relative z-10">${idx + 1}</td>
                <td class="py-3 px-4 font-bold text-blue-400 relative z-10">${displayName}</td>
                <td class="py-3 px-4 text-right font-mono relative z-10 w-1/2">
                    <div class="absolute right-4 top-2 bottom-2 bg-blue-500/20 rounded z-0" style="width: ${width}%;"></div>
                    <span class="relative z-10 pr-2">${yVal.toFixed(2)}%</span>
                </td>
            </tr>
        `;
    });
}
