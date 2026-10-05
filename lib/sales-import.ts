import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

interface SalesRow {
  name: string;
  date: string;
  phone: string;
  address: string;
  product: string;
  depositYuan: number;
  balanceYuan: number;
  delivery: string;
  completed: string;
  salesperson: string;
  brand: string;
  collector: string;
  paymentMethod: string;
  note: string;
  gift: string;
}

const sourceFile = path.join(process.cwd(), "lib", "sales-orders-2026.tsv");

function cleanCell(value: string) {
  return value
    .replace(/&#x9;/gi, "")
    .replace(/&#x20;/gi, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseDate(value: string) {
  const match = cleanCell(value).match(/^(\d{1,2})月(\d{1,2})日$/);
  if (!match) throw new Error(`无法识别订单日期：${value}`);
  return `2026-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseRows(): SalesRow[] {
  const lines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line, index) => {
    const cells = line.split("\t").map(cleanCell);
    if (cells.length < 15) throw new Error(`销售报表第 ${index + 2} 行字段不足：${cells.length}`);
    return {
      name: cells[0], date: parseDate(cells[1]), phone: cells[2], address: cells[3], product: cells[4],
      depositYuan: Number(cells[5]), balanceYuan: Number(cells[6]), delivery: cells[7], completed: cells[8],
      salesperson: cells[9], brand: cells[10], collector: cells[11], paymentMethod: cells[12], note: cells[13], gift: cells[14],
    } satisfies SalesRow;
  });
  for (const [index, row] of rows.entries()) {
    if (!row.name || !row.product || !Number.isFinite(row.depositYuan) || !Number.isFinite(row.balanceYuan)) {
      throw new Error(`销售报表第 ${index + 2} 行存在无效数据`);
    }
  }
  return rows;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "product";
}

export function importProvidedSalesOrders(db: Database.Database) {
  const rows = parseRows();
  const insertProduct = db.prepare("INSERT INTO products (id, name, subtitle, image, install_fee_fen) VALUES (?, ?, ?, ?, 0)");
  const insertPrice = db.prepare("INSERT INTO product_prices (product_id, price_fen) VALUES (?, ?)");
  const insertCustomer = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)");
  const insertOrder = db.prepare(
    `INSERT INTO orders (id, order_no, customer_id, status, source, need_install, install_fee_fen, total_fen, paid_fen,
      appointment_at, note, salesperson, brand, collector, payment_method, delivery_install, gift, completed_at, created_at)
     VALUES (?, ?, ?, ?, '厂家直发', ?, 0, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare("INSERT INTO order_items (order_id, product_id, quantity, unit_price_fen, serial_no) VALUES (?, ?, 1, ?, '')");
  const insertPayment = db.prepare("INSERT INTO payments (order_id, amount_fen, method, received_at, note) VALUES (?, ?, ?, ?, ?)");
  const customers = new Map<string, number>();
  const products = new Map<string, { id: string; priceFen: number }>();
  const seenProductIds = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const totalFen = Math.round((row.depositYuan + row.balanceYuan) * 100);
    const paidFen = Math.round(row.depositYuan * 100);
    const customerKey = row.phone || `${row.name}|${row.address}`;
    let customerId = customers.get(customerKey);
    if (!customerId) {
      customerId = Number(insertCustomer.run(row.name, row.phone, row.address).lastInsertRowid);
      customers.set(customerKey, customerId);
    }

    const productKey = row.product;
    let product = products.get(productKey);
    if (!product) {
      const baseId = `sale-${slug(productKey)}`;
      let productId = baseId;
      let suffix = 2;
      while (seenProductIds.has(productId) || db.prepare("SELECT 1 FROM products WHERE id = ?").get(productId)) {
        productId = `${baseId}-${suffix++}`;
      }
      insertProduct.run(productId, productKey, "2026 年度销售报表导入", "/products/vanward-ml10.jpg");
      product = { id: productId, priceFen: totalFen };
      products.set(productKey, product);
      seenProductIds.add(productId);
      insertPrice.run(productId, totalFen);
    }

    const orderId = `sales-2026-${String(index + 1).padStart(3, "0")}`;
    const orderNo = `XS-2026-${String(index + 1).padStart(3, "0")}`;
    const needInstall = row.delivery === "是" ? 1 : 0;
    const completed = row.completed === "是";
    const status = completed ? "已完成" : needInstall ? "待安装" : "待出库";
    const deliveryInstall = row.delivery === "是" ? "送货+安装" : "仅送货";
    const createdAt = `${row.date} 12:00:00`;
    insertOrder.run(orderId, orderNo, customerId, status, needInstall, totalFen, paidFen, row.note, row.salesperson, row.brand, row.collector, row.paymentMethod, deliveryInstall, row.gift, completed ? `${row.date} 12:00:00` : null, createdAt);
    insertItem.run(orderId, product.id, totalFen);
    if (paidFen > 0) {
      insertPayment.run(orderId, paidFen, row.paymentMethod || "现金", `${row.date} 12:00:00`, "销售报表导入");
    }
  }
  return rows.length;
}
