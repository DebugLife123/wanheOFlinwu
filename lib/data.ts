import { getDb } from "./db";

export type OrderStatus = "待出库" | "配送中" | "待安装" | "已完成";

export interface ProductOption {
  id: string;
  name: string;
  subtitle: string;
  image: string;
  priceFen: number;
  installFeeFen: number;
  saleable: number;
}

export interface OrderRow {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  productName: string;
  quantity: number;
  totalFen: number;
  paidFen: number;
  depositFen: number;
  balanceFen: number;
  status: OrderStatus;
  source: string;
  needInstall: boolean;
  appointmentAt: string | null;
  orderDate: string;
  completed: boolean;
  completedAt: string | null;
  deliveryInstall: string;
  salesperson: string;
  brand: string;
  collector: string;
  paymentMethod: string;
  note: string;
  gift: string;
  createdAt: string;
}

export interface InventoryRow {
  sku: string;
  product: string;
  warehouse: string;
  saleable: number;
  reserved: number;
  sample: number;
  damaged: number;
  inTransit: number;
}

export interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  lastOrderAt: string | null;
  totalSpentFen: number;
}

export interface ServiceTaskRow {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  productLabel: string;
  assignee: string;
  appointmentAt: string | null;
  status: string;
  type: string;
}

export interface ReceivableRow {
  orderId: string;
  orderNo: string;
  customerName: string;
  totalFen: number;
  paidFen: number;
  dueFen: number;
  createdAt: string;
  overdue: boolean;
}

export interface PaymentRow {
  id: number;
  orderId: string;
  orderNo: string;
  customerName: string;
  amountFen: number;
  method: string;
  receivedAt: string;
  note: string;
}

export interface DashboardStats {
  monthSalesFen: number;
  monthOrderCount: number;
  monthReceivedFen: number;
  pendingReceiveFen: number;
  pendingOutbound: number;
  todayDelivery: number;
  taskCount: number;
  nearestTaskAt: string | null;
  overdueCount: number;
  overdueTop: { customerName: string; dueFen: number } | null;
  lowStock: { id: string; name: string; subtitle: string; image: string; saleable: number }[];
}

export function listProducts(): ProductOption[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.subtitle, p.image, p.install_fee_fen,
              (SELECT price_fen FROM product_prices pp WHERE pp.product_id = p.id ORDER BY pp.id DESC LIMIT 1) AS price_fen,
              COALESCE((SELECT SUM(i.saleable) FROM inventory i WHERE i.product_id = p.id), 0) AS saleable
       FROM products p ORDER BY p.rowid`,
    )
    .all() as Array<{
    id: string;
    name: string;
    subtitle: string;
    image: string;
    install_fee_fen: number;
    price_fen: number;
    saleable: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    image: row.image,
    priceFen: row.price_fen,
    installFeeFen: row.install_fee_fen,
    saleable: row.saleable,
  }));
}

export function listOrders(): OrderRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.id, o.order_no, o.status, o.source, o.need_install, o.total_fen, o.paid_fen,
              o.appointment_at, o.created_at, o.completed_at, o.note,
              o.salesperson, o.brand, o.collector, o.payment_method, o.delivery_install, o.gift,
              c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
              (SELECT GROUP_CONCAT(p.name || ' × ' || oi.quantity, '、')
                 FROM order_items oi JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id) AS product_name,
              (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS quantity,
              (SELECT COALESCE(SUM(amount_fen), 0) FROM payments WHERE order_id = o.id
                AND id = (SELECT MIN(id) FROM payments WHERE order_id = o.id)) AS deposit_fen
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC`,
    )
    .all() as Array<{
    id: string;
    order_no: string;
    status: OrderStatus;
    source: string;
    need_install: number;
    total_fen: number;
    paid_fen: number;
    appointment_at: string | null;
    created_at: string;
    completed_at: string | null;
    note: string;
    salesperson: string;
    brand: string;
    collector: string;
    payment_method: string;
    delivery_install: string;
    gift: string;
    deposit_fen: number;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    product_name: string | null;
    quantity: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    productName: row.product_name ?? "未记录商品",
    quantity: row.quantity,
    totalFen: row.total_fen,
    paidFen: row.paid_fen,
    depositFen: row.deposit_fen,
    balanceFen: Math.max(row.total_fen - row.paid_fen, 0),
    status: row.status,
    source: row.source,
    needInstall: row.need_install === 1,
    appointmentAt: row.appointment_at,
    orderDate: row.created_at.slice(0, 10),
    completed: row.status === "已完成",
    completedAt: row.completed_at,
    deliveryInstall: row.delivery_install || (row.need_install === 1 ? "送货+安装" : "仅送货"),
    salesperson: row.salesperson,
    brand: row.brand,
    collector: row.collector,
    paymentMethod: row.payment_method,
    note: row.note,
    gift: row.gift,
    createdAt: row.created_at,
  }));
}

export function listInventory(): InventoryRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id AS sku, p.name AS product, w.name AS warehouse,
              i.saleable, i.reserved, i.sample, i.damaged, i.in_transit
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       JOIN warehouses w ON w.id = i.warehouse_id
       ORDER BY p.id, w.id`,
    )
    .all() as Array<{
    sku: string;
    product: string;
    warehouse: string;
    saleable: number;
    reserved: number;
    sample: number;
    damaged: number;
    in_transit: number;
  }>;
  return rows.map((row) => ({
    sku: row.sku.toUpperCase(),
    product: row.product,
    warehouse: row.warehouse,
    saleable: row.saleable,
    reserved: row.reserved,
    sample: row.sample,
    damaged: row.damaged,
    inTransit: row.in_transit,
  }));
}

export function listCustomers(): CustomerRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.address,
              COUNT(o.id) AS order_count,
              MAX(o.created_at) AS last_order_at,
              COALESCE(SUM(o.total_fen), 0) AS total_spent_fen
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY c.id
       ORDER BY last_order_at DESC NULLS LAST, c.id DESC`,
    )
    .all() as Array<{
    id: number;
    name: string;
    phone: string;
    address: string;
    order_count: number;
    last_order_at: string | null;
    total_spent_fen: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    orderCount: row.order_count,
    lastOrderAt: row.last_order_at,
    totalSpentFen: row.total_spent_fen,
  }));
}

