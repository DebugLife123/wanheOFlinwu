"use client";

import Image from "next/image";
import {
  ArchiveRestore, Bell, Boxes, ChevronDown, ChevronRight, CircleDollarSign,
  ClipboardList, Clock3, FileDown, House, LayoutDashboard, Loader2, MapPin,
  Menu, PackageCheck, Phone, Plus, Search, Settings, ShoppingCart, Tag,
  Truck, UserRound, UsersRound, Warehouse, Wrench, X, Eye, ReceiptText, CheckCircle2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  advanceOrderStatus, completeServiceTask, createCustomer, createOrder,
  createServiceTask, recordPayment, updateOrder,
} from "@/lib/actions";
import type {
  CustomerRow, DashboardStats, InventoryRow, OrderRow, OrderStatus,
  PaymentRow, ProductOption, ReceivableRow, ServiceTaskRow,
} from "@/lib/data";

type View = "dashboard" | "orders" | "inventory" | "customers" | "service" | "receivables";
type Notify = (message: string) => void;

interface WorkbenchData {
  products: ProductOption[];
  orders: OrderRow[];
  inventory: InventoryRow[];
  customers: CustomerRow[];
  serviceTasks: ServiceTaskRow[];
  receivables: ReceivableRow[];
  payments: PaymentRow[];
  stats: DashboardStats;
}

const yuan = (fen: number) => `¥${(fen / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const pad = (value: number) => String(value).padStart(2, "0");
const dateOnly = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const timeLabel = (value: string | null) => {
  if (!value) return "未预约";
  const today = new Date();
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (date === dateOnly(today)) return `今天 ${time}`;
  const yesterday = new Date(today.getTime() - 86400000);
  if (date === dateOnly(yesterday)) return `昨天 ${time}`;
  return `${date.slice(5).replace("-", " 月 ")} 日 ${time}`;
};
const statusTone: Record<OrderStatus, string> = { 待出库: "warning", 配送中: "info", 待安装: "accent", 已完成: "success" };

export function OrderWorkbench(data: WorkbenchData) {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [dialog, setDialog] = useState<"order" | "customer" | "payment" | "task" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const navigate = (view: View) => { setActiveView(view); setMobileMenuOpen(false); };
  const notify: Notify = (message) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };

  return <div className="app-shell">
    <Sidebar activeView={activeView} navigate={navigate} stats={data.stats} />
    <header className="mobile-header"><button className="icon-button" type="button" aria-label="打开全部功能" onClick={() => setMobileMenuOpen(true)}><Menu aria-hidden="true" /></button><Brand compact /><button className="icon-button" type="button" aria-label="查看通知" onClick={() => notify("目前没有新的系统通知")}><Bell aria-hidden="true" /></button></header>
    <main className="main-stage" id="main-content"><Topbar onSearch={() => setSearchOpen(true)} onNotify={notify} stats={data.stats} /><div className="page-wrap">
      <PageHeader activeView={activeView} onCreate={() => setDialog("order")} />
      {activeView === "dashboard" && <Dashboard data={data} navigate={navigate} onCreate={() => setDialog("order")} onNotify={notify} onSelectOrder={setSelectedOrder} />}
      {activeView === "orders" && <OrdersView orders={data.orders} onCreate={() => setDialog("order")} onNotify={notify} onSelectOrder={setSelectedOrder} />}
      {activeView === "inventory" && <InventoryView inventory={data.inventory} onNotify={notify} />}
      {activeView === "customers" && <CustomersView customers={data.customers} onCreate={() => setDialog("customer")} onNotify={notify} />}
      {activeView === "service" && <ServiceView tasks={data.serviceTasks} onCreate={() => setDialog("task")} onNotify={notify} />}
      {activeView === "receivables" && <ReceivablesView receivables={data.receivables} payments={data.payments} onCreate={() => setDialog("payment")} onNotify={notify} />}
      <footer className="system-footer"><span>临武万和订单管理 · 自用版 v0.2</span><span className="footer-state"><i aria-hidden="true" /> 数据保存在本机 SQLite</span></footer>
    </div></main>
    <MobileNav activeView={activeView} navigate={navigate} onCreate={() => setDialog("order")} />
    {mobileMenuOpen && <MobileMenu activeView={activeView} navigate={navigate} onClose={() => setMobileMenuOpen(false)} stats={data.stats} />}
    {dialog === "order" && <NewOrderDialog products={data.products} onClose={() => setDialog(null)} onNotify={notify} />}
    {dialog === "customer" && <NewCustomerDialog onClose={() => setDialog(null)} onNotify={notify} />}
    {dialog === "payment" && <PaymentDialog receivables={data.receivables} onClose={() => setDialog(null)} onNotify={notify} />}
    {dialog === "task" && <NewTaskDialog onClose={() => setDialog(null)} onNotify={notify} />}
    {selectedOrder && <OrderDetailPanel order={selectedOrder} products={data.products} onClose={() => setSelectedOrder(null)} onNotify={notify} />}
    {searchOpen && <SearchDialog data={data} onClose={() => setSearchOpen(false)} navigate={navigate} />}
    {toast && <div className="toast" role="status"><PackageCheck aria-hidden="true" /><span>{toast}</span></div>}
  </div>;
}

function Brand({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? "brand--compact" : ""}`}><div className="brand-mark" aria-hidden="true">和</div><div className="brand-copy"><strong>临武万和</strong>{!compact && <span>订单管理</span>}</div></div>; }

function navItems(stats: DashboardStats) { return [
  { id: "dashboard" as View, label: "工作台", icon: LayoutDashboard },
  { id: "orders" as View, label: "销售订单", icon: ShoppingCart, badge: stats.pendingOutbound ? String(stats.pendingOutbound) : undefined },
  { id: "inventory" as View, label: "商品库存", icon: Boxes, badge: stats.lowStock.length ? String(stats.lowStock.length) : undefined },
  { id: "customers" as View, label: "客户", icon: UsersRound },
  { id: "service" as View, label: "安装售后", icon: Wrench, badge: stats.taskCount ? String(stats.taskCount) : undefined },
  { id: "receivables" as View, label: "应收欠款", icon: CircleDollarSign, badge: stats.overdueCount ? String(stats.overdueCount) : undefined },
]; }

