// --- 1. ZMIENNE GLOBALNE I NAWIGACJA ---
let allocChart: any = null;
let growthChart: any = null;
let profitBarChart: any = null;
let roiChart: any = null;
let bondsTreemapChart: any = null;
let stocksTreemapChart: any = null;

let currentStatView = 0; // 0: Depozyty, 1: Zysk Netto, 2: ROI
let cachedTotalDeposits = 0;
let cachedTotalNetProfit = 0;
let currentJournalEntries: any[] = [];
let currentDeposits: any[] = [];
let currentProfits: any[] = [];

// MOTYW
// --- OBSŁUGA MOTYWU (JASNY/CIEMNY/SYSTEMOWY) ---
function applyTheme(theme: string) {
    if (theme === 'light') {
        document.documentElement.classList.add('light-mode');
    } else if (theme === 'dark') {
        document.documentElement.classList.remove('light-mode');
    } else if (theme === 'system') {
        // Magiczna funkcja odpytująca system operacyjny o jego obecny kolor!
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.documentElement.classList.remove('light-mode');
        } else {
            document.documentElement.classList.add('light-mode');
        }
    }
}

// 1. Odczytanie i nałożenie motywu od razu przy starcie aplikacji
const savedTheme = localStorage.getItem('appTheme') || 'system';
applyTheme(savedTheme);

// 2. Automatyczne nasłuchiwanie na zmiany w systemie (np. gdy o 20:00 Windows włączy tryb ciemny)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentTheme = localStorage.getItem('appTheme') || 'system';
    if (currentTheme === 'system') {
        applyTheme('system'); // Reagujemy na żywo tylko, jeśli wybrano tryb "Systemowy"
    }
});

// --- ZMIENNE DO WIDŻETU WALUTOWEGO ---
let currentCurrencyView = 'USD';
let cachedAvgUsd = 0;
let cachedAvgEur = 0;
let cachedCurrentUsd = 0;
let cachedCurrentEur = 0;

function updateCurrencyWidgetUI() {
    const title = document.getElementById('currency-card-title');
    const currentRateEl = document.getElementById('currency-card-current');
    const avgEl = document.getElementById('currency-card-avg');
    const card = document.getElementById('clickable-currency-card');
    const description = document.getElementById('currency-description');

    if (!title || !currentRateEl || !avgEl || !card || !description) return;

    title.style.color = '#969696';
    currentRateEl.style.color = '#969696';

    if (currentCurrencyView === 'USD') {
        title.innerText = '$';
        currentRateEl.innerHTML = cachedCurrentUsd > 0 ? `Obecny kurs: \n<b>${cachedCurrentUsd.toFixed(4)} zł</b>` : 'Obecny kurs: -- zł';
        avgEl.innerText = cachedAvgUsd > 0 ? `${cachedAvgUsd.toFixed(4)} zł` : 'Brak danych';
        description.innerText = 'Średni kurs zakupu przy depozytach:';
        
        // Koloruj na zielono jeśli średnia jest mniejsza (kupiliśmy taniej) niż aktualny kurs
        if (cachedAvgUsd > 0 && cachedCurrentUsd > 0) {
            avgEl.style.color = cachedAvgUsd < cachedCurrentUsd ? '#4CAF50' : '#F44336';
        } else {
            avgEl.style.color = '#969696';
        }
    } else {
        title.innerText = '€';
        currentRateEl.innerHTML = cachedCurrentEur > 0 ? `Obecny kurs: \n<b>${cachedCurrentEur.toFixed(4)} zł</b>` : 'Obecny kurs: -- zł';
        avgEl.innerText = cachedAvgEur > 0 ? `${cachedAvgEur.toFixed(4)} zł` : 'Brak danych';
        description.innerText = 'Średni kurs zakupu przy depozytach:';
        
        if (cachedAvgEur > 0 && cachedCurrentEur > 0) {
            avgEl.style.color = cachedAvgEur < cachedCurrentEur ? '#4CAF50' : '#F44336';
        } else {
            avgEl.style.color = '#969696';
        }
    }
}

// --- USTAWIENIA (LocalStorage) ---
let userBrokers = JSON.parse(localStorage.getItem('userBrokers') || '[]');
if (userBrokers.length === 0) {
    userBrokers = [
        { name: "Akcje XTB", type: "Akcje" },
        { name: "Konto Oszczędnościowe", type: "Konta oszczędnościowe" }
    ];
    localStorage.setItem('userBrokers', JSON.stringify(userBrokers));
} else if (typeof userBrokers[0] === 'string') {
    userBrokers = userBrokers.map((b: string) => ({ name: b, type: "Inne" }));
    localStorage.setItem('userBrokers', JSON.stringify(userBrokers));
}

let userPortfolioThreshold = parseInt(localStorage.getItem('userPortfolioThreshold') || '20');

// Nawigacja
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        document.getElementById(target!)?.classList.add('active');
        
        if (target === 'journal') {
            setRandomQuote();
        }
    });
});

