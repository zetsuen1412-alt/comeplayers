import { redirect } from "next/navigation";

export default function LegacyOrderPageRedirect() {
  redirect("/my-orders");
}