function Sidebar({ activeView, navigate, stats }: { activeView: View; navigate: (view: View) => void; stats: DashboardStats }) { return <aside className="sidebar" aria-label="主导航"><Brand /><nav className="sidebar-nav">{navItems(stats).map((item) => <button key={item.id} className={`nav-item ${activeView === item.id ? "is-active" : ""}`} type="button" onClick={() => navigate(item.id)} aria-current={activeView === item.id ? "page" : undefined}><item.icon aria-hidden="true" /><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}</button>)}</nav><div className="sidebar-section"><span>管理</span><button className="nav-item" type="button"><Warehouse aria-hidden="true" /><span>进货与仓库</span></button><button className="nav-item" type="button"><ClipboardList aria-hidden="true" /><span>经营报表</span></button><button className="nav-item" type="button"><Settings aria-hidden="true" /><span>系统设置</span></button></div><div className="sidebar-user"><span className="avatar">王</span><span><strong>王店长</strong><small>管理员</small></span><ChevronDown aria-hidden="true" /></div></aside>; }

function Topbar({ onSearch, onNotify, stats }: { onSearch: () => void; onNotify: Notify; stats: DashboardStats }) { const count = stats.lowStock.length + stats.overdueCount; return <div className="topbar"><button className="global-search" type="button" onClick={onSearch}><Search aria-hidden="true" /><span>搜索订单、客户、型号或序列号</span><kbd>Ctrl K</kbd></button><div className="topbar-actions"><button className="icon-button" type="button" aria-label="导出当前数据" onClick={() => onNotify("导出功能将在下一版提供")}><FileDown aria-hidden="true" /></button><button className="icon-button notification-button" type="button" aria-label="查看通知" onClick={() => onNotify(`${stats.lowStock.length} 个低库存提醒，${stats.overdueCount} 笔欠款已逾期`)}><Bell aria-hidden="true" />{count > 0 && <i>{count}</i>}</button></div></div>; }

function PageHeader({ activeView, onCreate }: { activeView: View; onCreate: () => void }) { const meta: Record<View, { title: string; description: string }> = { dashboard: { title: "今天先处理这些", description: `${new Date().getFullYear()} 年 ${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日` }, orders: { title: "销售订单", description: "确认、出库、配送与收款分开记录" }, inventory: { title: "商品库存", description: "按仓库、库存类型和设备序列号追踪" }, customers: { title: "客户", description: "购买、安装与售后记录集中查询" }, service: { title: "安装售后", description: "按负责人安排今天和明天的上门任务" }, receivables: { title: "应收欠款", description: "跟进多次收款和约定还款日期" } }; const item = meta[activeView]; return <div className="page-header reveal" style={{ "--i": 0 } as React.CSSProperties}><div><h1>{item.title}</h1><p>{item.description}</p></div><button className="primary-button" type="button" onClick={onCreate}><Plus aria-hidden="true" />新建销售单</button></div>; }

function Dashboard({ data, navigate, onCreate, onNotify, onSelectOrder }: { data: WorkbenchData; navigate: (view: View) => void; onCreate: () => void; onNotify: Notify; onSelectOrder: (order: OrderRow) => void }) {
  const { stats } = data;
  return <div className="dashboard-grid">
    <section className="priority-panel reveal" style={{ "--i": 1 } as React.CSSProperties}><div className="section-heading"><div><h2>待办队列</h2><p>按业务影响排序</p></div><button className="text-button" type="button" onClick={() => navigate("orders")}>查看全部<ChevronRight aria-hidden="true" /></button></div><div className="priority-list">
      <button type="button" className="priority-row" onClick={() => navigate("orders")}><span className="priority-icon tone-warning"><ArchiveRestore aria-hidden="true" /></span><span><strong>{stats.pendingOutbound} 笔订单等待出库</strong><small>其中 {stats.todayDelivery} 笔安排今天配送</small></span><b>优先</b><ChevronRight aria-hidden="true" /></button>
      <button type="button" className="priority-row" onClick={() => navigate("service")}><span className="priority-icon tone-info"><Wrench aria-hidden="true" /></span><span><strong>{stats.taskCount} 个安装售后任务</strong><small>最近预约时间为{timeLabel(stats.nearestTaskAt)}</small></span><b className="neutral-badge">今天</b><ChevronRight aria-hidden="true" /></button>
      <button type="button" className="priority-row" onClick={() => navigate("receivables")}><span className="priority-icon tone-accent"><CircleDollarSign aria-hidden="true" /></span><span><strong>{stats.overdueCount} 笔欠款已经逾期</strong><small>{stats.overdueTop ? `${stats.overdueTop.customerName} · 尚欠 ${yuan(stats.overdueTop.dueFen)}` : "暂无逾期"}</small></span><b className="danger-badge">逾期</b><ChevronRight aria-hidden="true" /></button>
      <button type="button" className="priority-row" onClick={() => navigate("inventory")}><span className="priority-icon tone-neutral"><Boxes aria-hidden="true" /></span><span><strong>{stats.lowStock.length} 个商品库存偏低</strong><small>{stats.lowStock[0] ? `${stats.lowStock[0].name} 可售 ${stats.lowStock[0].saleable} 台` : "库存充足"}</small></span><b className="neutral-badge">补货</b><ChevronRight aria-hidden="true" /></button>
    </div></section>
    <aside className="summary-panel reveal" style={{ "--i": 2 } as React.CSSProperties}><div className="summary-heading"><span>本月经营</span><small>本地真实数据</small></div><div className="summary-main"><span>销售额</span><strong>{yuan(stats.monthSalesFen)}</strong><small>来自订单记录</small></div><dl className="summary-stats"><div><dt>订单</dt><dd>{stats.monthOrderCount}</dd></div><div><dt>已收款</dt><dd>{yuan(stats.monthReceivedFen)}</dd></div><div><dt>待收款</dt><dd>{yuan(stats.pendingReceiveFen)}</dd></div></dl><button className="secondary-button full-width" type="button" onClick={() => navigate("receivables")}>查看应收明细<ChevronRight aria-hidden="true" /></button></aside>
    <section className="orders-panel reveal" style={{ "--i": 3 } as React.CSSProperties}><div className="section-heading"><div><h2>最近销售订单</h2><p>点击订单继续处理</p></div><button className="secondary-button compact-button" type="button" onClick={onCreate}><Plus aria-hidden="true" />快速开单</button></div><OrderTable orders={data.orders.slice(0, 4)} onAdvance={(orderId) => <AdvanceButton orderId={orderId} onNotify={onNotify} />} onSelectOrder={onSelectOrder} /></section>
    <section className="stock-panel reveal" style={{ "--i": 4 } as React.CSSProperties}><div className="section-heading"><div><h2>需要关注的库存</h2><p>按可用库存排序</p></div><button className="text-button" type="button" onClick={() => navigate("inventory")}>查看库存<ChevronRight aria-hidden="true" /></button></div><div className="product-watch-list">{stats.lowStock.map((item) => <button type="button" className="product-watch" key={item.id} onClick={() => navigate("inventory")}><Image src={item.image} alt={item.name} width={88} height={88} /><span><strong>{item.name}</strong><small>{item.subtitle}</small></span><b className={item.saleable <= 1 ? "stock-low" : ""}>可售 {item.saleable}</b></button>)}{stats.lowStock.length === 0 && <div className="empty-state"><PackageCheck aria-hidden="true" /><strong>库存充足</strong><span>当前没有需要补货的商品。</span></div>}</div></section>
  </div>;
}

