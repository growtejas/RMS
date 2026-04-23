import { apiClient } from "@/lib/api/client";
import type { EvaluationCardContext } from "@/components/evaluation/mapRankedCandidateToEvaluationCard";

interface BackendRequisitionItem {
  item_id: number;
  experience_years?: number | null;
  ranking_required_skills?: string[] | null;
}

interface BackendRequisition {
  req_id: number;
  items: BackendRequisitionItem[];
}

/** Role-fit context for the evaluation card (matches TA requisition item fields). */
export async function fetchEvaluationContextForItem(
  requisitionId: number,
  requisitionItemId: number,
): Promise<EvaluationCardContext | undefined> {
  const { data } = await apiClient.get<BackendRequisition>(
    `/requisitions/${requisitionId}`,
  );
  const item = data.items.find((i) => i.item_id === requisitionItemId);
  if (!item) {
    return undefined;
  }
  return {
    requiredExperienceYears: item.experience_years ?? null,
    requiredSkillsCount: item.ranking_required_skills?.length
      ? item.ranking_required_skills.length
      : undefined,
  };
}