// Funkcja magiczna do kuponów: szuka kursu z DNI POPRZEDZAJĄCEGO (T-1) omijając weekendy
async function getNbpRateForPreviousBusinessDay(currency: string, targetDateStr: string): Promise<number> {
    if (currency === 'PLN' || !currency) return 1.0;
    
    let dateObj = new Date(targetDateStr);
    dateObj.setDate(dateObj.getDate() - 1); // Od razu cofamy o 1 dzień (wymóg prawny T-1)

    // Omijamy potencjalne puste dni NBP (weekendy, święta państwowe)
    for (let i = 0; i < 5; i++) {
        const dStr = dateObj.toISOString().split('T')[0];
        try {
            const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/A/${currency}/${dStr}?format=json`);
            if (res.ok) {
                const data = await res.json();
                return data.rates[0].mid; // Zwracamy prawidłowy kurs T-1
            }
        } catch (e) {}
        dateObj.setDate(dateObj.getDate() - 1); // Cofamy o kolejny dzień jeśli serwer NBP zwrócił błąd/404
    }
    return 1.0; // Ostateczny fallback w przypadku braku sieci
}

// --- 2. ZDARZENIA DOM (KLIKALNE KAFELKI I WIDOKI) ---
const modalSettings = document.getElementById('modal-settings') as HTMLDivElement;
const brokersListContainer = document.getElementById('setting-brokers-list');

function updateBrokerDropdowns() {
    const profBrokerSelect = document.getElementById('prof-broker') as HTMLSelectElement;
    const depDestSelect = document.getElementById('dep-dest') as HTMLSelectElement; 
    const transferFromSelect = document.getElementById('transfer-from') as HTMLSelectElement; 
    const transferToSelect = document.getElementById('transfer-to') as HTMLSelectElement; 
    const assetBrokerSelect = document.getElementById('asset-broker') as HTMLSelectElement; // DODANE
    
    if (profBrokerSelect) profBrokerSelect.innerHTML = '';
    if (depDestSelect) depDestSelect.innerHTML = '';
    if (transferFromSelect) transferFromSelect.innerHTML = '';
    if (transferToSelect) transferToSelect.innerHTML = '';
    if (assetBrokerSelect) assetBrokerSelect.innerHTML = ''; // DODANE

    userBrokers.forEach((b: any) => {
        if (profBrokerSelect) profBrokerSelect.innerHTML += `<option value="${b.name}">${b.name}</option>`;
        if (depDestSelect) depDestSelect.innerHTML += `<option value="${b.name}">${b.name}</option>`;
        if (transferFromSelect) transferFromSelect.innerHTML += `<option value="${b.name}">${b.name}</option>`;
        if (transferToSelect) transferToSelect.innerHTML += `<option value="${b.name}">${b.name}</option>`;
        if (assetBrokerSelect) assetBrokerSelect.innerHTML += `<option value="${b.name}">${b.name}</option>`; // DODANE
    });
}

function renderSettingsBrokers() {
    if (!brokersListContainer) return;
    brokersListContainer.innerHTML = '';
    userBrokers.forEach((broker: any, index: number) => {
        brokersListContainer.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(140,140,140,0.3);">
                <span><strong>${broker.name}</strong> <small style="color:#aaa;">(${broker.type})</small></span>
                <button class="btn btn-delete-broker-setting" data-index="${index}" style="font-size: 16px; background-color: var(--red); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    });
    updateBrokerDropdowns();
}

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DEKLARACJE ZMIENNYCH (tylko raz!) ---
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const selectPortfolioType = document.getElementById('setting-portfolio-type') as HTMLSelectElement;
    const brokersListContainer = document.getElementById('setting-brokers-list');

    // FMP API
    const inputFmpApiKey = document.getElementById('setting-fmp-api-key') as HTMLInputElement;
    const fmpToggle = document.getElementById('setting-fmp-toggle') as HTMLInputElement;
    const apiKeyContainer = document.getElementById('fmp-api-key-container');

    // Elementy nowego, małego okienka
    const modalAddBroker = document.getElementById('modal-add-broker') as HTMLDivElement;
    const btnOpenAddBroker = document.getElementById('btn-open-add-broker');
    const btnCancelAddBroker = document.getElementById('btn-cancel-add-broker');
    const btnConfirmAddBroker = document.getElementById('btn-confirm-add-broker');
    const inputNewBrokerName = document.getElementById('setting-new-broker-name') as HTMLInputElement;
    const selectNewBrokerType = document.getElementById('setting-new-broker-type') as HTMLSelectElement;

    // --- OBSŁUGA LISTY ROZWIJANEJ MOTYWU W USTAWIENIACH ---
    const selectTheme = document.getElementById('setting-theme') as HTMLSelectElement;
    if (selectTheme) {
        selectTheme.value = localStorage.getItem('appTheme') || 'system';
        selectTheme.addEventListener('change', () => {
            const newTheme = selectTheme.value;
            localStorage.setItem('appTheme', newTheme);
            applyTheme(newTheme);
        });
    }

    // --- OBSŁUGA FMP API I GŁÓWNYCH USTAWIEŃ ---
    
    // Reakcja na kliknięcie suwaka FMP
    fmpToggle?.addEventListener('change', () => {
        localStorage.setItem('fmpEnabled', fmpToggle.checked.toString());
        // Ukryj/pokaż pole na klucz
        if (apiKeyContainer) apiKeyContainer.style.display = fmpToggle.checked ? 'block' : 'none';
        // Odśwież watchlistę w tle, aby dodać/usunąć kolumny
        if(typeof (window as any).loadWatchlistData === 'function') {
            (window as any).loadWatchlistData();
        }
    });

    // Zapisywanie klucza FMP
    inputFmpApiKey?.addEventListener('input', () => {
        localStorage.setItem('fmpApiKey', inputFmpApiKey.value.trim());
    });
    inputFmpApiKey?.addEventListener('change', () => {
        localStorage.setItem('fmpApiKey', inputFmpApiKey.value.trim());
    });

    // Otwieranie głównych ustawień
    btnSettings?.addEventListener('click', () => {
        if (selectPortfolioType) selectPortfolioType.value = userPortfolioThreshold.toString();
        
        // Ładowanie zapisanych danych FMP po otwarciu okienka
        if (inputFmpApiKey) inputFmpApiKey.value = localStorage.getItem('fmpApiKey') || ''; 
        if (fmpToggle) fmpToggle.checked = localStorage.getItem('fmpEnabled') === 'true';
        if (apiKeyContainer) apiKeyContainer.style.display = fmpToggle?.checked ? 'block' : 'none';
        
        renderSettingsBrokers();
        modalSettings?.classList.remove('hidden');
    });

    // Zamykanie głównych ustawień
    btnCloseSettings?.addEventListener('click', () => {
        modalSettings?.classList.add('hidden');
    });

    selectPortfolioType?.addEventListener('change', () => {
        userPortfolioThreshold = parseInt(selectPortfolioType.value);
        localStorage.setItem('userPortfolioThreshold', userPortfolioThreshold.toString());
        if(typeof loadData === 'function') loadData(); 
    });

    // --- LOGIKA NOWEGO MODALA DO DODAWANIA ---
    // 1. Otwieranie małego modala
    btnOpenAddBroker?.addEventListener('click', () => {
        if (inputNewBrokerName) inputNewBrokerName.value = ''; // Czyszczenie pola
        if (selectNewBrokerType) selectNewBrokerType.value = 'Akcje'; // Domyślna wartość
        modalAddBroker?.classList.remove('hidden');
    });

    // 2. Anulowanie
    btnCancelAddBroker?.addEventListener('click', () => {
        modalAddBroker?.classList.add('hidden');
    });

    // 3. Zatwierdzanie i dodawanie do listy
    btnConfirmAddBroker?.addEventListener('click', () => {
        const valName = inputNewBrokerName?.value.trim();
        const valType = selectNewBrokerType ? selectNewBrokerType.value : 'Inne';

        // Zapobiegamy pustości i duplikatom po nazwie
        if (valName && !userBrokers.find((b:any) => b.name === valName)) {
            userBrokers.push({ name: valName, type: valType });
            localStorage.setItem('userBrokers', JSON.stringify(userBrokers));
            
            renderSettingsBrokers();
            modalAddBroker?.classList.add('hidden'); // Zamykamy małe okienko po sukcesie
        }
    });

    // --- NAPRAWIONE USUWANIE BROKERA ---
    brokersListContainer?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // PANCERNA METODA: Szukamy najbliższego przycisku, niezależnie czy kliknięto w tło czy w ikonę
        const deleteBtn = target.closest('.btn-delete-broker-setting');
        
        if (deleteBtn) {
            const index = parseInt(deleteBtn.getAttribute('data-index')!);
            userBrokers.splice(index, 1);
            localStorage.setItem('userBrokers', JSON.stringify(userBrokers));
            renderSettingsBrokers();
        }
    });

    updateBrokerDropdowns();

    document.getElementById('btn-back-to-stocks')?.addEventListener('click', () => {
        document.querySelector<HTMLElement>('[data-target="portfolio-stocks"]')?.click();
    });

    document.getElementById('btn-back-to-profits')?.addEventListener('click', () => {
    document.querySelector<HTMLElement>('[data-target="taxes"]')?.click();
    });

    document.getElementById('btn-back-to-profits-2')?.addEventListener('click', () => {
    document.querySelector<HTMLElement>('[data-target="taxes"]')?.click();
    });

    document.querySelector('[data-target="watchlist"]')?.addEventListener('click', () => {
        if(typeof (window as any).loadWatchlistData === 'function') {
            (window as any).loadWatchlistData();
        }
        document.querySelector('[data-target="portfolio-stocks"]')?.classList.add('active');
    });

    document.querySelector('[data-target="profits-list"]')?.addEventListener('click', () => {
        document.querySelector('[data-target="taxes"]')?.classList.add('active');
    });

    document.querySelector('[data-target="calculator"]')?.addEventListener('click', () => {
        document.querySelector('[data-target="taxes"]')?.classList.add('active');
    });



    
    const btnToggleAlloc = document.getElementById('btn-toggle-allocation');
    const viewChart = document.getElementById('allocation-view-chart');
    const viewTable = document.getElementById('allocation-view-table');

    if (btnToggleAlloc && viewChart && viewTable) {
        viewTable.style.display = 'none';
        btnToggleAlloc.addEventListener('click', () => {
            if (viewChart.style.display !== 'none') {
                viewChart.style.display = 'none';
                viewTable.style.display = 'block';
                btnToggleAlloc.innerHTML = '<i class="fas fa-chart-pie"></i> Wykres';
            } else {
                viewChart.style.display = 'block';
                viewTable.style.display = 'none';
                btnToggleAlloc.innerHTML = '<i class="fas fa-table"></i> Tabela ';
            }
        });
    }

    const btnToggleGrowth = document.getElementById('btn-toggle-growth');
    const viewGrowthChart = document.getElementById('growth-view-chart');
    const viewGrowthTable = document.getElementById('growth-view-table');

    if (btnToggleGrowth && viewGrowthChart && viewGrowthTable) {
        viewGrowthTable.style.display = 'none';
        btnToggleGrowth.addEventListener('click', () => {
            if (viewGrowthChart.style.display !== 'none') {
                viewGrowthChart.style.display = 'none';
                viewGrowthTable.style.display = 'block';
                btnToggleGrowth.innerHTML = '<i class="fas fa-chart-line"></i> Wykres';
            } else {
                viewGrowthChart.style.display = 'block';
                viewGrowthTable.style.display = 'none';
                btnToggleGrowth.innerHTML = '<i class="fas fa-table"></i> Tabela';
            }
        });
    }

    const statCard = document.getElementById('clickable-stat-card');
    const statTitle = document.getElementById('stat-card-title');
    const statVal = document.getElementById('total-assets-val');

    statCard?.addEventListener('click', () => {
        currentStatView = (currentStatView + 1) % 3;
        if (!statTitle || !statVal) return;

        if (currentStatView === 0) {
            statTitle.innerText = 'Całkowita wartość depozytów (PLN)';
            statVal.innerText = `${cachedTotalDeposits.toFixed(2)} zł`;
        } else if (currentStatView === 1) {
            statTitle.innerText = 'Całkowity zysk netto (PLN)';
            statVal.innerText = `${cachedTotalNetProfit.toFixed(2)} zł`;
            statVal.style.color = cachedTotalNetProfit >= 0 ? '#4CAF50' : '#ff5252';
        } else if (currentStatView === 2) {
            statTitle.innerText = 'Stopa zwrotu od depozytu (%)';
            const roi = cachedTotalDeposits > 0 ? (cachedTotalNetProfit / cachedTotalDeposits) * 100 : 0;
            statVal.innerText = `${roi.toFixed(2)} %`;
            statVal.style.color = roi >= 0 ? '#4CAF50' : '#ff5252';
        }
    });

    // Przełączanie kafelka walutowego (USD <-> EUR)
    const currencyCard = document.getElementById('clickable-currency-card');
    currencyCard?.addEventListener('click', () => {
        currentCurrencyView = currentCurrencyView === 'USD' ? 'EUR' : 'USD';
        updateCurrencyWidgetUI();
    });

    // --- OBSŁUGA MODALA STRATEGII ---
    const modalStrategy = document.getElementById('modal-strategy');
    const btnOpenStrategy = document.getElementById('open-strategy');
    const btnCloseStrategy = document.getElementById('btn-close-strategy');
    const btnEditStrategy = document.getElementById('btn-edit-strategy');
    const btnSaveStrategy = document.getElementById('btn-save-strategy');
    const btnCancelStrategy = document.getElementById('btn-cancel-strategy');
    const strategyViewMode = document.getElementById('strategy-view-mode');
    const strategyEditMode = document.getElementById('strategy-edit-mode');
    const strategyTextarea = document.getElementById('strategy-textarea') as HTMLTextAreaElement;

    function loadStrategy() {
        const savedStrategy = localStorage.getItem('userStrategy') || 'Brak zapisanej strategii. Kliknij "Edytuj Strategię", aby wkleić swoje zasady.';
        if (strategyViewMode) strategyViewMode.innerText = savedStrategy;
        if (strategyTextarea) strategyTextarea.value = savedStrategy;
    }
    loadStrategy();

    btnOpenStrategy?.addEventListener('click', () => {
        loadStrategy();
        if (strategyViewMode) strategyViewMode.style.display = 'block';
        if (strategyEditMode) strategyEditMode.style.display = 'none';
        if (btnEditStrategy) btnEditStrategy.style.display = 'block';
        if (btnSaveStrategy) btnSaveStrategy.style.display = 'none';
        if (btnCancelStrategy) btnCancelStrategy.style.display = 'none'; 
        modalStrategy?.classList.remove('hidden');
    });

    btnCloseStrategy?.addEventListener('click', () => {
        modalStrategy?.classList.add('hidden');
    });

    btnEditStrategy?.addEventListener('click', () => {
        if (strategyViewMode) strategyViewMode.style.display = 'none';
        if (strategyEditMode) strategyEditMode.style.display = 'block';
        if (btnEditStrategy) btnEditStrategy.style.display = 'none';
        if (btnSaveStrategy) btnSaveStrategy.style.display = 'block';
        if (btnCancelStrategy) btnCancelStrategy.style.display = 'block'; 
    });

    btnCancelStrategy?.addEventListener('click', () => {
        loadStrategy(); 
        if (strategyEditMode) strategyEditMode.style.display = 'none';
        if (strategyViewMode) strategyViewMode.style.display = 'block';
        if (btnSaveStrategy) btnSaveStrategy.style.display = 'none';
        if (btnCancelStrategy) btnCancelStrategy.style.display = 'none'; 
        if (btnEditStrategy) btnEditStrategy.style.display = 'block';
    });

    btnSaveStrategy?.addEventListener('click', () => {
        const newStrategy = strategyTextarea?.value || '';
        localStorage.setItem('userStrategy', newStrategy);
        loadStrategy(); 
        if (strategyEditMode) strategyEditMode.style.display = 'none';
        if (strategyViewMode) strategyViewMode.style.display = 'block';
        if (btnSaveStrategy) btnSaveStrategy.style.display = 'none';
        if (btnCancelStrategy) btnCancelStrategy.style.display = 'none'; 
        if (btnEditStrategy) btnEditStrategy.style.display = 'block';
    });

});

// --- 3. OBSŁUGA MODALI WPŁAT I ZYSKÓW ---

// --- IMPORT / EKSPORT WPŁAT Z CSV ---
const modalCsv = document.getElementById('modal-csv') as HTMLDivElement;
const btnOpenCsv = document.getElementById('btn-csv');
const btnCloseCsv = document.getElementById('btn-close-csv');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnTriggerImportCsv = document.getElementById('btn-trigger-import-csv');
const csvImportInput = document.getElementById('csv-import-file') as HTMLInputElement;

// 1. Otwieranie / Zamykanie Modala
btnOpenCsv?.addEventListener('click', () => modalCsv?.classList.remove('hidden'));
btnCloseCsv?.addEventListener('click', () => modalCsv?.classList.add('hidden'));
btnTriggerImportCsv?.addEventListener('click', () => csvImportInput?.click());

// 2. Eksportowanie do CSV
btnExportCsv?.addEventListener('click', () => {
    if (!currentDeposits || currentDeposits.length === 0) {
        alert("Nie ma żadnych wpłat do wyeksportowania.");
        return;
    }

    // Dodajemy nagłówki, zachowując 4 pierwsze kolumny tak, by pasowały do Importu.
    // Dodajemy też 2 dodatkowe kolumny (Kurs NBP i Wartość PLN) dla celów archiwalnych.

    let csvContent = "Data;Kwota;Waluta wpłaty;Waluta docelowa;Konto;Kurs NBP;Wartosc PLN\n";

    currentDeposits.forEach(d => {
        const amountStr = d.amount.toString().replace('.', ',');
        const rateStr = d.exchange_rate.toString().replace('.', ',');
        const plnStr = d.amount_pln.toString().replace('.', ',');
        const targetStr = d.target_currency || '';
        
        csvContent += `${d.date};${amountStr};${d.currency};${targetStr};${d.destination};${rateStr};${plnStr}\n`;
    });

    // Tworzenie pliku w pamięci przeglądarki z obsługą polskich znaków
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `moje_wplaty_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    modalCsv?.classList.add('hidden');
});

// 3. Importowanie z CSV (z NBP w tle)
async function getHistoricalRateForImport(currency: string, targetDate: string): Promise<number> {
    if (currency === 'PLN') return 1.0;
    let dateObj = new Date(targetDate);
    for (let i = 0; i < 5; i++) {
        const dStr = dateObj.toISOString().split('T')[0];
        try {
            const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/A/${currency}/${dStr}?format=json`);
            if (res.ok) {
                const data = await res.json();
                return data.rates[0].mid;
            }
        } catch (e) {}
        dateObj.setDate(dateObj.getDate() - 1);
    }
    return 1.0;
}

csvImportInput?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    const file = target.files[0];
    const text = await file.text();
    const lines = text.split('\n');

    modalCsv?.classList.add('hidden'); // Chowamy modal, bo proces się rozpoczął
    alert("Rozpoczynam import... Jeśli wgrywasz waluty obce, skrypt w tle połączy się z NBP po kursy historyczne. Pamiętaj by kliknąć OK i cierpliwie poczekać.");
    
    let importedCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const separator = line.includes(';') ? ';' : ',';
        const parts = line.split(separator).map(p => p.trim());
        

        // PKO BP używa domyślnie 5 kolumn z docelową walutą włącznie
        if (parts.length >= 5) {
            const date = parts[0];
            if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue; 
            
            const amount = parseFloat(parts[1].replace(/\s/g, '').replace(',', '.'));
            const currency = parts[2].toUpperCase();
            
            // Kolumna 4 (indeks 3) to waluta docelowa, kolumna 5 to konto
            const targetCurrency = parts[3].trim().toUpperCase() || null;
            const destination = parts[4].trim();
            
            if (!isNaN(amount) && date) {
                let rateCurrency = currency;
                if (currency === 'PLN' && targetCurrency && targetCurrency !== 'PLN') {
                    rateCurrency = targetCurrency;
                }
                const rate = await getHistoricalRateForImport(rateCurrency, date);
                const amountPln = currency === 'PLN' ? amount : amount * rate;
                
                const deposit = {
                    date: date,
                    amount: amount,
                    currency: currency,
                    exchange_rate: rate,
                    amount_pln: amountPln,
                    target_currency: targetCurrency,
                    destination: destination
                };
                await (window as any).api.addDeposit(deposit);
                importedCount++;
            }
        }
    }
    
    target.value = ''; 
    alert(`Sukces! Przeanalizowano i dodano pomyślnie ${importedCount} wpłat.`);
    loadData();
});

const modalDeposit = document.getElementById('modal-deposit') as HTMLDivElement;
const modalProfit = document.getElementById('modal-profit') as HTMLDivElement;

document.getElementById('btn-new-deposit')?.addEventListener('click', () => {
    const title = document.getElementById('modal-dep-title');
    if (title) title.innerText = 'Nowa Wpłata / Wypłata';
    
    (document.getElementById('dep-id') as HTMLInputElement).value = '';
    (document.getElementById('dep-date') as HTMLInputElement).valueAsDate = new Date();
    (document.getElementById('dep-amount') as HTMLInputElement).value = '';
    
    modalDeposit?.classList.remove('hidden');
});
document.getElementById('btn-cancel-deposit')?.addEventListener('click', () => modalDeposit?.classList.add('hidden'));

// --- FUNKCJA OBSŁUGUJĄCA DYNAMICZNE OSTRZEŻENIA W ZYSKACH ---
function updateProfitWarning() {
    const warningEl = document.getElementById('prof-warning');
    const warningTax = document.getElementById('tax-warning');
    const brokerSelect = document.getElementById('prof-broker') as HTMLSelectElement;
    if (!warningEl || !brokerSelect || !warningTax) return;

    const selectedBrokerName = brokerSelect.value;
    const brokerObj = userBrokers.find((b: any) => b.name === selectedBrokerName);

    if (brokerObj) {
        if (brokerObj.type === 'Obligacje skarbowe krajowe') {
            warningEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Pamiętaj, aby w końcowej kwocie uwzględnić zamianę obligacji i wykup obligacji, które zapadły.';
            warningEl.style.display = 'block';

            warningTax.innerHTML = '<i class="fa-solid fa-circle-info"></i> Aby podatek nie został naliczony w automatycznym dodawaniu kuponu, upewnij się, że w nazwie konta znajduje się <i>IKE</i>, <i>IKZE</i>, <i>OKI</i> lub <i>OIPE</i>.';
            warningTax.style.display = 'block';

        } else if (brokerObj.type === 'Obligacje korporacyjne i zagraniczne') {
            warningEl.innerHTML = '<i class="fa-solid fa-circle-info"></i> Pamiętaj, aby w zyskach uwzględnić opłaty transakcyjne i ewentualne straty (różnice w cenie kupna i sprzedaży obligacji).';
            warningEl.style.display = 'block';

            warningTax.innerHTML = '<i class="fa-solid fa-circle-info"></i> Aby podatek nie został naliczony w automatycznym dodawaniu kuponu, upewnij się, że w nazwie konta znajduje się <i>IKE</i>, <i>IKZE</i>, <i>OKI</i> lub <i>OIPE</i>.';
            warningTax.style.display = 'block';
        } else {
            warningEl.style.display = 'none';
            warningTax.style.display ='none';
        }
    } else {
        warningEl.style.display = 'none';
        warningTax.style.display ='none';
    }
}

// Podpięcie pod zmianę wartości na liście
// --- OBSŁUGA IMPORTU ODSETEK Z PKO (ZYSKI) ORAZ OSTRZEŻEŃ ---
const profBrokerSelect = document.getElementById('prof-broker') as HTMLSelectElement;
const btnPkoImport = document.getElementById('btn-pko-import');
const pkoImportFile = document.getElementById('pko-import-file') as HTMLInputElement;
const pkoInfo = document.getElementById('pko-info') as HTMLInputElement;

// 1. Reakcja na zmianę wybranego konta (pokazuje ostrzeżenia ORAZ przycisk PKO)
// 1. Reakcja na zmianę wybranego konta (pokazuje ostrzeżenia ORAZ przycisk PKO)
profBrokerSelect?.addEventListener('change', () => {
    updateProfitWarning(); 

    const selectedBroker = profBrokerSelect.value;
    const brokerObj = userBrokers.find((b: any) => b.name === selectedBroker);
    
    // Twarde wymuszenie display block/none
    if (brokerObj && brokerObj.type === 'Obligacje skarbowe krajowe') {
        if (btnPkoImport) btnPkoImport.style.display = 'block';
        if (pkoInfo) pkoInfo.style.display = 'block';
    } else {
        if (btnPkoImport) btnPkoImport.style.display = 'none';
        if (pkoInfo) pkoInfo.style.display = 'none';
    }
});

// 2. Otwieranie Modala Zysków
document.getElementById('btn-new-profit')?.addEventListener('click', () => {
    (document.getElementById('prof-id') as HTMLInputElement).value = '';
    (document.getElementById('prof-date') as HTMLInputElement).valueAsDate = new Date();
    (document.getElementById('prof-amount') as HTMLInputElement).value = '';
    (document.getElementById('prof-tax') as HTMLInputElement).value = '';
    
    modalProfit?.classList.remove('hidden');
    profBrokerSelect?.dispatchEvent(new Event('change')); // Wymusza odświeżenie (pokazuje przycisk/ostrzeżenie)
});

// 3. Włączenie okna wyboru pliku
btnPkoImport?.addEventListener('click', () => pkoImportFile?.click());

// 4. Analiza pliku PKO
pkoImportFile?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    const file = target.files[0];
    const text = await file.text();
    const lines = text.split('\n');
    
    let totalGross = 0;
    let count = 0;
    
    for (let line of lines) {
        const separator = line.includes(';') ? ';' : ',';
        const parts = line.split(separator);
        
        // PKO BP używa 7 kolumn (indeks 6 to Kwota)
        if (parts.length >= 7) {
            const rodzaj = parts[1].toLowerCase();
            
            if (rodzaj.includes('naliczenie odsetek')) {
                // Usuwamy cudzysłowy, ewentualne spacje w tysiącach i polski przecinek
                const amountStr = parts[6].replace(/"/g, '').replace(/\s/g, '').replace(',', '.');
                const amount = parseFloat(amountStr);
                
                if (!isNaN(amount)) {
                    totalGross += amount;
                    count++;
                }
            }
        }
    }
    

    if (count > 0) {
        const selectedBrokerName = (document.getElementById('prof-broker') as HTMLSelectElement).value;
        const upperBroker = selectedBrokerName.toUpperCase();
        
        // NOWE: Sprawdzamy czy nazwa konta sugeruje brak podatku Belki
        const isTaxFree = upperBroker.includes('IKE') || upperBroker.includes('IKZE') || upperBroker.includes('OKI') || upperBroker.includes('OIPE');
        
        const taxMultiplier = isTaxFree ? 1.0 : 0.81;
        const netProfit = totalGross * taxMultiplier; 
        
        const profAmount = document.getElementById('prof-amount') as HTMLInputElement;
        const profTax = document.getElementById('prof-tax') as HTMLInputElement;
        const profCat = document.getElementById('prof-cat') as HTMLSelectElement;
        
        if (profAmount) profAmount.value = netProfit.toFixed(2);
        if (profTax) profTax.value = isTaxFree ? '0.00' : 'Pobrany';
        if (profCat) profCat.value = 'Kupony';
        
        alert(`Znaleziono ${count} operacji typu "naliczenie odsetek".\n\nSuma brutto: ${totalGross.toFixed(2)} zł\n${isTaxFree ? 'Zastosowano zwolnienie z podatku (IKE/IKZE).' : 'Potrącono podatek 19%.'}\nTwój zysk netto: ${netProfit.toFixed(2)} zł.`);
    } else {
        alert("W wybranym pliku nie znaleziono operacji typu 'naliczenie odsetek'. Upewnij się, że wgrywasz poprawny plik z Historii Dyspozycji PKO.");
    }
    
    target.value = ''; // Reset inputa
});

// ZAPIS ZYSKU (Z uwzględnieniem edycji)
document.getElementById('btn-save-profit')?.addEventListener('click', async () => {
    const idStr = (document.getElementById('prof-id') as HTMLInputElement).value;
    
    const profit = {
        date: (document.getElementById('prof-date') as HTMLInputElement).value,
        broker: (document.getElementById('prof-broker') as HTMLSelectElement).value,
        category: (document.getElementById('prof-cat') as HTMLSelectElement).value,
        amount: parseFloat((document.getElementById('prof-amount') as HTMLInputElement).value) || 0,
        tax: parseFloat((document.getElementById('prof-tax') as HTMLInputElement).value) || 0
    };

    if (idStr) {
        // Zaktualizuj istniejący
        await (window as any).api.updateProfit(parseInt(idStr), profit);
    } else {
        // Dodaj nowy
        await (window as any).api.addProfit(profit);
    }
    
    modalProfit?.classList.add('hidden');
    loadData();
});
document.getElementById('btn-cancel-profit')?.addEventListener('click', () => modalProfit?.classList.add('hidden'));


// --- 4. OBSŁUGA WALUT I NBP ---
// --- OBSŁUGA WALUT, NBP I PRZEWALUTOWAŃ ---
const depCurrency = document.getElementById('dep-currency') as HTMLSelectElement;
const depAmount = document.getElementById('dep-amount') as HTMLInputElement;
const depDate = document.getElementById('dep-date') as HTMLInputElement;
const depRateInfo = document.getElementById('dep-rate-info') as HTMLDivElement;
const depIsConvCheckbox = document.getElementById('dep-is-conversion') as HTMLInputElement;
const depTargetGroup = document.getElementById('dep-target-currency-group');
const depTargetSelect = document.getElementById('dep-target-currency') as HTMLSelectElement;

let currentRate = 1.0;

// Pokazywanie/ukrywanie pola waluty docelowej
depIsConvCheckbox?.addEventListener('change', () => {
    if (depTargetGroup) depTargetGroup.style.display = depIsConvCheckbox.checked ? 'block' : 'none';
    updateRate();
});
depTargetSelect?.addEventListener('change', updateRate);

async function updateRate() {
    if (!depCurrency || !depAmount || !depRateInfo || !depDate) return;
    const currency = depCurrency.value;
    const amount = parseFloat(depAmount.value) || 0;
    const selectedDate = depDate.value; 
    
    // Ustalanie waluty bazowej do pobrania kursu z NBP 
    // (Jeśli wpłacamy PLN, ale docelowo kupujemy USD, musimy znać kurs USD!)
    let rateCurrency = currency;
    if (currency === 'PLN' && depIsConvCheckbox?.checked && depTargetSelect?.value && depTargetSelect.value !== 'PLN') {
        rateCurrency = depTargetSelect.value;
    }
    
    if (rateCurrency === 'PLN') {
        currentRate = 1.0;
        depRateInfo.innerText = '';
        return;
    }

    if (!selectedDate) {
        depRateInfo.innerText = 'Wybierz datę, aby pobrać kurs historyczny NBP.';
        currentRate = 1.0;
        return;
    }

    depRateInfo.innerText = 'Pobieranie kursu NBP...';

    let dateObj = new Date(selectedDate);
    let foundRate = null;
    let rateDate = '';

    for (let i = 0; i < 5; i++) {
        const dStr = dateObj.toISOString().split('T')[0];
        try {
            const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/A/${rateCurrency}/${dStr}?format=json`);
            if (res.ok) {
                const data = await res.json();
                foundRate = data.rates[0].mid;
                rateDate = dStr;
                break; 
            }
        } catch (e) {}
        dateObj.setDate(dateObj.getDate() - 1);
    }

    if (foundRate !== null) {
        currentRate = foundRate;
        const plnVal = currency === 'PLN' ? amount : amount * currentRate;
        depRateInfo.innerText = `Kurs NBP z ${rateDate}: ${currentRate.toFixed(4)} PLN. Przeliczono na: ${plnVal.toFixed(2)} PLN`;
    } else {
        depRateInfo.innerText = 'Nie udało się pobrać kursu historycznego NBP. Użyto przelicznika 1:1.';
        currentRate = 1.0;
    }
}

