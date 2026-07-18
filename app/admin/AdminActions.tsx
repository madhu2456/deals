"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Edit, Check, X, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminApproveDealAction,
  adminRejectDealAction,
  adminDeleteDealAction,
} from "@/lib/actions";

interface AdminActionsProps {
  dealId: string;
  status: string;
  slug: string;
}

export function AdminActions({ dealId, status, slug }: AdminActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const runAction = (action: () => Promise<unknown>) => {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" aria-label="Edit deal">
        <Link href={`/admin/deals/${dealId}/edit`}>
          <Edit className="h-4 w-4" />
        </Link>
      </Button>

      {status !== "APPROVED" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-emerald-600 hover:text-emerald-700"
          aria-label="Approve deal"
          disabled={pending}
          onClick={() => runAction(() => adminApproveDealAction(dealId))}
        >
          <Check className="h-4 w-4" />
        </Button>
      )}

      {status !== "REJECTED" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-amber-600 hover:text-amber-700"
          aria-label="Reject deal"
          disabled={pending}
          onClick={() => runAction(() => adminRejectDealAction(dealId))}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label="Delete deal"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this deal permanently?")) return;
          runAction(() => adminDeleteDealAction(dealId));
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {status === "APPROVED" ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/deals/${slug}`} target="_blank" rel="noopener noreferrer">
            View
            <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/admin/deals/${dealId}/edit`}>Preview</Link>
        </Button>
      )}
    </div>
  );
}
