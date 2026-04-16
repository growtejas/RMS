CREATE TABLE "ranking_snapshots" (
	"snapshot_id" serial PRIMARY KEY NOT NULL,
	"requisition_item_id" integer NOT NULL,
	"requisition_id" integer NOT NULL,
	"ranking_version" varchar(40) NOT NULL,
	"keyword_weight" numeric(5, 4) DEFAULT '0.5500' NOT NULL,
	"business_weight" numeric(5, 4) DEFAULT '0.4500' NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_requisition_item_id_requisition_items_item_id_fk" FOREIGN KEY ("requisition_item_id") REFERENCES "public"."requisition_items"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_requisition_id_requisitions_req_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("req_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ranking_snapshots_item_generatedat" ON "ranking_snapshots" USING btree ("requisition_item_id","generated_at");--> statement-breakpoint
CREATE INDEX "idx_ranking_snapshots_req_generatedat" ON "ranking_snapshots" USING btree ("requisition_id","generated_at");