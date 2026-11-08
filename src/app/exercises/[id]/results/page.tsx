import { ResultsView } from "@/components/views/results-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsView id={id} />;
}
