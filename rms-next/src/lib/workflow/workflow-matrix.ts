/**
 * Port of `backend/services/requisition/workflow_matrix.py` (transition matrices + helpers).
 */

import type { RequisitionItemStatus, RequisitionStatus } from "@/types/workflow";
import { REQUISITION_STATUSES, ITEM_STATUSES } from "@/types/workflow";

export const SystemRole = {
  MANAGER: "Manager",
  HR: "HR",
  TA: "TA",
  ADMIN: "Admin",
  SYSTEM: "SYSTEM",
} as const;

export type SystemRoleName = (typeof SystemRole)[keyof typeof SystemRole];

const RS = {
  DRAFT: "Draft",
  PENDING_BUDGET: "Pending_Budget",
  PENDING_HR: "Pending_HR",
  ACTIVE: "Active",
  FULFILLED: "Fulfilled",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const satisfies Record<string, RequisitionStatus>;

const IS = {
  PENDING: "Pending",
  SOURCING: "Sourcing",
  SHORTLISTED: "Shortlisted",
  INTERVIEWING: "Interviewing",
  OFFERED: "Offered",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const satisfies Record<string, RequisitionItemStatus>;

function toSet<T extends string>(...xs: T[]): Set<T> {
  return new Set(xs);
}

export const HEADER_TRANSITIONS: Readonly<
  Record<RequisitionStatus, ReadonlySet<RequisitionStatus>>
> = {
  [RS.DRAFT]: toSet(RS.PENDING_BUDGET, RS.CANCELLED),
  [RS.PENDING_BUDGET]: toSet(RS.PENDING_HR, RS.REJECTED, RS.CANCELLED),
  [RS.PENDING_HR]: toSet(RS.ACTIVE, RS.REJECTED, RS.CANCELLED),
  [RS.ACTIVE]: toSet(RS.FULFILLED, RS.CANCELLED),
  [RS.REJECTED]: toSet(RS.DRAFT),
  [RS.FULFILLED]: new Set(),
  [RS.CANCELLED]: new Set(),
};

export const HEADER_TERMINAL_STATES: ReadonlySet<RequisitionStatus> = new Set([
  RS.FULFILLED,
  RS.CANCELLED,
]);

export const ITEM_TRANSITIONS: Readonly<
  Record<RequisitionItemStatus, ReadonlySet<RequisitionItemStatus>>
> = {
  [IS.PENDING]: toSet(IS.SOURCING, IS.CANCELLED),
  [IS.SOURCING]: toSet(IS.SHORTLISTED, IS.CANCELLED),
  [IS.SHORTLISTED]: toSet(IS.INTERVIEWING, IS.SOURCING, IS.CANCELLED),
  [IS.INTERVIEWING]: toSet(IS.OFFERED, IS.SHORTLISTED, IS.CANCELLED),
  [IS.OFFERED]: toSet(IS.FULFILLED, IS.INTERVIEWING, IS.CANCELLED),
  [IS.FULFILLED]: new Set(),
  [IS.CANCELLED]: new Set(),
};

export const ITEM_TERMINAL_STATES: ReadonlySet<RequisitionItemStatus> = new Set([
  IS.FULFILLED,
  IS.CANCELLED,
]);

export const ITEM_BACKWARD_TRANSITIONS: Readonly<
  Partial<Record<RequisitionItemStatus, ReadonlySet<RequisitionItemStatus>>>
> = {
  [IS.SHORTLISTED]: toSet(IS.SOURCING),
  [IS.INTERVIEWING]: toSet(IS.SHORTLISTED),
  [IS.OFFERED]: toSet(IS.INTERVIEWING),
};

export const HEADER_SYSTEM_ONLY_TRANSITIONS: Readonly<
  Partial<Record<RequisitionStatus, ReadonlySet<RequisitionStatus>>>
> = {
  [RS.ACTIVE]: toSet(RS.FULFILLED),
};

export const ITEM_SYSTEM_ONLY_TRANSITIONS: Readonly<
  Partial<Record<RequisitionItemStatus, ReadonlySet<RequisitionItemStatus>>>
> = {
  [IS.PENDING]: toSet(IS.SOURCING),
};

const HR = SystemRole.HR;
const TA = SystemRole.TA;
const AD = SystemRole.ADMIN;
const MG = SystemRole.MANAGER;
const SY = SystemRole.SYSTEM;

type HKey = `${RequisitionStatus}|${RequisitionStatus}`;
type IKey = `${RequisitionItemStatus}|${RequisitionItemStatus}`;

function h(a: RequisitionStatus, b: RequisitionStatus): HKey {
  return `${a}|${b}`;
}
function i(a: RequisitionItemStatus, b: RequisitionItemStatus): IKey {
  return `${a}|${b}`;
}

const froz = (...roles: SystemRoleName[]) => new Set(roles);

const HEADER_TRANSITION_AUTHORITY: ReadonlyMap<HKey, ReadonlySet<SystemRoleName>> =
  new Map([
 [h(RS.DRAFT, RS.PENDING_BUDGET), froz(MG)],
    [h(RS.DRAFT, RS.CANCELLED), froz(MG, AD)],
    [h(RS.PENDING_BUDGET, RS.PENDING_HR), froz(MG, AD, HR)],
    [h(RS.PENDING_BUDGET, RS.REJECTED), froz(MG, AD)],
    [h(RS.PENDING_BUDGET, RS.CANCELLED), froz(MG, AD)],
    [h(RS.PENDING_HR, RS.ACTIVE), froz(HR, AD)],
    [h(RS.PENDING_HR, RS.REJECTED), froz(HR, AD)],
    [h(RS.PENDING_HR, RS.CANCELLED), froz(MG, HR, AD)],
    [h(RS.ACTIVE, RS.FULFILLED), froz(SY)],
    [h(RS.ACTIVE, RS.CANCELLED), froz(MG, HR, AD)],
    [h(RS.REJECTED, RS.DRAFT), froz(MG, AD)],
  ]);

const ITEM_TRANSITION_AUTHORITY: ReadonlyMap<IKey, ReadonlySet<SystemRoleName>> =
  new Map([
    [i(IS.PENDING, IS.SOURCING), froz(SY)],
    [i(IS.PENDING, IS.CANCELLED), froz(MG, HR, AD)],
    [i(IS.SOURCING, IS.SHORTLISTED), froz(TA, AD)],
    [i(IS.SOURCING, IS.CANCELLED), froz(MG, HR, TA, AD)],
    [i(IS.SHORTLISTED, IS.INTERVIEWING), froz(TA, AD)],
    [i(IS.SHORTLISTED, IS.SOURCING), froz(TA, AD)],
    [i(IS.SHORTLISTED, IS.CANCELLED), froz(MG, HR, TA, AD)],
    [i(IS.INTERVIEWING, IS.OFFERED), froz(TA, HR, AD)],
    [i(IS.INTERVIEWING, IS.SHORTLISTED), froz(TA, AD)],
    [i(IS.INTERVIEWING, IS.CANCELLED), froz(MG, HR, TA, AD)],
    [i(IS.OFFERED, IS.FULFILLED), froz(HR, TA)],
    [i(IS.OFFERED, IS.INTERVIEWING), froz(TA, HR, AD)],
    [i(IS.OFFERED, IS.CANCELLED), froz(MG, HR, TA, AD)],
  ]);

export const ITEM_BUDGET_EDIT_AUTHORITY = froz(MG, HR, AD);
export const ITEM_BUDGET_APPROVE_AUTHORITY = froz(MG, HR, AD);
export const ITEM_BUDGET_REJECT_AUTHORITY = froz(MG, HR, AD);

export const ITEM_BUDGET_EDITABLE_HEADER_STATES = new Set<RequisitionStatus>([
  RS.DRAFT,
  RS.PENDING_BUDGET,
]);

export const ITEM_BUDGET_APPROVABLE_HEADER_STATES = new Set<RequisitionStatus>([
  RS.PENDING_BUDGET,
]);

export const ITEM_STATUS_CHANGE_ALLOWED_HEADER_STATES = new Set<RequisitionStatus>([
  RS.ACTIVE,
]);

export const ALL_REQUISITION_STATUS_VALUES = new Set<string>(REQUISITION_STATUSES);
export const ALL_ITEM_STATUS_VALUES = new Set<string>(ITEM_STATUSES);

export function isValidHeaderTransition(
  fromStatus: RequisitionStatus,
  toStatus: RequisitionStatus,
): boolean {
  return HEADER_TRANSITIONS[fromStatus]?.has(toStatus) ?? false;
}

export function isValidItemTransition(
  fromStatus: RequisitionItemStatus,
  toStatus: RequisitionItemStatus,
): boolean {
  return ITEM_TRANSITIONS[fromStatus]?.has(toStatus) ?? false;
}

export function isHeaderTerminal(status: RequisitionStatus): boolean {
  return HEADER_TERMINAL_STATES.has(status);
}

export function isItemTerminal(status: RequisitionItemStatus): boolean {
  return ITEM_TERMINAL_STATES.has(status);
}

export function isBackwardItemTransition(
  fromStatus: RequisitionItemStatus,
  toStatus: RequisitionItemStatus,
): boolean {
  return ITEM_BACKWARD_TRANSITIONS[fromStatus]?.has(toStatus) ?? false;
}

export function isSystemOnlyHeaderTransition(
  fromStatus: RequisitionStatus,
  toStatus: RequisitionStatus,
): boolean {
  return HEADER_SYSTEM_ONLY_TRANSITIONS[fromStatus]?.has(toStatus) ?? false;
}

export function isSystemOnlyItemTransition(
  fromStatus: RequisitionItemStatus,
  toStatus: RequisitionItemStatus,
): boolean {
  return ITEM_SYSTEM_ONLY_TRANSITIONS[fromStatus]?.has(toStatus) ?? false;
}

export function getHeaderAuthorizedRoles(
  fromStatus: RequisitionStatus,
  toStatus: RequisitionStatus,
): ReadonlySet<SystemRoleName> {
  return HEADER_TRANSITION_AUTHORITY.get(h(fromStatus, toStatus)) ?? new Set();
}

export function getItemAuthorizedRoles(
  fromStatus: RequisitionItemStatus,
  toStatus: RequisitionItemStatus,
): ReadonlySet<SystemRoleName> {
  return ITEM_TRANSITION_AUTHORITY.get(i(fromStatus, toStatus)) ?? new Set();
}