depCurrency?.addEventListener('change', updateRate);
depAmount?.addEventListener('input', updateRate);
depDate?.addEventListener('change', updateRate);


// --- ZAPIS WPŁATY ---
document.getElementById('btn-save-deposit')?.addEventListener('click', async () => {
    const amount = parseFloat(depAmount?.value) || 0;
    const isConv = depIsConvCheckbox?.checked;
    const targetCurr = isConv ? depTargetSelect?.value : null;

    const deposit = {
        date: (document.getElementById('dep-date') as HTMLInputElement).value,
        amount: amount,
        currency: depCurrency.value,
        exchange_rate: currentRate,
        amount_pln: depCurrency.value === 'PLN' ? amount : amount * currentRate, // Bezpieczne liczenie
        target_currency: targetCurr, // NOWE: Przekazujemy do bazy danych
        destination: (document.getElementById('dep-dest') as HTMLSelectElement).value
    };

    const idStr = (document.getElementById('dep-id') as HTMLInputElement).value;

    if (idStr) {
        await (window as any).api.updateDeposit(parseInt(idStr), deposit);
    } else {
        await (window as any).api.addDeposit(deposit);
    }

    modalDeposit?.classList.add('hidden');
    loadData();
});

// ZAPIS WPŁAT (I EDYCJA)

// --- OBSŁUGA TRANSFERÓW MIĘDZY KONTAMI ---
const modalTransfer = document.getElementById('modal-transfer') as HTMLDivElement;
const btnTransfer = document.getElementById('btn-transfer');

btnTransfer?.addEventListener('click', () => {
    (document.getElementById('transfer-date') as HTMLInputElement).valueAsDate = new Date();
    (document.getElementById('transfer-amount') as HTMLInputElement).value = '';
    modalTransfer?.classList.remove('hidden');
});

document.getElementById('btn-cancel-transfer')?.addEventListener('click', () => {
    modalTransfer?.classList.add('hidden');
});

// Pobieranie kursów NBP dla transferu (jeśli przelewasz waluty obce)
const transferCurrency = document.getElementById('transfer-currency') as HTMLSelectElement;
const transferAmount = document.getElementById('transfer-amount') as HTMLInputElement;
const transferDate = document.getElementById('transfer-date') as HTMLInputElement;
const transferRateInfo = document.getElementById('transfer-rate-info') as HTMLDivElement;

// NOWE: Elementy przewalutowania w transferze
const transferIsConvCheckbox = document.getElementById('transfer-is-conversion') as HTMLInputElement;
const transferTargetGroup = document.getElementById('transfer-target-currency-group');
const transferTargetSelect = document.getElementById('transfer-target-currency') as HTMLSelectElement;

let currentTransferRate = 1.0;

// Pokazywanie/ukrywanie pola waluty docelowej w transferze
transferIsConvCheckbox?.addEventListener('change', () => {
    if (transferTargetGroup) transferTargetGroup.style.display = transferIsConvCheckbox.checked ? 'block' : 'none';
    updateTransferRate();
});
transferTargetSelect?.addEventListener('change', updateTransferRate);

