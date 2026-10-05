"use server";

import { revalidatePath } from "next/cache";
import { getDb, nextOrderId, nextOrderNo, nextTaskId } from "./db";
import type { OrderStatus } from "./data";

function fenFromYuan(input: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

function yuanText(fen: number): string {
  return `¥${(fen / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function normalizeDateTime(input: string): string | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

function normalizeDateOnly(input: string): string | null {
  const value = input.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validOrderStatus(input: string): input is OrderStatus {
  return input === "待出库" || input === "配送中" || input === "待安装" || input === "已完成";
}

export async function createOrder(formData: FormData) {
  const db = getDb();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const customerAddress = String(formData.get("customerAddress") ?? "").trim();
  const productId = String(formData.get("productId") ?? "");
  const quantity = Math.max(1, Number(formData.get("quantity") ?? 1) || 1);
  const source = String(formData.get("source") ?? "门店仓");
  const needInstall = formData.get("needInstall") === "1";
  const paymentMethod = String(formData.get("paymentMethod") ?? "现金");
  const salesperson = String(formData.get("salesperson") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const collector = String(formData.get("collector") ?? "").trim();
  const deliveryInstall = String(formData.get("deliveryInstall") ?? (needInstall ? "送货+安装" : "仅送货")).trim();
  const gift = String(formData.get("gift") ?? "").trim();
  const appointmentAt = normalizeDateTime(String(formData.get("appointmentAt") ?? ""));
  const note = String(formData.get("note") ?? "").trim();

  if (!customerName) return { ok: false, message: "请填写客户姓名" };

  const product = db
    .prepare(
      `SELECT p.id, p.name, p.install_fee_fen,
              (SELECT price_fen FROM product_prices pp WHERE pp.product_id = p.id ORDER BY pp.id DESC LIMIT 1) AS price_fen
       FROM products p WHERE p.id = ?`,
    )
    .get(productId) as { id: string; name: string; install_fee_fen: number; price_fen: number } | undefined;
  if (!product) return { ok: false, message: "请选择商品" };

  const installFeeFen = needInstall ? product.install_fee_fen : 0;
  const totalFen = product.price_fen * quantity + installFeeFen;
  const paidInput = fenFromYuan(String(formData.get("paidYuan") ?? ""));
  const paidFen = Math.min(paidInput, totalFen);

  const orderId = nextOrderId(db);
  const orderNo = nextOrderNo(db);

  const run = db.transaction(() => {
    let customer = db
      .prepare("SELECT id FROM customers WHERE name = ? AND phone = ?")
      .get(customerName, customerPhone) as { id: number } | undefined;
    if (!customer && customerPhone) {
      customer = db.prepare("SELECT id FROM customers WHERE phone = ?").get(customerPhone) as { id: number } | undefined;
      if (customer && customerAddress) {
        db.prepare("UPDATE customers SET address = ?, name = ? WHERE id = ?").run(customerAddress, customerName, customer.id);
      }
    }
    const customerId =
      customer?.id ??
      Number(
        db
          .prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)")
          .run(customerName, customerPhone, customerAddress).lastInsertRowid,
      );

    db.prepare(
      `INSERT INTO orders (id, order_no, customer_id, status, source, need_install, install_fee_fen, total_fen, paid_fen, appointment_at, note, salesperson, brand, collector, payment_method, delivery_install, gift)
       VALUES (?, ?, ?, '待出库', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(orderId, orderNo, customerId, source, needInstall ? 1 : 0, installFeeFen, totalFen, paidFen, appointmentAt, note, salesperson, brand, collector, paymentMethod, deliveryInstall, gift);

    db.prepare(
      "INSERT INTO order_items (order_id, product_id, quantity, unit_price_fen) VALUES (?, ?, ?, ?)",
    ).run(orderId, product.id, quantity, product.price_fen);

    if (paidFen > 0) {
      db.prepare("INSERT INTO payments (order_id, amount_fen, method, note) VALUES (?, ?, ?, ?)").run(
        orderId,
        paidFen,
        paymentMethod,
        "开单收款",
      );
    }

    if (needInstall) {
      const taskId = nextTaskId(db, "安装");
      db.prepare(
        `INSERT INTO service_tasks (id, order_id, customer_id, type, product_label, address, assignee, appointment_at, status)
         VALUES (?, ?, ?, '安装', ?, ?, '', ?, ?)`,
      ).run(taskId, orderId, customerId, product.name, customerAddress, appointmentAt, appointmentAt ? "已预约" : "待上门");
    }

    if (source !== "厂家直发") {
      const warehouse = db.prepare("SELECT id FROM warehouses WHERE name = ?").get(source) as { id: number } | undefined;
      if (warehouse) {
        db.prepare(
          `INSERT INTO inventory (product_id, warehouse_id, reserved) VALUES (?, ?, ?)
           ON CONFLICT (product_id, warehouse_id) DO UPDATE SET reserved = reserved + excluded.reserved`,
        ).run(product.id, warehouse.id, quantity);
      }
    }
  });

  run();
  revalidatePath("/");

  const dueFen = totalFen - paidFen;
  const message =
    dueFen > 0
      ? `订单 ${orderNo} 已创建，合计 ${yuanText(totalFen)}，待收 ${yuanText(dueFen)}`
      : `订单 ${orderNo} 已创建，${yuanText(totalFen)} 已收讫`;
  return { ok: true, message, orderNo };
}

