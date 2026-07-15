const DASHBOARD_ENDPOINT = "/api/market-dashboard";
const REFRESH_INTERVAL_MS = 60000;

let activeRequestId = 0;
let latestPayload = null;

function refreshIcons() {
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function formatNumber(value, digits = 2) {
    return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function formatVolume(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "N/A";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function setSyncStatus(type, payload = null, error = null) {
    const statusText = document.getElementById("sync-status");
    if (!statusText) {
        return;
    }

    if (type === "syncing") {
        statusText.innerHTML =
            '<span class="flex items-center text-yellow-400"><i data-lucide="refresh-cw" class="w-4 h-4 mr-2 animate-spin"></i> Dang dong bo du lieu thi truong...</span>';
        refreshIcons();
        return;
    }

    if (type === "error") {
        const errorMessage = escapeHtml(error?.message || "Khong the ket noi API noi bo.");
        statusText.innerHTML = `<span class="flex items-center text-red-500"><i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>Loi ket noi: ${errorMessage}</span>`;
        refreshIcons();
        return;
    }

    const dataDate = payload?.dataDate ? ` · Data ${escapeHtml(payload.dataDate)}` : "";
    statusText.innerHTML = `<span class="flex items-center text-green-400"><i data-lucide="check-circle" class="w-4 h-4 mr-2"></i>Da dong bo tu API noi bo${dataDate}</span>`;
    refreshIcons();
}

document.addEventListener("DOMContentLoaded", () => {
    refreshIcons();

    document.getElementById("btn-close-modal").addEventListener("click", () => {
        document.getElementById("config-modal").classList.add("hidden");
    });
    document.getElementById("modal-backdrop").addEventListener("click", () => {
        document.getElementById("config-modal").classList.add("hidden");
    });
    document.getElementById("btn-open-config").addEventListener("click", () => {
        document.getElementById("config-modal").classList.remove("hidden");
    });

    document.querySelectorAll(".tab-btn").forEach((button) => {
        button.addEventListener("click", (event) => {
            switchTab(event.currentTarget.dataset.tab);
        });
    });

    fetchDataAndProcess();
    setInterval(() => fetchDataAndProcess(true), REFRESH_INTERVAL_MS);
});

function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((button) => {
        const currentTabId = button.dataset.tab;
        const activeClasses =
            currentTabId === "req2"
                ? ["border-yellow-500", "text-yellow-400", "bg-yellow-500/10"]
                : ["border-emerald-500", "text-emerald-400", "bg-emerald-500/10"];

        if (currentTabId === tabId) {
            button.classList.add("active", ...activeClasses);
            button.classList.remove("border-transparent", "text-gray-400");
        } else {
            button.classList.remove("active", ...activeClasses);
            button.classList.add("border-transparent", "text-gray-400");
        }
    });

    document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `panel-${tabId}`);
    });
}

async function fetchDataAndProcess(isSilent = false) {
    const loader = document.getElementById("global-loader");
    const requestId = ++activeRequestId;

    if (!isSilent && loader) {
        loader.classList.remove("hidden");
    }

    setSyncStatus("syncing");

    try {
        const response = await fetch(`${DASHBOARD_ENDPOINT}?t=${Date.now()}${isSilent ? "&silent=1" : ""}`, {
            headers: {
                Accept: "application/json"
            }
        });
        const payload = await response.json();

        if (requestId !== activeRequestId) {
            return;
        }

        if (!response.ok) {
            throw new Error(payload?.error?.message || "API noi bo tra ve loi.");
        }

        latestPayload = payload;
        renderDashboard(payload);
        setSyncStatus("ready", payload);
    } catch (error) {
        console.error(error);

        if (requestId !== activeRequestId) {
            return;
        }

        if (!latestPayload) {
            renderDashboard({
                warnings: [
                    {
                        code: "API_ERROR",
                        message: error?.message || "Khong the ket noi API noi bo."
                    }
                ],
                req1Rows: [],
                req2Rows: [],
                meta: {
                    rsDates: []
                }
            });
        } else {
            renderWarnings([
                {
                    code: "API_REFRESH_ERROR",
                    message: error?.message || "Lan dong bo moi nhat that bai. Dang giu du lieu cu."
                },
                ...(latestPayload.warnings || [])
            ]);
        }

        setSyncStatus("error", null, error);
    } finally {
        if (!isSilent && loader) {
            loader.classList.add("hidden");
        }
        refreshIcons();
    }
}

function renderDashboard(payload) {
    renderWarnings(payload.warnings || []);
    renderReq1(payload.req1Rows || [], payload.meta?.rsDates || []);
    renderReq2(payload.req2Rows || []);
    renderSourceInfo(payload);
}

function renderWarnings(warnings) {
    const banner = document.getElementById("warning-banner");
    const list = document.getElementById("warning-list");

    if (!banner || !list) {
        return;
    }

    if (!warnings.length) {
        banner.classList.add("hidden");
        list.innerHTML = "";
        return;
    }

    list.innerHTML = warnings
        .map((warning) => {
            return `
                <div class="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                    <div class="text-xs font-mono text-amber-300">${escapeHtml(warning.code)}</div>
                    <div class="mt-1 text-sm text-amber-100">${escapeHtml(warning.message)}</div>
                </div>
            `;
        })
        .join("");

    banner.classList.remove("hidden");
}

