import { DrawingIntelligenceWorkspace } from "@/components/drawings/drawing-intelligence-workspace";

interface ProjectGambarKerjaPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function ProjectGambarKerjaPage({ params }: ProjectGambarKerjaPageProps) {
  const { projectId } = await params;
  return <DrawingIntelligenceWorkspace projectId={projectId} />;
}
