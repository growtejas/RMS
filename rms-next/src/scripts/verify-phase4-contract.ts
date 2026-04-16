import postgres from "postgres";

type ViolationRow = {
  candidate_id: number;
  requisition_item_id?: number | null;
  current_stage?: string | null;
  reason?: string | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = postgres(url, { max: 1 });
  try {
    const missingApplications = (await sql.unsafe(`
      select
        c.candidate_id,
        c.requisition_item_id,
        c.current_stage
      from candidates c
      left join applications a on a.candidate_id = c.candidate_id
      where a.application_id is null
      order by c.candidate_id
    `)) as ViolationRow[];

    const missingHistory = (await sql.unsafe(`
      select
        a.candidate_id,
        a.requisition_item_id,
        a.current_stage
      from applications a
      left join application_stage_history h on h.application_id = a.application_id
      where h.history_id is null
      order by a.application_id
    `)) as ViolationRow[];

    const stageDrift = (await sql.unsafe(`
      select
        c.candidate_id,
        c.requisition_item_id,
        c.current_stage
      from candidates c
      inner join applications a on a.candidate_id = c.candidate_id
      where c.current_stage <> a.current_stage
      order by c.candidate_id
    `)) as ViolationRow[];

    const inboundToApplicationChain = await sql.unsafe(`
      select
        ie.inbound_event_id,
        a.application_id,
        count(h.history_id) as history_rows
      from inbound_events ie
      inner join audit_log al
        on al.entity_name = 'candidate'
        and al.new_value like ('%inbound_event_id=' || ie.inbound_event_id || '%')
      inner join candidates c
        on c.candidate_id = nullif(al.entity_id, '')::int
      inner join applications a
        on a.candidate_id = c.candidate_id
      left join application_stage_history h
        on h.application_id = a.application_id
      where ie.status = 'processed'
      group by ie.inbound_event_id, a.application_id
      order by ie.inbound_event_id desc
      limit 10
    `);

    const hasStageMoveHistory = (await sql.unsafe(`
      select exists (
        select 1
        from application_stage_history
        group by application_id
        having count(*) >= 2
      ) as ok
    `)) as unknown as Array<{ ok: boolean }>;

    const counts = await sql.unsafe(`
      select
        (select count(*) from candidates) as candidates_count,
        (select count(*) from applications) as applications_count,
        (select count(*) from application_stage_history) as history_count
    `);

    const [summary] = counts as unknown as Array<{
      candidates_count: string;
      applications_count: string;
      history_count: string;
    }>;

    console.log("Phase 4 contract summary:");
    console.log({
      candidates_count: Number(summary?.candidates_count ?? 0),
      applications_count: Number(summary?.applications_count ?? 0),
      history_count: Number(summary?.history_count ?? 0),
      missing_applications: missingApplications.length,
      missing_history: missingHistory.length,
      stage_drift: stageDrift.length,
      inbound_chain_rows: inboundToApplicationChain.length,
      has_stage_move_history: Boolean(hasStageMoveHistory[0]?.ok),
    });

    const integrationFailures: string[] = [];
    if (inboundToApplicationChain.length === 0) {
      integrationFailures.push(
        "No inbound->candidate->application chain found. Run one public_apply ingest.",
      );
    }
    if (!Boolean(hasStageMoveHistory[0]?.ok)) {
      integrationFailures.push(
        "No application with >=2 history rows found. Run one stage move API call.",
      );
    }

    if (
      missingApplications.length ||
      missingHistory.length ||
      stageDrift.length ||
      integrationFailures.length
    ) {
      if (missingApplications.length) {
        console.error("Violation: candidates missing applications", missingApplications);
      }
      if (missingHistory.length) {
        console.error("Violation: applications missing stage history", missingHistory);
      }
      if (stageDrift.length) {
        console.error("Violation: candidate/application stage mismatch", stageDrift);
      }
      if (integrationFailures.length) {
        console.error("Integration check failures:", integrationFailures);
      }
      process.exitCode = 1;
      return;
    }

    console.log("Phase 4 contract OK");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Phase 4 contract check failed:", message);
  process.exit(1);
});