function renderSourceInfo(payload) {
    const meta = payload?.meta || {};
    document.getElementById("data-source-name").textContent = payload?.source || "supabase";
    document.getElementById("data-sync-date").textContent = payload?.dataDate || "N/A";
    document.getElementById("data-universe").textContent = `${meta.eligibleUniverseSize ?? 0} / ${meta.universeSize ?? 0}`;
    document.getElementById("data-benchmark").textContent = meta.benchmarkAvailable
        ? meta.benchmarkSymbol || "VNINDEX"
        : "Chua san sang";
    document.getElementById("data-view").textContent = meta.snapshotView || "stock_latest_snapshot";
}

function renderReq1(data, rsDates) {
    const tbody = document.getElementById("tbody-req1");
    tbody.innerHTML = "";

    document.getElementById("req1-date1").textContent = rsDates[0] || "D1 RS";
    document.getElementById("req1-date2").textContent = rsDates[1] || "D2 RS";
    document.getElementById("req1-date3").textContent = rsDates[2] || "D3 RS";

    if (!data.length) {
        tbody.innerHTML =
            '<tr><td colspan="8" class="text-center py-8 text-gray-500">Khong co co phieu thoa man tieu chi trong snapshot hien tai.</td></tr>';
        return;
    }

    data.forEach((item, index) => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${index + 1}</td>
                <td class="py-3 px-4 font-bold text-green-400">${escapeHtml(item.symbol)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.roc26)}%</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.close)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatVolume(item.volume)}</td>
                <td class="py-3 px-4 text-right font-mono text-slate-300">${formatNumber(item.rs3)}</td>
                <td class="py-3 px-4 text-right font-mono text-slate-300">${formatNumber(item.rs2)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-green-400">${formatNumber(item.rs1)}</td>
            </tr>
        `;
    });
}

function renderReq2(data) {
    const tbody = document.getElementById("tbody-req2");
    tbody.innerHTML = "";

    if (!data.length) {
        tbody.innerHTML =
            '<tr><td colspan="11" class="text-center py-8 text-gray-500">Khong co co phieu thoa man tieu chi (>= 4/6).</td></tr>';
        return;
    }

    data.forEach((item, index) => {
        const tooltipPos = index < 2 ? "top-0 right-full mr-2" : "bottom-0 right-full mr-2";
        const statusBadge = item.isBuyActivated
            ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/30 shadow-[0_0_8px_rgba(34,197,94,0.2)]">MUA CHUAN</span>'
            : '<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700/60">Theo doi</span>';

        tbody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${index + 1}</td>
                <td class="py-3 px-4 font-bold text-yellow-400">${escapeHtml(item.symbol)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.close)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatVolume(item.volume)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.roc26)}%</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.ma20)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.ma50)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.ma50_tb5d, 4)}</td>
                <td class="py-3 px-4 text-right font-mono">${formatNumber(item.rs_avg)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-yellow-400 relative">
                    <div class="relative group inline-block cursor-help select-none">
                        <span class="border-b border-dashed border-yellow-500/50">${item.sScore}/6</span>
                        <div class="absolute ${tooltipPos} hidden group-hover:block bg-slate-900 border border-slate-700/85 text-xs text-slate-300 rounded-lg p-3 w-60 shadow-2xl z-50 font-sans text-left space-y-1 backdrop-blur-md">
                            <div class="font-bold text-white mb-1.5 border-b border-slate-800 pb-1 flex items-center justify-between">
                                <span>Tieu chi ky thuat</span>
                                <span class="text-yellow-400">${item.sScore}/6</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>1. Vol > 300K:</span>
                                <span class="${item.cond1 ? "text-yellow-400 font-bold" : "text-slate-500"}">${item.cond1 ? "Dat" : "Khong"}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>2. RS [75-90]:</span>
                                <span class="${item.cond2 ? "text-yellow-400 font-bold" : "text-slate-500"}">${item.cond2 ? "Dat" : "Khong"}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>3. ROC26 > VNI & [10-20%]:</span>
                                <span class="${item.cond3 ? "text-yellow-400 font-bold" : "text-slate-500"}">${item.cond3 ? "Dat" : "Khong"}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>4. Gia > MA20:</span>
                                <span class="${item.cond4 ? "text-yellow-400 font-bold" : "text-slate-500"}">${item.cond4 ? "Dat" : "Khong"}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>5. MA20 > MA50:</span>
                                <span class="${item.cond5 ? "text-yellow-400 font-bold" : "text-slate-500"}">${item.cond5 ? "Dat" : "Khong"}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>6. MA50 huong len:</span>
                                <span class="${item.cond6 ? "text-yellow-400 font-bold" : "text-slate-500"}">${item.cond6 ? "Dat" : "Khong"}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 text-center">${statusBadge}</td>
            </tr>
        `;
    });
}