export async function createCustomer(formData: FormData) {
  const db = getDb();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name) return { ok: false, message: "请填写客户姓名" };

  const existing = db
    .prepare("SELECT id FROM customers WHERE name = ? AND phone = ?")
    .get(name, phone) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE customers SET address = ? WHERE id = ?").run(address, existing.id);
    revalidatePath("/");
    return { ok: true, message: `客户 ${name} 的信息已更新` };
  }

  db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)").run(name, phone, address);
  revalidatePath("/");
  return { ok: true, message: `客户 ${name} 已建档` };
}


export async function updateOrder(formData: FormData) {
  const db = getDb();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const customerAddress = String(formData.get("customerAddress") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Math.max(1, Number(formData.get("quantity") ?? 1) || 1);
  const source = String(formData.get("source") ?? "门店仓").trim();
  const needInstall = formData.get("needInstall") === "1";
  const statusInput = String(formData.get("status") ?? "待出库");
  const appointmentAt = normalizeDateTime(String(formData.get("appointmentAt") ?? ""));
  const orderDate = normalizeDateOnly(String(formData.get("orderDate") ?? ""));
  const salesperson = String(formData.get("salesperson") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const collector = String(formData.get("collector") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const deliveryInstall = String(formData.get("deliveryInstall") ?? "").trim();
  const gift = String(formData.get("gift") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!orderId) return { ok: false, message: "订单不存在" };
  if (!customerName) return { ok: false, message: "请填写客户姓名" };
  if (!validOrderStatus(statusInput)) return { ok: false, message: "订单状态无效" };
  if (!orderDate) return { ok: false, message: "请填写有效的订单日期" };

  const order = db.prepare(
    `SELECT o.id, o.order_no, o.customer_id, o.status, o.source, o.need_install, o.paid_fen,
            oi.id AS item_id, oi.product_id, oi.quantity AS old_quantity
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ? ORDER BY oi.id LIMIT 1`,
  ).get(orderId) as {
    id: string; order_no: string; customer_id: number; status: OrderStatus; source: string;
    need_install: number; paid_fen: number; item_id: number | null; product_id: string | null; old_quantity: number | null;
  } | undefined;
  if (!order) return { ok: false, message: "订单不存在" };
  if (order.status === "已完成" && (statusInput !== "已完成" || productId !== order.product_id || quantity !== order.old_quantity || source !== order.source)) {
    return { ok: false, message: "已完成订单不可修改商品、数量、仓库或状态" };
  }

  const product = db.prepare(
    `SELECT id, name, price_fen, install_fee_fen FROM products WHERE id = ?`,
  ).get(productId) as { id: string; name: string; price_fen: number; install_fee_fen: number } | undefined;
  if (!product) return { ok: false, message: "请选择商品" };

  const installFeeFen = needInstall ? product.install_fee_fen : 0;
  const totalFen = product.price_fen * quantity + installFeeFen;
  if (totalFen < order.paid_fen) return { ok: false, message: `订单总额不能低于已收款 ${yuanText(order.paid_fen)}` };

  const run = db.transaction(() => {
    db.prepare("UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ?")
      .run(customerName, customerPhone, customerAddress, order.customer_id);
    db.prepare(
      `UPDATE orders SET status = ?, source = ?, need_install = ?, install_fee_fen = ?, total_fen = ?,
        appointment_at = ?, note = ?, salesperson = ?, brand = ?, collector = ?, payment_method = ?,
        delivery_install = ?, gift = ?, created_at = ?, completed_at = CASE WHEN ? = '已完成' THEN COALESCE(completed_at, datetime('now', 'localtime')) ELSE NULL END
       WHERE id = ?`,
    ).run(statusInput, source, needInstall ? 1 : 0, installFeeFen, totalFen, appointmentAt, note, salesperson, brand, collector, paymentMethod, deliveryInstall, gift, `${orderDate} 00:00`, statusInput, orderId);

    if (order.item_id) {
      db.prepare("UPDATE order_items SET product_id = ?, quantity = ?, unit_price_fen = ? WHERE id = ?")
        .run(product.id, quantity, product.price_fen, order.item_id);
    } else {
      db.prepare("INSERT INTO order_items (order_id, product_id, quantity, unit_price_fen) VALUES (?, ?, ?, ?)")
        .run(orderId, product.id, quantity, product.price_fen);
    }

    if (order.status !== "已完成") {
      if (order.source !== "厂家直发") {
        const oldWarehouse = db.prepare("SELECT id FROM warehouses WHERE name = ?").get(order.source) as { id: number } | undefined;
        if (oldWarehouse && order.product_id && order.old_quantity) {
          db.prepare("UPDATE inventory SET reserved = MAX(reserved - ?, 0) WHERE product_id = ? AND warehouse_id = ?")
            .run(order.old_quantity, order.product_id, oldWarehouse.id);
        }
      }
      if (source !== "厂家直发") {
        const newWarehouse = db.prepare("SELECT id FROM warehouses WHERE name = ?").get(source) as { id: number } | undefined;
        if (newWarehouse) {
          db.prepare(
            `INSERT INTO inventory (product_id, warehouse_id, reserved) VALUES (?, ?, ?)
             ON CONFLICT (product_id, warehouse_id) DO UPDATE SET reserved = reserved + excluded.reserved`,
          ).run(product.id, newWarehouse.id, quantity);
        }
      }
    }

    if (needInstall) {
      const activeTask = db.prepare("SELECT id FROM service_tasks WHERE order_id = ? AND status NOT IN ('已完成', '已取消') LIMIT 1").get(orderId);
      if (!activeTask) {
        const taskId = nextTaskId(db, "安装");
        db.prepare(
          `INSERT INTO service_tasks (id, order_id, customer_id, type, product_label, address, assignee, appointment_at, status)
           VALUES (?, ?, ?, '安装', ?, ?, '', ?, ?)`,
        ).run(taskId, orderId, order.customer_id, product.name, customerAddress, appointmentAt, appointmentAt ? "已预约" : "待上门");
      } else {
        db.prepare("UPDATE service_tasks SET product_label = ?, address = ?, appointment_at = ? WHERE order_id = ? AND status NOT IN ('已完成', '已取消')")
          .run(product.name, customerAddress, appointmentAt, orderId);
      }
    } else {
      db.prepare("UPDATE service_tasks SET status = '已取消' WHERE order_id = ? AND status NOT IN ('已完成', '已取消')").run(orderId);
    }

    if (statusInput === "已完成" && order.status !== "已完成") {
      db.prepare("UPDATE service_tasks SET status = '已完成' WHERE order_id = ? AND status NOT IN ('已完成', '已取消')").run(orderId);
      if (source !== "厂家直发") {
        const warehouse = db.prepare("SELECT id FROM warehouses WHERE name = ?").get(source) as { id: number } | undefined;
        if (warehouse) {
          db.prepare(`UPDATE inventory SET saleable = MAX(saleable - ?, 0), reserved = MAX(reserved - ?, 0) WHERE product_id = ? AND warehouse_id = ?`).run(quantity, quantity, product.id, warehouse.id);
        }
      }
    }
  });

  run();
  revalidatePath("/");
  return { ok: true, message: `订单 ${order.order_no} 已保存修改` };
}

export async function advanceOrderStatus(formData: FormData) {
  const db = getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const order = db.prepare("SELECT id, order_no, status, need_install FROM orders WHERE id = ?").get(orderId) as
    | { id: string; order_no: string; status: OrderStatus; need_install: number }
    | undefined;
  if (!order) return { ok: false, message: "订单不存在" };

  const flow: Record<OrderStatus, OrderStatus | null> = {
    待出库: "配送中",
    配送中: order.need_install === 1 ? "待安装" : "已完成",
    待安装: "已完成",
    已完成: null,
  };
  const nextStatus = flow[order.status];
  if (!nextStatus) return { ok: false, message: "订单已完成，无需变更" };

  db.prepare("UPDATE orders SET status = ?, completed_at = CASE WHEN ? = '已完成' THEN datetime('now', 'localtime') ELSE completed_at END WHERE id = ?").run(nextStatus, nextStatus, orderId);

  if (nextStatus === "已完成") {
    db.prepare(
      "UPDATE service_tasks SET status = '已完成' WHERE order_id = ? AND status NOT IN ('已完成', '已取消')",
    ).run(orderId);
    const items = db.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?").all(orderId) as Array<{
      product_id: string;
      quantity: number;
    }>;
    const orderRow = db.prepare("SELECT source FROM orders WHERE id = ?").get(orderId) as { source: string };
    if (orderRow.source !== "厂家直发") {
      const warehouse = db.prepare("SELECT id FROM warehouses WHERE name = ?").get(orderRow.source) as
        | { id: number }
        | undefined;
      if (warehouse) {
        for (const item of items) {
          db.prepare(
            `UPDATE inventory SET saleable = MAX(saleable - ?, 0), reserved = MAX(reserved - ?, 0)
             WHERE product_id = ? AND warehouse_id = ?`,
          ).run(item.quantity, item.quantity, item.product_id, warehouse.id);
        }
      }
    }
  }

  revalidatePath("/");
  return { ok: true, message: `订单 ${order.order_no} 已更新为「${nextStatus}」` };
}

export async function recordPayment(formData: FormData) {
  const db = getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const method = String(formData.get("method") ?? "现金");
  const amountFen = fenFromYuan(String(formData.get("amountYuan") ?? ""));
  const note = String(formData.get("note") ?? "").trim();

  if (amountFen <= 0) return { ok: false, message: "请填写收款金额" };

  const order = db.prepare("SELECT id, order_no, total_fen, paid_fen FROM orders WHERE id = ?").get(orderId) as
    | { id: string; order_no: string; total_fen: number; paid_fen: number }
    | undefined;
  if (!order) return { ok: false, message: "订单不存在" };

  const dueFen = order.total_fen - order.paid_fen;
  if (dueFen <= 0) return { ok: false, message: "该订单已收讫" };

  const accepted = Math.min(amountFen, dueFen);
  db.prepare("INSERT INTO payments (order_id, amount_fen, method, note) VALUES (?, ?, ?, ?)").run(
    orderId,
    accepted,
    method,
    note || "补收尾款",
  );
  db.prepare("UPDATE orders SET paid_fen = paid_fen + ? WHERE id = ?").run(accepted, orderId);

  revalidatePath("/");
  const remain = dueFen - accepted;
  return {
    ok: true,
    message:
      remain > 0
        ? `已收 ${yuanText(accepted)}，${order.order_no} 尚欠 ${yuanText(remain)}`
        : `已收 ${yuanText(accepted)}，${order.order_no} 已收讫`,
  };
}

export async function createServiceTask(formData: FormData) {
  const db = getDb();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const type = String(formData.get("type") ?? "安装");
  const productLabel = String(formData.get("productLabel") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "").trim();
  const appointmentAt = normalizeDateTime(String(formData.get("appointmentAt") ?? ""));

  if (!customerName) return { ok: false, message: "请填写客户姓名" };

  let customer = db
    .prepare("SELECT id FROM customers WHERE name = ? AND phone = ?")
    .get(customerName, customerPhone) as { id: number } | undefined;
  const customerId =
    customer?.id ??
    Number(
      db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)").run(customerName, customerPhone, address)
        .lastInsertRowid,
    );

  const taskId = nextTaskId(db, type);
  db.prepare(
    `INSERT INTO service_tasks (id, order_id, customer_id, type, product_label, address, assignee, appointment_at, status)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(taskId, customerId, type, productLabel, address, assignee, appointmentAt, appointmentAt ? "已预约" : "待上门");

  revalidatePath("/");
  return { ok: true, message: `任务 ${taskId} 已创建` };
}

export async function completeServiceTask(formData: FormData) {
  const db = getDb();
  const taskId = String(formData.get("taskId") ?? "");
  const task = db.prepare("SELECT id, order_id FROM service_tasks WHERE id = ?").get(taskId) as
    | { id: string; order_id: string | null }
    | undefined;
  if (!task) return { ok: false, message: "任务不存在" };

  db.prepare("UPDATE service_tasks SET status = '已完成' WHERE id = ?").run(taskId);
  if (task.order_id) {
    db.prepare("UPDATE orders SET status = '已完成', completed_at = datetime('now', 'localtime') WHERE id = ? AND status = '待安装'").run(task.order_id);
  }

  revalidatePath("/");
  return { ok: true, message: `任务 ${taskId} 已完成` };
}
