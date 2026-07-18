import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin-auth";
import { adminUpdateDealAction } from "@/lib/actions";
import { getCategories, getDealById } from "@/lib/data";
import { DealForm } from "../../../components/DealForm";

interface EditDealPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit Deal",
};

export default async function EditDealPage({ params }: EditDealPageProps) {
  await requireAdmin();
  const { id } = await params;

  const [deal, categories] = await Promise.all([getDealById(id), getCategories()]);
  if (!deal) notFound();

  const updateAction = async (formData: FormData) => {
    "use server";
    return adminUpdateDealAction(id, formData);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Button asChild variant="ghost" size="sm" className="gap-1 pl-0">
            <Link href="/admin">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Edit Deal</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <DealForm
          deal={deal}
          categories={categories}
          action={updateAction}
          submitLabel="Update Deal"
        />
      </main>
    </div>
  );
}
