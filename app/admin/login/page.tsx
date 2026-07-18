import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/admin-auth";
import { loginAdminAction } from "@/lib/actions";
import { BrandLogo } from "@/app/components/BrandLogo";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Admin Login",
};

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-sm border-border">
        <CardHeader className="text-center">
          <div className="mx-auto">
            <BrandLogo size="lg" />
          </div>
          <CardTitle className="mt-4 text-xl">Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm action={loginAdminAction} />
        </CardContent>
      </Card>
    </div>
  );
}
