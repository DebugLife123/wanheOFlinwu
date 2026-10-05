export type OrderStatus = "待出库" | "配送中" | "待安装" | "已完成";

export const orders = [
  { id: "XS-0802-006", customer: "陈桂香", phone: "138 7552 0836", product: "万和 ML10 燃气热水器", amount: 3699, paid: 1000, status: "待出库" as OrderStatus, time: "10:42", source: "门店仓" },
  { id: "XS-0802-005", customer: "李建国", phone: "151 7356 2041", product: "喜乐乐 X9 取暖桌", amount: 4280, paid: 4280, status: "配送中" as OrderStatus, time: "09:18", source: "后仓" },
  { id: "XS-0801-018", customer: "周冬梅", phone: "189 7355 7620", product: "万和 MLV5 燃气热水器", amount: 3199, paid: 3199, status: "待安装" as OrderStatus, time: "昨天", source: "厂家直发" },
  { id: "XS-0801-015", customer: "黄志勇", phone: "177 7351 6618", product: "万和 STLV88 户外热水器", amount: 5999, paid: 5999, status: "已完成" as OrderStatus, time: "昨天", source: "门店仓" },
];

export const inventory = [
  { sku: "WH-ML10", product: "万和 ML10 燃气热水器", warehouse: "门店仓", saleable: 3, reserved: 1, sample: 1, damaged: 0, inTransit: 2, serial: "已启用" },
  { sku: "WH-MLVS6", product: "万和 MLVS6 一级能效", warehouse: "后仓", saleable: 2, reserved: 0, sample: 0, damaged: 0, inTransit: 0, serial: "已启用" },
  { sku: "WH-STLV88", product: "万和 STLV88 户外版", warehouse: "门店仓", saleable: 1, reserved: 1, sample: 0, damaged: 0, inTransit: 1, serial: "已启用" },
  { sku: "XLL-X9", product: "喜乐乐 X9 取暖桌", warehouse: "后仓", saleable: 2, reserved: 1, sample: 1, damaged: 0, inTransit: 0, serial: "已启用" },
  { sku: "XLL-Q7", product: "喜乐乐 Q7 取暖桌", warehouse: "临时仓", saleable: 0, reserved: 0, sample: 1, damaged: 1, inTransit: 3, serial: "已启用" },
];

export const tasks = [
  { id: "AZ-0802-003", customer: "周冬梅", address: "临武县武水镇晴岚路 18 号", product: "万和 MLV5", assignee: "刘师傅", time: "今天 14:30", state: "已预约" },
  { id: "AZ-0802-002", customer: "李建国", address: "临武县舜峰镇东云路 62 号", product: "喜乐乐 X9", assignee: "何师傅", time: "今天 16:00", state: "待上门" },
  { id: "SH-0802-001", customer: "王海燕", address: "临武县南强镇莲塘村 6 组", product: "万和 JSQ30", assignee: "刘师傅", time: "明天 09:00", state: "等待配件" },
];

export const receivables = [
  { customer: "陈桂香", order: "XS-0802-006", total: 3699, paid: 1000, due: 2699, date: "2026-08-10", state: "待还款" },
  { customer: "肖国安", order: "XS-0726-031", total: 4280, paid: 3000, due: 1280, date: "2026-08-01", state: "已逾期" },
  { customer: "唐春梅", order: "XS-0718-022", total: 5999, paid: 5000, due: 999, date: "2026-08-15", state: "待还款" },
];

export const products = [
  { id: "ml10", name: "万和 ML10", subtitle: "澎湃瀑布洗 · 一级能效", price: 3699, stock: 3, image: "/products/vanward-ml10.jpg" },
  { id: "mlvs6", name: "万和 MLVS6", subtitle: "雾化外排 · 一级能效", price: 3199, stock: 2, image: "/products/vanward-mlvs6.jpg" },
  { id: "stlv88", name: "万和 STLV88", subtitle: "中央零冷水户外版", price: 5999, stock: 1, image: "/products/vanward-stlv88.jpg" },
];
