import { redirect } from "next/navigation";

export default function OrdersPageRedirect() {
  redirect("/my-orders");
}
