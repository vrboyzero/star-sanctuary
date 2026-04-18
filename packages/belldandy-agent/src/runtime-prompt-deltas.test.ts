import { describe, expect, it } from "vitest";

import {
  buildLaunchSpecPromptDeltas,
  buildToolResultPromptDeltas,
  buildToolFailureRecoveryPromptDelta,
  buildToolPostVerificationPromptDelta,
  collectSystemPromptDeltaTexts,
} from "./runtime-prompt-deltas.js";

describe("buildLaunchSpecPromptDeltas", () => {
  it("builds role and tool-selection deltas from a launch spec", () => {
    const deltas = buildLaunchSpecPromptDeltas({
      profileId: "coder",
      role: "verifier",
      permissionMode: "confirm",
      allowedToolFamilies: ["workspace-read", "command-exec"],
      maxToolRiskLevel: "high",
      toolSet: ["file_read", "terminal", "log_read"],
      policySummary: "Verification-first run.",
      delegationProtocol: {
        source: "goal_verifier",
        intent: {
          kind: "verifier_handoff",
          summary: "Review delegated results",
          role: "verifier",
        },
        contextPolicy: {
          includeParentConversation: true,
          includeStructuredContext: true,
          contextKeys: ["goalId"],
        },
        expectedDeliverable: {
          format: "verification_report",
          summary: "Verification report with findings.",
        },
        aggregationPolicy: {
          mode: "verifier_fan_in",
          summarizeFailures: true,
        },
      launchDefaults: {
        permissionMode: "confirm",
        allowedToolFamilies: ["workspace-read", "command-exec"],
        maxToolRiskLevel: "high",
      },
      ownership: {
        scopeSummary: "Review delegated verifier output only.",
        outOfScope: ["Implement fixes"],
      },
      acceptance: {
        doneDefinition: "State whether the verifier output is ready for handoff.",
        verificationHints: ["Check findings", "Check evidence"],
      },
      deliverableContract: {
        format: "verification_report",
        requiredSections: ["Findings", "Evidence"],
      },
    },
  });

    expect(deltas.map((delta) => delta.deltaType)).toEqual([
      "role-execution-policy",
      "tool-selection-policy",
    ]);
    expect(deltas[0]?.text).toContain("operate as `verifier`");
    expect(deltas[1]?.text).toContain("Allowed tool families: workspace-read, command-exec");
    expect(deltas[1]?.text).toContain("Expected deliverable: verification_report | Verification report with findings.");
    expect(deltas[1]?.text).toContain("Owned scope: Review delegated verifier output only.");
    expect(deltas[1]?.text).toContain("Done definition: State whether the verifier output is ready for handoff.");
    expect(deltas[1]?.text).toContain("Deliverable required sections: Findings, Evidence");
    expect(deltas[1]?.text).toContain("Verifier handoff rule: stay inside verification scope");

    expect(collectSystemPromptDeltaTexts(deltas)).toEqual([
      expect.stringContaining("Run Role Override"),
      expect.stringContaining("Run Tool Selection Constraints"),
    ]);
  });
});

