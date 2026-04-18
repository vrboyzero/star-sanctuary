import type {
  DelegationProtocol,
  DelegationTeamMember,
} from "@belldandy/skills";
import {
  buildIdentityAuthorityMayDirect,
  buildIdentityAuthorityReportsTo,
  deriveAuthorityRelationToManager,
  type IdentityAuthorityProfile,
} from "@belldandy/protocol";

function cloneStringArray(value: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? [...value] : undefined;
}

function enrichTeamMemberWithIdentity(input: {
  member: DelegationTeamMember;
  resolvedAgentId?: string;
  managerAgentId?: string;
  managerProfile?: IdentityAuthorityProfile;
  resolveAuthorityProfile: (agentId: string) => IdentityAuthorityProfile | undefined;
}): DelegationTeamMember {
  const agentId = input.member.agentId?.trim() || input.resolvedAgentId;
  const memberProfile = agentId ? input.resolveAuthorityProfile(agentId) : undefined;
  const authorityRelationToManager = input.member.authorityRelationToManager
    ?? deriveAuthorityRelationToManager({
      managerAgentId: input.managerAgentId,
      managerProfile: input.managerProfile,
      memberAgentId: agentId,
      memberProfile,
    });
  const reportsTo = input.member.reportsTo
    ?? buildIdentityAuthorityReportsTo(memberProfile, input.managerProfile);
  const mayDirect = input.member.mayDirect
    ?? buildIdentityAuthorityMayDirect(memberProfile);

  return {
    ...input.member,
    ...(agentId && !input.member.agentId ? { agentId } : {}),
    ...(input.member.identityLabel ? {} : memberProfile?.currentLabel ? { identityLabel: memberProfile.currentLabel } : {}),
    ...(authorityRelationToManager ? { authorityRelationToManager } : {}),
    ...(reportsTo ? { reportsTo: cloneStringArray(reportsTo) } : {}),
    ...(mayDirect ? { mayDirect: cloneStringArray(mayDirect) } : {}),
  };
}

export function enrichDelegationProtocolTeamWithIdentity(input: {
  protocol: DelegationProtocol | undefined;
  currentAgentId?: string;
  resolveAuthorityProfile: (agentId: string) => IdentityAuthorityProfile | undefined;
}): DelegationProtocol | undefined {
  const protocol = input.protocol;
  if (!protocol?.team || !Array.isArray(protocol.team.memberRoster) || protocol.team.memberRoster.length === 0) {
    return protocol;
  }

  const team = protocol.team;
  const managerAgentId = team.managerAgentId?.trim() || undefined;
  const managerProfile = managerAgentId ? input.resolveAuthorityProfile(managerAgentId) : undefined;
  const memberRoster = team.memberRoster.map((member) => enrichTeamMemberWithIdentity({
    member,
    resolvedAgentId: member.laneId === team.currentLaneId ? input.currentAgentId : undefined,
    managerAgentId,
    managerProfile,
    resolveAuthorityProfile: input.resolveAuthorityProfile,
  }));

  return {
    ...protocol,
    team: {
      ...team,
      ...(team.managerIdentityLabel ? {} : managerProfile?.currentLabel ? { managerIdentityLabel: managerProfile.currentLabel } : {}),
      memberRoster,
    },
  };
}