export function listServiceTasks(): ServiceTaskRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.id, t.type, t.product_label, t.address, t.assignee, t.appointment_at, t.status,
              c.name AS customer_name, c.phone AS customer_phone
       FROM service_tasks t JOIN customers c ON c.id = t.customer_id
       ORDER BY t.appointment_at IS NULL, t.appointment_at`,
    )
    .all() as Array<{
    id: string;
    type: string;
    product_label: string;
    address: string;
    assignee: string;
    appointment_at: string | null;
    status: string;
    customer_name: string;
    customer_phone: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    address: row.address,
    productLabel: row.product_label,
    assignee: row.assignee,
    appointmentAt: row.appointment_at,
    status: row.status,
    type: row.type,
  }));
}

export function listReceivables(): ReceivableRow[] {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = db
    .prepare(
      `SELECT o.id, o.order_no, o.total_fen, o.paid_fen, o.created_at, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.paid_fen < o.total_fen
       ORDER BY o.created_at`,
    )
    .all() as Array<{
    id: string;
    order_no: string;
    total_fen: number;
    paid_fen: number;
    created_at: string;
    customer_name: string;
  }>;
  return rows.map((row) => {
    const createdAt = new Date(row.created_at.replace(" ", "T"));
    const dueDate = new Date(createdAt);
    dueDate.setDate(dueDate.getDate() + 7);
    return {
      orderId: row.id,
      orderNo: row.order_no,
      customerName: row.customer_name,
      totalFen: row.total_fen,
      paidFen: row.paid_fen,
      dueFen: row.total_fen - row.paid_fen,
      createdAt: row.created_at,
      overdue: dueDate.getTime() < today.getTime(),
    };
  });
}

export function listPayments(limit = 30): PaymentRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id, p.order_id, p.amount_fen, p.method, p.received_at, p.note,
              o.order_no, c.name AS customer_name
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN customers c ON c.id = o.customer_id
       ORDER BY p.received_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    order_id: string;
    amount_fen: number;
    method: string;
    received_at: string;
    note: string;
    order_no: string;
    customer_name: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderNo: row.order_no,
    customerName: row.customer_name,
    amountFen: row.amount_fen,
    method: row.method,
    receivedAt: row.received_at,
    note: row.note,
  }));
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartText = formatDateTime(monthStart);

  const month = db
    .prepare(
      `SELECT COALESCE(SUM(total_fen), 0) AS sales, COUNT(*) AS orders
       FROM orders WHERE created_at >= ?`,
    )
    .get(monthStartText) as { sales: number; orders: number };

  const received = db
    .prepare("SELECT COALESCE(SUM(amount_fen), 0) AS amount FROM payments WHERE received_at >= ?")
    .get(monthStartText) as { amount: number };

  const pending = db
    .prepare("SELECT COALESCE(SUM(total_fen - paid_fen), 0) AS due FROM orders WHERE paid_fen < total_fen")
    .get() as { due: number };

  const outbound = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE status = '待出库'")
    .get() as { n: number };

  const todayText = formatDate(new Date());
  const todayDelivery = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE status = '待出库' AND substr(appointment_at, 1, 10) = ?")
    .get(todayText) as { n: number };

  const taskCount = db
    .prepare("SELECT COUNT(*) AS n FROM service_tasks WHERE status NOT IN ('已完成', '已取消')")
    .get() as { n: number };

  const nearestTask = db
    .prepare(
      "SELECT appointment_at FROM service_tasks WHERE status NOT IN ('已完成', '已取消') AND appointment_at IS NOT NULL ORDER BY appointment_at LIMIT 1",
    )
    .get() as { appointment_at: string } | undefined;

  const receivables = listReceivables();
  const overdueList = receivables.filter((item) => item.overdue);
  const overdueTop = overdueList.length > 0 ? { customerName: overdueList[0].customerName, dueFen: overdueList[0].dueFen } : null;

  const lowStock = db
    .prepare(
      `SELECT p.id, p.name, p.subtitle, p.image, COALESCE(SUM(i.saleable), 0) AS saleable
       FROM products p LEFT JOIN inventory i ON i.product_id = p.id
       GROUP BY p.id HAVING saleable <= 2 ORDER BY saleable, p.id LIMIT 3`,
    )
    .all() as Array<{ id: string; name: string; subtitle: string; image: string; saleable: number }>;

  return {
    monthSalesFen: month.sales,
    monthOrderCount: month.orders,
    monthReceivedFen: received.amount,
    pendingReceiveFen: pending.due,
    pendingOutbound: outbound.n,
    todayDelivery: todayDelivery.n,
    taskCount: taskCount.n,
    nearestTaskAt: nearestTask?.appointment_at ?? null,
    overdueCount: overdueList.length,
    overdueTop,
    lowStock: lowStock.map((item) => ({
      id: item.id,
      name: item.name,
      subtitle: item.subtitle,
      image: item.image,
      saleable: item.saleable,
    })),
  };
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${formatDate(date)} ${hours}:${minutes}:${seconds}`;
}
