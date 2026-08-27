import sqlite3 from 'sqlite3';
import * as path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'portfolio.db');
export const db = new sqlite3.Database(dbPath);

export function initDB() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            amount REAL,
            currency TEXT,
            exchange_rate REAL,
            amount_pln REAL,
            destination TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT,
            purchase_date TEXT,
            price REAL,
            quantity REAL,
            coupon_date TEXT,
            coupon_rate REAL,
            coupon_freq TEXT
        )`);        

        db.run(`CREATE TABLE IF NOT EXISTS profits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            broker TEXT,
            category TEXT,
            amount REAL,
            tax REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            buy_reason TEXT,
            sell_reason TEXT,
            closed_on_plan TEXT,
            followed_strategy TEXT,
            improvement TEXT,
            profit_percent REAL,
            rating INTEGER,
            image_data TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS watchlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticker TEXT UNIQUE,
                    date_added TEXT
                )`);
    });
}

export const addDeposit = (deposit: any): Promise<number> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO deposits (date, amount, currency, exchange_rate, amount_pln, destination) VALUES (?, ?, ?, ?, ?, ?)`);
        stmt.run([deposit.date, deposit.amount, deposit.currency, deposit.exchange_rate, deposit.amount_pln, deposit.destination], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

export const getDeposits = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM deposits ORDER BY date DESC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export const addProfit = (profit: any): Promise<number> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO profits (date, broker, category, amount, tax) VALUES (?, ?, ?, ?, ?)`);
        stmt.run([profit.date, profit.broker, profit.category, profit.amount, profit.tax], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

export const getProfits = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM profits ORDER BY date DESC`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export const addAsset = (asset: any): Promise<number> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO assets (name, type, purchase_date, price, quantity, coupon_date, coupon_rate, coupon_freq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run([asset.name, asset.type, asset.purchase_date, asset.price, asset.quantity, asset.coupon_date, asset.coupon_rate, asset.coupon_freq], function(err) {
            if (err) reject(err); else resolve(this.lastID);
        });
    });
}

export const getAssets = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM assets ORDER BY purchase_date DESC`, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

export const updateAssetQuantity = (id: number, quantity: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE assets SET quantity = ? WHERE id = ?`, [quantity, id], err => {
            if (err) reject(err); else resolve();
        });
    });
}

export const deleteAsset = (id: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM assets WHERE id = ?`, [id], err => {
            if (err) reject(err); else resolve();
        });
    });
}

export const addJournalEntry = (entry: any): Promise<number> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO journal (date, buy_reason, sell_reason, closed_on_plan, followed_strategy, improvement, profit_percent, rating, image_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run([entry.date, entry.buy_reason, entry.sell_reason, entry.closed_on_plan, entry.followed_strategy, entry.improvement, entry.profit_percent, entry.rating, entry.image_data], function(err) {
            if (err) reject(err); else resolve(this.lastID);
        });
    });
}

export const getJournalEntries = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM journal ORDER BY date DESC, id DESC`, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

export const deleteJournalEntry = (id: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM journal WHERE id = ?`, [id], err => {
            if (err) reject(err); else resolve();
        });
    });
}

export const updateJournalEntry = (id: number, entry: any): Promise<void> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`UPDATE journal SET date = ?, buy_reason = ?, sell_reason = ?, closed_on_plan = ?, followed_strategy = ?, improvement = ?, profit_percent = ?, rating = ?, image_data = ? WHERE id = ?`);
        stmt.run([entry.date, entry.buy_reason, entry.sell_reason, entry.closed_on_plan, entry.followed_strategy, entry.improvement, entry.profit_percent, entry.rating, entry.image_data, id], err => {
            if (err) reject(err); else resolve();
        });
    });
}

export const addWatchlistTicker = (ticker: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        // INSERT OR IGNORE zapobiega dublowaniu tickerów!
        const stmt = db.prepare(`INSERT OR IGNORE INTO watchlist (ticker, date_added) VALUES (?, ?)`);
        stmt.run([ticker, new Date().toISOString().split('T')[0]], err => {
            if (err) reject(err); else resolve();
        });
    });
}

export const getWatchlist = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM watchlist ORDER BY ticker ASC`, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

export const deleteWatchlistTicker = (id: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`DELETE FROM watchlist WHERE id = ?`);
        stmt.run([id], err => {
            if (err) reject(err); else resolve();
        });
    });
}

export const deleteDeposit = (id: number) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM deposits WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

export const updateDeposit = (id: number, deposit: any) => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE deposits 
             SET date = ?, amount = ?, currency = ?, exchange_rate = ?, amount_pln = ?, destination = ? 
             WHERE id = ?`,
            [deposit.date, deposit.amount, deposit.currency, deposit.exchange_rate, deposit.amount_pln, deposit.destination, id],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
};

export const deleteProfit = (id: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM profits WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

export const updateProfit = (id: number, profit: any): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE profits 
             SET date = ?, broker = ?, category = ?, amount = ?, tax = ? 
             WHERE id = ?`,
            [profit.date, profit.broker, profit.category, profit.amount, profit.tax, id],
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};