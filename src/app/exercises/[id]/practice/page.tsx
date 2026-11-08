import { PracticeView } from "@/components/views/practice-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeView id={id} />;
}
