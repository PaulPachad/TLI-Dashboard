import { requireAdmin } from "@/lib/auth-helpers";
import { getOperationsSnapshot } from "@/lib/operations/service";
import { OperationsCenter } from "@/components/admin/operations-center";

export default async function OperationsPage() {
  await requireAdmin();
  const snapshot = await getOperationsSnapshot();
  const initialData = JSON.parse(JSON.stringify(snapshot));

  return <OperationsCenter initialData={initialData} />;
}
