import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    addDeposit: (deposit: any) => ipcRenderer.invoke('add-deposit', deposit),
    getDeposits: () => ipcRenderer.invoke('get-deposits'),
    addProfit: (profit: any) => ipcRenderer.invoke('add-profit', profit),
    getProfits: () => ipcRenderer.invoke('get-profits'),
    addAsset: (asset: any) => ipcRenderer.invoke('add-asset', asset),
    getAssets: () => ipcRenderer.invoke('get-assets'),
    updateAssetQuantity: (id: number, quantity: number) => ipcRenderer.invoke('update-asset-quantity', {id, quantity}),
    deleteAsset: (id: number) => ipcRenderer.invoke('delete-asset', id),
    getTickerPrice: (ticker: string) => ipcRenderer.invoke('get-ticker-price', ticker),
    addJournalEntry: (entry: any) => ipcRenderer.invoke('add-journal-entry', entry),
    getJournalEntries: () => ipcRenderer.invoke('get-journal-entries'),
    deleteJournalEntry: (id: number) => ipcRenderer.invoke('delete-journal-entry', id),
    updateJournalEntry: (id: number, entry: any) => ipcRenderer.invoke('update-journal-entry', {id, entry}),
    addWatchlistTicker: (ticker: string) => ipcRenderer.invoke('add-watchlist-ticker', ticker),
    getWatchlist: () => ipcRenderer.invoke('get-watchlist'),
    deleteWatchlistTicker: (id: number) => ipcRenderer.invoke('delete-watchlist-ticker', id),
    getYahooQuote: (ticker: string) => ipcRenderer.invoke('get-yahoo-quote', ticker),
    getYahooFundamentals: (ticker: string) => ipcRenderer.invoke('get-yahoo-fundamentals', ticker),
    openExternal: (url: string) => ipcRenderer.send('open-external', url),
    updateDeposit: (id: number, deposit: any) => ipcRenderer.invoke('update-deposit', id, deposit),
    deleteDeposit: (id: number) => ipcRenderer.invoke('delete-deposit', id),
    updateProfit: (id: number, profit: any) => ipcRenderer.invoke('update-profit', id, profit),
    deleteProfit: (id: number) => ipcRenderer.invoke('delete-profit', id)
});
