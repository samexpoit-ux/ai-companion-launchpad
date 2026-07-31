import { useCallback, useEffect, useState } from "react";
import { Search, Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listUsers,
  setUserAdmin,
  setUserCreditLimit,
  setUserPlan,
  type AdminUserRow,
} from "@/lib/admin-api";
import { formatCredits } from "@/lib/credits";
import { PLANS, planById } from "@/lib/plans";

export function UsersTab() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setRows(await listUsers(term));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const changePlan = async (row: AdminUserRow, plan: string) => {
    setBusy(row.id);
    try {
      await setUserPlan(row.id, plan, planById(plan).credits);
      toast.success(`${row.email ?? "User"} moved to ${planById(plan).name}`);
      await load(search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change plan");
    } finally {
      setBusy(null);
    }
  };

  const changeLimit = async (row: AdminUserRow, value: string) => {
    const credits = Number(value);
    if (!Number.isFinite(credits) || credits < 0) return;
    setBusy(row.id);
    try {
      await setUserCreditLimit(row.id, credits);
      toast.success("Credit limit updated");
      await load(search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update credits");
    } finally {
      setBusy(null);
    }
  };

  const toggleAdmin = async (row: AdminUserRow) => {
    setBusy(row.id);
    try {
      await setUserAdmin(row.id, !row.isAdmin);
      toast.success(row.isAdmin ? "Admin access revoked" : "Admin access granted");
      await load(search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change role");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(search);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-ink-500">Loading users…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">No users found.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white/80">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Platform users with plan, credit and role controls</caption>
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                <th scope="col" className="px-4 py-2">User</th>
                <th scope="col" className="px-4 py-2">Plan</th>
                <th scope="col" className="px-4 py-2">Credit limit</th>
                <th scope="col" className="px-4 py-2">Used</th>
                <th scope="col" className="px-4 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium text-ink-900">{row.displayName ?? "—"}</div>
                    <div className="text-xs text-ink-500">{row.email ?? row.id}</div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      aria-label={`Plan for ${row.email ?? row.id}`}
                      value={row.plan}
                      disabled={busy === row.id}
                      onChange={(e) => void changePlan(row, e.target.value)}
                      className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs"
                    >
                      {PLANS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min={0}
                      defaultValue={row.creditsTotal}
                      disabled={busy === row.id}
                      aria-label={`Credit limit for ${row.email ?? row.id}`}
                      className="h-8 w-24 text-xs"
                      onBlur={(e) => {
                        if (Number(e.target.value) !== row.creditsTotal) {
                          void changeLimit(row, e.target.value);
                        }
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 text-ink-700">{formatCredits(row.creditsUsed)}</td>
                  <td className="px-4 py-2">
                    <Button
                      size="sm"
                      variant={row.isAdmin ? "secondary" : "outline"}
                      disabled={busy === row.id}
                      onClick={() => void toggleAdmin(row)}
                    >
                      {row.isAdmin ? (
                        <>
                          <Shield className="mr-1 h-3.5 w-3.5" aria-hidden /> Admin
                        </>
                      ) : (
                        <>
                          <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden /> Member
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
