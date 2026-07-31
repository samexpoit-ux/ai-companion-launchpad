import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceSidebar } from "@/components/dashboard/WorkspaceSidebar";
export const Route = createFileRoute("/dashpreview")({ component: () => (
  <div className="flex h-dvh"><WorkspaceSidebar className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[300px] shadow-ds-lg" recents={[{id:"1",title:"OTP Rewards Hub",updatedAt:Date.now()-3600000}]} workspaceName="sam's workspace" userLabel="sam" credits={{left:304,total:400}} /><div className="aurora-canvas flex-1" /></div>
) });
