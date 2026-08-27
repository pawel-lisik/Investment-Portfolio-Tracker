import { app, BrowserWindow, ipcMain, shell} from 'electron';
import * as path from 'path';
import { initDB, addDeposit, getDeposits, addProfit, getProfits, addAsset, getAssets, updateAssetQuantity, deleteAsset, addJournalEntry, getJournalEntries, deleteJournalEntry, updateJournalEntry, addWatchlistTicker, getWatchlist, deleteWatchlistTicker, deleteDeposit, updateDeposit, updateProfit, deleteProfit} from './database';

const yfModule = require('yahoo-finance2');
const YahooFinanceClass = yfModule.default || yfModule;
const yahooFinance = new YahooFinanceClass();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Portfolio Pawła",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../public/index.html'));
}

app.whenReady().then(() => {
    initDB();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('add-deposit', async (event, deposit) => {
    return await addDeposit(deposit);
});

ipcMain.handle('get-deposits', async () => {
    return await getDeposits();
});

ipcMain.handle('add-profit', async (event, profit) => {
    return await addProfit(profit);
});

ipcMain.handle('get-profits', async () => {
    return await getProfits();
});

ipcMain.handle('add-asset', async (event, asset) => await addAsset(asset));
ipcMain.handle('get-assets', async () => await getAssets());
ipcMain.handle('update-asset-quantity', async (event, {id, quantity}) => await updateAssetQuantity(id, quantity));
ipcMain.handle('delete-asset', async (event, id) => await deleteAsset(id));

ipcMain.handle('get-ticker-price', async (event, ticker: string) => {
    try {
        // Używamy natywnego fetch (dostępnego w najnowszym Node/Electron)
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Wyciąganie aktualnej ceny rynkowej ze struktury JSON Yahoo Finance
        if (data.chart && data.chart.result && data.chart.result.length > 0) {
            return data.chart.result[0].meta.regularMarketPrice;
        }
        return null;
    } catch (error) {
        console.error("Błąd pobierania kursu:", error);
        return null;
    }
});

ipcMain.handle('add-journal-entry', async (event, entry) => await addJournalEntry(entry));
ipcMain.handle('get-journal-entries', async () => await getJournalEntries());
ipcMain.handle('delete-journal-entry', async (event, id) => await deleteJournalEntry(id));
ipcMain.handle('update-journal-entry', async (event, {id, entry}) => await updateJournalEntry(id, entry));

// --- WATCHLIST & YAHOO FINANCE ---
// --- WATCHLIST & YAHOO FINANCE ---
ipcMain.handle('add-watchlist-ticker', async (event, ticker) => await addWatchlistTicker(ticker));
ipcMain.handle('get-watchlist', async () => await getWatchlist());
ipcMain.handle('delete-watchlist-ticker', async (event, id) => await deleteWatchlistTicker(id));

ipcMain.handle('get-yahoo-quote', async (event, ticker) => {
    try {
        const quote = await yahooFinance.quote(ticker);
        // summaryDetail dla P/E, defaultKeyStatistics dla PEG
        const summary = await yahooFinance.quoteSummary(ticker, { modules: ['summaryDetail', 'defaultKeyStatistics'] }).catch(() => null);
        
        return {
            price: quote.regularMarketPrice,
            changePercent: quote.regularMarketChangePercent,
            name: quote.longName || quote.shortName || ticker,
            pe: summary?.summaryDetail?.trailingPE || null,
            peg: summary?.defaultKeyStatistics?.pegRatio || null
        };
    } catch (e) {
        console.error("Błąd pobierania danych z Yahoo dla:", ticker, e);
        return null;
    }
});

ipcMain.handle('get-yahoo-fundamentals', async (event, ticker) => {
    try {
        return await yahooFinance.quoteSummary(ticker, { 
            modules: ['summaryDetail', 'defaultKeyStatistics', 'price'] 
        });
    } catch (e) {
        console.error("Błąd pobierania fundamentów dla:", ticker, e);
        return null;
    }
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// USUWANIE WPŁATY
ipcMain.handle('delete-deposit', async (event, id) => {
    return await deleteDeposit(id);
});

// AKTUALIZACJA (EDYCJA) WPŁATY
ipcMain.handle('update-deposit', async (event, id, deposit) => {
    return await updateDeposit(id, deposit);
});

// USUWANIE I EDYCJA ZYSKÓW
ipcMain.handle('delete-profit', async (event, id) => {
    return await deleteProfit(id);
});

ipcMain.handle('update-profit', async (event, id, profit) => {
    return await updateProfit(id, profit);
});