import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/admin-auth";
import { getAdmin2faStatus } from "@/lib/admin-2fa";
import { loginAdminAction } from "@/lib/actions";
import { BrandLogo } from "@/app/components/BrandLogo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Login",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  // F021 flags: with 2FA off the form renders EXACTLY as pre-F021.
  const twoFactor = getAdmin2faStatus();

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
          <LoginForm
            action={loginAdminAction}
            twoFactorEnabled={twoFactor.enabled}
            turnstileSiteKey={twoFactor.turnstile ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "" : ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