function OrdersView({ orders, onCreate, onNotify, onSelectOrder }: { orders: OrderRow[]; onCreate: () => void; onNotify: Notify; onSelectOrder: (order: OrderRow) => void }) {
  const [status, setStatus] = useState("全部");
  const [keyword, setKeyword] = useState("");
  const [brand, setBrand] = useState("全部");
  const [salesperson, setSalesperson] = useState("全部");
  const [paymentMethod, setPaymentMethod] = useState("全部");
  const [sortBy, setSortBy] = useState("date-desc");
  const brands = useMemo(() => Array.from(new Set(orders.map((order) => order.brand).filter(Boolean))).sort(), [orders]);
  const salespeople = useMemo(() => Array.from(new Set(orders.map((order) => order.salesperson).filter(Boolean))).sort(), [orders]);
  const paymentMethods = useMemo(() => Array.from(new Set(orders.map((order) => order.paymentMethod).filter(Boolean))).sort(), [orders]);
  const visible = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const filtered = orders.filter((order) => {
      const matchesStatus = status === "全部" || order.status === status;
      const matchesBrand = brand === "全部" || order.brand === brand;
      const matchesSalesperson = salesperson === "全部" || order.salesperson === salesperson;
      const matchesPaymentMethod = paymentMethod === "全部" || order.paymentMethod === paymentMethod;
      const searchText = `${order.orderNo} ${order.customerName} ${order.customerPhone} ${order.customerAddress} ${order.productName} ${order.note}`.toLowerCase();
      return matchesStatus && matchesBrand && matchesSalesperson && matchesPaymentMethod && (!query || searchText.includes(query));
    });
    return filtered.sort((a, b) => {
      if (sortBy === "date-asc") return a.orderDate.localeCompare(b.orderDate);
      if (sortBy === "amount-desc") return b.totalFen - a.totalFen;
      if (sortBy === "amount-asc") return a.totalFen - b.totalFen;
      if (sortBy === "balance-desc") return b.balanceFen - a.balanceFen;
      return b.orderDate.localeCompare(a.orderDate);
    });
  }, [brand, keyword, orders, paymentMethod, salesperson, sortBy, status]);
  const reset = () => { setStatus("全部"); setKeyword(""); setBrand("全部"); setSalesperson("全部"); setPaymentMethod("全部"); setSortBy("date-desc"); };
  return <section className="workspace-panel reveal" style={{ "--i": 1 } as React.CSSProperties}>
    <div className="order-filter-panel">
      <div className="filter-bar order-filter-bar"><div className="segmented" role="group" aria-label="订单状态筛选">{["全部", "待出库", "配送中", "待安装", "已完成"].map((item) => <button type="button" key={item} className={status === item ? "is-selected" : ""} onClick={() => setStatus(item)}>{item}</button>)}</div><button type="button" className="text-button" onClick={reset}>重置筛选</button></div>
      <div className="order-filter-controls"><label className="order-filter-search"><Search aria-hidden="true" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索订单号、姓名、电话、产品或备注" /></label><label><span>品牌</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option>全部</option>{brands.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>业务员</span><select value={salesperson} onChange={(event) => setSalesperson(event.target.value)}><option>全部</option>{salespeople.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>收款方式</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>全部</option>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>排序</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="date-desc">日期：最新</option><option value="date-asc">日期：最早</option><option value="amount-desc">金额：从高到低</option><option value="amount-asc">金额：从低到高</option><option value="balance-desc">尾款：从高到低</option></select></label></div>
    </div>
    <OrderTable orders={visible} onAdvance={(orderId) => <AdvanceButton orderId={orderId} onNotify={onNotify} />} onSelectOrder={onSelectOrder} /><div className="panel-footer"><span>显示 {visible.length} / {orders.length} 笔订单</span><button className="primary-button compact-button" type="button" onClick={onCreate}><Plus aria-hidden="true" />新建销售单</button></div>
  </section>;
}

