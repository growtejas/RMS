CREATE TABLE "candidate_embeddings" (
	"candidate_embedding_id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"requisition_id" integer NOT NULL,
	"provider" varchar(50) DEFAULT 'local-hash' NOT NULL,
	"model" varchar(80) DEFAULT 'hash-v1' NOT NULL,
	"embedding_dim" integer NOT NULL,
	"embedding" jsonb NOT NULL,
	"source_text" text NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_item_embeddings" (
	"requisition_item_embedding_id" serial PRIMARY KEY NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"requisition_id" integer NOT NULL,
	"provider" varchar(50) DEFAULT 'local-hash' NOT NULL,
	"model" varchar(80) DEFAULT 'hash-v1' NOT NULL,
	"embedding_dim" integer NOT NULL,
	"embedding" jsonb NOT NULL,
	"source_text" text NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_candidate_id_candidates_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("candidate_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_requisition_item_id_requisition_items_item_id_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_requisition_id_requisitions_req_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("req_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_item_embeddings" ADD CONSTRAINT "requisition_item_embeddings_requisition_item_id_requisition_items_item_id_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_item_embeddings" ADD CONSTRAINT "requisition_item_embeddings_requisition_id_requisitions_req_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("req_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidate_embeddings_candidate" ON "candidate_embeddings" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_embeddings_item" ON "candidate_embeddings" USING btree ("requisition_item_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_embeddings_req" ON "candidate_embeddings" USING btree ("requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_requisition_item_embeddings_item" ON "requisition_item_embeddings" USING btree ("requisition_item_id");--> statement-breakpoint
CREATE INDEX "idx_requisition_item_embeddings_req" ON "requisition_item_embeddings" USING btree ("requisition_id");