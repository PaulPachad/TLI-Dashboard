import { requireAdmin } from "@/lib/auth-helpers";
import { getAutomationOverview } from "@/lib/automation/service";
import { AutomationCenter } from "@/components/admin/automation-center";

export default async function AutomationPage() {
  await requireAdmin();
  const overview = await getAutomationOverview();
  const initialData = JSON.parse(JSON.stringify(overview));

  return <AutomationCenter initialData={initialData} />;
}
