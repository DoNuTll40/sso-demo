import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session-auth";

export default async function HomePage() {
  const user = await currentUser({ cookies: await cookies() });
  if (!user) redirect("/login");
  redirect(user.role === "ADMIN" ? "/admin/clients" : "/settings/security");
}
