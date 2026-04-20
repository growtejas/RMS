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
  uniqueIndex,
  uuid,
  jsonb,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "free",
  "pro",
  "enterprise",
]);

/** Multi-tenant root entity for ATS expansion. */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  domain: varchar("domain", { length: 120 }),
  settings: jsonb("settings"),
  googleOauthTokens: jsonb("google_oauth_tokens"),
  subscriptionPlan: subscriptionPlanEnum("subscription_plan")
    .notNull()
    .default("free"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

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

/** User ↔ organization membership; primary org drives JWT `org_id` unless overridden. */
export const organizationMembers = pgTable(
  "organization_members",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.organizationId] })],
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
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("idx_requisitions_status_reqid_desc").on(t.overallStatus, t.reqId),
    index("idx_requisitions_raisedby_reqid_desc").on(t.raisedBy, t.reqId),
    index("idx_requisitions_assignedta_reqid_desc").on(t.assignedTa, t.reqId),
    index("idx_requisitions_organization_reqid_desc").on(t.organizationId, t.reqId),
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
    /** When true, ranking uses manager/requisition JD PDFs only; when false, uses pipeline overrides below. */
    pipelineRankingUseRequisitionJd: boolean("pipeline_ranking_use_requisition_jd")
      .notNull()
      .default(true),
    /** TA/HR-entered JD text for candidate ranking (used when not using requisition JD). */
    pipelineJdText: text("pipeline_jd_text"),
    /** Optional PDF stored like manager JD; extracted for ranking when not using requisition JD. */
    pipelineJdFileKey: text("pipeline_jd_file_key"),
    /** Optional explicit skill list for ATS V1 ranking; else derived from `requirements`. */
    rankingRequiredSkills: jsonb("ranking_required_skills").$type<string[] | null>(),
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

/**
 * Global identity per organization (normalized email). Multiple `candidates` rows
 * (one per requisition line) may reference the same person.
 */
export const candidatePersons = pgTable(
  "candidate_persons",
  {
    personId: serial("person_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    emailNormalized: varchar("email_normalized", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_candidate_persons_org_email").on(
      t.organizationId,
      t.emailNormalized,
    ),
    index("idx_candidate_persons_org").on(t.organizationId),
  ],
);