async function updateTransferRate() {
    if (!transferCurrency || !transferAmount || !transferRateInfo || !transferDate) return;
    const currency = transferCurrency.value;
    const amount = parseFloat(transferAmount.value) || 0;
    const selectedDate = transferDate.value; 
    
    // Inteligentne dobranie waluty do kursu NBP
    let rateCurrency = currency;
    if (currency === 'PLN' && transferIsConvCheckbox?.checked && transferTargetSelect?.value && transferTargetSelect.value !== 'PLN') {
        rateCurrency = transferTargetSelect.value;
    }

    if (rateCurrency === 'PLN') {
        currentTransferRate = 1.0;
        transferRateInfo.innerText = '';
        return;
    }

    if (!selectedDate) {
        transferRateInfo.innerText = 'Wybierz datę...';
        currentTransferRate = 1.0;
        return;
    }

    transferRateInfo.innerText = 'Pobieranie kursu NBP...';
    let dateObj = new Date(selectedDate);
    let foundRate = null;
    let rateDate = '';

    for (let i = 0; i < 5; i++) {
        const dStr = dateObj.toISOString().split('T')[0];
        try {
            const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/A/${rateCurrency}/${dStr}?format=json`);
            if (res.ok) {
                const data = await res.json();
                foundRate = data.rates[0].mid;
                rateDate = dStr;
                break; 
            }
        } catch (e) {}
        dateObj.setDate(dateObj.getDate() - 1);
    }

    if (foundRate !== null) {
        currentTransferRate = foundRate;
        const plnVal = currency === 'PLN' ? amount : amount * currentTransferRate;
        transferRateInfo.innerText = `Kurs NBP z ${rateDate}: ${currentTransferRate.toFixed(4)} PLN. Przeliczono na: ${plnVal.toFixed(2)} PLN`;
    } else {
        transferRateInfo.innerText = 'Błąd pobierania kursu. Użyto 1:1.';
        currentTransferRate = 1.0;
    }
}

transferCurrency?.addEventListener('change', updateTransferRate);
transferAmount?.addEventListener('input', updateTransferRate);
transferDate?.addEventListener('change', updateTransferRate);

// ZAPIS TRANSFERU (Tworzy podwójny wpis w bazie)
document.getElementById('btn-save-transfer')?.addEventListener('click', async () => {
    const amount = parseFloat(transferAmount?.value) || 0;
    const from = (document.getElementById('transfer-from') as HTMLSelectElement).value;
    const to = (document.getElementById('transfer-to') as HTMLSelectElement).value;

    if (amount <= 0) {
        alert("Kwota transferu musi być większa od zera!");
        return;
    }
    if (from === to) {
        alert("Konto źródłowe i docelowe muszą być różne!");
        return;
    }

    const date = transferDate.value;
    const currency = transferCurrency.value;
    const isConv = transferIsConvCheckbox?.checked;
    const targetCurr = isConv ? transferTargetSelect?.value : null;

    const amountPln = currency === 'PLN' ? amount : amount * currentTransferRate;

    // 1. Tworzymy ujemny wpis (zabieramy ze źródła)
    // Z konta źródłowego zawsze schodzą oryginalne środki, nie oznaczamy ich jako zakup (target_currency = null)
    const withdrawal = {
        date: date,
        amount: -amount,
        currency: currency,
        exchange_rate: currentTransferRate,
        amount_pln: -amountPln,
        target_currency: null,
        destination: from
    };

    // 2. Tworzymy dodatni wpis (dodajemy do celu)
    // Jeśli użyto przewalutowania, do bazy wejdzie docelowa waluta, co odczytają statystyki
    const deposit = {
        date: date,
        amount: amount,
        currency: currency,
        exchange_rate: currentTransferRate,
        amount_pln: amountPln,
        target_currency: targetCurr,
        destination: to
    };

    // Zapisujemy obie operacje do bazy danych
    await (window as any).api.addDeposit(withdrawal);
    await (window as any).api.addDeposit(deposit);

    modalTransfer?.classList.add('hidden');
    loadData(); // Odświeżamy widok!
});

document.getElementById('btn-save-deposit')?.addEventListener('click', async () => {
    const amount = parseFloat(depAmount?.value) || 0;
    const deposit = {
        date: (document.getElementById('dep-date') as HTMLInputElement).value,
        amount: amount,
        currency: depCurrency.value,
        exchange_rate: currentRate,
        amount_pln: amount * currentRate,
        destination: (document.getElementById('dep-dest') as HTMLSelectElement).value
    };

    const idStr = (document.getElementById('dep-id') as HTMLInputElement).value;

    if (idStr) {
        await (window as any).api.updateDeposit(parseInt(idStr), deposit);
    } else {
        await (window as any).api.addDeposit(deposit);
    }

    modalDeposit?.classList.add('hidden');
    loadData();
});



// KLIKANIE EDYTUJ/USUŃ W TABELI WPŁAT
document.getElementById('deposits-tbody')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest('.btn-delete-dep');
    const editBtn = target.closest('.btn-edit-dep');
    const moreBtn = target.closest('.btn-more-dep');
    const closeBtn = target.closest('.btn-close-slider');

    if (moreBtn) {
        const id = moreBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-dep-${id}`);
        if (slider) slider.style.transform = 'translateX(-50%)'; 
    }
    else if (closeBtn) {
        const id = closeBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-dep-${id}`);
        if (slider) slider.style.transform = 'translateX(0)'; 
    }
    else if (deleteBtn) {
        const id = parseInt(deleteBtn.getAttribute('data-id')!);
        if (confirm("Czy na pewno chcesz usunąć tę wpłatę z historii? (Zmieni to całkowite saldo!)")) {
            await (window as any).api.deleteDeposit(id);
            loadData();
        }
    } 
    else if (editBtn) {
        const id = parseInt(editBtn.getAttribute('data-id')!);
        const dep = currentDeposits.find(x => x.id === id);
        if (dep) {
            const title = document.getElementById('modal-dep-title');
            if (title) title.innerText = 'Edytuj Wpłatę';


            (document.getElementById('dep-id') as HTMLInputElement).value = dep.id.toString();
            (document.getElementById('dep-date') as HTMLInputElement).value = dep.date;
            (document.getElementById('dep-amount') as HTMLInputElement).value = dep.amount.toString();
            (document.getElementById('dep-currency') as HTMLSelectElement).value = dep.currency;
            (document.getElementById('dep-dest') as HTMLSelectElement).value = dep.destination;

            // Wypełnianie checkboxa przewalutowania
            if (dep.target_currency) {
                depIsConvCheckbox.checked = true;
                depTargetSelect.value = dep.target_currency;
                if (depTargetGroup) depTargetGroup.style.display = 'block';
            } else {
                depIsConvCheckbox.checked = false;
                if (depTargetGroup) depTargetGroup.style.display = 'none';
            }

            updateRate();
            modalDeposit?.classList.remove('hidden');
        }
    }
});

// KLIKANIE EDYTUJ/USUŃ W TABELI ZYSKÓW
document.getElementById('profits-list-tbody')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.btn-edit-profit');
    const deleteBtn = target.closest('.btn-delete-profit');
    
    // Nowe przyciski suwaka
    const moreBtn = target.closest('.btn-more-profit');
    const closeBtn = target.closest('.btn-close-slider-profit');

    if (moreBtn) {
        // Po kliknięciu kropek włączamy przesunięcie
        const id = moreBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-profit-${id}`);
        if (slider) slider.style.transform = 'translateX(-50%)'; 
    }
    else if (closeBtn) {
        // Po kliknięciu "x" cofamy przesunięcie do stanu początkowego
        const id = closeBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-profit-${id}`);
        if (slider) slider.style.transform = 'translateX(0)'; 
    }
    else if (deleteBtn) {
        const id = parseInt(deleteBtn.getAttribute('data-id')!);
        if (confirm("Czy na pewno chcesz usunąć ten zysk z historii?")) {
            await (window as any).api.deleteProfit(id);
            loadData();
        }
    } 
    else if (editBtn) {
        const id = parseInt(editBtn.getAttribute('data-id')!);
        const p = currentProfits.find(x => x.id === id);
        
        if (p) {
            (document.getElementById('prof-id') as HTMLInputElement).value = p.id.toString();
            (document.getElementById('prof-date') as HTMLInputElement).value = p.date;
            (document.getElementById('prof-broker') as HTMLSelectElement).value = p.broker;
            
            // Dynamiczne dopisanie opcji, jeśli edytujemy wpis z wygenerowaną z automatu nazwą
            const catSelect = document.getElementById('prof-cat') as HTMLSelectElement;
            if (!Array.from(catSelect.options).some(opt => opt.value === p.category)) {
                catSelect.innerHTML += `<option value="${p.category}">${p.category}</option>`;
            }
            catSelect.value = p.category;
            
            (document.getElementById('prof-amount') as HTMLInputElement).value = p.amount.toString();
            (document.getElementById('prof-tax') as HTMLInputElement).value = p.tax.toString();

            updateProfitWarning(); // Sprawdź komunikat dla ładowanego rekordu
            modalProfit?.classList.remove('hidden');
        }
    }
});


// --- 5. GŁÓWNA LOGIKA ŁADOWANIA DANYCH ---
// --- FUNKCJA SYNCHRONIZUJĄCA WYNIKI S&P 500 ---
async function syncSP500() {
    const apiKey = localStorage.getItem('fmpApiKey');
    if (!apiKey) return; // Jeśli użytkownik nie podał klucza, pomijamy
    
    // Sprawdzamy czy pobieraliśmy dane dzisiaj (żeby nie marnować limitu API)
    const today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem('sp500LastFetch') === today) return; 

    try {
        // Pobieramy całą historię cen ETF-a na S&P 500 (SPY)
        const res = await fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/SPY?apikey=${apiKey}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.historical) return;

        // Awaryjna baza dla starych lat (API darmowe cofa zwykle o 5 lat)
        const baseSP500 = {
            '2018': -4.38, '2019': 31.49, '2020': 18.40, '2021': 28.71, '2022': -18.11
        };
        let sp500Returns: Record<string, number> = JSON.parse(localStorage.getItem('sp500Returns') || JSON.stringify(baseSP500));

        const endOfYearPrices: Record<string, number> = {};
        const history = data.historical.reverse(); // Odwracamy, by czytać od najstarszej do najnowszej
        
        // Zapisujemy cenę z ostatniego dnia handlowego każdego roku
        history.forEach((day: any) => {
            const year = day.date.substring(0, 4);
            endOfYearPrices[year] = day.close; // Pętla nadpisuje wartość, aż dotrze do 31 grudnia danego roku (lub do dzisiaj)
        });

        // Obliczamy stopę zwrotu (Koniec Roku / Koniec Poprzedniego Roku - 1)
        const years = Object.keys(endOfYearPrices).sort();
        for (let i = 1; i < years.length; i++) {
            const prevYear = years[i - 1];
            const currYear = years[i];
            const returnPct = ((endOfYearPrices[currYear] / endOfYearPrices[prevYear]) - 1) * 100;
            
            // Zapisujemy do słownika
            sp500Returns[currYear] = parseFloat(returnPct.toFixed(2));
        }

        // Zapisujemy do lokalnej bazy
        localStorage.setItem('sp500Returns', JSON.stringify(sp500Returns));
        localStorage.setItem('sp500LastFetch', today);
    } catch(e) {
        console.error("Błąd aktualizacji S&P 500 z API:", e);
    }
}

async function loadData() {
    const deposits = await (window as any).api.getDeposits();
    let profits = await (window as any).api.getProfits();
    const assets = await (window as any).api.getAssets();

    // ========================================================
    // --- AUTOMATYCZNE GENEROWANIE KUPONÓW OBLIGACJI ---
    // ========================================================
    let newProfitsAdded = false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const a of assets) {
        const brokerObj = userBrokers.find((b: any) => b.name === a.type);
        const realType = brokerObj ? brokerObj.type : a.type;

        if (!realType.includes('Obligacje korporacyjne')) continue;
        if (!a.coupon_date || !a.coupon_rate || a.quantity <= 0) continue;

        const nominal = 1000;
        let payoutDate = new Date(a.coupon_date);
        payoutDate.setHours(0, 0, 0, 0);
        
        let purchaseDate = new Date(a.purchase_date);
        purchaseDate.setHours(0, 0, 0, 0);
        
        const freqMonths = a.coupon_freq === 'Półroczna' ? 6 : 12;

        while (payoutDate <= purchaseDate) {
            payoutDate.setMonth(payoutDate.getMonth() + freqMonths);
        }

        let isFirstCoupon = true;
        const categoryName = `Kupony - ${a.name}`; 

        while (payoutDate <= today) {
            const payoutDateStr = payoutDate.toISOString().split('T')[0];
            const alreadyExists = profits.some((p: any) => p.category === categoryName && p.date === payoutDateStr);
            

            if (!alreadyExists) {
                const assetCurrency = a.currency || 'PLN';
                const yearlyCoupon = nominal * a.quantity * (a.coupon_rate / 100);
                const periodCoupon = freqMonths === 6 ? yearlyCoupon / 2 : yearlyCoupon;
                let realProfitForeign = periodCoupon;

                if (isFirstCoupon) {
                    const prevPayoutDate = new Date(payoutDate);
                    prevPayoutDate.setMonth(prevPayoutDate.getMonth() - freqMonths);
                    
                    const totalDays = Math.round((payoutDate.getTime() - prevPayoutDate.getTime()) / (1000 * 3600 * 24));
                    const daysHeld = Math.round((payoutDate.getTime() - purchaseDate.getTime()) / (1000 * 3600 * 24));
                    
                    if (daysHeld > 0 && daysHeld < totalDays) {
                        realProfitForeign = periodCoupon * (daysHeld / totalDays);
                    }
                }

                const exchangeRate = await getNbpRateForPreviousBusinessDay(assetCurrency, payoutDateStr);
                const realProfitPln = realProfitForeign * exchangeRate;
                
                // NOWE: Sprawdzamy zwolnienie z podatku dla kuponów automatycznych (szukamy w nazwie konta/brokera)
                const upperBroker = a.type.toUpperCase();
                const isTaxFree = upperBroker.includes('IKE') || upperBroker.includes('IKZE') || upperBroker.includes('OKI') || upperBroker.includes('OIPE');
                
                const taxPln = isTaxFree ? 0 : realProfitPln * 0.19;

                await (window as any).api.addProfit({
                    date: payoutDateStr,
                    broker: a.type,
                    category: categoryName,
                    amount: realProfitPln,
                    tax: taxPln
                });
                newProfitsAdded = true;
            }

            isFirstCoupon = false;
            payoutDate.setMonth(payoutDate.getMonth() + freqMonths);
        }
    }

    if (newProfitsAdded) {
        profits = await (window as any).api.getProfits();
    }
    // ========================================================

    currentProfits = profits;

    const tbodyProfList = document.getElementById('profits-list-tbody');
    if (tbodyProfList) {
        tbodyProfList.innerHTML = '';
        [...profits].reverse().forEach((p: any) => { 
            const catDisplay = p.category.startsWith('Kupony') ? p.category : `<span style="text-transform: capitalize;">${p.category}</span>`;
            
            const brokerObj = userBrokers.find((b: any) => b.name === p.broker);
            const isSkarbowe = brokerObj && brokerObj.type === 'Obligacje skarbowe krajowe';
            
            let taxDisplay = `${p.tax > 0 ? '-' : ''}${p.tax.toFixed(2)} zł`;
            if (isSkarbowe && p.tax === 0 && (p.category === 'Kupony' || p.category === 'odsetki')) {
                taxDisplay = '<span style="color: #888; font-style: italic;">pobrany</span>';
            }
            
            tbodyProfList.innerHTML += `
                <tr>
                    <td>${p.date}</td>
                    <td>${p.broker}</td>
                    <td>${catDisplay}</td>
                    <td style="color: #4CAF50;">${p.amount.toFixed(2)} zł</td>
                    <td style="color: #F44336;">${taxDisplay}</td>
                    <td style="padding: 5px; width: 1%; white-space: nowrap; text-align: right;">
                        <div style="width: 140px; overflow: hidden; border-radius: 4px; position: relative; margin-left: auto;">
                            <div id="slider-profit-${p.id}" style="display: flex; width: 280px; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform: translateX(0); align-items: center;">  
                                
                                <div style="width: 140px; display: flex; gap: 5px; justify-content: flex-end; align-items: center; height: 30px;">
                                    <button class="btn btn-more-profit" data-id="${p.id}" style="font-size: 11px; background: none; border: 2px solid #ccc; border-radius: 50%; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;">
                                        <i class="fa-solid fa-ellipsis"></i>
                                    </button>
                                </div>

                                <div style="width: 140px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; height: 30px;">
                                    <button class="btn btn-edit-profit" data-id="${p.id}" style="font-size: 16px; background-color: var(--purple); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn btn-delete-profit" data-id="${p.id}" style="font-size: 16px; background-color: var(--red); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-trash"></i></button>
                                    <button class="btn btn-close-slider-profit" data-id="${p.id}" style="font-size: 20px; background: none; border: none; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;" title="Anuluj">
                                        <i class="fa-regular fa-circle-xmark"></i>
                                    </button>
                                </div>
                                
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
    }


    const tbodyDep = document.getElementById('deposits-tbody');
    if (tbodyDep) tbodyDep.innerHTML = '';
    
    let totalAssetsPLN = 0;
    const allocation: Record<string, number> = {};
    let totalUsdAmount = 0; let totalUsdPln = 0;
    let totalEurAmount = 0; let totalEurPln = 0;

    currentDeposits = deposits;

    // --- POBIERANIE BIEŻĄCYCH KURSÓW NBP ---
    try {
        const resUsd = await fetch('https://api.nbp.pl/api/exchangerates/rates/A/USD/?format=json');
        if (resUsd.ok) {
            const data = await resUsd.json();
            cachedCurrentUsd = data.rates[0].mid;
        }
        const resEur = await fetch('https://api.nbp.pl/api/exchangerates/rates/A/EUR/?format=json');
        if (resEur.ok) {
            const data = await resEur.json();
            cachedCurrentEur = data.rates[0].mid;
        }
    } catch(e) {
        console.log("Błąd aktualizacji bieżących kursów walut z NBP.");
    }

    // --- NADPISANIE WARTOŚCI W LOCIE DLA CAŁEJ LOGIKI ---
    deposits.forEach((d: any) => {
        let displayRate = d.exchange_rate;
        let displayPln = d.amount_pln;
        let rateText = '-';

        if (d.target_currency) {
            rateText = `${displayRate.toFixed(4)} <span style="color:#aaa; font-size:11px;">(na ${d.target_currency})</span>`;
        } else if (d.currency !== 'PLN') {
            if (d.currency === 'USD' && cachedCurrentUsd > 0) displayRate = cachedCurrentUsd;
            if (d.currency === 'EUR' && cachedCurrentEur > 0) displayRate = cachedCurrentEur;
            
            displayPln = d.amount * displayRate;
            rateText = `${displayRate.toFixed(4)} <span style="color:#aaa; font-size:11px;">(obecny)</span>`;
            
            // KRYTYCZNA ZMIANA: Nadpisujemy właściwość obiektu d, aby reszta skryptu (wykresy itp.) korzystała z nowego kursu!
            d.amount_pln = displayPln;
        }

        totalAssetsPLN += d.amount_pln; 
        allocation[d.destination] = (allocation[d.destination] || 0) + d.amount_pln;

        if (d.target_currency) {
            if (d.currency === 'USD') {
                totalUsdAmount += d.amount;
                totalUsdPln += d.amount_pln;
            } else if (d.target_currency === 'USD') {
                const usdAmount = d.amount_pln / d.exchange_rate;
                totalUsdAmount += usdAmount;
                totalUsdPln += d.amount_pln;
            }

            if (d.currency === 'EUR') {
                totalEurAmount += d.amount;
                totalEurPln += d.amount_pln;
            } else if (d.target_currency === 'EUR') {
                const eurAmount = d.amount_pln / d.exchange_rate;
                totalEurAmount += eurAmount;
                totalEurPln += d.amount_pln;
            }
        }

        let currencyDisplay = `${d.amount} ${d.currency}`;
        if (d.target_currency) {
            currencyDisplay += ` <i class="fa-solid fa-arrow-right" style="font-size:10px; color:#aaa; margin:0 5px;"></i> ${d.target_currency}`;
        }

        if (tbodyDep) {
            tbodyDep.innerHTML += `
                <tr>
                    <td>${d.date}</td>
                    <td>${currencyDisplay}</td>
                    <td>${rateText}</td>
                    <td style="font-weight: ${d.target_currency ? 'normal' : 'bold'}; color: ${d.target_currency ? 'var(--text-color)' : '#4CAF50'};">${d.amount_pln.toFixed(2)} zł</td>
                    <td>${d.destination}</td>
                    
                    <td style="padding: 5px; width: 1%; white-space: nowrap; text-align: right;">
                        <div style="width: 140px; overflow: hidden; border-radius: 4px; position: relative; margin-left: auto;">
                            <div id="slider-dep-${d.id}" style="display: flex; width: 280px; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform: translateX(0); align-items: center;">  
                                
                                <div style="width: 140px; display: flex; gap: 5px; justify-content: flex-end; align-items: center; height: 30px;">
                                    <button class="btn btn-more-dep" data-id="${d.id}" style="font-size: 11px; background: none; border: 2px solid #ccc; border-radius: 50%; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;">
                                        <i class="fa-solid fa-ellipsis"></i>
                                    </button>
                                </div>

                                <div style="width: 140px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; height: 30px;">
                                    <button class="btn btn-edit-dep" data-id="${d.id}" style="font-size: 16px; background-color: var(--purple); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn btn-delete-dep" data-id="${d.id}" style="font-size: 16px; background-color: var(--red); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-trash"></i></button>
                                    <button class="btn btn-close-slider" data-id="${d.id}" style="font-size: 20px; background: none; border: none; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;" title="Anuluj">
                                        <i class="fa-regular fa-circle-xmark"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }
    });

    cachedTotalDeposits = totalAssetsPLN;
    cachedAvgUsd = totalUsdAmount > 0 ? totalUsdPln / totalUsdAmount : 0;
    cachedAvgEur = totalEurAmount > 0 ? totalEurPln / totalEurAmount : 0;
    
    updateCurrencyWidgetUI();

    const allocMap = {
        akcje: 0, skarbowe: 0, korpo: 0, konto: 0, krypto: 0, metale: 0, inne: 0
    };

    Object.keys(allocation).forEach(brokerName => {
        const amount = allocation[brokerName];
        const brokerObj = userBrokers.find((b:any) => b.name === brokerName);
        const brokerType = brokerObj ? brokerObj.type : 'Inne';

        if (brokerType === 'Akcje') allocMap.akcje += amount;
        else if (brokerType === 'Obligacje skarbowe krajowe') allocMap.skarbowe += amount;
        else if (brokerType === 'Obligacje korporacyjne i zagraniczne') allocMap.korpo += amount;
        else if (brokerType === 'Konta oszczędnościowe') allocMap.konto += amount;
        else if (brokerType === 'Kryptowaluty') allocMap.krypto += amount;
        else if (brokerType === 'Metale szlachetne') allocMap.metale += amount;
        else allocMap.inne += amount;
    });

    const tbodyAlloc = document.getElementById('allocation-tbody');
    if (tbodyAlloc) {
        tbodyAlloc.innerHTML = `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Akcje</td>
                <td style="padding: 10px; text-align: right;">${allocMap.akcje.toFixed(2)} zł</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Obligacje skarbowe krajowe</td>
                <td style="padding: 10px; text-align: right;">${allocMap.skarbowe.toFixed(2)} zł</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Obligacje korporacyjne i zagraniczne</td>
                <td style="padding: 10px; text-align: right;">${allocMap.korpo.toFixed(2)} zł</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Konta oszczędnościowe</td>
                <td style="padding: 10px; text-align: right;">${allocMap.konto.toFixed(2)} zł</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Kryptowaluty</td>
                <td style="padding: 10px; text-align: right;">${allocMap.krypto.toFixed(2)} zł</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Metale szlachetne</td>
                <td style="padding: 10px; text-align: right;">${allocMap.metale.toFixed(2)} zł</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px;">Inne</td>
                <td style="padding: 10px; text-align: right;">${allocMap.inne.toFixed(2)} zł</td>
            </tr>
        `;
        const allocTotalEl = document.getElementById('allocation-total');
        if (allocTotalEl) allocTotalEl.innerText = `${totalAssetsPLN.toFixed(2)} zł`;

        const portfolioWarning = document.getElementById('portfolio-warning');
        const warningPercent = document.getElementById('warning-percent');
        
        if (portfolioWarning && warningPercent) {
            if (totalAssetsPLN > 0) {
                const stocksPercent = (allocMap.akcje / totalAssetsPLN) * 100;
                if (stocksPercent > userPortfolioThreshold) {
                    warningPercent.innerText = `${stocksPercent.toFixed(1)}%`;
                    portfolioWarning.style.display = 'block'; 
                } else {
                    portfolioWarning.style.display = 'none'; 
                }
            } else {
                portfolioWarning.style.display = 'none';
            }
        }
    }

    const taxesContainer = document.getElementById('taxes-container');
    if(taxesContainer) taxesContainer.innerHTML = '';

    const groupedByYear: Record<string, Record<string, Record<string, {profit: number, tax: number}>>> = {};

    profits.forEach((p: any) => {
        const year = p.date.substring(0, 4); 
        if (!groupedByYear[year]) groupedByYear[year] = {};
        
        if (!groupedByYear[year][p.broker]) {
            groupedByYear[year][p.broker] = { 
                "dywidendy": {profit: 0, tax: 0}, 
                "sprzedaz": {profit: 0, tax: 0}, 
                "odsetki": {profit: 0, tax: 0},
                "kupony": {profit: 0, tax: 0}
            };
        }
        
        let targetCategory = p.category;
        if (p.category.startsWith('Kupony')) targetCategory = 'kupony';

        if (groupedByYear[year][p.broker][targetCategory]) {
            groupedByYear[year][p.broker][targetCategory].profit += p.amount;
            groupedByYear[year][p.broker][targetCategory].tax += p.tax;
        }
    });

    const years = Object.keys(groupedByYear).sort().reverse();
    
    years.forEach(year => {
        let totalYearProfit = 0;
        let totalYearTax = 0;
        const activeBrokersInYear = Object.keys(groupedByYear[year]);

        activeBrokersInYear.forEach(b => {
            const data = groupedByYear[year][b];
            totalYearProfit += data['dywidendy'].profit + data['sprzedaz'].profit + data['odsetki'].profit + data['kupony'].profit;
            totalYearTax += data['dywidendy'].tax + data['sprzedaz'].tax + data['odsetki'].tax + data['kupony'].tax;
        });

        const netProfit = totalYearProfit - totalYearTax;
        const profitColor = netProfit >= 0 ? '#4CAF50' : '#ff5252'; 

        let tableHTML = `
        <div class="year-block" style="background-color: var(--widget-background); border: 1px solid var(--widget-border)">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 15px;">
                <h2 style="margin: 0; padding: 0; border: none; color: var(--text-color);">Rok ${year}</h2>
                <div style="text-align: right;">
                    <span style="font-size: 12px; color: #aaa;">Łączny zysk netto:</span><br>
                    <strong style="font-size: 18px; color: ${profitColor};">${netProfit.toFixed(2)} zł</strong>
                </div>
            </div>
            <table class="tax-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background-color: rgba(255,255,255,0.05);">
                        <th rowspan="2" style="padding: 10px; text-align: left; vertical-align: middle; border-right: 1px solid var(--border);">Konto</th>
                        <th colspan="2" style="padding: 8px; text-align: center; border-right: 1px solid var(--border);">Dywidendy</th>
                        <th colspan="2" style="padding: 8px; text-align: center; border-right: 1px solid var(--border);">Sprzedaż</th>
                        <th colspan="2" style="padding: 8px; text-align: center; border-right: 1px solid var(--border);">Odsetki</th>
                        <th colspan="2" style="padding: 8px; text-align: center; color: #00d2e0;">Kupony</th>
                    </tr>
                    <tr style="background-color: rgba(255,255,255,0.02); font-size: 12px; color: #aaa;">
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal;">Zysk</th>
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal; border-right: 1px solid var(--border);">Należny Podatek</th>
                        
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal;">Zysk</th>
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal; border-right: 1px solid var(--border);">Należny Podatek</th>
                        
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal;">Zysk</th>
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal; border-right: 1px solid var(--border);">Należny Podatek</th>
                        
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal; color: #00d2e0;">Zysk</th>
                        <th style="padding: 5px 10px; text-align: right; font-weight: normal; color: #00d2e0;">Należny Podatek</th>
                    </tr>
                </thead>
                <tbody>
        `;

        activeBrokersInYear.forEach(b => {
            const data = groupedByYear[year][b];
            
            const brokerObj = userBrokers.find((br:any) => br.name === b);
            const isSkarbowe = brokerObj && brokerObj.type === 'Obligacje skarbowe krajowe';

            const fProf = (val: number) => val === 0 ? '' : `${val.toFixed(2)} zł`;
            const fTax = (val: number, isPobrany: boolean = false) => {
                if (isPobrany) return '<span style="color: #888; font-style: italic;">pobrany</span>';
                return val === 0 ? '' : `-${val.toFixed(2)} zł`;
            };

            const odsPobrany = isSkarbowe && data['odsetki'].profit > 0 && data['odsetki'].tax === 0;
            const kupPobrany = isSkarbowe && data['kupony'].profit > 0 && data['kupony'].tax === 0;

            tableHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; border-right: 1px solid var(--border);"><strong>${b}</strong></td>
                    
                    <td class="profit-value" style="padding: 10px; text-align: right;">${fProf(data['dywidendy'].profit)}</td>
                    <td class="tax-value" style="padding: 10px; text-align: right; border-right: 1px solid var(--border);">${fTax(data['dywidendy'].tax)}</td>
                    
                    <td class="profit-value" style="padding: 10px; text-align: right;">${fProf(data['sprzedaz'].profit)}</td>
                    <td class="tax-value" style="padding: 10px; text-align: right; border-right: 1px solid var(--border);">${fTax(data['sprzedaz'].tax)}</td>
                    
                    <td class="profit-value" style="padding: 10px; text-align: right;">${fProf(data['odsetki'].profit)}</td>
                    <td class="tax-value" style="padding: 10px; text-align: right; border-right: 1px solid var(--border);">${fTax(data['odsetki'].tax, odsPobrany)}</td>
                    
                    <td class="profit-value" style="padding: 10px; text-align: right; color: #00d2e0; font-weight: bold;">${fProf(data['kupony'].profit)}</td>
                    <td class="tax-value" style="padding: 10px; text-align: right; color: #ff9230;">${fTax(data['kupony'].tax, kupPobrany)}</td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table></div>`;

        if(taxesContainer) taxesContainer.innerHTML += tableHTML;
    });

    loadAssetsData();
    loadJournalData();

    const allChartsWrapper = document.getElementById('all-charts');
    const emptyLabel = document.getElementById('empty-label');

    if (totalAssetsPLN === 0) {
        if (allChartsWrapper) allChartsWrapper.style.display = 'none';
        if (emptyLabel) emptyLabel.style.display = '';

        const dashboardBtn = document.querySelector('button[data-target="dashboard"]');
        if (dashboardBtn && dashboardBtn.classList.contains('active')) {
            modalSettings?.classList.remove('hidden');
            renderSettingsBrokers();
        }
    } else {
        if (allChartsWrapper) allChartsWrapper.style.display = ''; 
        if (emptyLabel) emptyLabel.style.display = 'none';

        await syncSP500();

        renderCharts(allocMap, deposits, profits);
    }
}