describe("tool result prompt deltas", () => {
  it("builds a failure recovery delta with classified guidance", () => {
    const delta = buildToolFailureRecoveryPromptDelta({
      toolCallId: "call-1",
      toolName: "echo",
      error: "Permission denied by launch policy",
    });

    expect(delta).toBeDefined();
    expect(delta?.deltaType).toBe("tool-failure-recovery");
    expect(delta?.text).toContain("## Tool Failure Recovery");
    expect(delta?.text).toContain("Failure class: permission_or_policy");
    expect(delta?.text).toContain("Do not work around policy or permission failures");
  });

  it("prefers structured failureKind over error-text fallback", () => {
    const delta = buildToolFailureRecoveryPromptDelta({
      toolCallId: "call-1b",
      toolName: "file_read",
      error: "unexpected opaque failure",
      failureKind: "input_error",
    });

    expect(delta).toBeDefined();
    expect(delta?.text).toContain("Failure class: input_error");
  });

  it("builds a post-verification delta for write-like tools", () => {
    const delta = buildToolPostVerificationPromptDelta({
      toolCallId: "call-2",
      toolName: "file_write",
    });

    expect(delta).toBeDefined();
    expect(delta?.deltaType).toBe("tool-post-verification");
    expect(delta?.text).toContain("## Tool Post-Action Verification");
    expect(delta?.text).toContain("Tool: `file_write`");
    expect(delta?.text).toContain("Verify the effect before claiming success");
  });

  it("builds a delegation result review delta from structured delegation arguments", () => {
    const delta = buildToolPostVerificationPromptDelta({
      toolCallId: "call-3",
      toolName: "delegate_task",
      requestArguments: {
        ownership: {
          scope_summary: "Review the runtime prompt delta patch only.",
          out_of_scope: ["Implement fixes"],
        },
        acceptance: {
          done_definition: "Returned result states whether the patch is acceptable.",
          verification_hints: ["Check findings", "Check missing tests"],
        },
        deliverable_contract: {
          format: "verification_report",
          required_sections: ["Findings", "Recommendation"],
        },
      },
    });

    expect(delta).toBeDefined();
    expect(delta?.text).toContain("## Delegation Result Review");
    expect(delta?.text).toContain("Owned scope: Review the runtime prompt delta patch only.");
    expect(delta?.text).toContain("Done definition: Returned result states whether the patch is acceptable.");
    expect(delta?.text).toContain("Deliverable contract: verification_report | sections: Findings | Recommendation");
  });

  it("adds delegation review guidance when a delegated result is rejected by the acceptance gate", () => {
    const deltas = buildToolResultPromptDeltas({
      result: {
        id: "call-4",
        name: "delegate_task",
        success: false,
        output: "worker finished",
        error: "Delegation acceptance gate rejected the sub-agent result. Missing required sections: Recommendation",
        metadata: {
          delegationResults: [{
            label: "Agent verifier",
            workerSuccess: true,
            accepted: false,
            acceptanceGate: {
              enforced: true,
              accepted: false,
              summary: "Delegated result failed the structured acceptance gate: Missing required sections: Recommendation",
              reasons: ["Missing required sections: Recommendation"],
              deliverableFormat: "verification_report",
              requiredSections: ["Findings", "Recommendation"],
              missingRequiredSections: ["Recommendation"],
              acceptanceCheckStatus: "missing",
              rejectionConfidence: "high",
              managerActionHint: "reject this handoff and re-delegate with explicit section requirements or a clearer deliverable contract.",
              contractSpecificChecks: [
                { id: "verification_report_findings", label: "Verification report is missing a findings section.", status: "passed", enforced: true, evidence: "Findings" },
                { id: "verification_report_recommendation", label: "Verification report is missing a recommendation or verdict section.", status: "failed", enforced: true },
              ],
            },
          }],
          acceptedCount: 0,
          gateRejectedCount: 1,
          workerSuccessCount: 1,
          followUpStrategy: {
            mode: "single",
            summary: "Suggested next step: retry with follow-up delegation: Agent verifier.",
            recommendedRuntimeAction: "retry_delegation",
            retryLabels: ["Agent verifier"],
            highPriorityLabels: ["Agent verifier"],
            verifierHandoffLabels: ["Agent verifier"],
            items: [
              {
                label: "Agent verifier",
                action: "retry",
                reason: "reject this handoff and re-delegate with explicit section requirements or a clearer deliverable contract.",
                recommendedRuntimeAction: "retry_delegation",
                priority: "high",
                verificationHints: ["Check findings", "Check missing tests"],
                template: {
                  toolName: "delegate_task",
                  agentId: "verifier",
                  instruction: "Review the runtime prompt delta patch only.\n\nFollow-up requirement: Delegated result failed the structured acceptance gate: Missing required sections: Recommendation",
                  acceptance: {
                    doneDefinition: "Returned result states whether the patch is acceptable.",
                    verificationHints: ["Check findings", "Check missing tests"],
                  },
                  deliverableContract: {
                    format: "verification_report",
                    requiredSections: ["Findings", "Recommendation"],
                  },
                },
                verifierTemplate: {
                  toolName: "delegate_task",
                  agentId: "verifier",
                  instruction: "Verify whether the delegated runtime prompt delta review is safe to accept.",
                  acceptance: {
                    doneDefinition: "Returned result states whether the patch is acceptable.",
                    verificationHints: ["Check findings", "Check missing tests"],
                  },
                  deliverableContract: {
                    format: "verification_report",
                    requiredSections: ["Findings", "Recommendation", "Done Definition Check", "Required Sections Audit"],
                  },
                },
              },
            ],
          },
        },
      },
      requestArguments: {
        ownership: {
          scope_summary: "Review the runtime prompt delta patch only.",
        },
        acceptance: {
          done_definition: "Returned result states whether the patch is acceptable.",
          verification_hints: ["Check findings", "Check missing tests"],
        },
        deliverable_contract: {
          format: "verification_report",
          required_sections: ["Findings", "Recommendation"],
        },
      },
    });

    expect(deltas.map((delta) => delta.deltaType)).toEqual([
      "tool-failure-recovery",
      "tool-post-verification",
    ]);
    expect(deltas[0]?.text).toContain("## Tool Failure Recovery");
    expect(deltas[0]?.text).toContain("Delegation gate confidence: high");
    expect(deltas[0]?.text).toContain("Suggested follow-up: Suggested next step: retry with follow-up delegation: Agent verifier.");
    expect(deltas[0]?.text).toContain("Suggested runtime action: retry_delegation");
    expect(deltas[0]?.text).toContain("High-priority follow-up items: Agent verifier");
    expect(deltas[0]?.metadata).toMatchObject({
      delegationResult: {
        delegationResults: [
          {
            acceptanceGate: {
              accepted: false,
              rejectionConfidence: "high",
            },
          },
        ],
      },
    });
    expect(deltas[1]?.text).toContain("## Delegation Result Review");
    expect(deltas[1]?.text).toContain("Done definition: Returned result states whether the patch is acceptable.");
    expect(deltas[1]?.text).toContain("Manager action: reject this handoff and re-delegate with explicit section requirements or a clearer deliverable contract.");
    expect(deltas[1]?.text).toContain("## Suggested Follow-Up Strategy");
    expect(deltas[1]?.text).toContain("Recommended runtime action: retry_delegation");
    expect(deltas[1]?.text).toContain("Retry with follow-up delegation: Agent verifier");
    expect(deltas[1]?.text).toContain("High-priority follow-up: Agent verifier");
    expect(deltas[1]?.text).toContain("Verifier handoff available: Agent verifier");
    expect(deltas[1]?.text).toContain("Runtime action: retry_delegation [high]");
    expect(deltas[1]?.text).toContain("Optional verifier handoff: delegate_task; agent_id=verifier");
    expect(deltas[1]?.metadata).toMatchObject({
      delegationResult: {
        delegationResults: [
          {
            acceptanceGate: {
              deliverableFormat: "verification_report",
              accepted: false,
            },
          },
        ],
        followUpStrategy: {
          mode: "single",
          recommendedRuntimeAction: "retry_delegation",
          retryLabels: ["Agent verifier"],
          highPriorityLabels: ["Agent verifier"],
          verifierHandoffLabels: ["Agent verifier"],
        },
      },
    });
  });

  it("adds parallel fan-in follow-up guidance for mixed delegation outcomes", () => {
    const delta = buildToolPostVerificationPromptDelta({
      toolCallId: "call-5",
      toolName: "delegate_parallel",
      requestArguments: {
        tasks: [
          {
            instruction: "Review patch A",
            acceptance: {
              verification_hints: ["Check readiness note"],
            },
          },
          {
            instruction: "Review patch B",
            acceptance: {
              verification_hints: ["Check recommendation"],
            },
            deliverable_contract: {
              format: "verification_report",
              required_sections: ["Findings", "Recommendation"],
            },
          },
        ],
      },
      resultMetadata: {
        delegationResults: [
          {
            label: "Task 1 / default",
            workerSuccess: true,
            accepted: true,
            acceptanceGate: {
              enforced: true,
              accepted: true,
              summary: "Delegated result passed the structured acceptance gate.",
              reasons: [],
              acceptanceCheckStatus: "not_requested",
            },
          },
          {
            label: "Task 2 / default",
            workerSuccess: true,
            accepted: false,
            acceptanceGate: {
              enforced: true,
              accepted: false,
              summary: "Delegated result failed the structured acceptance gate: Missing required sections: Recommendation",
              reasons: ["Missing required sections: Recommendation"],
              acceptanceCheckStatus: "missing",
              rejectionConfidence: "high",
              managerActionHint: "reject this handoff and re-delegate with explicit section requirements or a clearer deliverable contract.",
            },
          },
        ],
        followUpStrategy: {
          mode: "parallel",
          summary: "Parallel fan-in strategy: accept now: Task 1 / default; retry with follow-up delegation: Task 2 / default.",
          recommendedRuntimeAction: "retry_delegation",
          acceptedLabels: ["Task 1 / default"],
          retryLabels: ["Task 2 / default"],
          verifierHandoffLabels: ["Task 2 / default"],
          items: [
            {
              label: "Task 1 / default",
              action: "accept",
              reason: "Delegated result passed the acceptance gate.",
              recommendedRuntimeAction: "accept_result",
              priority: "normal",
            },
            {
              label: "Task 2 / default",
              action: "retry",
              reason: "reject this handoff and re-delegate with explicit section requirements or a clearer deliverable contract.",
              recommendedRuntimeAction: "retry_delegation",
              priority: "high",
              verificationHints: ["Check recommendation"],
              template: {
                toolName: "delegate_task",
                instruction: "Review patch B\n\nFollow-up requirement: Delegated result failed the structured acceptance gate: Missing required sections: Recommendation",
                acceptance: {
                  verificationHints: ["Check recommendation"],
                },
                deliverableContract: {
                  format: "verification_report",
                  requiredSections: ["Findings", "Recommendation"],
                },
              },
              verifierTemplate: {
                toolName: "delegate_task",
                agentId: "verifier",
                instruction: "Verify whether Task 2 / default is safe to accept.",
                acceptance: {
                  verificationHints: ["Check recommendation"],
                },
                deliverableContract: {
                  format: "verification_report",
                  requiredSections: ["Findings", "Recommendation"],
                },
              },
            },
          ],
        },
      },
    });

    expect(delta).toBeDefined();
    expect(delta?.text).toContain("Summary: Parallel fan-in strategy: accept now: Task 1 / default; retry with follow-up delegation: Task 2 / default.");
    expect(delta?.text).toContain("Recommended runtime action: retry_delegation");
    expect(delta?.text).toContain("Accept now: Task 1 / default");
    expect(delta?.text).toContain("Retry with follow-up delegation: Task 2 / default");
    expect(delta?.text).toContain("Verifier handoff available: Task 2 / default");
    expect(delta?.text).toContain("Task 2 / default: retry");
    expect(delta?.text).toContain("Runtime action: retry_delegation [high]");
  });
});