/** `backend/db/models/candidate.py` */
export const candidates = pgTable(
  "candidates",
  {
    candidateId: serial("candidate_id").primaryKey(),
    personId: integer("person_id")
      .notNull()
      .references(() => candidatePersons.personId, { onDelete: "restrict" }),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    currentCompany: varchar("current_company", { length: 200 }),
    resumePath: text("resume_path"),
    currentStage: varchar("current_stage", { length: 20 })
      .notNull()
      .default("Sourced"),
    addedBy: integer("added_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    totalExperienceYears: numeric("total_experience_years", {
      precision: 5,
      scale: 2,
    }),
    noticePeriodDays: integer("notice_period_days"),
    isReferral: boolean("is_referral").notNull().default(false),
    candidateSkills: jsonb("candidate_skills").$type<string[] | null>(),
    educationRaw: text("education_raw"),
    /** SHA-256 hex of normalized resume text (for dedupe + parse cache invalidation). */
    resumeContentHash: varchar("resume_content_hash", { length: 64 }),
    /** Versioned JSON cache of last `ParsedResumeArtifact` for ranking (avoids re-parsing). */
    resumeParseCache: jsonb("resume_parse_cache").$type<Record<string, unknown> | null>(),
    /** Same requisition line + org: another candidate row with identical resume hash (flag-only dedupe). */
    duplicateResumeOfCandidateId: integer("duplicate_resume_of_candidate_id").references(
      (): AnyPgColumn => candidates.candidateId,
      { onDelete: "set null" },
    ),
    /**
     * Canonical structured resume (schema_version in JSON). Null when disabled or not yet extracted.
     * @see rms-next/src/lib/services/resume-structure/resume-structure.schema.ts
     */
    resumeStructuredProfile: jsonb("resume_structured_profile").$type<Record<string, unknown> | null>(),
    /** ready | pending | failed — async LLM refinement; null when unused. */
    resumeStructureStatus: varchar("resume_structure_status", { length: 20 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("idx_candidates_item_stage_createdat").on(
      t.requisitionItemId,
      t.currentStage,
      t.createdAt,
    ),
    index("idx_candidates_req_createdat").on(t.requisitionId, t.createdAt),
    index("idx_candidates_org_item").on(t.organizationId, t.requisitionItemId),
    uniqueIndex("uq_candidates_org_item_person").on(
      t.organizationId,
      t.requisitionItemId,
      t.personId,
    ),
    index("idx_candidates_org_item_resume_hash").on(
      t.organizationId,
      t.requisitionItemId,
      t.resumeContentHash,
    ),
    index("idx_candidates_resume_structure_status").on(t.resumeStructureStatus),
  ],
);

/** Phase 4 core ATS record: one application per candidate for a job line. */
export const applications = pgTable(
  "applications",
  {
    applicationId: serial("application_id").primaryKey(),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.candidateId, { onDelete: "cascade" }),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "cascade" }),
    currentStage: varchar("current_stage", { length: 20 }).notNull().default("Sourced"),
    source: varchar("source", { length: 50 }).notNull().default("manual"),
    createdBy: integer("created_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    /** ATS quality bucket from last ranking run (BEST | VERY_GOOD | GOOD | AVERAGE | NOT_SUITABLE). */
    atsBucket: varchar("ats_bucket", { length: 30 }),
  },
  (t) => [
    uniqueIndex("uq_applications_candidate").on(t.candidateId),
    index("idx_applications_item_stage_createdat").on(
      t.requisitionItemId,
      t.currentStage,
      t.createdAt,
    ),
    index("idx_applications_req_createdat").on(t.requisitionId, t.createdAt),
    index("idx_applications_org_item").on(t.organizationId, t.requisitionItemId),
    index("idx_applications_org_item_ats_bucket").on(
      t.organizationId,
      t.requisitionItemId,
      t.atsBucket,
    ),
  ],
);

/** Immutable stage movement log for applications. */
export const applicationStageHistory = pgTable(
  "application_stage_history",
  {
    historyId: serial("history_id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.applicationId, { onDelete: "cascade" }),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.candidateId, { onDelete: "cascade" }),
    fromStage: varchar("from_stage", { length: 20 }),
    toStage: varchar("to_stage", { length: 20 }).notNull(),
    changedBy: integer("changed_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    changedAt: timestamp("changed_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_application_stage_history_app_changedat").on(t.applicationId, t.changedAt),
    index("idx_application_stage_history_candidate_changedat").on(t.candidateId, t.changedAt),
  ],
);

/** Canonical skill names for ATS V1 alias resolution (docs/ATS §9.3). */
export const skillAliases = pgTable(
  "skill_aliases",
  {
    aliasId: serial("alias_id").primaryKey(),
    canonicalSkill: varchar("canonical_skill", { length: 100 }).notNull(),
    alias: varchar("alias", { length: 100 }).notNull().unique(),
  },
  (t) => [index("idx_skill_aliases_canonical").on(t.canonicalSkill)],
);

/** Versioned ranking config per requisition item (docs/ATS §6). */
export const rankingVersions = pgTable(
  "ranking_versions",
  {
    rankingVersionId: serial("ranking_version_id").primaryKey(),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    config: jsonb("config").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ranking_versions_item_version_unique").on(
      t.requisitionItemId,
      t.versionNumber,
    ),
    index("idx_ranking_versions_item_active").on(t.requisitionItemId, t.isActive),
  ],
);

/** Per-candidate score for a ranking version (docs/ATS §5). */
export const candidateJobScores = pgTable(
  "candidate_job_scores",
  {
    scoreId: serial("score_id").primaryKey(),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.candidateId, { onDelete: "cascade" }),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    rankingVersionId: integer("ranking_version_id")
      .notNull()
      .references(() => rankingVersions.rankingVersionId, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    breakdown: jsonb("breakdown").notNull(),
    computedAt: timestamp("computed_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("candidate_job_scores_unique").on(
      t.candidateId,
      t.rankingVersionId,
    ),
    index("idx_candidate_job_scores_item_score").on(t.requisitionItemId, t.score),
  ],
);

/** Phase 5 ranking snapshots for fast reads and deterministic auditability. */
export const rankingSnapshots = pgTable(
  "ranking_snapshots",
  {
    snapshotId: serial("snapshot_id").primaryKey(),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "cascade" }),
    rankingVersion: varchar("ranking_version", { length: 40 }).notNull(),
    keywordWeight: numeric("keyword_weight", { precision: 5, scale: 4 })
      .notNull()
      .default("0.5500"),
    semanticWeight: numeric("semantic_weight", { precision: 5, scale: 4 })
      .notNull()
      .default("0.0000"),
    businessWeight: numeric("business_weight", { precision: 5, scale: 4 })
      .notNull()
      .default("0.4500"),
    payload: jsonb("payload").notNull(),
    generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ranking_snapshots_item_generatedat").on(t.requisitionItemId, t.generatedAt),
    index("idx_ranking_snapshots_req_generatedat").on(t.requisitionId, t.generatedAt),
  ],
);