// --- 6. RYSOWANIE WYKRESÓW GŁÓWNYCH ---
function renderCharts(allocMap: Record<string, number>, deposits: any[], profits: any[]) {
    const ctxAlloc = document.getElementById('allocationChart') as HTMLCanvasElement;
    if (allocChart) allocChart.destroy();

    const filteredLabels = Object.keys(allocMap).filter(k => allocMap[k] > 0);
    const filteredData = filteredLabels.map(k => allocMap[k]);

    const displayLabels = filteredLabels.map(k => {
        if (k === 'akcje') return 'Akcje';
        if (k === 'skarbowe') return 'Oblig. skarbowe';
        if (k === 'korpo') return 'Oblig. korporacyjne';
        if (k === 'konto') return 'Konto oszczędnościowe';
        if (k === 'krypto') return 'Kryptowaluty';
        if (k === 'metale') return 'Metale szlachetne';
        return 'Inne';
    });

    if (ctxAlloc) {
        allocChart = new (window as any).Chart(ctxAlloc, {
            type: 'doughnut',
            data: {
                labels: displayLabels,
                datasets: [{
                    data: filteredData,
                    backgroundColor: ['#0091ff', '#30d158', '#ff4245', '#ff9230', '#00d2e0', '#ffd600', '#939393'],
                    borderColor: 'rgba(255, 255, 255, 0.5)', 
                    borderWidth: 1 
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right', 
                        labels: { 
                            color: 'rgba(120, 120, 120, 0.8)',
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            padding: 20,          
                        } 
                    },
                    title: { display: true, text: 'Skład Portfolio'}
                }
            }
        });
    }

    const ctxGrowth = document.getElementById('growthChart') as HTMLCanvasElement;
    if (growthChart) growthChart.destroy();

    const sortedDep = [...deposits].reverse();
    let cumulativeDeposits = 0;
    const labels: string[] = [];
    const depositsData: number[] = [];
    const totalAssetsData: number[] = [];

    // KRYTYCZNA ZMIANA: Tabela sumy depozytów i zysków korzysta ze zmienionego d.amount_pln!
    for (const d of sortedDep) {
        labels.push(d.date);
        cumulativeDeposits += d.amount_pln;
        depositsData.push(cumulativeDeposits);

        let cumulativeProfitsAtDate = 0;
        for (const p of profits) {
            if (p.date <= d.date) {
               cumulativeProfitsAtDate += p.amount;
            }
        }
        totalAssetsData.push(cumulativeDeposits + cumulativeProfitsAtDate);
    }

    const yearlyGrowth: Record<string, { dep: number, prof: number }> = {};
    
    deposits.forEach((d: any) => {
        const y = d.date.substring(0, 4);
        if (!yearlyGrowth[y]) yearlyGrowth[y] = { dep: 0, prof: 0 };
        yearlyGrowth[y].dep += d.amount_pln;
    });

    profits.forEach((p: any) => {
        const y = p.date.substring(0, 4);
        if (!yearlyGrowth[y]) yearlyGrowth[y] = { dep: 0, prof: 0 };
        yearlyGrowth[y].prof += (p.amount - p.tax);
    });

    const allYears = Object.keys(yearlyGrowth).sort();
    const tbodyGrowth = document.getElementById('growth-tbody');
    
    if (tbodyGrowth) {
        tbodyGrowth.innerHTML = '';
        let runningDep = 0;
        let runningProf = 0;

        allYears.forEach(year => {
            runningDep += yearlyGrowth[year].dep;
            runningProf += yearlyGrowth[year].prof;
            const runningTotal = runningDep + runningProf;

            tbodyGrowth.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background-color: rgba(255,255,255,0.02);">
                    <td style="padding: 8px; text-align: left;"><strong>${year}</strong></td>
                    <td style="padding: 8px;">${runningDep.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$& ')}</td>
                    <td style="padding: 8px;">${runningProf.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$& ')}</td>
                    <td style="padding: 8px; font-weight: bold;">${runningTotal.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$& ')}</td>
                </tr>
            `;
        });
    }

    if (ctxGrowth) {
        growthChart = new (window as any).Chart(ctxGrowth, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Suma Depozytów i Zysków (PLN)',
                        data: totalAssetsData,
                        borderColor: '#F44336',
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        fill: false,
                        tension: 0.1
                    },
                    {
                        label: 'Suma Depozytów (PLN)',
                        data: depositsData,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: 'rgba(120, 120, 120, 0.8)' } },
                    title: { display: true, text: 'Wzrost Wartości Portfela'},
                    tooltip: {
                        callbacks: {
                            label: function(context: any) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed.y);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: 'rgba(120, 120, 120, 0.8)' }, grid: { color: 'rgba(120, 120, 120, 0.2)' } },
                    y: { ticks: { color: 'rgba(120, 120, 120, 0.8)' }, grid: { color: 'rgba(120, 120, 120, 0.2)' } }
                }
            }
        });
    }


    const ctxProfitBar = document.getElementById('profitBarChart') as HTMLCanvasElement;
    const ctxRoi = document.getElementById('roiChart') as HTMLCanvasElement;
    if (profitBarChart) profitBarChart.destroy();
    if (roiChart) roiChart.destroy();

    // Przygotowanie struktury na wszystkie 7 kategorii
    const yearlyProfits: Record<string, { 
        akcje: number, 
        skarbowe: number, 
        korpo: number, 
        oszczednosciowe: number, 
        krypto: number, 
        metale: number, 
        inne: number, 
        totalNet: number 
    }> = {};
    
    let grandTotalNetProfit = 0; 

    profits.forEach(p => {
        const year = p.date.substring(0, 4);
        if (!yearlyProfits[year]) {
            yearlyProfits[year] = { akcje: 0, skarbowe: 0, korpo: 0, oszczednosciowe: 0, krypto: 0, metale: 0, inne: 0, totalNet: 0 };
        }

        const netAmount = p.amount - p.tax;
        yearlyProfits[year].totalNet += netAmount;
        grandTotalNetProfit += netAmount;

        const brokerObj = userBrokers.find((b: any) => b.name === p.broker);
        const brokerType = brokerObj ? brokerObj.type : 'Inne';

        if (brokerType === 'Akcje') yearlyProfits[year].akcje += netAmount;
        else if (brokerType === 'Obligacje skarbowe krajowe') yearlyProfits[year].skarbowe += netAmount;
        else if (brokerType === 'Obligacje korporacyjne i zagraniczne') yearlyProfits[year].korpo += netAmount;
        else if (brokerType === 'Konta oszczędnościowe') yearlyProfits[year].oszczednosciowe += netAmount;
        else if (brokerType === 'Kryptowaluty') yearlyProfits[year].krypto += netAmount;
        else if (brokerType === 'Metale szlachetne') yearlyProfits[year].metale += netAmount;
        else yearlyProfits[year].inne += netAmount;
    });

    const sortedYears = Object.keys(yearlyProfits).sort();
    if (sortedYears.length === 0) {
        sortedYears.push(new Date().getFullYear().toString());
        yearlyProfits[sortedYears[0]] = { akcje: 0, skarbowe: 0, korpo: 0, oszczednosciowe: 0, krypto: 0, metale: 0, inne: 0, totalNet: 0 };
    }

    // Ekstrakcja danych do wykresu dla każdej kategorii
    const dataAkcje = sortedYears.map(y => yearlyProfits[y].akcje);
    const dataSkarbowe = sortedYears.map(y => yearlyProfits[y].skarbowe);
    const dataKorpo = sortedYears.map(y => yearlyProfits[y].korpo);
    const dataOszczednosciowe = sortedYears.map(y => yearlyProfits[y].oszczednosciowe);
    const dataKrypto = sortedYears.map(y => yearlyProfits[y].krypto);
    const dataMetale = sortedYears.map(y => yearlyProfits[y].metale);
    const dataInne = sortedYears.map(y => yearlyProfits[y].inne);

    if (ctxProfitBar) {
        profitBarChart = new (window as any).Chart(ctxProfitBar, {
            type: 'bar',
            data: {
                labels: sortedYears,
                datasets: [
                    // Używamy kolorów zbieżnych z wykresem kołowym alokacji
                    { label: 'Akcje', data: dataAkcje, backgroundColor: '#0091ff' },
                    { label: 'Obligacje skarbowe', data: dataSkarbowe, backgroundColor: '#30d158' },
                    { label: 'Oblig. korporacyjne i zagraniczne', data: dataKorpo, backgroundColor: '#ff4245' },
                    { label: 'Konta oszczędnościowe', data: dataOszczednosciowe, backgroundColor: '#ff9230' },
                    { label: 'Kryptowaluty', data: dataKrypto, backgroundColor: '#00d2e0' },
                    { label: 'Metale szlachetne', data: dataMetale, backgroundColor: '#ffd600' },
                    { label: 'Inne', data: dataInne, backgroundColor: '#939393' }
                ]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                scales: { 
                    x: { ticks: { color: 'rgba(120, 120, 120, 0.8)' }, grid: { color: 'rgba(120, 120, 120, 0.2)' }, stacked: true },
                    y: { ticks: { color: 'rgba(120, 120, 120, 0.8)' }, grid: { color: 'rgba(120, 120, 120, 0.2)' }, stacked: true },                
                },
                plugins: { 
                    title: { display: true, text: 'Zysk netto z inwestycji'}, 
                    legend: { 
                        labels: {
                            color: 'rgba(120, 120, 120, 0.8)',
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            // Filtr ukrywający z legendy kategorie, które w całym portfelu mają 0 zysku (opcjonalnie dla czytelności)
                            filter: function(legendItem: any, chartData: any) {
                                const dataset = chartData.datasets[legendItem.datasetIndex];
                                const hasData = dataset.data.some((value: number) => value !== 0);
                                return hasData;
                            }
                        }
                    }
                },
            }
        });
    }

    const depositsByYear: Record<string, number> = {};
    for (const d of sortedDep) {
        const y = d.date.substring(0, 4);
        depositsByYear[y] = (depositsByYear[y] || 0) + d.amount_pln;
    }


    let runningDep = 0;
    const roiData = sortedYears.map(year => {
        runningDep += (depositsByYear[year] || 0);
        if (runningDep === 0) return 0;
        return (yearlyProfits[year].totalNet / runningDep) * 100;
    });

    // Pobieramy automatycznie zaktualizowane dane z LocalStorage (jeśli są)
    const storedSP500 = JSON.parse(localStorage.getItem('sp500Returns') || '{}');
    
    // Twardy fallback, jeśli ktoś wyłączy FMP API suwakiem w ustawieniach
    const fallbackSP500: Record<string, number> = {
        '2018': -4.38, '2019': 31.49, '2020': 18.40, '2021': 28.71, '2022': -18.11, '2023': 26.29, '2024': 24.23, '2025': 20.0, '2026': 15.0
    };

    const sp500Data = sortedYears.map(year => {
        if (storedSP500[year] !== undefined) return storedSP500[year];
        if (fallbackSP500[year] !== undefined) return fallbackSP500[year];
        return 0; // Jeśli nie ma danych dla jakiegoś ekstremalnego roku
    });


    if (ctxRoi) {
        roiChart = new (window as any).Chart(ctxRoi, {
            type: 'line',
            data: {
                labels: sortedYears,
                datasets: [
                    {
                        label: 'Twój Portfel',
                        data: roiData,
                        borderColor: '#4285F4', // Niebieski dla Twojego portfela
                        backgroundColor: 'rgba(66, 133, 244, 0.1)',
                        fill: false,
                        tension: 0.4 
                    },
                    {
                        // NOWE: Dodana linia S&P 500
                        label: 'S&P 500',
                        data: sp500Data,
                        borderColor: '#34A853', // Zielony dla benchmarku
                        backgroundColor: 'rgba(52, 168, 83, 0.1)',
                        borderDash: [5, 5], // Przerywana linia
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                plugins: {
                    legend: { 
                        display: true, // Włącza legendę, by było widać opisy!
                        labels: { color: 'rgba(120, 120, 120, 0.8)', usePointStyle: true }
                    }, 
                    title: { display: true, text: 'Stopa zwrotu w skali roku od całości skumulowanego depozytu'},
                    tooltip: { 
                        callbacks: { 
                            label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} %` 
                        } 
                    }
                },
                scales: {
                    x: { 
                        ticks: { color: 'rgba(120, 120, 120, 0.8)' }, 
                        grid: { color: 'rgba(120, 120, 120, 0.2)' } 
                    },
                    y: { 
                        ticks: { 
                            color: 'rgba(120, 120, 120, 0.8)', 
                            callback: function(val: any, index: number) { 
                                return val + '%'; 
                            }
                        }, 
                        grid: { color: 'rgba(120, 120, 120, 0.2)' }  
                    }                
                }
            }
        });
    }
}

