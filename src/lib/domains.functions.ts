/**
 * Custom domain verification.
 *
 * A domain becomes `verified` only when public DNS actually points at the
 * deploy target: we look up the TXT record `_nexura.<domain>` for the
 * verification token, and check A / CNAME records against the target. DNS is
 * resolved over DNS-over-HTTPS because the Worker runtime has no resolver.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DOH = "https://cloudflare-dns.com/dns-query";

async function resolve(name: string, type: "A" | "TXT" | "CNAME"): Promise<string[]> {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
  return (json.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").replace(/\.$/, ""));
}

const verifyInput = z.object({ domainId: z.string().uuid() });

export const verifyCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Sign in to verify a domain.");

    const row = await context.supabase
      .from("custom_domains")
      .select("id,domain,target,verification_token")
      .eq("id", data.domainId)
      .maybeSingle();
    if (!row.data) throw new Error("Domain not found.");

    const { domain, target, verification_token: token } = row.data as {
      domain: string;
      target: string | null;
      verification_token: string;
    };

    const [txt, a, cname] = await Promise.all([
      resolve(`_nexura.${domain}`, "TXT"),
      resolve(domain, "A"),
      resolve(domain, "CNAME"),
    ]);

    const tokenOk = txt.some((v) => v.includes(token));
    const wanted = (target ?? "").trim().replace(/\.$/, "");
    const pointsOk = wanted
      ? a.includes(wanted) || cname.some((c) => c.toLowerCase() === wanted.toLowerCase())
      : a.length > 0 || cname.length > 0;

    const verified = tokenOk && pointsOk;
    const detail = verified
      ? `Verified — TXT token found and ${a[0] ?? cname[0]} matches the target.`
      : !tokenOk
        ? `TXT record _nexura.${domain} does not contain the token yet.`
        : `DNS points at ${a.join(", ") || cname.join(", ") || "nothing"} instead of ${wanted || "your server"}.`;

    await context.supabase
      .from("custom_domains")
      .update({
        status: verified ? "verified" : "failed",
        last_check: detail,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", data.domainId);

    return { verified, detail, a, cname, txt };
  });
