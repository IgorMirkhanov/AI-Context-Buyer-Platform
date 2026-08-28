import { CopyMarketing } from "../copywriting/limits";

export type MediaKind = "image" | "video";

export type MediaMarketing = CopyMarketing & {
  product_description?: string;
};

export type MediaClusterInput = {
  id: string;
  name: string;
};

export type MediaPlanInput = {
  clusters: MediaClusterInput[];
  marketing: MediaMarketing;
  kinds: MediaKind[];
};

export type MediaPlanItem = {
  cluster_id: string;
  cluster_name: string;
  kind: MediaKind;
  prompt: string;
  width: number;
  height: number;
  duration_ms: number | null;
};

export type MediaPlan = {
  items: MediaPlanItem[];
};

export type MediaPromptWriter = {
  draftPrompt(
    cluster: MediaClusterInput,
    marketing: MediaMarketing,
    kind: MediaKind,
  ): string;
};
