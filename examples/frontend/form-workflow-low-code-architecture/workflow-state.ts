export type WorkflowPhase =
  | 'draft' | 'submitted' | 'in_review' | 'changes_requested'
  | 'approved' | 'rejected' | 'canceled';

export type WorkflowCommand = 'edit' | 'submit' | 'approve' | 'request_changes' | 'reject' | 'cancel';

export interface WorkflowView {
  readonly instanceId: string;
  readonly phase: WorkflowPhase;
  readonly version: number;
  readonly allowedCommands: readonly WorkflowCommand[];
  readonly assigneeLabel?: string;
}

export function applyWorkflowSnapshot(
  current: WorkflowView,
  incoming: WorkflowView,
): WorkflowView {
  if (incoming.instanceId !== current.instanceId) throw new TypeError('Workflow instance mismatch');
  return incoming.version > current.version ? incoming : current;
}

export const canIssue = (view: WorkflowView, command: WorkflowCommand): boolean =>
  view.allowedCommands.includes(command);
