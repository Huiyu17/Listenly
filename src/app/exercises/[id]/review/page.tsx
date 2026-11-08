import { ReviewView } from "@/components/views/review-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewView id={id} />;
}
