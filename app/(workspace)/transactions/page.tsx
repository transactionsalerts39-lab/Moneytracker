import { Suspense } from "react";

import { TransactionsView } from "@/components/transactions/transactions-view";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading transactions…</p>}>
      <TransactionsView />
    </Suspense>
  );
}