// --- 7. OBSŁUGA PORTFELA (AKTYWA) ---
const modalAsset = document.getElementById('modal-asset') as HTMLDivElement;
const assetBrokerSelect = document.getElementById('asset-broker') as HTMLSelectElement;
const assetCouponFields = document.getElementById('asset-coupon-fields') as HTMLDivElement;
const assetNameInput = document.getElementById('asset-name') as HTMLInputElement;
const assetPriceInput = document.getElementById('asset-price') as HTMLInputElement;

// Pobieranie ceny Tickera (tylko gdy to konto Akcyjne)
assetNameInput?.addEventListener('change', async () => {
    const brokerName = assetBrokerSelect.value;
    const brokerObj = userBrokers.find((b: any) => b.name === brokerName);
    const realType = brokerObj ? brokerObj.type : brokerName;

    if (realType === 'Akcje') {
        const ticker = assetNameInput.value.trim().toUpperCase();
        if (ticker) {
            assetPriceInput.placeholder = "Pobieranie...";
            const price = await (window as any).api.getTickerPrice(ticker);
            if (price !== null) {
                assetPriceInput.value = price.toFixed(2);
                assetPriceInput.placeholder = "";
            } else {
                assetPriceInput.placeholder = "Nie znaleziono tickera";
            }
        }
    }
});

document.getElementById('btn-new-bond')?.addEventListener('click', () => {
    (document.getElementById('asset-date') as HTMLInputElement).valueAsDate = new Date();
    if (assetBrokerSelect) {
        // Szukamy domyślnego brokera od obligacji, żeby go od razu zaznaczyć w modalu
        const bondBroker = userBrokers.find((b: any) => b.type.includes('Obligacje'));
        if (bondBroker) assetBrokerSelect.value = bondBroker.name;
        assetBrokerSelect.dispatchEvent(new Event('change')); // Wymuszamy sprawdzenie, czy pokazać kupony
    }
    modalAsset?.classList.remove('hidden');
});

document.getElementById('btn-new-stock')?.addEventListener('click', () => {
    (document.getElementById('asset-date') as HTMLInputElement).valueAsDate = new Date();
    if (assetBrokerSelect) {
        // Szukamy domyślnego brokera od akcji
        const stockBroker = userBrokers.find((b: any) => b.type === 'Akcje');
        if (stockBroker) assetBrokerSelect.value = stockBroker.name;
        assetBrokerSelect.dispatchEvent(new Event('change'));
    }
    modalAsset?.classList.remove('hidden');
});

document.getElementById('btn-cancel-asset')?.addEventListener('click', () => modalAsset?.classList.add('hidden'));

// Dynamiczne wyświetlanie pól kuponowych w zależności od typu wybranego Brokera
assetBrokerSelect?.addEventListener('change', () => {
    const brokerName = assetBrokerSelect.value;
    const brokerObj = userBrokers.find((b: any) => b.name === brokerName);
    const realType = brokerObj ? brokerObj.type : '';

    if (realType === 'Obligacje korporacyjne i zagraniczne' || realType === 'Obligacje korporacyjne') {
        if(assetCouponFields) assetCouponFields.style.display = 'block';
    } else {
        if(assetCouponFields) assetCouponFields.style.display = 'none';
    }
});

// Zapis aktywa (W pole TYPE leci NAZWA BROKERA)
document.getElementById('btn-save-asset')?.addEventListener('click', async () => {
    const asset = {
        name: (document.getElementById('asset-name') as HTMLInputElement).value,
        type: assetBrokerSelect.value, // <--- Teraz tu idzie np. 'Revolut'
        purchase_date: (document.getElementById('asset-date') as HTMLInputElement).value,
        price: parseFloat((document.getElementById('asset-price') as HTMLInputElement).value) || 0,
        currency: (document.getElementById('asset-currency') as HTMLSelectElement).value, // NOWE: Zapis waluty
        quantity: parseFloat((document.getElementById('asset-quantity') as HTMLInputElement).value) || 0,
        coupon_date: (document.getElementById('asset-coupon-date') as HTMLInputElement).value || null,
        coupon_rate: parseFloat((document.getElementById('asset-coupon-rate') as HTMLInputElement).value) || 0,
        coupon_freq: (document.getElementById('asset-coupon-freq') as HTMLSelectElement).value
    };

    await (window as any).api.addAsset(asset);
    modalAsset?.classList.add('hidden');
    loadData();
});

async function loadAssetsData() {
    const assets = await (window as any).api.getAssets();

    const tbodyBonds = document.getElementById('bonds-tbody');
    const tbodyStocks = document.getElementById('stocks-tbody');
    if (tbodyBonds) tbodyBonds.innerHTML = '';
    if (tbodyStocks) tbodyStocks.innerHTML = '';

    const bondsData: any[] = [];
    const stocksData: any[] = [];

    assets.forEach((a: any) => {
        // 1. ZABEZPIECZENIE WALUTY
        const assetCurrency = a.currency || 'PLN';
        let exchangeRate = 1.0;
        
        // 2. MAGICZNE POBRANIE DZISIEJSZEGO KURSU
        if (assetCurrency === 'USD' && cachedCurrentUsd > 0) exchangeRate = cachedCurrentUsd;
        if (assetCurrency === 'EUR' && cachedCurrentEur > 0) exchangeRate = cachedCurrentEur;

        // 3. MATEMATYKA 
        const foreignValue = a.price * a.quantity;
        const totalValuePln = foreignValue * exchangeRate;
        
        // TŁUMACZENIE BROKERA NA TYP
        const brokerObj = userBrokers.find((b:any) => b.name === a.type);
        const realType = brokerObj ? brokerObj.type : a.type; // fallback dla starych rekordów

        const couponInfo = (realType === 'Obligacje korporacyjne i zagraniczne' || realType === 'Obligacje korporacyjne') && a.coupon_rate 
            ? `${a.coupon_rate}% (${a.coupon_freq})<br><small>Wypłata: ${a.coupon_date}</small>` 
            : '-';

        // 4. ŁADNE FORMATOWANIE TABELI
        let priceDisplay = `${a.price.toFixed(2)} ${assetCurrency}`;
        let valueDisplay = `${totalValuePln.toFixed(2)} zł`;
        
        if (assetCurrency !== 'PLN') {
            valueDisplay += `<br><small style="color:#aaa; font-weight:normal; opacity: 0.8;">(${foreignValue.toFixed(2)} ${assetCurrency})</small>`;
        }

        // WYGENEROWANIE SUWAKA Z PRZYCISKAMI
        const actionsHTML = `
            <td style="padding: 5px; width: 1%; white-space: nowrap; text-align: right;">
                <div style="width: 140px; overflow: hidden; border-radius: 4px; position: relative; margin-left: auto;">
                    <div id="slider-asset-${a.id}" style="display: flex; width: 280px; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform: translateX(0); align-items: center;">  
                        
                        <div style="width: 140px; display: flex; gap: 5px; justify-content: flex-end; align-items: center; height: 30px;">
                            <button class="btn btn-more-asset" data-id="${a.id}" style="font-size: 11px; background: none; border: 2px solid #ccc; border-radius: 50%; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;">
                                <i class="fa-solid fa-ellipsis"></i>
                            </button>
                        </div>

                        <div style="width: 140px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; height: 30px;">
                            <button class="btn btn-edit-qty" data-id="${a.id}" style="font-size: 16px; background-color: var(--purple); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-delete-asset" data-id="${a.id}" style="font-size: 16px; background-color: var(--red); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-trash"></i></button>
                            <button class="btn btn-close-slider-asset" data-id="${a.id}" style="font-size: 20px; background: none; border: none; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;" title="Anuluj">
                                <i class="fa-regular fa-circle-xmark"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </td>
        `;

        // 5. ROZDZIELENIE LOGIKI DLA OBLIGACJI I AKCJI
        if (realType.includes('Obligacje')) {
            bondsData.push({ name: a.name, value: totalValuePln, type: realType });
            if (tbodyBonds) {
                tbodyBonds.innerHTML += `
                    <tr>
                        <td><strong>${a.name}</strong></td>
                        <td>${a.type} <br><small style="color:#aaa;">(${realType})</small></td>
                        <td>${a.purchase_date}</td>
                        <td>${a.quantity} szt. <br><small>po ${priceDisplay}</small></td>
                        <td style="color: #4CAF50; font-weight: bold;">${valueDisplay}</td>
                        <td>${couponInfo}</td>
                        ${actionsHTML}
                    </tr>
                `;
            }
        } else {
            stocksData.push({ name: a.name, value: totalValuePln, type: realType });
            if (tbodyStocks) {
                // BRAK kolumny z kuponami!
                tbodyStocks.innerHTML += `
                    <tr>
                        <td><strong>${a.name}</strong></td>
                        <td>${a.type} <br><small style="color:#aaa;">(${realType})</small></td>
                        <td>${a.purchase_date}</td>
                        <td>${a.quantity} szt. <br><small>po ${priceDisplay}</small></td>
                        <td style="color: #4CAF50; font-weight: bold;">${valueDisplay}</td>
                        ${actionsHTML}
                    </tr>
                `;
            }
        }
    });

    renderTreemaps(bondsData, stocksData);
}

const modalEditQty = document.getElementById('modal-edit-qty') as HTMLDivElement;
document.getElementById('btn-cancel-qty')?.addEventListener('click', () => modalEditQty?.classList.add('hidden'));

const handleTableClick = async (e: Event) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.btn-edit-qty');
    const deleteBtn = target.closest('.btn-delete-asset');
    
    // Nowe przyciski slidera
    const moreBtn = target.closest('.btn-more-asset');
    const closeBtn = target.closest('.btn-close-slider-asset');

    if (moreBtn) {
        const id = moreBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-asset-${id}`);
        if (slider) slider.style.transform = 'translateX(-50%)'; 
    }
    else if (closeBtn) {
        const id = closeBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-asset-${id}`);
        if (slider) slider.style.transform = 'translateX(0)'; 
    }
    else if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        const editIdEl = document.getElementById('edit-qty-id') as HTMLInputElement;
        const editValEl = document.getElementById('edit-qty-val') as HTMLInputElement;
        if(editIdEl) editIdEl.value = id!;
        if(editValEl) editValEl.value = ""; 
        modalEditQty?.classList.remove('hidden');
    } 
    else if (deleteBtn) {
        const id = parseInt(deleteBtn.getAttribute('data-id')!);
        if (confirm("Czy na pewno chcesz całkowicie usunąć to aktywo z portfela?")) {
            await (window as any).api.deleteAsset(id);
            loadAssetsData();
        }
    }
};

document.getElementById('bonds-tbody')?.addEventListener('click', handleTableClick);
document.getElementById('stocks-tbody')?.addEventListener('click', handleTableClick);

document.getElementById('btn-save-qty')?.addEventListener('click', async () => {
    const id = parseInt((document.getElementById('edit-qty-id') as HTMLInputElement).value);
    const newQty = parseFloat((document.getElementById('edit-qty-val') as HTMLInputElement).value);
    if (!isNaN(newQty)) {
        await (window as any).api.updateAssetQuantity(id, newQty);
        modalEditQty?.classList.add('hidden');
        loadAssetsData();
    }
});

function renderTreemaps(bonds: any[], stocks: any[]) {
    if (bondsTreemapChart) bondsTreemapChart.destroy();
    if (stocksTreemapChart) stocksTreemapChart.destroy();

    const canvasB = document.getElementById('bondsTreemap') as HTMLCanvasElement;
    const canvasS = document.getElementById('stocksTreemap') as HTMLCanvasElement;
    
    const ctxB = canvasB ? canvasB.getContext('2d') : null;
    const ctxS = canvasS ? canvasS.getContext('2d') : null;

    const colorGenBonds = (ctx: any) => {
        if (!ctx.raw || !ctx.raw._data) return '#333';
        const item = Array.isArray(ctx.raw._data) ? ctx.raw._data[0] : ctx.raw._data;
        if (!item || !item.type) return '#333';
        return item.type.includes('skarbowe') ? '#1976D2' : '#388E3C';
    };

    const colorGenStocks = () => '#FF9800';

    const safeBonds = bonds.length > 0 ? bonds : [{ name: 'Brak obligacji', value: 0.0001, type: '' }];
    const safeStocks = stocks.length > 0 ? stocks : [{ name: 'Brak akcji', value: 0.0001, type: '' }];

    const labelFormatter = (ctx: any) => {
        if (ctx.type !== 'data' || !ctx.raw) return;
        return [ctx.raw.g, Number(ctx.raw.v).toFixed(2) + ' zł'];
    };

    const tooltipOptions = {
        enabled: true,
        callbacks: {
            label: (context: any) => ` Wartość: ${Number(context.raw.v).toFixed(2)} zł`
        }
    };

    if (ctxB) {
        bondsTreemapChart = new (window as any).Chart(ctxB, {
            type: 'treemap',
            data: {
                datasets: [{
                    tree: safeBonds,
                    key: 'value',
                    groups: ['name'],
                    backgroundColor: colorGenBonds,
                    borderWidth: 1,
                    borderColor: '#1e1e1e',
                    labels: { display: true, formatter: labelFormatter, color: 'white', font: { size: 14 } }
                }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipOptions } }
        });
    }

    if (ctxS) {
        stocksTreemapChart = new (window as any).Chart(ctxS, {
            type: 'treemap',
            data: {
                datasets: [{
                    tree: safeStocks,
                    key: 'value',
                    groups: ['name'],
                    backgroundColor: colorGenStocks,
                    borderWidth: 1,
                    borderColor: '#1e1e1e',
                    labels: { display: true, formatter: labelFormatter, color: 'white', font: { size: 14 } }
                }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipOptions } }
        });
    }
}

// --- 8. OBSŁUGA DZIENNIKA ZAGRAŃ ---
const modalJournal = document.getElementById('modal-journal') as HTMLDivElement;

