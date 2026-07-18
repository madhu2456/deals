import Link from "next/link";
import { Plus, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin-auth";
import { logoutAdminAction } from "@/lib/actions";
import { getAllDealsAdmin } from "@/lib/data";
import { formatDate, statusColor } from "@/lib/format";
import { AdminActions } from "./AdminActions";

export const metadata = {
  title: "Admin Dashboard",
};

interface AdminPageProps {
  searchParams: Promise<{ status?: string; search?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdmin();
  const { status = "PENDING", search = "" } = await searchParams;

  const deals = await getAllDealsAdmin({ status, search });

  const statusTabs = [
    { value: "PENDING", label: "Pending" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "EXPIRED", label: "Expired" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-foreground">Deals Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="sm">
              <Link href="/admin/deals/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Deal
              </Link>
            </Button>
            <form action={logoutAdminAction}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="mr-1.5 h-4 w-4" />
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="inline-flex rounded-lg bg-muted p-1">
            {statusTabs.map((tab) => (
              <Link
                key={tab.value}
                href={`/admin?status=${tab.value}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  status === tab.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <form action="/admin" className="flex max-w-sm gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="search"
                defaultValue={search}
                placeholder="Search deals..."
                className="pl-8"
              />
            </div>
            <input type="hidden" name="status" value={status} />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No {status.toLowerCase()} deals found.
                  </TableCell>
                </TableRow>
              ) : (
                deals.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{deal.title}</div>
                      <div className="text-sm text-muted-foreground">{deal.brandName}</div>
                      {deal.submittedByEmail && (
                        <div className="text-xs text-muted-foreground">
                          by {deal.submittedByName || "Anonymous"} ({deal.submittedByEmail})
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{deal.category.name}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(deal.status)}>
                        {deal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(deal.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AdminActions dealId={deal.id} status={deal.status} slug={deal.slug} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
