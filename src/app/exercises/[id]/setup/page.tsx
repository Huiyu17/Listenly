import { SetupView } from "@/components/views/setup-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SetupView id={id} />;
}
