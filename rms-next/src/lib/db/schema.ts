import {
  pgTable,
  integer,
  varchar,
  boolean,
  timestamp,
  primaryKey,
  text,
  serial,
  date,
  numeric,
  index,
} from "drizzle-orm/pg-core";

/** Mirrors `backend/db/models/auth.py` + Alembic `users` / `roles` / `user_roles`. */
export const users = pgTable("users", {
  userId: serial("user_id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  isActive: boolean("is_active"),
  createdAt: timestamp("created_at", { mode: "date" }),
  lastLogin: timestamp("last_login", { mode: "date" }),
  employeeId: varchar("employee_id", { length: 20 }),
});

export const roles = pgTable("roles", {
  roleId: serial("role_id").primaryKey(),
  roleName: varchar("role_name", { length: 30 }).notNull().unique(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.roleId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export type UserRow = typeof users.$inferSelect;

/** `backend/db/models/company_role.py` — before `employees` for FK reference. */
export const companyRoles = pgTable("company_roles", {
  roleId: serial("role_id").primaryKey(),
  roleName: varchar("role_name", { length: 100 }).notNull().unique(),
  roleDescription: text("role_description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** `backend/db/models/employee.py` */
export const employees = pgTable("employees", {
  empId: varchar("emp_id", { length: 20 }).primaryKey(),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  rbmEmail: varchar("rbm_email", { length: 100 }).notNull(),
  dob: date("dob", { mode: "date" }),
  gender: varchar("gender", { length: 10 }),
  doj: date("doj", { mode: "date" }),
  empStatus: varchar("emp_status", { length: 20 }).notNull().default("Onboarding"),
  companyRoleId: integer("company_role_id").references(() => companyRoles.roleId),
});

/** `backend/db/models/user_employee_map.py` */
export const userEmployeeMap = pgTable(
  "user_employee_map",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    empId: varchar("emp_id", { length: 20 })
      .notNull()
      .references(() => employees.empId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.empId] })],
);

/** `backend/db/models/employee_contact.py` */
export const employeeContacts = pgTable(
  "employee_contacts",
  {
    empId: varchar("emp_id", { length: 20 })
      .notNull()
      .references(() => employees.empId),
    contactType: varchar("contact_type", { length: 20 }).notNull(),
    email: varchar("email", { length: 100 }),
    phone: varchar("phone", { length: 15 }),
    address: text("address"),
  },
  (t) => [primaryKey({ columns: [t.empId, t.contactType] })],
);

/** `backend/db/models/employee_education.py` */
export const employeeEducation = pgTable("employee_education", {
  eduId: serial("edu_id").primaryKey(),
  empId: varchar("emp_id", { length: 20 })
    .notNull()
    .references(() => employees.empId),
  qualification: varchar("qualification", { length: 100 }),
  specialization: varchar("specialization", { length: 100 }),
  institution: varchar("institution", { length: 100 }),
  yearCompleted: integer("year_completed"),
});

/** `backend/db/models/employee_finance.py` */
export const employeeFinance = pgTable("employee_finance", {
  empId: varchar("emp_id", { length: 20 })
    .primaryKey()
    .references(() => employees.empId, { onDelete: "cascade" }),
  bankDetails: text("bank_details"),
  taxId: varchar("tax_id", { length: 50 }),
});

/** `backend/db/models/requisition.py` */
export const requisitions = pgTable(
  "requisitions",
  {
    reqId: serial("req_id").primaryKey(),
    version: integer("version").notNull().default(1),
    raisedBy: integer("raised_by")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    assignedTa: integer("assigned_ta").references(() => users.userId, {
      onDelete: "restrict",
    }),
    budgetApprovedBy: integer("budget_approved_by").references(
      () => users.userId,
      { onDelete: "restrict" },
    ),
    approvedBy: integer("approved_by").references(() => users.userId, {
      onDelete: "restrict",
    }),
    projectName: varchar("project_name", { length: 100 }),
    clientName: varchar("client_name", { length: 100 }),
    justification: text("justification"),
    managerNotes: text("manager_notes"),
    rejectionReason: text("rejection_reason"),
    jdFileKey: text("jd_file_key"),
    priority: varchar("priority", { length: 10 }),
    isReplacement: boolean("is_replacement").notNull().default(false),
    duration: varchar("duration", { length: 50 }),
    workMode: varchar("work_mode", { length: 10 }),
    officeLocation: varchar("office_location", { length: 100 }),
    budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }),
    requiredByDate: date("required_by_date", { mode: "date" }),
    overallStatus: varchar("overall_status", { length: 30 }).notNull(),
    approvalHistory: timestamp("approval_history", { mode: "date" }),
    assignedAt: timestamp("assigned_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_requisitions_status_reqid_desc").on(t.overallStatus, t.reqId),
    index("idx_requisitions_raisedby_reqid_desc").on(t.raisedBy, t.reqId),
    index("idx_requisitions_assignedta_reqid_desc").on(t.assignedTa, t.reqId),
  ],
);

/** `backend/db/models/requisition_item.py` */
export const requisitionItems = pgTable(
  "requisition_items",
  {
    itemId: serial("item_id").primaryKey(),
    version: integer("version").notNull().default(1),
    reqId: integer("req_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "restrict" }),
    rolePosition: varchar("role_position", { length: 50 }).notNull(),
    jobDescription: text("job_description").notNull(),
    jdFileKey: text("jd_file_key"),
    skillLevel: varchar("skill_level", { length: 30 }),
    experienceYears: integer("experience_years"),
    educationRequirement: varchar("education_requirement", { length: 100 }),
    requirements: text("requirements"),
    assignedEmpId: varchar("assigned_emp_id", { length: 20 }).references(
      () => employees.empId,
      { onDelete: "restrict" },
    ),
    replacementHire: boolean("replacement_hire").notNull().default(false),
    replacedEmpId: varchar("replaced_emp_id", { length: 20 }).references(
      () => employees.empId,
      { onDelete: "restrict" },
    ),
    assignedTa: integer("assigned_ta").references(() => users.userId, {
      onDelete: "restrict",
    }),
    hrNotes: text("hr_notes"),
    taNotes: text("ta_notes"),
    estimatedBudget: numeric("estimated_budget", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    approvedBudget: numeric("approved_budget", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    itemStatus: varchar("item_status", { length: 20 }).notNull(),
  },
  (t) => [
    index("idx_requisition_items_reqid_itemid").on(t.reqId, t.itemId),
    index("idx_requisition_items_assignedta_reqid").on(t.assignedTa, t.reqId),
    index("idx_requisition_items_status").on(t.itemStatus),
  ],
);

/** `backend/db/models/candidate.py` */
export const candidates = pgTable(
  "candidates",
  {
    candidateId: serial("candidate_id").primaryKey(),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    resumePath: text("resume_path"),
    currentStage: varchar("current_stage", { length: 20 })
      .notNull()
      .default("Sourced"),
    addedBy: integer("added_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    index("idx_candidates_item_stage_createdat").on(
      t.requisitionItemId,
      t.currentStage,
      t.createdAt,
    ),
    index("idx_candidates_req_createdat").on(t.requisitionId, t.createdAt),
  ],
);

/** `backend/db/models/interview.py` */
export const interviews = pgTable(
  "interviews",
  {
    id: serial("id").primaryKey(),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.candidateId, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    interviewerName: varchar("interviewer_name", { length: 150 }).notNull(),
    scheduledAt: timestamp("scheduled_at", { mode: "date" }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("Scheduled"),
    result: varchar("result", { length: 20 }),
    feedback: text("feedback"),
    conductedBy: integer("conducted_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("idx_interviews_candidate_round").on(t.candidateId, t.roundNumber)],
);

/** `backend/db/models/requisition_status_history.py` */
export const requisitionStatusHistory = pgTable(
  "requisition_status_history",
  {
    historyId: serial("history_id").primaryKey(),
    reqId: integer("req_id")
      .notNull()
      .references(() => requisitions.reqId),
    oldStatus: varchar("old_status", { length: 50 }).notNull(),
    newStatus: varchar("new_status", { length: 50 }).notNull(),
    justification: text("justification"),
    changedBy: integer("changed_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { mode: "date" }),
  },
  (t) => [
    index("idx_req_status_hist_reqid_changedat").on(t.reqId, t.changedAt),
    index("idx_req_status_hist_newstatus_reqid_changedat").on(
      t.newStatus,
      t.reqId,
      t.changedAt,
    ),
  ],
);

/** `backend/db/models/workflow_audit.py` */
export const workflowTransitionAudit = pgTable(
  "workflow_transition_audit",
  {
    auditId: serial("audit_id").primaryKey(),
    entityType: varchar("entity_type", { length: 30 }).notNull(),
    entityId: integer("entity_id").notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    fromStatus: varchar("from_status", { length: 30 }).notNull(),
    toStatus: varchar("to_status", { length: 30 }).notNull(),
    versionBefore: integer("version_before").notNull(),
    versionAfter: integer("version_after").notNull(),
    performedBy: integer("performed_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    userRoles: varchar("user_roles", { length: 200 }),
    reason: text("reason"),
    transitionMetadata: text("transition_metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_wta_entity_createdat").on(t.entityType, t.entityId, t.createdAt),
    index("idx_wta_performedby_createdat").on(t.performedBy, t.createdAt),
    index("idx_wta_createdat").on(t.createdAt),
  ],
);

/** `backend/db/models/employee_availability.py` */
export const employeeAvailability = pgTable(
  "employee_availability",
  {
    empId: varchar("emp_id", { length: 20 })
      .notNull()
      .references(() => employees.empId),
    effectiveFrom: date("effective_from", { mode: "date" }).notNull(),
    availabilityPct: integer("availability_pct").notNull(),
  },
  (t) => [primaryKey({ columns: [t.empId, t.effectiveFrom] })],
);

/** `backend/db/models/skill.py` */
export const skills = pgTable("skills", {
  skillId: serial("skill_id").primaryKey(),
  skillName: varchar("skill_name", { length: 50 }).notNull().unique(),
  normalizedName: varchar("normalized_name", { length: 50 }).notNull().unique(),
  isVerified: boolean("is_verified").notNull().default(false),
  createdBy: integer("created_by"),
});

/** `backend/db/models/employee_skill.py` */
export const employeeSkills = pgTable(
  "employee_skills",
  {
    empId: varchar("emp_id", { length: 20 })
      .notNull()
      .references(() => employees.empId),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.skillId),
    proficiencyLevel: varchar("proficiency_level", { length: 20 }),
    yearsExperience: numeric("years_experience", { precision: 4, scale: 1 }),
  },
  (t) => [primaryKey({ columns: [t.empId, t.skillId] })],
);

/** `backend/db/models/department.py` */
export const departments = pgTable("departments", {
  departmentId: serial("department_id").primaryKey(),
  departmentName: varchar("department_name", { length: 50 }).notNull().unique(),
});

/** `backend/db/models/location.py` */
export const locations = pgTable("locations", {
  locationId: serial("location_id").primaryKey(),
  city: varchar("city", { length: 50 }),
  country: varchar("country", { length: 50 }),
});

/** `backend/db/models/employee_assignment.py` */
export const employeeAssignments = pgTable("employee_assignments", {
  assignmentId: serial("assignment_id").primaryKey(),
  empId: varchar("emp_id", { length: 20 })
    .notNull()
    .references(() => employees.empId),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.departmentId),
  managerId: varchar("manager_id", { length: 20 }).references(() => employees.empId),
  locationId: integer("location_id").references(() => locations.locationId),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }),
});

/** `backend/db/models/audit_log.py` (columns used by reference-data reads). */
export const auditLog = pgTable(
  "audit_log",
  {
    auditId: serial("audit_id").primaryKey(),
    entityName: varchar("entity_name", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 50 }),
    action: varchar("action", { length: 20 }).notNull(),
    performedBy: integer("performed_by"),
    targetUserId: integer("target_user_id"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    performedAt: timestamp("performed_at", { mode: "date" }),
  },
  (t) => [
    index("idx_audit_log_performedat").on(t.performedAt),
    index("idx_audit_log_performedby_performedat").on(t.performedBy, t.performedAt),
    index("idx_audit_log_targetuser_performedat").on(t.targetUserId, t.performedAt),
    index("idx_audit_log_entity").on(t.entityName, t.entityId),
  ],
);