const quotes = [
    { text: "„Gdybyś przez całe życie kupował spółki o wysokiej jakości tylko wtedy, gdy osiągają 200-tygodniową średnią kroczącą, pobiłbyś S&P 500 z ogromną nawiązką. Problem polega na tym, że niewielu ludzi ma w sobie tyle dyscypliny”", author: "Charlie Munger" },
    { text: "„Ktoś siedzi dziś w cieniu, ponieważ ktoś inny posadził drzewo dawno temu.”", author: "Warren Buffet" },
    { text: "„Rynek akcji to narzędzie do przenoszenia pieniędzy od aktywnych do cierpliwych.”", author: "Warren Buffet" },
    { text: "„Giełda jest pełna ludzi, którzy znają cenę wszystkiego, ale nie znają wartości niczego.”", author: "Warren Buffet" },
    { text: "„Gdyby historia była wszystkim, co liczy się w inwestowaniu, najbogatszymi ludźmi byliby bibliotekarze.”", author: "Warren Buffet" },
    { text: "„Zdecydowanie lepiej jest kupić wspaniałą firmę za przyzwoitą cenę, niż przyzwoitą firmę za wspaniałą cenę.”", author: "Warren Buffet" },
    { text: "„Kupuj tylko akcje takich firm, których posiadanie sprawiłoby ci przyjemność, gdyby giełda została zamknięta na 10 lat.”", author: "Warren Buffet" },
    { text: "„Cena jest tym, co płacisz. Wartość jest tym, co otrzymujesz.”", author: "Warren Buffet" },
    { text: "„Nigdy nie inwestuj w biznes, którego nie rozumiesz.”", author: "Warren Buffet" },
    { text: "„Zbudowanie reputacji zajmuje 20 lat, a jej zniszczenie pięć minut. Jeśli o tym pomyślisz, zaczniesz działać inaczej.”", author: "Warren Buffet" },
    { text: "„Jeśli masz tylko młotek, każdy problem wygląda jak gwóźdź.”", author: "Charlie Munger" },
    { text: "„Tęsknota za szybkim wzbogaceniem się jest bardzo niebezpieczna.”", author: "Charlie Munger" },
    { text: "„Znam ludzi, którzy mają wysokie IQ, ale brakuje im cierpliwości. Są rozszarpywani na strzępy przez rynek.”", author: "Charlie Munger" },
    { text: "„Przez całe moje życie nie spotkałem ani jednego mądrego człowieka, który nie czytałby bez przerwy – ani jednego. Będziesz zaskoczony, jak dużo czyta Warren i jak dużo czytam ja.”", author: "Charlie Munger" },
    { text: "„Nigdy nie handluj z kimś, komu nie możesz zaufać. Żadna umowa nie chroni przed złym człowiekiem.”", author: "Charlie Munger" },
    { text: "„Żyj w ramach swoich dochodów i oszczędzaj, aby inwestować. Rób to, co musisz zrobić. Ucz się każdego dnia.”", author: "Charlie Munger" },
    { text: "„Inwestor nie ma racji dlatego, że inni się z nim zgadzają lub nie. Ma rację dlatego, że jego fakty i analizy są rzetelne.”", author: "Benjamin Graham" },
    { text: "„Największym wrogiem inwestora – a nawet jego najgorszym koszmarem – jest prawdopodobnie on sam.”", author: "Benjamin Graham" },
    { text: "„Operacja inwestycyjna to taka, która po dokładnej analizie obiecuje bezpieczeństwo kapitału i satysfakcjonujący zwrot. Operacje niespełniające tych wymogów są spekulacją.”", author: "Benjamin Graham" },
    { text: "„Sekret zdrowego inwestowania można streścić w dwóch słowach: Margines Bezpieczeństwa.”", author: "Benjamin Graham" },
    { text: "„Za każdą akcją stoi firma. Dowiedz się, czym się zajmuje.”", author: "Peter Lynch" },
    { text: "„Jeśli nie potrafisz wyjaśnić 10-latkowi w dwie minuty lub szybciej, dlaczego posiadasz dane akcje, nie powinieneś ich mieć.”", author: "Peter Lynch" },
    { text: "„Więcej pieniędzy stracili inwestorzy próbujący przewidzieć korekty lub przed nimi uciekać, niż wyniosły straty w czasie samych korekt.”", author: "Peter Lynch" },
    { text: "„Spadki na giełdzie są tak powszechne jak zamiecie śnieżne w Minnesocie w zimie. Jeśli jesteś przygotowany, nie mogą cię skrzywdzić.”", author: "Peter Lynch" },
    { text: "„Kluczem do zarabiania pieniędzy na akcjach jest niedawanie się wystraszyć.”", author: "Peter Lynch" },
    { text: "„Trend jest twoim przyjacielem, dopóki się nie odwróci…”", author: "John Murphy" },
    { text: "„Rynek dyskontuje wszystko.”", author: "John Murphy" },
    { text: "„Historia się powtarza.”", author: "John Murphy" },
    { text: "„Nigdy nie łap spadającego noża.”", author: "John Murphy" },
    { text: "„Kupuj, gdy na ulicach leje się krew, nawet jeśli ta krew jest twoja.”", author: "Nathan Mayer Rothschild" },
    { text: "„Czas maksymalnego pesymizmu jest najlepszym momentem na kupno, a czas maksymalnego optymizmu – najlepszym momentem na sprzedaż.”", author: "Sir John Templeton" }
];

function setRandomQuote() {
    const quoteEl = document.getElementById('journal-quote');
    if (quoteEl) {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        const quote = quotes[randomIndex];
        quoteEl.innerHTML = `${quote.text} <br><span style="font-size: 13px; font-weight: bold; color: var(--accent); opacity: 0.8;">~ ${quote.author}</span>`;
    }
}


document.getElementById('btn-new-journal')?.addEventListener('click', () => {
    (document.getElementById('journal-id') as HTMLInputElement).value = '';
    (document.getElementById('journal-existing-image') as HTMLInputElement).value = '';
    (document.getElementById('journal-date') as HTMLInputElement).valueAsDate = new Date();
    (document.getElementById('journal-buy-reason') as HTMLTextAreaElement).value = '';
    (document.getElementById('journal-improvement') as HTMLTextAreaElement).value = '';
    (document.getElementById('journal-profit') as HTMLInputElement).value = '';
    (document.getElementById('journal-image') as HTMLInputElement).value = '';
    modalJournal?.classList.remove('hidden');
});

document.getElementById('btn-cancel-journal')?.addEventListener('click', () => modalJournal?.classList.add('hidden'));

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

document.getElementById('btn-save-journal')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('journal-image') as HTMLInputElement;
    let base64Image = (document.getElementById('journal-existing-image') as HTMLInputElement).value;

    if (fileInput && fileInput.files && fileInput.files[0]) {
        base64Image = await fileToBase64(fileInput.files[0]);
    }

    const entry = {
        date: (document.getElementById('journal-date') as HTMLInputElement).value,
        buy_reason: (document.getElementById('journal-buy-reason') as HTMLTextAreaElement).value,
        sell_reason: (document.getElementById('journal-sell-reason') as HTMLSelectElement).value,
        closed_on_plan: (document.getElementById('journal-closed-plan') as HTMLSelectElement).value,
        followed_strategy: (document.getElementById('journal-strategy') as HTMLSelectElement).value,
        improvement: (document.getElementById('journal-improvement') as HTMLTextAreaElement).value,
        profit_percent: parseFloat((document.getElementById('journal-profit') as HTMLInputElement).value) || 0,
        rating: parseInt((document.getElementById('journal-rating') as HTMLSelectElement).value),
        image_data: base64Image
    };

    const idStr = (document.getElementById('journal-id') as HTMLInputElement).value;

    if (idStr) {
        await (window as any).api.updateJournalEntry(parseInt(idStr), entry);
    } else {
        await (window as any).api.addJournalEntry(entry);
    }

    modalJournal?.classList.add('hidden');
    loadJournalData();
});

async function loadJournalData() {
    const container = document.getElementById('journal-container');
    if (!container) return;
    container.innerHTML = '';

    currentJournalEntries = await (window as any).api.getJournalEntries();

    currentJournalEntries.forEach((entry: any) => {
        const profitColor = entry.profit_percent >= 0 ? '#4CAF50' : '#F44336';

        let imgHTML = '';
        if (entry.image_data) {
            imgHTML = `<img src="${entry.image_data}" class="journal-img" title="Kliknij by powiększyć">`;
        }

        container.innerHTML += `
            <div class="journal-card">
                <h3>
                    <span>${entry.date}</span>
                    <span style="color: ${profitColor}; font-weight: bold;">${entry.profit_percent}%</span>
                </h3>
                <div class="journal-details">
                    <p><strong>Ocena:</strong> ${entry.rating}/5</p>
                    <p><strong>Wyjście:</strong> ${entry.sell_reason} | Zgodnie z planem: ${entry.closed_on_plan}</p>
                    <p><strong>Zgodnie ze strategią:</strong> ${entry.followed_strategy}</p>
                    <p style="margin-top: 10px;"><strong>Dlaczego kupiłem:</strong><br>${entry.buy_reason}</p>
                    <p><strong>Co poprawić:</strong><br>${entry.improvement}</p>
                </div>
                ${imgHTML}
                <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
                    <div style="width: 140px; overflow: hidden; border-radius: 4px; position: relative;">
                        <div id="slider-journal-${entry.id}" style="display: flex; width: 280px; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform: translateX(0); align-items: center;">  
                            
                            <!-- WIDOK 1: Trzy kropeczki -->
                            <div style="width: 140px; display: flex; gap: 5px; justify-content: flex-end; align-items: center; height: 30px;">
                                <button class="btn btn-more-journal" data-id="${entry.id}" style="font-size: 11px; background: none; border: 2px solid #ccc; border-radius: 50%; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;">
                                    <i class="fa-solid fa-ellipsis"></i>
                                </button>
                            </div>

                            <!-- WIDOK 2: Właściwe przyciski (Ołówek / Kosz / X) -->
                            <div style="width: 140px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; height: 30px;">
                                <button class="btn btn-edit-journal" data-id="${entry.id}" style="font-size: 16px; background-color: var(--purple); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-pen"></i></button>
                                <button class="btn btn-delete-journal" data-id="${entry.id}" style="font-size: 16px; background-color: var(--red); border: none; border-radius: 30px; width: 45px; height: 30px; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0;"><i class="fa-solid fa-trash"></i></button>
                                <button class="btn btn-close-slider-journal" data-id="${entry.id}" style="font-size: 20px; background: none; border: none; color: #ccc; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; box-sizing: border-box; margin: 0;" title="Anuluj">
                                    <i class="fa-regular fa-circle-xmark"></i>
                                </button>
                            </div>
                            
                        </div>
                    </div>
                </div>
            </div>
        `;
    });    
    setRandomQuote();
}

