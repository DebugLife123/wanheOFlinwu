import { OrderWorkbench } from "@/components/order-workbench";
import {
  getDashboardStats,
  listCustomers,
  listInventory,
  listOrders,
  listPayments,
  listProducts,
  listReceivables,
  listServiceTasks,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default function Home() {
  const products = listProducts();
  const orders = listOrders();
  const inventory = listInventory();
  const customers = listCustomers();
  const serviceTasks = listServiceTasks();
  const receivables = listReceivables();
  const payments = listPayments();
  const stats = getDashboardStats();

  return (
    <OrderWorkbench
      products={products}
      orders={orders}
      inventory={inventory}
      customers={customers}
      serviceTasks={serviceTasks}
      receivables={receivables}
      payments={payments}
      stats={stats}
    />
  );
}
