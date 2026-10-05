import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

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
  `);

  seed(db);
  globalForDb.__linwuDb = db;
  return db;
}

function seed(db: Database.Database) {
  const hasProducts = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
  if (hasProducts.n > 0) return;

  const run = db.transaction(() => {
    const insertProduct = db.prepare(
      "INSERT INTO products (id, name, subtitle, image, install_fee_fen) VALUES (?, ?, ?, ?, ?)",
    );
    insertProduct.run("ml10", "万和 ML10 燃气热水器", "澎湃瀑布洗 · 一级能效", "/products/vanward-ml10.jpg", 10000);
    insertProduct.run("mlv5", "万和 MLV5 燃气热水器", "恒温零冷水 · 一级能效", "/products/vanward-ml10.jpg", 10000);
    insertProduct.run("mlvs6", "万和 MLVS6 燃气热水器", "雾化外排 · 一级能效", "/products/vanward-mlvs6.jpg", 10000);
    insertProduct.run("stlv88", "万和 STLV88 户外热水器", "中央零冷水户外版", "/products/vanward-stlv88.jpg", 15000);
    insertProduct.run("x9", "喜乐乐 X9 取暖桌", "智能升降 · 语音控制", "/products/vanward-ml10.jpg", 0);
    insertProduct.run("q7", "喜乐乐 Q7 取暖桌", "经典款 · 节能发热", "/products/vanward-ml10.jpg", 0);

    const insertPrice = db.prepare("INSERT INTO product_prices (product_id, price_fen) VALUES (?, ?)");
    insertPrice.run("ml10", 369900);
    insertPrice.run("mlv5", 319900);
    insertPrice.run("mlvs6", 319900);
    insertPrice.run("stlv88", 599900);
    insertPrice.run("x9", 428000);
    insertPrice.run("q7", 298000);

    const insertWarehouse = db.prepare("INSERT INTO warehouses (name) VALUES (?)");
    insertWarehouse.run("门店仓");
    insertWarehouse.run("后仓");
    insertWarehouse.run("临时仓");

    const warehouseId = (name: string) =>
      (db.prepare("SELECT id FROM warehouses WHERE name = ?").get(name) as { id: number }).id;

    const insertInventory = db.prepare(
      `INSERT INTO inventory (product_id, warehouse_id, saleable, reserved, sample, damaged, in_transit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertInventory.run("ml10", warehouseId("门店仓"), 3, 1, 1, 0, 2);
    insertInventory.run("mlvs6", warehouseId("后仓"), 2, 0, 0, 0, 0);
    insertInventory.run("stlv88", warehouseId("门店仓"), 1, 1, 0, 0, 1);
    insertInventory.run("x9", warehouseId("后仓"), 2, 1, 1, 0, 0);
    insertInventory.run("q7", warehouseId("临时仓"), 0, 0, 1, 1, 3);

    const insertCustomer = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)");
    const customerId = (name: string, phone: string, address: string) =>
      Number(insertCustomer.run(name, phone, address).lastInsertRowid);

    const c1 = customerId("陈桂香", "13875520836", "临武县武水镇晴岚路 18 号");
    const c2 = customerId("李建国", "15173562041", "临武县舜峰镇东云路 62 号");
    const c3 = customerId("周冬梅", "18973557620", "临武县南强镇莲塘村 6 组");
    const c4 = customerId("黄志勇", "17773516618", "临武县工业园环城北路 9 号");
    const c5 = customerId("肖国安", "13973514482", "临武县楚江镇楚江圩 3 组");
    const c6 = customerId("唐春梅", "15873569017", "临武县金江镇打鼓村 2 组");
    const c7 = customerId("王海燕", "13773558342", "临武县南强镇莲塘村 6 组");

    const insertOrder = db.prepare(
      `INSERT INTO orders (id, order_no, customer_id, status, source, need_install, install_fee_fen, total_fen, paid_fen, appointment_at, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare(
      "INSERT INTO order_items (order_id, product_id, quantity, unit_price_fen, serial_no) VALUES (?, ?, ?, ?, ?)",
    );
    const insertPayment = db.prepare(
      "INSERT INTO payments (order_id, amount_fen, method, received_at, note) VALUES (?, ?, ?, ?, ?)",
    );

    insertOrder.run("ord-006", "XS-0802-006", c1, "待出库", "门店仓", 1, 10000, 369900, 100000, "2026-08-03 14:30", "", "2026-08-02 10:42:00");
    insertItem.run("ord-006", "ml10", 1, 359900, "ML10-26-0802-031");
    insertPayment.run("ord-006", 100000, "微信", "2026-08-02 10:45:00", "定金");

    insertOrder.run("ord-005", "XS-0802-005", c2, "配送中", "后仓", 1, 0, 428000, 428000, "2026-08-02 16:00", "", "2026-08-02 09:18:00");
    insertItem.run("ord-005", "x9", 1, 428000, "");
    insertPayment.run("ord-005", 428000, "微信", "2026-08-02 09:20:00", "全款");

    insertOrder.run("ord-018", "XS-0801-018", c3, "待安装", "厂家直发", 1, 10000, 329900, 329900, "2026-08-02 14:30", "", "2026-08-01 17:05:00");
    insertItem.run("ord-018", "mlv5", 1, 319900, "");
    insertPayment.run("ord-018", 329900, "支付宝", "2026-08-01 17:08:00", "全款");

    insertOrder.run("ord-015", "XS-0801-015", c4, "已完成", "门店仓", 1, 15000, 614900, 614900, null, "", "2026-08-01 11:26:00");
    insertItem.run("ord-015", "stlv88", 1, 599900, "STLV88-26-0728-007");
    insertPayment.run("ord-015", 614900, "现金", "2026-08-01 11:30:00", "全款");

    insertOrder.run("ord-031", "XS-0726-031", c5, "已完成", "门店仓", 0, 0, 428000, 300000, null, "", "2026-07-26 15:40:00");
    insertItem.run("ord-031", "x9", 1, 428000, "");
    insertPayment.run("ord-031", 300000, "现金", "2026-07-26 15:42:00", "首付款");

    insertOrder.run("ord-022", "XS-0718-022", c6, "已完成", "门店仓", 1, 15000, 614900, 500000, null, "", "2026-07-18 10:12:00");
    insertItem.run("ord-022", "stlv88", 1, 599900, "STLV88-26-0715-003");
    insertPayment.run("ord-022", 500000, "微信", "2026-07-18 10:15:00", "首付款");

    const insertTask = db.prepare(
      `INSERT INTO service_tasks (id, order_id, customer_id, type, product_label, address, assignee, appointment_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertTask.run("AZ-0802-003", "ord-018", c3, "安装", "万和 MLV5", "临武县南强镇莲塘村 6 组", "刘师傅", "2026-08-02 14:30", "已预约");
    insertTask.run("AZ-0802-002", "ord-005", c2, "安装", "喜乐乐 X9", "临武县舜峰镇东云路 62 号", "何师傅", "2026-08-02 16:00", "待上门");
    insertTask.run("SH-0802-001", null, c7, "维修", "万和 JSQ30", "临武县南强镇莲塘村 6 组", "刘师傅", "2026-08-03 09:00", "等待配件");
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