document.getElementById('journal-container')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest('.btn-delete-journal');
    const editBtn = target.closest('.btn-edit-journal');
    const imgEl = target.closest('.journal-img');
    
    // Suwak
    const moreBtn = target.closest('.btn-more-journal');
    const closeBtn = target.closest('.btn-close-slider-journal');

    if (moreBtn) {
        const id = moreBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-journal-${id}`);
        if (slider) slider.style.transform = 'translateX(-50%)'; 
    }
    else if (closeBtn) {
        const id = closeBtn.getAttribute('data-id');
        const slider = document.getElementById(`slider-journal-${id}`);
        if (slider) slider.style.transform = 'translateX(0)'; 
    }
    else if (deleteBtn) {
        const id = parseInt(deleteBtn.getAttribute('data-id')!);
        if (confirm("Usunąć ten wpis z dziennika?")) {
            await (window as any).api.deleteJournalEntry(id);
            loadJournalData();
        }
    } 
    else if (editBtn) {
        const id = parseInt(editBtn.getAttribute('data-id')!);
        const entry = currentJournalEntries.find(x => x.id === id);
        if (entry) {
            (document.getElementById('journal-id') as HTMLInputElement).value = entry.id.toString();
            (document.getElementById('journal-existing-image') as HTMLInputElement).value = entry.image_data || '';
            (document.getElementById('journal-date') as HTMLInputElement).value = entry.date;
            (document.getElementById('journal-buy-reason') as HTMLTextAreaElement).value = entry.buy_reason;
            (document.getElementById('journal-sell-reason') as HTMLSelectElement).value = entry.sell_reason;
            (document.getElementById('journal-closed-plan') as HTMLSelectElement).value = entry.closed_on_plan;
            (document.getElementById('journal-strategy') as HTMLSelectElement).value = entry.followed_strategy;
            (document.getElementById('journal-improvement') as HTMLTextAreaElement).value = entry.improvement;
            (document.getElementById('journal-profit') as HTMLInputElement).value = entry.profit_percent.toString();
            (document.getElementById('journal-rating') as HTMLSelectElement).value = entry.rating.toString();
            (document.getElementById('journal-image') as HTMLInputElement).value = ''; 

            modalJournal?.classList.remove('hidden');
        }
    } 
    else if (imgEl) {
        const src = imgEl.getAttribute('src');
        if (src) {
            const previewModal = document.getElementById('modal-image-preview');
            const previewImg = document.getElementById('preview-img') as HTMLImageElement;
            if(previewImg) previewImg.src = src;
            previewModal?.classList.remove('hidden');
        }
    }
});

const closePreview = () => document.getElementById('modal-image-preview')?.classList.add('hidden');
document.getElementById('btn-close-preview')?.addEventListener('click', closePreview);
document.getElementById('modal-image-preview')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-image-preview')) closePreview();
});

// ==========================================
// --- 9. OBSŁUGA WATCHLISTY I FUNDAMENTÓW ---
// ==========================================

const modalTicker = document.getElementById('modal-ticker') as HTMLDivElement;
const modalValuation = document.getElementById('modal-valuation') as HTMLDivElement;

document.getElementById('btn-new-ticker')?.addEventListener('click', () => {
    (document.getElementById('ticker-input') as HTMLInputElement).value = '';
    modalTicker?.classList.remove('hidden');
});
document.getElementById('btn-cancel-ticker')?.addEventListener('click', () => modalTicker?.classList.add('hidden'));
document.getElementById('btn-close-valuation')?.addEventListener('click', () => modalValuation?.classList.add('hidden'));

document.getElementById('btn-save-ticker')?.addEventListener('click', async () => {
    const tickerInput = document.getElementById('ticker-input') as HTMLInputElement;
    if(!tickerInput) return;
    const ticker = tickerInput.value.trim().toUpperCase();
    if (ticker) {
        await (window as any).api.addWatchlistTicker(ticker);
        modalTicker?.classList.add('hidden');
        (window as any).loadWatchlistData();
    }
});

document.getElementById('tv-import-file')?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    
    const file = target.files[0];
    const text = await file.text();
    const lines = text.split('\n');

    for (let line of lines) {
        line = line.trim();
        if (line && !line.includes(',') && !line.includes('\\') && !line.includes('}')) { 
            let ticker = line.includes(':') ? line.split(':')[1] : line;
            ticker = ticker.trim().toUpperCase();
            
            if (ticker && ticker.length > 0 && ticker.length < 15) {
                await (window as any).api.addWatchlistTicker(ticker);
            }
        }
    }
    
    target.value = ''; 
    (window as any).loadWatchlistData();
});

(window as any).loadWatchlistData = async function loadWatchlistData() {
    const tbody = document.getElementById('watchlist-tbody');
    if (!tbody) return;

    // --- KLUCZ API FMP ---
    const FMP_API_KEY = localStorage.getItem('fmpApiKey') || '';
    const isFmpEnabled = localStorage.getItem('fmpEnabled') === 'true'; 


    document.querySelectorAll<HTMLElement>('.fmp-column').forEach((th) => {
    th.style.display = isFmpEnabled ? 'table-cell' : 'none';
    });

    const colspanVal = isFmpEnabled ? 8 : 6;

    tbody.innerHTML = `
        <tr>
            <td colspan="${colspanVal}" style="text-align:center;">
                Ładowanie danych...
            </td>
        </tr>
    `;

    const assets = await (window as any).api.getAssets();

    const ownedTickers = new Set(
        assets
            .filter((a: any) => {
                const brokerObj = userBrokers.find((b: any) => b.name === a.type);
                const realType = brokerObj ? brokerObj.type : a.type;
                return realType === 'Akcje';
            })
            .map((a: any) => a.name.trim().toUpperCase())
    );

    let watchlist = await (window as any).api.getWatchlist();
    if (!watchlist) watchlist = [];
    
    const watchlistTickers = new Set(watchlist.map((w: any) => w.ticker));

    const missingTickers = [...ownedTickers].filter(t => !watchlistTickers.has(t));
    if (missingTickers.length > 0) {
        for (const t of missingTickers) {
            await (window as any).api.addWatchlistTicker(t);
        }
        watchlist = await (window as any).api.getWatchlist();
    }

    const uniqueWatchlist: any[] = [];
    const seen = new Set();
    for (const w of watchlist) {
        if (!seen.has(w.ticker)) {
            seen.add(w.ticker);
            uniqueWatchlist.push(w);
        }
    }

    if (uniqueWatchlist.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspanVal}" style="text-align:center;">
                    Brak spółek. Kup akcje, zaimportuj listę lub dodaj ręcznie.
                </td>
            </tr>
        `;
        return;
    }

    async function getFMPData(ticker: string) {
        let dcf = '-';
        let target = '-';
        
        if (!FMP_API_KEY) return { dcf, target };
        
        try {
            const cleanTicker = ticker.split('.')[0]; 

            const resDcf = await fetch(`https://financialmodelingprep.com/stable/discounted-cash-flow?symbol=${cleanTicker}&apikey=${FMP_API_KEY}`);
            if (resDcf.ok) {
                const data = await resDcf.json();
                if (data && data.length > 0 && data[0].dcf) {
                    dcf = data[0].dcf.toFixed(2);
                }
            }
            
            const resTarget = await fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${cleanTicker}&apikey=${FMP_API_KEY}`);
            if (resTarget.ok) {
                const data = await resTarget.json();
                if (data && data.length > 0 && data[0].targetConsensus) {
                    target = data[0].targetConsensus.toFixed(2);
                }
            }
        } catch(e) {
            console.error("Błąd pobierania danych z FMP:", e);
        }
        
        return { dcf, target };
    }

    const promises = uniqueWatchlist.map(async (item: any) => {
        const quote = await (window as any).api.getYahooQuote(item.ticker).catch(() => null);
        const fmp = isFmpEnabled ? await getFMPData(item.ticker) : null;

        return { 
            item, 
            quote, 
            fmp,
            isOwned: ownedTickers.has(item.ticker) 
        };
    });

    const quotes = await Promise.all(promises);

    const ownedQuotes = quotes.filter(q => q.isOwned);
    const watchedQuotes = quotes.filter(q => !q.isOwned);

    const renderRow = ({ item, quote, fmp, isOwned }: any) => {
        const price = quote?.price != null ? quote.price.toFixed(2) : '-';
        const change = quote?.changePercent != null ? quote.changePercent.toFixed(2) : '-';
        const changeColor = quote?.changePercent > 0 ? '#4CAF50' : quote?.changePercent < 0 ? '#F44336' : '#fff';
        const changeSign = quote?.changePercent > 0 ? '+' : '';
        const pe = quote?.pe != null ? quote.pe.toFixed(2) : '-';
        const peg = quote?.peg != null ? quote.peg.toFixed(2) : '-';
        const name = quote?.name || item.ticker;
        
        const shortLogo = item.ticker.substring(0, 2).toUpperCase();
        const isUS = !item.ticker.includes('.');

        let pegColor = 'var(--text-color)';
        if (peg !== '-') {
            const pegVal = parseFloat(peg);
            if (pegVal < 1) pegColor = '#4CAF50';
            else if (pegVal > 2) pegColor = '#F44336';
        }

        const actionHTML = isOwned 
            ? `<span style="font-size: 11px; color: #aaa; background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border);">W portfelu</span>`
            : `<button class="btn btn-delete-wl" data-id="${item.id}" style="padding: 5px 10px; font-size: 11px; background-color: #F44336; color: white; border: none; cursor: pointer; border-radius: 4px;">Usuń</button>`;

        // NAJPIERW BUDUJEMY LOGO
        let logoHTML = `
            <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background-color: #333; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                <span style="font-weight: bold; font-size: 11px; color: var(--accent); position: absolute; z-index: 1;">
                    ${shortLogo}
                </span>
        `;

        if (isUS) {
            logoHTML += `
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #f8f9fa; z-index: 2; display: flex; align-items: center; justify-content: center;">
                    <img 
                        src="https://financialmodelingprep.com/image-stock/${item.ticker}.png" 
                        style="width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.5));"
                        onerror="this.parentElement.style.display='none';"
                    />
                </div>
            `;
        }
        logoHTML += `</div>`;

        // POTEM BUDUJEMY KOLUMNY FMP
        let fmpColumnsHTML = '';
        if (isFmpEnabled && fmp) {
            let dcfColor = 'var(--text-color)';
            if (fmp.dcf !== '-' && quote?.price != null) {
                dcfColor = parseFloat(fmp.dcf) > quote.price ? '#4CAF50' : '#F44336';
            }
            
            let targetColor = 'var(--text-color)';
            if (fmp.target !== '-' && quote?.price != null) {
                targetColor = parseFloat(fmp.target) > quote.price ? '#4CAF50' : '#F44336';
            }

            fmpColumnsHTML = `
                <td style="color: ${dcfColor}; font-weight: bold;">${fmp.dcf}</td>
                <td style="color: ${targetColor}; font-weight: bold;">${fmp.target}</td>
            `;
        }

        // NA KOŃCU ZWRACAMY HTML (Jeden główny return)
        return `
            <tr class="watchlist-row" style="cursor: pointer; transition: 0.2s;" data-ticker="${item.ticker}">
                <td style="display: flex; align-items: center; gap: 12px; padding: 12px;">
                    ${logoHTML}
                    <div>
                        <div style="font-weight: bold; font-size: 14px;">${name}</div>
                        <div style="font-size: 11px; color: #888;">${item.ticker}</div>
                    </div>
                </td>
                <td style="font-weight: bold;">${price}</td>
                <td style="color: ${changeColor}; font-weight: bold;">${changeSign}${change}%</td>
                <td>${pe}</td>
                <td style="color: ${pegColor}">${peg}</td>
                
                ${fmpColumnsHTML}
                
                <td>${actionHTML}</td>
            </tr>
        `;
    };

    let finalHTML = '';

    if (ownedQuotes.length > 0) {
        // Zmieniono colspan="8" na colspan="${colspanVal}"
        finalHTML += `
            <tr style="background-color: rgba(255,255,255,0.05);">
                <td colspan="${colspanVal}" style="padding: 10px 15px; font-size: 12px; font-weight: bold; color: var(--accent); letter-spacing: 1px; text-transform: uppercase;">
                    <i class="fa-solid fa-briefcase" style="margin-right: 8px;"></i> Posiadane w portfelu
                </td>
            </tr>
        `;
        finalHTML += ownedQuotes.map(renderRow).join('');
    }

    if (watchedQuotes.length > 0) {
        // Zmieniono colspan="8" na colspan="${colspanVal}"
        finalHTML += `
            <tr style="background-color: rgba(255,255,255,0.02);">
                <td colspan="${colspanVal}" style="padding: 10px 15px; font-size: 12px; font-weight: bold; color: #aaa; letter-spacing: 1px; text-transform: uppercase;">
                    <i class="fa-solid fa-eye" style="margin-right: 8px;"></i> Obserwowane
                </td>
            </tr>
        `;
        finalHTML += watchedQuotes.map(renderRow).join('');
    }

    tbody.innerHTML = finalHTML;
}

document.getElementById('watchlist-tbody')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest('.btn-delete-wl');
    const row = target.closest('.watchlist-row');

    if (deleteBtn) {
            e.stopPropagation(); 
            const id = parseInt(deleteBtn.getAttribute('data-id')!);
            
            // NOWE: Pytanie o potwierdzenie usunięcia z Watchlisty
            if (confirm("Czy na pewno chcesz usunąć tę spółkę z listy obserwowanych?")) {
                await (window as any).api.deleteWatchlistTicker(id);
                (window as any).loadWatchlistData();
            }
        } 
        else if (row) {
            const ticker = row.getAttribute('data-ticker');
            if (!ticker) return;

            const valTbody = document.getElementById('val-tbody');
            const valTitle = document.getElementById('val-title');
            if(!valTbody || !valTitle) return;

            valTitle.innerText = `Ładowanie wyceny ${ticker}...`;

            const btnOpenYahoo = document.getElementById('btn-open-yahoo');
            if (btnOpenYahoo) {
                btnOpenYahoo.onclick = () => {
                    const url = `https://finance.yahoo.com/quote/${ticker}/key-statistics/`;
                    (window as any).api.openExternal(url);
                };
            }

        valTbody.innerHTML = '';
        modalValuation?.classList.remove('hidden');

        const data = await (window as any).api.getYahooFundamentals(ticker);
        
        valTitle.innerText = `Valuation Measures: ${ticker}`;
        
        if (!data) {
            valTbody.innerHTML = `<tr><td colspan="2" style="text-align:center;">Brak danych wyceny dla tej spółki.</td></tr>`;
            return;
        }

        const formatLarge = (num: number) => {
            if (!num) return '-';
            if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
            if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
            return num.toString();
        };

        const sd = data.summaryDetail || {};
        const ks = data.defaultKeyStatistics || {};
        const p = data.price || {};

        const metrics = [
            { name: "Market Cap", val: formatLarge(p.marketCap) },
            { name: "Enterprise Value", val: formatLarge(ks.enterpriseValue) },
            { name: "Trailing P/E", val: sd.trailingPE?.toFixed(2) || '-' },
            { name: "Forward P/E", val: sd.forwardPE?.toFixed(2) || '-' },
            { name: "PEG Ratio (5yr expected)", val: ks.pegRatio?.toFixed(2) || '-' },
            { name: "Price/Sales", val: sd.priceToSalesTrailing12Months?.toFixed(2) || '-' },
            { name: "Price/Book", val: ks.priceToBook?.toFixed(2) || '-' }
        ];

        metrics.forEach(m => {
            valTbody.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="text-align: left; padding: 10px; color: #aaa;">${m.name}</td>
                    <td style="padding: 10px; font-weight: bold;">${m.val}</td>
                </tr>
            `;
        });
    }
});



// START
loadData();



// ==========================================
// --- 10. KALKULATOR WIELU PRZELEWÓW CSV ---
// ==========================================

const currencySelect = document.getElementById('currency-select') as HTMLSelectElement;
const csvUpload = document.getElementById('csv-upload') as HTMLInputElement;
const rowsContainer = document.getElementById('rows-container') as HTMLDivElement;
const btnAddRow = document.getElementById('btn-add-row') as HTMLButtonElement;
const totalCurrencyEl = document.getElementById('total-currency') as HTMLSpanElement;
const totalPlnEl = document.getElementById('total-pln') as HTMLSpanElement;
const currencyLabelEl = document.getElementById('currency-label') as HTMLSpanElement;

// Pobiera kurs średni NBP z ostatniego dostępnego dnia roboczego przed podaną datą transakcji
async function getCalcNBPRate(currency: string, transactionDateStr: string): Promise<number> {
    if (!transactionDateStr) return 0;
    
    let date = new Date(transactionDateStr);
    
    // Pętla cofająca się do 7 dni (na wypadek długich weekendów/świąt)
    for (let i = 0; i < 7; i++) {
        date.setDate(date.getDate() - 1);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}-${mm}-${dd}`;
        
        try {
            const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/A/${currency}/${formattedDate}/?format=json`);
            if (response.ok) {
                const data = await response.json();
                return data.rates[0].mid;
            }
        } catch (error) {
            // Ciche przejście do kolejnego dnia wstecz w przypadku braku danych
        }
    }
    return 0; // Jeśli nie znajdzie kursu
}

// Funkcja przeliczająca łączne sumy ze wszystkich wierszy
function updateCalcTotals(): void {
    if (!rowsContainer || !totalCurrencyEl || !totalPlnEl || !currencyLabelEl || !currencySelect) return;

    let totalCurrency = 0;
    let totalPln = 0;
    
    const rows = rowsContainer.querySelectorAll('.calc-row');
    rows.forEach(row => {
        const amountInput = row.querySelector('.amount-input') as HTMLInputElement;
        const plnResult = row.querySelector('.pln-result') as HTMLSpanElement;
        
        const amount = parseFloat(amountInput.value) || 0;
        const pln = parseFloat(plnResult.dataset.value || '0') || 0;
        
        totalCurrency += amount;
        totalPln += pln;
    });

    totalCurrencyEl.textContent = totalCurrency.toFixed(2);
    totalPlnEl.textContent = totalPln.toFixed(2);
    currencyLabelEl.textContent = currencySelect.value;
}

// Tworzy pojedynczy wiersz kalkulatora
function createCalcRow(defaultDate: string = '', defaultAmount: string = ''): void {
    if (!rowsContainer) return;

    const row = document.createElement('div');
    row.className = 'calc-row';
    row.style.cssText = 'display: flex; gap: 15px; align-items: center; padding: 5px 0;';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'date-input btn';
    dateInput.value = defaultDate;

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.01';
    amountInput.className = 'amount-input btn';
    amountInput.placeholder = 'Kwota';
    amountInput.addEventListener('blur', () => {
        const val = parseFloat(amountInput.value);
        if (!isNaN(val)) amountInput.value = val.toFixed(2);
    });
    amountInput.value = defaultAmount;

    const resultSpan = document.createElement('span');
    resultSpan.className = 'pln-result';
    resultSpan.style.cssText = 'min-width: 250px; font-weight: bold; color: #4CAF50;';
    resultSpan.textContent = '0.00 PLN';
    resultSpan.dataset.value = '0';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn';
    removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    removeBtn.style.color = '#ff4444';
    removeBtn.onclick = () => { 
        row.remove(); 
        updateCalcTotals(); 
    };

    // Obsługa przeliczenia przy zmianie wartości lub daty
    const calculateRow = async () => {
        if (dateInput.value && amountInput.value && currencySelect) {
            resultSpan.textContent = 'Pobieranie kursu...';
            resultSpan.style.color = '#aaa';

            const rate = await getCalcNBPRate(currencySelect.value.toLowerCase(), dateInput.value);
            const amount = parseFloat(amountInput.value) || 0;
            const plnValue = amount * rate;
            
            resultSpan.dataset.value = plnValue.toString();
            resultSpan.textContent = `${plnValue.toFixed(2)} PLN (kurs NBP: ${rate.toFixed(4)})`;
            resultSpan.style.color = '#4CAF50';
            updateCalcTotals();
        } else {
            resultSpan.textContent = '0.00 PLN';
            resultSpan.dataset.value = '0';
            updateCalcTotals();
        }
    };

    dateInput.addEventListener('change', calculateRow);
    amountInput.addEventListener('input', calculateRow);
    currencySelect?.addEventListener('change', calculateRow);

    row.append(dateInput, amountInput, resultSpan, removeBtn);
    rowsContainer.append(row);

    // Automatyczne przeliczenie po imporcie danych z CSV
    if (defaultDate && defaultAmount) {
        calculateRow();
    }
}

// Inicjalizacja domyślnego wiersza i zdarzeń
if (btnAddRow) btnAddRow.addEventListener('click', () => createCalcRow());
if (currencySelect) currencySelect.addEventListener('change', updateCalcTotals);

// Parser plików CSV
// Parser plików CSV
if (csvUpload) {
    csvUpload.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split(/\r\n|\n/);
            
            if (rowsContainer) rowsContainer.innerHTML = ''; // Czyści obecne wiersze

            lines.forEach((line, index) => {
                if (index === 0 || !line.trim()) return; 
                
                // 1. Sprawdzamy separator struktury (Numbers/Excel w PL używa średnika)
                const isSemicolon = line.includes(';');
                let cols: string[] = [];

                if (isSemicolon) {
                    cols = line.split(';');
                } else {
                    // Dzielenie po przecinkach z pominięciem przecinków wewnątrz cudzysłowów
                    const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
                    cols = matches ? matches : line.split(',');
                }
                
                const type = cols[0]?.replace(/["']/g, '').trim();
                

                if (type && type.toLowerCase() === 'deposit') {
                    const timeStr = cols[4]?.replace(/["']/g, '').trim(); 
                    let amountStr = cols[5]?.replace(/["']/g, '').trim(); 
                    
                    // 2. Usuwamy spacje i zamieniamy polski przecinek na kropkę
                    if (amountStr) {
                        amountStr = amountStr.replace(/\s/g, '').replace(',', '.');
                        
                        // NOWE: Wymuszenie zawsze dwóch miejsc po przecinku (np. 47.7 -> 47.70)
                        const amountNum = parseFloat(amountStr);
                        if (!isNaN(amountNum)) {
                            amountStr = amountNum.toFixed(2);
                        }
                    }
                    
                    const dateMatch = timeStr?.match(/^\d{4}-\d{2}-\d{2}/);
                    const parsedDate = dateMatch ? dateMatch[0] : '';
                    
                    if (parsedDate && amountStr) {
                        createCalcRow(parsedDate, amountStr);
                    }
                }
            });
            
            target.value = ''; // Pozwala zaimportować ponownie ten sam plik
        };
        reader.readAsText(file);
    });

    // Uruchamia jeden pusty wiersz na start, jeśli strona zawiera kalkulator
    if (rowsContainer) createCalcRow();
}