/** Cached AI evaluation (structured) per requisition item + candidate + input hash. */
export const candidateAiEvaluations = pgTable(
  "candidate_ai_evaluations",
  {
    evaluationId: serial("evaluation_id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.candidateId, { onDelete: "cascade" }),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 40 }).notNull(),
    aiScore: numeric("ai_score", { precision: 6, scale: 2 }).notNull(),
    breakdown: jsonb("breakdown").notNull(),
    summary: text("summary").notNull(),
    risks: jsonb("risks").$type<string[]>().notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    rawError: text("raw_error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_candidate_ai_eval_item_candidate_hash").on(
      t.requisitionItemId,
      t.candidateId,
      t.inputHash,
    ),
    index("idx_candidate_ai_eval_org_item").on(t.organizationId, t.requisitionItemId),
    index("idx_candidate_ai_eval_candidate").on(t.candidateId),
  ],
);

/** Candidate embedding cache for semantic ranking. */
export const candidateEmbeddings = pgTable(
  "candidate_embeddings",
  {
    candidateEmbeddingId: serial("candidate_embedding_id").primaryKey(),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.candidateId, { onDelete: "cascade" }),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull().default("local-hash"),
    model: varchar("model", { length: 80 }).notNull().default("hash-v1"),
    embeddingDim: integer("embedding_dim").notNull(),
    embedding: jsonb("embedding").notNull(),
    sourceText: text("source_text").notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_candidate_embeddings_candidate").on(t.candidateId),
    index("idx_candidate_embeddings_item").on(t.requisitionItemId),
    index("idx_candidate_embeddings_req").on(t.requisitionId),
  ],
);

/** Requisition-item embedding cache for semantic ranking. */
export const requisitionItemEmbeddings = pgTable(
  "requisition_item_embeddings",
  {
    requisitionItemEmbeddingId: serial("requisition_item_embedding_id").primaryKey(),
    requisitionItemId: integer("requisition_item_id")
      .notNull()
      .references(() => requisitionItems.itemId, { onDelete: "cascade" }),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.reqId, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull().default("local-hash"),
    model: varchar("model", { length: 80 }).notNull().default("hash-v1"),
    embeddingDim: integer("embedding_dim").notNull(),
    embedding: jsonb("embedding").notNull(),
    sourceText: text("source_text").notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_requisition_item_embeddings_item").on(t.requisitionItemId),
    index("idx_requisition_item_embeddings_req").on(t.requisitionId),
  ],
);

