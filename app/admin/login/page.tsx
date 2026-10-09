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
          {/* F030: production without an explicit ADMIN_2FA_ENABLED refuses
              single-factor login — say so, with the enrollment command, so
              the operator is never guessing why valid credentials bounce. */}
          {twoFactor.blocked ? (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-red-700 dark:text-red-300"
            >
              Admin login is disabled on this deployment until 2FA is enabled
              and enrolled. Set <code>ADMIN_2FA_ENABLED=&quot;true&quot;</code>,
              run <code>pnpm admin:2fa-enroll</code>, and restart — see
              <code> docs/ops/admin-2fa.md</code>.
            </p>
          ) : null}
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