function OrderTable({ orders, onAdvance, onSelectOrder }: { orders: OrderRow[]; onAdvance: (orderId: string) => ReactNode; onSelectOrder: (order: OrderRow) => void }) { return <div className="data-table"><div className="table-head"><span>订单 / 客户</span><span>商品</span><span>金额 / 尾款</span><span>进度</span><span>操作</span></div>{orders.map((order) => <div className="table-row order-table-row" key={order.id} onClick={() => onSelectOrder(order)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectOrder(order); } }} role="button" tabIndex={0}><span className="order-id"><strong>{order.orderNo}</strong><small>{order.customerName} · {order.orderDate}</small></span><span className="product-cell"><strong>{order.productName}</strong><small>{order.deliveryInstall || order.source}</small></span><span className="money-cell"><strong>{yuan(order.totalFen)}</strong><small>{order.balanceFen === 0 ? "已收讫" : `尾款 ${yuan(order.balanceFen)}`}</small></span><span><i className={`status-badge tone-${statusTone[order.status]}`}>{order.status}</i></span><span className="row-actions"><button className="detail-button" type="button" onClick={(event) => { event.stopPropagation(); onSelectOrder(order); }}><Eye aria-hidden="true" />详情</button>{onAdvance(order.id)}</span></div>)}{orders.length === 0 && <div className="empty-state"><ClipboardList aria-hidden="true" /><strong>当前筛选没有订单</strong><span>切换状态查看其他订单。</span></div>}</div>; }


function OrderDetailPanel({ order, products, onClose, onNotify }: { order: OrderRow; products: ProductOption[]; onClose: () => void; onNotify: Notify }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const appointmentValue = order.appointmentAt ? order.appointmentAt.replace(" ", "T") : "";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("orderId", order.id);
    form.set("needInstall", form.get("deliveryInstall") === "送货+安装" ? "1" : "0");
    startTransition(async () => {
      const result = await updateOrder(form);
      onNotify(result.message);
      if (result.ok) onClose();
    });
  };
  return <div className="detail-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
      <div className="detail-drawer__header"><div><span className="eyebrow">完整订单档案</span><h2 id="order-detail-title">{order.orderNo}</h2><p>{order.customerName} · {order.orderDate}</p></div><div className="detail-header-actions"><button className="secondary-button compact-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "取消编辑" : "编辑详情"}</button><button className="icon-button" type="button" aria-label="关闭订单详情" onClick={onClose}><X aria-hidden="true" /></button></div></div>
      {editing ? <form id="order-edit-form" className="detail-drawer__body detail-edit-form" onSubmit={submit}>
        <div className="detail-status-line"><i className={`status-badge tone-${statusTone[order.status]}`}>{order.status}</i><span>订单金额、定金和尾款由收款记录自动计算</span></div>
        <section className="detail-money-card"><div><span>订单总额</span><strong>{yuan(order.totalFen)}</strong></div><div><span>已收定金</span><b>{yuan(order.depositFen)}</b></div><div><span>当前尾款</span><b className={order.balanceFen > 0 ? "detail-money-card__due" : ""}>{yuan(order.balanceFen)}</b></div></section>
        <DetailFormSection title="基础信息"><div className="form-grid"><label><span>订单日期</span><input name="orderDate" type="date" defaultValue={order.orderDate} required /></label><label><span>订单状态</span><select name="status" defaultValue={order.status}><option>待出库</option><option>配送中</option><option>待安装</option><option>已完成</option></select>{order.status === "已完成" && <small>已完成订单不能回退状态</small>}</label><label><span>客户姓名</span><input name="customerName" defaultValue={order.customerName} required /></label><label><span>联系电话</span><input name="customerPhone" inputMode="tel" defaultValue={order.customerPhone} /></label><label className="full-field"><span>地址</span><input name="customerAddress" defaultValue={order.customerAddress} /></label></div></DetailFormSection>
        <DetailFormSection title="商品与履约"><div className="form-grid"><label><span>产品名称</span><select name="productId" defaultValue={products.find((item) => item.name === order.productName.split(" × ")[0])?.id ?? products[0]?.id}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>数量</span><input name="quantity" type="number" min="1" max="99" defaultValue={order.quantity} /></label><label><span>品牌</span><input name="brand" defaultValue={order.brand} /></label><label><span>履约来源</span><select name="source" defaultValue={order.source}><option>门店仓</option><option>后仓</option><option>厂家直发</option></select></label><label><span>送货 / 安装</span><select name="deliveryInstall" defaultValue={order.deliveryInstall || (order.needInstall ? "送货+安装" : "仅送货")}><option>送货+安装</option><option>仅送货</option><option>客户自提</option><option>厂家直发</option></select></label><label><span>预约时间</span><input name="appointmentAt" type="datetime-local" defaultValue={appointmentValue} /></label><label><span>赠品</span><input name="gift" defaultValue={order.gift} /></label></div></DetailFormSection>
        <DetailFormSection title="业务与收款"><div className="form-grid"><label><span>业务员</span><input name="salesperson" defaultValue={order.salesperson} /></label><label><span>收款人</span><input name="collector" defaultValue={order.collector} /></label><label><span>收款方式</span><select name="paymentMethod" defaultValue={order.paymentMethod || "现金"}><option>现金</option><option>微信</option><option>支付宝</option><option>银行转账</option></select></label><label className="full-field"><span>备注</span><textarea name="note" defaultValue={order.note} rows={3} /></label></div></DetailFormSection>
      </form> : <div className="detail-drawer__body">
        <div className="detail-status-line"><i className={`status-badge tone-${statusTone[order.status]}`}>{order.status}</i><span>{order.completed ? `完结于 ${order.completedAt?.slice(0, 16) ?? order.orderDate}` : "订单仍在履约中"}</span></div>
        <section className="detail-money-card"><div><span>订单总额</span><strong>{yuan(order.totalFen)}</strong></div><div><span>定金</span><b>{yuan(order.depositFen)}</b></div><div><span>尾款</span><b className={order.balanceFen > 0 ? "detail-money-card__due" : ""}>{yuan(order.balanceFen)}</b></div></section>
        <DetailSection title="客户信息"><DetailGrid fields={[["姓名", order.customerName], ["电话", order.customerPhone || "未填写"], ["地址", order.customerAddress || "未填写"]]} /></DetailSection>
        <DetailSection title="商品与履约"><DetailGrid fields={[["产品名称", order.productName], ["品牌", order.brand || "未填写"], ["送货 / 安装", order.deliveryInstall || "未填写"], ["预约时间", timeLabel(order.appointmentAt)], ["赠品", order.gift || "无"]]} /></DetailSection>
        <DetailSection title="业务与收款"><DetailGrid fields={[["业务员", order.salesperson || "未填写"], ["收款人", order.collector || "未填写"], ["收款方式", order.paymentMethod || "未填写"], ["完结", order.completed ? "是" : "否"], ["履约来源", order.source]]} /></DetailSection>
        <DetailSection title="备注"><div className="detail-note">{order.note || "暂无备注"}</div></DetailSection>
      </div>}
      <div className="detail-drawer__footer">{editing ? <><span>修改后会同步客户、履约和订单档案</span><div className="detail-footer-actions"><button className="secondary-button" type="button" onClick={() => setEditing(false)}>取消</button><button className="primary-button" type="submit" form="order-edit-form" disabled={pending}>{pending ? "保存中…" : "保存修改"}</button></div></> : <><span><ReceiptText aria-hidden="true" /> 可继续推进订单状态</span>{order.status !== "已完成" ? <AdvanceButton orderId={order.id} onNotify={(message) => { onNotify(message); onClose(); }} /> : <span className="detail-complete"><CheckCircle2 aria-hidden="true" />订单已完成</span>}</>}</div>
    </aside>
  </div>;
}

