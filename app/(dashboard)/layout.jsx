import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session-auth";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({children}) {
  const user = await currentUser({cookies: await cookies()});
  if (!user) redirect("/login");
  return <DashboardShell>{children}</DashboardShell>;
}
