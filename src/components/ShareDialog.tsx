/**
 * Share one project with another Nexura account.
 *
 * The invite is resolved server-side by email; the browser only ever sees the
 * collaborator list it is allowed to read.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCollaborators, type Collaborator } from "@/lib/collab";
import { revokeThreadAccess, shareThread } from "@/lib/collab.functions";
import { cn } from "@/lib/utils";

export function ShareDialog({
  threadId,
  title,
  open,
  onOpenChange,
}: {
  threadId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [people, setPeople] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPeople(await listCollaborators(threadId));
  }, [threadId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const invite = useCallback(async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await shareThread({ data: { threadId, email: email.trim(), role } });
      toast.success(`${email.trim()} can now open this project`);
      setEmail("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not share this project");
    } finally {
      setBusy(false);
    }
  }, [email, load, role, threadId]);

  const revoke = useCallback(
    async (userId: string) => {
      try {
        await revokeThreadAccess({ data: { threadId, userId } });
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not remove access");
      }
    },
    [load, threadId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share “{title}”</DialogTitle>
          <DialogDescription>
            Invited people see this project in “Shared with me”, with its full chat history.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void invite();
            }}
            placeholder="teammate@example.com"
            aria-label="Collaborator email"
            type="email"
          />
          <Button onClick={() => void invite()} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            )}
            Invite
          </Button>
        </div>

        <div className="flex gap-1.5">
          {(["editor", "viewer"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                role === r
                  ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-[color:var(--color-iris-ink)]"
                  : "border-ink-200 text-ink-500 hover:bg-ink-100",
              )}
            >
              {r === "editor" ? "Can edit" : "Can view"}
            </button>
          ))}
        </div>

        <ul className="mt-1 space-y-1.5">
          {people.length === 0 ? (
            <li className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
              Only you have access right now.
            </li>
          ) : (
            people.map((p) => (
              <li
                key={p.userId}
                className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink-900">{p.email ?? p.userId}</span>
                <span className="text-2xs uppercase tracking-wide text-ink-500">{p.role}</span>
                <button
                  type="button"
                  onClick={() => void revoke(p.userId)}
                  aria-label={`Remove ${p.email ?? "collaborator"}`}
                  className="rounded-full p-1 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
