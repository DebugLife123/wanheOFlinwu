import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "临武万和订单管理",
    short_name: "万和订单",
    description: "店内订单、库存、客户和安装售后管理",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3ef",
    theme_color: "#f7f3ef",
    lang: "zh-CN",
  };
}