function DetailFormSection({ title, children }: { title: string; children: ReactNode }) { return <section className="detail-section detail-form-section"><h3>{title}</h3>{children}</section>; }

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section className="detail-section"><h3>{title}</h3>{children}</section>; }
function DetailGrid({ fields }: { fields: Array<[string, string]> }) { return <dl className="detail-grid">{fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }

function AdvanceButton({ orderId, onNotify }: { orderId: string; onNotify: Notify }) { const [pending, startTransition] = useTransition(); const click = () => startTransition(async () => { const form = new FormData(); form.set("orderId", orderId); const result = await advanceOrderStatus(form); onNotify(result.message); }); return <button className="secondary-button compact-button" type="button" disabled={pending} onClick={click}>{pending ? <Loader2 className="spin" aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}推进状态</button>; }

function InventoryView({ inventory, onNotify }: { inventory: InventoryRow[]; onNotify: Notify }) {
  const [warehouse, setWarehouse] = useState("全部仓库");
  const warehouses = useMemo(() => ["全部仓库", ...new Set(inventory.map((item) => item.warehouse))], [inventory]);
  const filtered = warehouse === "全部仓库" ? inventory : inventory.filter((item) => item.warehouse === warehouse);
  return <section className="workspace-panel reveal" style={{ "--i": 1 } as React.CSSProperties}><div className="inventory-toolbar"><label className="select-control"><span>仓库</span><select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>{warehouses.map((item) => <option key={item}>{item}</option>)}</select></label><div className="toolbar-buttons"><button className="secondary-button compact-button" type="button" onClick={() => onNotify("序列号查询将在下一版提供")}><Tag aria-hidden="true" />查序列号</button><button className="secondary-button compact-button" type="button" onClick={() => onNotify("调拨功能将在下一版提供")}><Truck aria-hidden="true" />仓库调拨</button></div></div><div className="inventory-summary"><div><span>现存合计</span><strong>{filtered.reduce((sum, item) => sum + item.saleable + item.sample + item.damaged, 0)}</strong></div><div><span>可售</span><strong>{filtered.reduce((sum, item) => sum + item.saleable, 0)}</strong></div><div><span>已预留</span><strong>{filtered.reduce((sum, item) => sum + item.reserved, 0)}</strong></div><div><span>在途</span><strong>{filtered.reduce((sum, item) => sum + item.inTransit, 0)}</strong></div></div><div className="inventory-list">{filtered.map((item) => <button type="button" className="inventory-row" key={`${item.sku}-${item.warehouse}`} onClick={() => onNotify(`${item.product} · ${item.warehouse} · 可售 ${item.saleable} 台`)}><span className="inventory-name"><strong>{item.product}</strong><small>{item.sku} · {item.warehouse}</small></span><span><small>可售</small><strong className={item.saleable <= 1 ? "stock-low" : ""}>{item.saleable}</strong></span><span><small>预留</small><strong>{item.reserved}</strong></span><span><small>样机</small><strong>{item.sample}</strong></span><span><small>损坏</small><strong>{item.damaged}</strong></span><ChevronRight aria-hidden="true" /></button>)}{filtered.length === 0 && <div className="empty-state"><Warehouse aria-hidden="true" /><strong>当前仓库暂无库存</strong><span>切换仓库查看其他库存。</span></div>}</div></section>;
}

function CustomersView({ customers, onCreate, onNotify }: { customers: CustomerRow[]; onCreate: () => void; onNotify: Notify }) {
  const [term, setTerm] = useState("");
  const visible = useMemo(() => { const value = term.trim().toLowerCase(); return value ? customers.filter((item) => `${item.name}${item.phone}${item.address}`.toLowerCase().includes(value)) : customers; }, [customers, term]);
  return <section className="workspace-panel reveal" style={{ "--i": 1 } as React.CSSProperties}><div className="list-search"><Search aria-hidden="true" /><input aria-label="搜索客户" placeholder="输入姓名、电话或地址" value={term} onChange={(event) => setTerm(event.target.value)} /><button className="secondary-button compact-button" type="button" onClick={onCreate}><Plus aria-hidden="true" />新增客户</button></div><div className="customer-grid">{visible.map((customer) => <button className="customer-card" type="button" key={customer.id} onClick={() => onNotify(`${customer.name} · 共 ${customer.orderCount} 笔订单 · 累计 ${yuan(customer.totalSpentFen)}`)}><span className="customer-avatar">{customer.name.slice(0, 1)}</span><span className="customer-main"><strong>{customer.name}</strong><small><Phone aria-hidden="true" />{customer.phone || "未留电话"}</small><small><MapPin aria-hidden="true" />{customer.address || "未留地址"}</small></span><span className="customer-meta"><b>{customer.orderCount} 笔订单</b><small>{customer.lastOrderAt ? `最近 ${timeLabel(customer.lastOrderAt)}` : "暂无订单"}</small></span><ChevronRight aria-hidden="true" /></button>)}{visible.length === 0 && <div className="empty-state"><UsersRound aria-hidden="true" /><strong>没有匹配客户</strong><span>换个关键词或点击新增客户。</span></div>}</div></section>;
}

function ServiceView({ tasks, onCreate, onNotify }: { tasks: ServiceTaskRow[]; onCreate: () => void; onNotify: Notify }) {
  const [filter, setFilter] = useState("进行中");
  const visible = filter === "全部" ? tasks : tasks.filter((task) => !["已完成", "已取消"].includes(task.status));
  return <section className="workspace-panel reveal" style={{ "--i": 1 } as React.CSSProperties}><div className="filter-bar"><div className="segmented"><button className={filter === "进行中" ? "is-selected" : ""} type="button" onClick={() => setFilter("进行中")}>进行中</button><button className={filter === "全部" ? "is-selected" : ""} type="button" onClick={() => setFilter("全部")}>全部任务</button></div><button className="secondary-button compact-button" type="button" onClick={onCreate}><Plus aria-hidden="true" />新增任务</button></div><div className="task-list">{visible.map((task) => <article className="task-card" key={task.id}><div className="task-time"><Clock3 aria-hidden="true" /><strong>{timeLabel(task.appointmentAt)}</strong><small>{task.id}</small></div><div className="task-body"><div><strong>{task.customerName} · {task.productLabel || task.type}</strong><span><MapPin aria-hidden="true" />{task.address || "地址待补充"}</span></div><span className={`status-badge ${task.status === "已完成" ? "tone-success" : task.status === "等待配件" ? "tone-warning" : "tone-info"}`}>{task.status}</span></div><div className="task-actions"><span><UserRound aria-hidden="true" />{task.assignee || "未指派"}</span><a className="icon-text-button" href={`tel:${task.customerPhone}`}><Phone aria-hidden="true" />联系</a>{task.status !== "已完成" && <CompleteTaskButton taskId={task.id} onNotify={onNotify} />}</div></article>)}{visible.length === 0 && <div className="empty-state"><Wrench aria-hidden="true" /><strong>暂无任务</strong><span>点击右上角新增安装或售后任务。</span></div>}</div></section>;
}

function CompleteTaskButton({ taskId, onNotify }: { taskId: string; onNotify: Notify }) { const [pending, startTransition] = useTransition(); const click = () => startTransition(async () => { const form = new FormData(); form.set("taskId", taskId); const result = await completeServiceTask(form); onNotify(result.message); }); return <button className="primary-button compact-button" type="button" disabled={pending} onClick={click}>{pending ? "处理中" : "标记完成"}</button>; }

function ReceivablesView({ receivables, payments, onCreate, onNotify }: { receivables: ReceivableRow[]; payments: PaymentRow[]; onCreate: () => void; onNotify: Notify }) {
  const total = receivables.reduce((sum, item) => sum + item.dueFen, 0);
  return <div className="receivable-layout reveal" style={{ "--i": 1 } as React.CSSProperties}><section className="receivable-summary"><span>当前应收合计</span><strong>{yuan(total)}</strong><p>共 {receivables.length} 笔 · {receivables.filter((item) => item.overdue).length} 笔已逾期</p><div><span>最近一笔收款</span><b>{payments[0] ? yuan(payments[0].amountFen) : "暂无"}</b></div></section><section className="workspace-panel receivable-list">{receivables.map((item) => <div className="receivable-row" key={item.orderId}><span><strong>{item.customerName}</strong><small>{item.orderNo}</small></span><span><small>订单金额</small><strong>{yuan(item.totalFen)}</strong></span><span><small>已收</small><strong>{yuan(item.paidFen)}</strong></span><span><small>尚欠</small><strong className={item.overdue ? "danger-text" : ""}>{yuan(item.dueFen)}</strong></span><span><small>下单日期</small><strong>{item.createdAt.slice(0, 10)}</strong></span><i className={`status-badge ${item.overdue ? "tone-accent" : "tone-warning"}`}>{item.overdue ? "已逾期" : "待还款"}</i><QuickPayment orderId={item.orderId} dueFen={item.dueFen} onNotify={onNotify} /></div>)}{receivables.length === 0 && <div className="empty-state"><CircleDollarSign aria-hidden="true" /><strong>没有应收欠款</strong><span>所有订单都已收讫。</span></div>}<div className="panel-footer"><span>欠款余额由收款流水自动计算</span><button className="secondary-button compact-button" type="button" onClick={onCreate}><Plus aria-hidden="true" />登记收款</button></div></section></div>;
}

function QuickPayment({ orderId, dueFen, onNotify }: { orderId: string; dueFen: number; onNotify: Notify }) { const [pending, startTransition] = useTransition(); const click = () => startTransition(async () => { const form = new FormData(); form.set("orderId", orderId); form.set("amountYuan", String(dueFen / 100)); form.set("method", "现金"); const result = await recordPayment(form); onNotify(result.message); }); return <button className="secondary-button compact-button" type="button" disabled={pending} onClick={click}>{pending ? "收款中" : "一键收讫"}</button>; }

function MobileNav({ activeView, navigate, onCreate }: { activeView: View; navigate: (view: View) => void; onCreate: () => void }) { const items: Array<{ id: View; label: string; icon: typeof House }> = [{ id: "dashboard", label: "工作台", icon: House }, { id: "orders", label: "订单", icon: ShoppingCart }, { id: "inventory", label: "库存", icon: Boxes }, { id: "service", label: "任务", icon: Wrench }]; return <nav className="mobile-nav" aria-label="手机主导航">{items.slice(0, 2).map((item) => <button type="button" key={item.id} className={activeView === item.id ? "is-active" : ""} onClick={() => navigate(item.id)}><item.icon aria-hidden="true" /><span>{item.label}</span></button>)}<button className="mobile-create" type="button" aria-label="新建销售单" onClick={onCreate}><Plus aria-hidden="true" /></button>{items.slice(2).map((item) => <button type="button" key={item.id} className={activeView === item.id ? "is-active" : ""} onClick={() => navigate(item.id)}><item.icon aria-hidden="true" /><span>{item.label}</span></button>)}</nav>; }

function MobileMenu({ activeView, navigate, onClose, stats }: { activeView: View; navigate: (view: View) => void; onClose: () => void; stats: DashboardStats }) { return <div className="sheet-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="mobile-sheet" role="dialog" aria-modal="true" aria-label="全部功能"><div className="sheet-heading"><Brand /><button className="icon-button" type="button" aria-label="关闭全部功能" onClick={onClose}><X aria-hidden="true" /></button></div><nav>{navItems(stats).map((item) => <button type="button" key={item.id} className={activeView === item.id ? "is-active" : ""} onClick={() => navigate(item.id)}><item.icon aria-hidden="true" /><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}<ChevronRight aria-hidden="true" /></button>)}</nav><div className="mobile-account"><span className="avatar">王</span><span><strong>王店长</strong><small>管理员</small></span><Settings aria-hidden="true" /></div></div></div>; }

function DialogShell({ title, description, onClose, children, footer }: { title: string; description: string; onClose: () => void; children: ReactNode; footer: ReactNode }) { return <div className="dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="order-dialog" role="dialog" aria-modal="true"><div className="dialog-heading"><div><h2>{title}</h2><p>{description}</p></div><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X aria-hidden="true" /></button></div>{children}<div className="dialog-footer">{footer}</div></section></div>; }

function NewOrderDialog({ products, onClose, onNotify }: { products: ProductOption[]; onClose: () => void; onNotify: Notify }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [install, setInstall] = useState(true);
  const [source, setSource] = useState("门店仓");
  const [pending, startTransition] = useTransition();
  const product = products.find((item) => item.id === productId) ?? products[0];
  const total = product ? product.priceFen * quantity + (install ? product.installFeeFen : 0) : 0;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set("productId", productId); form.set("quantity", String(quantity)); form.set("source", source); form.set("needInstall", install ? "1" : "0"); startTransition(async () => { const result = await createOrder(form); onNotify(result.message); if (result.ok) onClose(); }); };
  return <DialogShell title="新建销售单" description="保存后立即写入本地数据库" onClose={onClose} footer={<><div><span>订单合计</span><strong>{yuan(total)}</strong><small>{product?.name} × {quantity}{install ? " · 含安装" : ""}</small></div><div><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" form="new-order-form" disabled={pending}>{pending ? "保存中…" : "保存订单"}</button></div></>}><form id="new-order-form" onSubmit={submit}><div className="dialog-content"><div className="form-section"><h3>客户信息</h3><div className="form-grid"><label><span>客户姓名</span><input name="customerName" required placeholder="例如：陈桂香" /></label><label><span>联系电话</span><input name="customerPhone" inputMode="tel" placeholder="例如：13875520836" /></label><label className="full-field"><span>配送 / 安装地址</span><input name="customerAddress" placeholder="临武县…" /></label></div></div><div className="form-section"><h3>商品与履约</h3><div className="product-picker">{products.map((item) => <button type="button" key={item.id} className={productId === item.id ? "is-selected" : ""} onClick={() => setProductId(item.id)}><Image src={item.image} alt="" width={64} height={64} /><span><strong>{item.name}</strong><small>可售 {item.saleable} · {yuan(item.priceFen)}</small></span></button>)}</div><div className="form-grid form-grid--three"><label><span>履约来源</span><select name="source" value={source} onChange={(event) => setSource(event.target.value)}><option>门店仓</option><option>后仓</option><option>厂家直发</option></select></label><label><span>数量</span><input type="number" min="1" max="9" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><label><span>设备序列号</span><input name="serialNo" placeholder={source === "厂家直发" ? "安装前补录" : "选填"} /></label></div></div><div className="form-section form-section--inline"><label className="checkbox-label"><input type="checkbox" checked={install} onChange={(event) => setInstall(event.target.checked)} /><span><strong>需要配送安装</strong><small>安装费 {yuan(product?.installFeeFen ?? 0)}</small></span></label><label><span>预约时间</span><input name="appointmentAt" type="datetime-local" /></label></div><div className="form-section"><h3>业务与收款</h3><div className="form-grid form-grid--three"><label><span>本次收款（元）</span><input name="paidYuan" inputMode="decimal" placeholder="0" /></label><label><span>收款方式</span><select name="paymentMethod"><option>现金</option><option>微信</option><option>支付宝</option><option>银行转账</option><option>扫码</option></select></label><label><span>收款人</span><input name="collector" placeholder="例如：王店长" /></label><label><span>业务员</span><input name="salesperson" placeholder="选填" /></label><label><span>品牌</span><input name="brand" placeholder="例如：万和" /></label><label><span>送货 / 安装</span><select name="deliveryInstall"><option>送货+安装</option><option>仅送货</option><option>客户自提</option><option>厂家直发</option></select></label><label><span>赠品</span><input name="gift" placeholder="选填" /></label><label className="full-field"><span>备注</span><input name="note" placeholder="选填" /></label></div></div></div></form></DialogShell>;
}

function NewCustomerDialog({ onClose, onNotify }: { onClose: () => void; onNotify: Notify }) { const [pending, startTransition] = useTransition(); const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); startTransition(async () => { const result = await createCustomer(new FormData(event.currentTarget)); onNotify(result.message); if (result.ok) onClose(); }); }; return <DialogShell title="新增客户" description="姓名 + 电话即可建档" onClose={onClose} footer={<><div /><div><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" form="new-customer-form" disabled={pending}>{pending ? "保存中…" : "保存客户"}</button></div></>}><form id="new-customer-form" onSubmit={submit}><div className="dialog-content"><div className="form-grid"><label><span>客户姓名</span><input name="name" required /></label><label><span>联系电话</span><input name="phone" inputMode="tel" /></label><label className="full-field"><span>常用地址</span><input name="address" placeholder="临武县…" /></label></div></div></form></DialogShell>; }

function PaymentDialog({ receivables, onClose, onNotify }: { receivables: ReceivableRow[]; onClose: () => void; onNotify: Notify }) { const [pending, startTransition] = useTransition(); const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); startTransition(async () => { const result = await recordPayment(new FormData(event.currentTarget)); onNotify(result.message); if (result.ok) onClose(); }); }; return <DialogShell title="登记收款" description="自动冲抵对应订单欠款" onClose={onClose} footer={<><div /><div><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" form="payment-form" disabled={pending}>{pending ? "保存中…" : "确认收款"}</button></div></>}><form id="payment-form" onSubmit={submit}><div className="dialog-content"><div className="form-grid"><label className="full-field"><span>选择订单</span><select name="orderId" required>{receivables.map((item) => <option key={item.orderId} value={item.orderId}>{item.orderNo} · {item.customerName} · 尚欠 {yuan(item.dueFen)}</option>)}</select></label><label><span>收款金额（元）</span><input name="amountYuan" inputMode="decimal" required placeholder="0" /></label><label><span>收款方式</span><select name="method"><option>现金</option><option>微信</option><option>支付宝</option><option>银行转账</option></select></label><label className="full-field"><span>备注</span><input name="note" placeholder="选填" /></label></div></div></form></DialogShell>; }

function NewTaskDialog({ onClose, onNotify }: { onClose: () => void; onNotify: Notify }) { const [pending, startTransition] = useTransition(); const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); startTransition(async () => { const result = await createServiceTask(new FormData(event.currentTarget)); onNotify(result.message); if (result.ok) onClose(); }); }; return <DialogShell title="新增安装 / 售后任务" description="安排师傅上门服务" onClose={onClose} footer={<><div /><div><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" form="task-form" disabled={pending}>{pending ? "保存中…" : "创建任务"}</button></div></>}><form id="task-form" onSubmit={submit}><div className="dialog-content"><div className="form-grid"><label><span>客户姓名</span><input name="customerName" required /></label><label><span>联系电话</span><input name="customerPhone" inputMode="tel" /></label><label className="full-field"><span>上门地址</span><input name="address" placeholder="临武县…" /></label><label><span>任务类型</span><select name="type"><option>安装</option><option>维修</option><option>送货</option><option>回访</option></select></label><label><span>商品 / 型号</span><input name="productLabel" placeholder="例如：万和 ML10" /></label><label><span>负责师傅</span><input name="assignee" placeholder="选填" /></label><label className="full-field"><span>预约时间</span><input name="appointmentAt" type="datetime-local" /></label></div></div></form></DialogShell>; }

function SearchDialog({ data, onClose, navigate }: { data: WorkbenchData; onClose: () => void; navigate: (view: View) => void }) { const [term, setTerm] = useState(""); const results = useMemo(() => { const value = term.trim().toLowerCase(); if (!value) return []; const orders = data.orders.filter((item) => `${item.orderNo}${item.customerName}${item.customerPhone}${item.productName}`.toLowerCase().includes(value)).map((item) => ({ title: `${item.orderNo} · ${item.customerName}`, meta: `${item.productName} · ${item.status}`, view: "orders" as View })); const stock = data.inventory.filter((item) => `${item.sku}${item.product}${item.warehouse}`.toLowerCase().includes(value)).map((item) => ({ title: item.product, meta: `${item.sku} · ${item.warehouse} · 可售 ${item.saleable}`, view: "inventory" as View })); const customers = data.customers.filter((item) => `${item.name}${item.phone}${item.address}`.toLowerCase().includes(value)).map((item) => ({ title: item.name, meta: `${item.phone || "未留电话"} · ${item.orderCount} 笔订单`, view: "customers" as View })); return [...orders, ...stock, ...customers].slice(0, 8); }, [data, term]); return <div className="dialog-layer search-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="全局搜索"><div className="search-input"><Search aria-hidden="true" /><input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="输入客户、订单、商品或序列号" /><button className="icon-button" type="button" aria-label="关闭搜索" onClick={onClose}><X aria-hidden="true" /></button></div><div className="search-results">{term && results.map((result) => <button type="button" key={`${result.title}-${result.meta}`} onClick={() => { navigate(result.view); onClose(); }}><span><strong>{result.title}</strong><small>{result.meta}</small></span><ChevronRight aria-hidden="true" /></button>)}{!term && <div className="search-hint"><kbd>XS</kbd><span>可以搜索订单号、客户手机号、商品型号或序列号</span></div>}{term && results.length === 0 && <div className="empty-state"><Search aria-hidden="true" /><strong>没有匹配结果</strong><span>换一个手机号、型号或订单号再试。</span></div>}</div></section></div>; }
