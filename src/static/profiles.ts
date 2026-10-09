import type { Profile, ProfileId } from "../types.js";
import { InputError } from "../errors.js";

export const PROFILES: Readonly<Record<ProfileId, Profile>> = Object.freeze({
  "personal-local-multirepo": Object.freeze({
    id: "personal-local-multirepo",
    label: "个人本地多仓协作",
    description: "个人在根协调目录中通过一套协议驱动多个独立仓库的需求交付。",
    dimensions: Object.freeze({
      intake: 10,
      context: 12,
      requirements: 15,
      decisions: 10,
      execution: 10,
      verification: 18,
      synchronization: 10,
      boundaries: 5,
      safety: 10
    })
  }),
  "team-shared-repo": Object.freeze({
    id: "team-shared-repo",
    label: "团队共享仓库",
    description: "多人和多个 AI 工具通过版本化协议完成共享仓库中的需求交付。",
    dimensions: Object.freeze({
      intake: 10,
      context: 11,
      requirements: 14,
      decisions: 10,
      execution: 10,
      verification: 18,
      synchronization: 9,
      boundaries: 8,
      safety: 10
    })
  })
});

export function getProfile(id: string): Profile {
  const profile = PROFILES[id as ProfileId];
  if (!profile) {
    throw new InputError(`Unknown profile '${id}'. Available: ${Object.keys(PROFILES).join(", ")}`);
  }
  return profile;
}