/** ATS ingestion event ledger (webhook-first, no direct candidate writes). */
export const inboundEvents = pgTable(
  "inbound_events",
  {
    inboundEventId: serial("inbound_event_id").primaryKey(),
    source: varchar("source", { length: 50 }).notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(5),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { mode: "date" }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { mode: "date" }),
    dedupeReview: jsonb("dedupe_review"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("uq_inbound_events_source_external").on(t.source, t.externalId),
    index("idx_inbound_events_status_receivedat").on(t.status, t.receivedAt),
  ],
);

/** Resume parsing artifacts captured during ingestion pipeline processing. */
export const resumeParseArtifacts = pgTable(
  "resume_parse_artifacts",
  {
    resumeParseArtifactId: serial("resume_parse_artifact_id").primaryKey(),
    inboundEventId: integer("inbound_event_id")
      .notNull()
      .references(() => inboundEvents.inboundEventId, { onDelete: "cascade" }),
    parserProvider: varchar("parser_provider", { length: 50 }).notNull(),
    parserVersion: varchar("parser_version", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("processed"),
    sourceResumeRef: text("source_resume_ref"),
    rawText: text("raw_text"),
    parsedData: jsonb("parsed_data").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_resume_parse_artifacts_eventid").on(t.inboundEventId),
    index("idx_resume_parse_artifacts_status").on(t.status),
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

/** Configurable pipeline stage labels per org (requisition_item / application stages). */
export const pipelineStageDefinitions = pgTable(
  "pipeline_stage_definitions",
  {
    id: serial("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stageKey: varchar("stage_key", { length: 40 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isTerminal: boolean("is_terminal").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pipeline_stage_definitions_org_stage_unique").on(
      t.organizationId,
      t.stageKey,
    ),
  ],
);

/** ATS automation hooks (thresholds, SLA reminders); evaluated by workers / services. */
export const atsAutomationRules = pgTable(
  "ats_automation_rules",
  {
    id: serial("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    trigger: varchar("trigger", { length: 80 }).notNull(),
    config: jsonb("config").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("idx_ats_automation_rules_org_active").on(t.organizationId, t.isActive)],
);

export const interviewPanelists = pgTable(
  "interview_panelists",
  {
    id: serial("id").primaryKey(),
    interviewId: integer("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.userId, { onDelete: "set null" }),
    displayName: varchar("display_name", { length: 150 }).notNull(),
    roleLabel: varchar("role_label", { length: 80 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (t) => [index("idx_interview_panelists_interview").on(t.interviewId)],
);

export const interviewScorecards = pgTable(
  "interview_scorecards",
  {
    id: serial("id").primaryKey(),
    interviewId: integer("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    panelistId: integer("panelist_id").references(() => interviewPanelists.id, {
      onDelete: "set null",
    }),
    scores: jsonb("scores").notNull().default({}),
    notes: text("notes"),
    submittedBy: integer("submitted_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("idx_interview_scorecards_interview").on(t.interviewId)],
);

export const bulkImportJobs = pgTable(
  "bulk_import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    payload: jsonb("payload"),
    resultSummary: jsonb("result_summary"),
    errorMessage: text("error_message"),
    createdBy: integer("created_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_bulk_import_jobs_org_status").on(t.organizationId, t.status, t.createdAt),
  ],
);

export const notificationEvents = pgTable(
  "notification_events",
  {
    id: serial("id").primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    payload: jsonb("payload").notNull(),
    channel: varchar("channel", { length: 20 }).notNull().default("email"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notification_events_org_status").on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
  ],
);

export const candidatePortalTokens = pgTable(
  "candidate_portal_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.applicationId, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("idx_candidate_portal_tokens_app").on(t.applicationId)],
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
