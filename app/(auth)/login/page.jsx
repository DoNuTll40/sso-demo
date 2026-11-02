import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session-auth";
import LoginForm from "./login-form";

export default async function LoginPage({searchParams}) {
  const params = await searchParams;
  const user = await currentUser({cookies: await cookies()});
  // An OAuth request may intentionally ask the user to choose a different account.
  if (user && !params.session_id) {
    redirect(user.role === "ADMIN" ? "/admin/clients" : "/settings/security");
  }
  return <LoginForm />;
}
