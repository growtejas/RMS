CREATE TABLE "audit_log" (
	"audit_id" serial PRIMARY KEY NOT NULL,
	"entity_name" varchar(50) NOT NULL,
	"entity_id" varchar(50),
	"action" varchar(20) NOT NULL,
	"performed_by" integer,
	"target_user_id" integer,
	"old_value" text,
	"new_value" text,
	"performed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"candidate_id" serial PRIMARY KEY NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"requisition_id" integer NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"resume_path" text,
	"current_stage" varchar(20) DEFAULT 'Sourced' NOT NULL,
	"added_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_roles" (
	"role_id" serial PRIMARY KEY NOT NULL,
	"role_name" varchar(100) NOT NULL,
	"role_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_roles_role_name_unique" UNIQUE("role_name")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"department_id" serial PRIMARY KEY NOT NULL,
	"department_name" varchar(50) NOT NULL,
	CONSTRAINT "departments_department_name_unique" UNIQUE("department_name")
);
--> statement-breakpoint
CREATE TABLE "employee_assignments" (
	"assignment_id" serial PRIMARY KEY NOT NULL,
	"emp_id" varchar(20) NOT NULL,
	"department_id" integer NOT NULL,
	"manager_id" varchar(20),
	"location_id" integer,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "employee_availability" (
	"emp_id" varchar(20) NOT NULL,
	"effective_from" date NOT NULL,
	"availability_pct" integer NOT NULL,
	CONSTRAINT "employee_availability_emp_id_effective_from_pk" PRIMARY KEY("emp_id","effective_from")
);
--> statement-breakpoint
CREATE TABLE "employee_contacts" (
	"emp_id" varchar(20) NOT NULL,
	"contact_type" varchar(20) NOT NULL,
	"email" varchar(100),
	"phone" varchar(15),
	"address" text,
	CONSTRAINT "employee_contacts_emp_id_contact_type_pk" PRIMARY KEY("emp_id","contact_type")
);
--> statement-breakpoint
CREATE TABLE "employee_education" (
	"edu_id" serial PRIMARY KEY NOT NULL,
	"emp_id" varchar(20) NOT NULL,
	"qualification" varchar(100),
	"specialization" varchar(100),
	"institution" varchar(100),
	"year_completed" integer
);
--> statement-breakpoint
CREATE TABLE "employee_finance" (
	"emp_id" varchar(20) PRIMARY KEY NOT NULL,
	"bank_details" text,
	"tax_id" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "employee_skills" (
	"emp_id" varchar(20) NOT NULL,
	"skill_id" integer NOT NULL,
	"proficiency_level" varchar(20),
	"years_experience" numeric(4, 1),
	CONSTRAINT "employee_skills_emp_id_skill_id_pk" PRIMARY KEY("emp_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"emp_id" varchar(20) PRIMARY KEY NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"rbm_email" varchar(100) NOT NULL,
	"dob" date,
	"gender" varchar(10),
	"doj" date,
	"emp_status" varchar(20) DEFAULT 'Onboarding' NOT NULL,
	"company_role_id" integer
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"interviewer_name" varchar(150) NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'Scheduled' NOT NULL,
	"result" varchar(20),
	"feedback" text,
	"conducted_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"location_id" serial PRIMARY KEY NOT NULL,
	"city" varchar(50),
	"country" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "requisition_items" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"req_id" integer NOT NULL,
	"role_position" varchar(50) NOT NULL,
	"job_description" text NOT NULL,
	"jd_file_key" text,
	"skill_level" varchar(30),
	"experience_years" integer,
	"education_requirement" varchar(100),
	"requirements" text,
	"assigned_emp_id" varchar(20),
	"replacement_hire" boolean DEFAULT false NOT NULL,
	"replaced_emp_id" varchar(20),
	"assigned_ta" integer,
	"hr_notes" text,
	"ta_notes" text,
	"estimated_budget" numeric(12, 2) DEFAULT '0' NOT NULL,
	"approved_budget" numeric(12, 2),
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"item_status" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_status_history" (
	"history_id" serial PRIMARY KEY NOT NULL,
	"req_id" integer NOT NULL,
	"old_status" varchar(50) NOT NULL,
	"new_status" varchar(50) NOT NULL,
	"justification" text,
	"changed_by" integer,
	"changed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"req_id" serial PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"raised_by" integer NOT NULL,
	"assigned_ta" integer,
	"budget_approved_by" integer,
	"approved_by" integer,
	"project_name" varchar(100),
	"client_name" varchar(100),
	"justification" text,
	"manager_notes" text,
	"rejection_reason" text,
	"jd_file_key" text,
	"priority" varchar(10),
	"is_replacement" boolean DEFAULT false NOT NULL,
	"duration" varchar(50),
	"work_mode" varchar(10),
	"office_location" varchar(100),
	"budget_amount" numeric(12, 2),
	"required_by_date" date,
	"overall_status" varchar(30) NOT NULL,
	"approval_history" timestamp,
	"assigned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"role_id" serial PRIMARY KEY NOT NULL,
	"role_name" varchar(30) NOT NULL,
	CONSTRAINT "roles_role_name_unique" UNIQUE("role_name")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"skill_id" serial PRIMARY KEY NOT NULL,
	"skill_name" varchar(50) NOT NULL,
	"normalized_name" varchar(50) NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	CONSTRAINT "skills_skill_name_unique" UNIQUE("skill_name"),
	CONSTRAINT "skills_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "user_employee_map" (
	"user_id" integer NOT NULL,
	"emp_id" varchar(20) NOT NULL,
	CONSTRAINT "user_employee_map_user_id_emp_id_pk" PRIMARY KEY("user_id","emp_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar NOT NULL,
	"is_active" boolean,
	"created_at" timestamp,
	"last_login" timestamp,
	"employee_id" varchar(20),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workflow_transition_audit" (
	"audit_id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"from_status" varchar(30) NOT NULL,
	"to_status" varchar(30) NOT NULL,
	"version_before" integer NOT NULL,
	"version_after" integer NOT NULL,
	"performed_by" integer,
	"user_roles" varchar(200),
	"reason" text,
	"transition_metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_requisition_item_id_requisition_items_item_id_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_requisition_id_requisitions_req_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("req_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_added_by_users_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_department_id_departments_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("department_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_manager_id_employees_emp_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("emp_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_location_id_locations_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_contacts" ADD CONSTRAINT "employee_contacts_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_finance" ADD CONSTRAINT "employee_finance_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_skill_id_skills_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("skill_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_role_id_company_roles_role_id_fk" FOREIGN KEY ("company_role_id") REFERENCES "public"."company_roles"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidates_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("candidate_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_conducted_by_users_user_id_fk" FOREIGN KEY ("conducted_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_req_id_requisitions_req_id_fk" FOREIGN KEY ("req_id") REFERENCES "public"."requisitions"("req_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_assigned_emp_id_employees_emp_id_fk" FOREIGN KEY ("assigned_emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_replaced_emp_id_employees_emp_id_fk" FOREIGN KEY ("replaced_emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_assigned_ta_users_user_id_fk" FOREIGN KEY ("assigned_ta") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_status_history" ADD CONSTRAINT "requisition_status_history_req_id_requisitions_req_id_fk" FOREIGN KEY ("req_id") REFERENCES "public"."requisitions"("req_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_status_history" ADD CONSTRAINT "requisition_status_history_changed_by_users_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_raised_by_users_user_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_assigned_ta_users_user_id_fk" FOREIGN KEY ("assigned_ta") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_budget_approved_by_users_user_id_fk" FOREIGN KEY ("budget_approved_by") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_approved_by_users_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_employee_map" ADD CONSTRAINT "user_employee_map_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_employee_map" ADD CONSTRAINT "user_employee_map_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_audit" ADD CONSTRAINT "workflow_transition_audit_performed_by_users_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_performedat" ON "audit_log" USING btree ("performed_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_performedby_performedat" ON "audit_log" USING btree ("performed_by","performed_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_targetuser_performedat" ON "audit_log" USING btree ("target_user_id","performed_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity" ON "audit_log" USING btree ("entity_name","entity_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_item_stage_createdat" ON "candidates" USING btree ("requisition_item_id","current_stage","created_at");--> statement-breakpoint
CREATE INDEX "idx_candidates_req_createdat" ON "candidates" USING btree ("requisition_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_interviews_candidate_round" ON "interviews" USING btree ("candidate_id","round_number");--> statement-breakpoint
CREATE INDEX "idx_requisition_items_reqid_itemid" ON "requisition_items" USING btree ("req_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_requisition_items_assignedta_reqid" ON "requisition_items" USING btree ("assigned_ta","req_id");--> statement-breakpoint
CREATE INDEX "idx_requisition_items_status" ON "requisition_items" USING btree ("item_status");--> statement-breakpoint
CREATE INDEX "idx_req_status_hist_reqid_changedat" ON "requisition_status_history" USING btree ("req_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_req_status_hist_newstatus_reqid_changedat" ON "requisition_status_history" USING btree ("new_status","req_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_requisitions_status_reqid_desc" ON "requisitions" USING btree ("overall_status","req_id");--> statement-breakpoint
CREATE INDEX "idx_requisitions_raisedby_reqid_desc" ON "requisitions" USING btree ("raised_by","req_id");--> statement-breakpoint
CREATE INDEX "idx_requisitions_assignedta_reqid_desc" ON "requisitions" USING btree ("assigned_ta","req_id");--> statement-breakpoint
CREATE INDEX "idx_wta_entity_createdat" ON "workflow_transition_audit" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_wta_performedby_createdat" ON "workflow_transition_audit" USING btree ("performed_by","created_at");--> statement-breakpoint
CREATE INDEX "idx_wta_createdat" ON "workflow_transition_audit" USING btree ("created_at");