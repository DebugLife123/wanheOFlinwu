import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { importProvidedSalesOrders } from "./sales-import";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const globalForDb = globalThis as unknown as { __linwuDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__linwuDb) return globalForDb.__linwuDb;

  const db = new Database(path.join(dataDir, "linwu.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      install_fee_fen INTEGER NOT NULL DEFAULT 10000
    );

    CREATE TABLE IF NOT EXISTS product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL REFERENCES products(id),
      price_fen INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL REFERENCES products(id),
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      saleable INTEGER NOT NULL DEFAULT 0,
      reserved INTEGER NOT NULL DEFAULT 0,
      sample INTEGER NOT NULL DEFAULT 0,
      damaged INTEGER NOT NULL DEFAULT 0,
      in_transit INTEGER NOT NULL DEFAULT 0,
      UNIQUE (product_id, warehouse_id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL DEFAULT '待出库',
      source TEXT NOT NULL DEFAULT '门店仓',
      need_install INTEGER NOT NULL DEFAULT 0,
      install_fee_fen INTEGER NOT NULL DEFAULT 0,
      total_fen INTEGER NOT NULL,
      paid_fen INTEGER NOT NULL DEFAULT 0,
      appointment_at TEXT,
      note TEXT NOT NULL DEFAULT '',
      salesperson TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      collector TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT '',
      delivery_install TEXT NOT NULL DEFAULT '',
      gift TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price_fen INTEGER NOT NULL,
      serial_no TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      amount_fen INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT '现金',
      received_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS service_tasks (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      type TEXT NOT NULL DEFAULT '安装',
      product_label TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      assignee TEXT NOT NULL DEFAULT '',
      appointment_at TEXT,
      status TEXT NOT NULL DEFAULT '待上门',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn(db, "orders", "salesperson", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "brand", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "collector", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "payment_method", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "delivery_install", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "gift", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "completed_at", "TEXT");

  seed(db);
  globalForDb.__linwuDb = db;
  return db;
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seed(db: Database.Database) {
  const importVersion = "sales-report-2026-v2";
  const imported = db.prepare("SELECT value FROM app_meta WHERE key = 'sales_import'").get() as { value: string } | undefined;
  if (imported?.value === importVersion) return;

  const run = db.transaction(() => {
    // 年度报表是销售订单的唯一数据源：清除旧版本的演示商品、订单、客户、收款和任务。
    // 仓库名称属于系统配置，保留用于后续新建订单选择履约来源。
    db.exec(`
      DELETE FROM service_tasks;
      DELETE FROM payments;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM customers;
      DELETE FROM inventory;
      DELETE FROM product_prices;
      DELETE FROM products;
    `);
    importProvidedSalesOrders(db);

    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sales_import', ?)").run(importVersion);
  });

  run();
}

export function nextOrderNo(db: Database.Database): string {
  const now = new Date();
  const prefix = `XS-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const row = db
    .prepare("SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1")
    .get(`${prefix}-%`) as { order_no: string } | undefined;
  const seq = row ? Number(row.order_no.split("-")[2]) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

export function nextOrderId(db: Database.Database): string {
  const row = db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number };
  return `ord-${String(row.n + 1).padStart(4, "0")}-${Date.now().toString(36)}`;
}

export function nextTaskId(db: Database.Database, type: string): string {
  const now = new Date();
  const prefix = `${type === "维修" ? "SH" : "AZ"}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const row = db
    .prepare("SELECT id FROM service_tasks WHERE id LIKE ? ORDER BY id DESC LIMIT 1")
    .get(`${prefix}-%`) as { id: string } | undefined;
  const seq = row ? Number(row.id.split("-")[2]) + 1 : 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

