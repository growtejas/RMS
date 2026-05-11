/**
 * Canonical CIE role taxonomy (code-backed; exposed via GET /api/cie/role-catalog).
 * Used to map LLM free-text titles to stable roleId slugs for search and navigation.
 */

export type RoleMaster = {
  id: string;
  displayName: string;
  aliases: string[];
};

const R: RoleMaster[] = [
  {
    id: "data_engineer",
    displayName: "Data Engineer",
    aliases: ["ETL Engineer", "Big Data Engineer", "Data Platform Engineer", "ETL Developer"],
  },
  {
    id: "analytics_engineer",
    displayName: "Analytics Engineer",
    aliases: ["Data Analytics Engineer", "Product Analytics Engineer"],
  },
  {
    id: "data_scientist",
    displayName: "Data Scientist",
    aliases: ["Applied Scientist", "Research Scientist", "ML Scientist"],
  },
  {
    id: "machine_learning_engineer",
    displayName: "Machine Learning Engineer",
    aliases: ["ML Engineer", "MLOps Engineer", "AI Engineer", "Deep Learning Engineer"],
  },
  {
    id: "data_analyst",
    displayName: "Data Analyst",
    aliases: ["Business Data Analyst", "BI Analyst", "Reporting Analyst"],
  },
  {
    id: "business_analyst",
    displayName: "Business Analyst",
    aliases: ["Functional Analyst", "Requirements Analyst"],
  },
  {
    id: "product_analyst",
    displayName: "Product Analyst",
    aliases: ["Growth Analyst"],
  },
  {
    id: "software_engineer",
    displayName: "Software Engineer",
    aliases: ["SWE", "Application Developer", "Programmer"],
  },
  {
    id: "backend_engineer",
    displayName: "Backend Engineer",
    aliases: ["Back-end Engineer", "Server-side Engineer", "API Engineer"],
  },
  {
    id: "frontend_engineer",
    displayName: "Frontend Engineer",
    aliases: ["Front-end Engineer", "UI Engineer", "Web Developer"],
  },
  {
    id: "fullstack_engineer",
    displayName: "Full Stack Engineer",
    aliases: ["Full-Stack Developer", "Full Stack Developer"],
  },
  {
    id: "mobile_engineer",
    displayName: "Mobile Engineer",
    aliases: ["iOS Developer", "Android Developer", "Mobile Developer"],
  },
  {
    id: "devops_engineer",
    displayName: "DevOps Engineer",
    aliases: ["SRE", "Site Reliability Engineer", "Platform Engineer", "Infrastructure Engineer"],
  },
  {
    id: "cloud_engineer",
    displayName: "Cloud Engineer",
    aliases: ["AWS Engineer", "Azure Engineer", "GCP Engineer"],
  },
  {
    id: "security_engineer",
    displayName: "Security Engineer",
    aliases: ["Application Security Engineer", "Cybersecurity Engineer"],
  },
  {
    id: "qa_engineer",
    displayName: "QA Engineer",
    aliases: ["Quality Assurance Engineer", "Test Engineer", "SDET"],
  },
  {
    id: "database_administrator",
    displayName: "Database Administrator",
    aliases: ["DBA", "Database Engineer"],
  },
  {
    id: "solutions_architect",
    displayName: "Solutions Architect",
    aliases: ["Technical Architect", "Enterprise Architect"],
  },
  {
    id: "engineering_manager",
    displayName: "Engineering Manager",
    aliases: ["Software Engineering Manager", "EM", "Development Manager"],
  },
  {
    id: "tech_lead",
    displayName: "Tech Lead",
    aliases: ["Technical Lead", "Lead Engineer", "Team Lead"],
  },
  {
    id: "product_manager",
    displayName: "Product Manager",
    aliases: ["PM", "Technical Product Manager", "TPM"],
  },
  {
    id: "project_manager",
    displayName: "Project Manager",
    aliases: ["Program Manager", "Delivery Manager"],
  },
  {
    id: "scrum_master",
    displayName: "Scrum Master",
    aliases: ["Agile Coach"],
  },
  {
    id: "ux_designer",
    displayName: "UX Designer",
    aliases: ["User Experience Designer"],
  },
  {
    id: "ui_designer",
    displayName: "UI Designer",
    aliases: ["Visual Designer"],
  },
  {
    id: "product_designer",
    displayName: "Product Designer",
    aliases: ["UX/UI Designer"],
  },
  {
    id: "business_intelligence_developer",
    displayName: "BI Developer",
    aliases: ["Business Intelligence Developer", "Power BI Developer", "Tableau Developer"],
  },
  {
    id: "salesforce_developer",
    displayName: "Salesforce Developer",
    aliases: ["SFDC Developer", "Salesforce Engineer"],
  },
  {
    id: "network_engineer",
    displayName: "Network Engineer",
    aliases: ["Network Administrator"],
  },
  {
    id: "systems_administrator",
    displayName: "Systems Administrator",
    aliases: ["Sysadmin", "IT Administrator"],
  },
  {
    id: "support_engineer",
    displayName: "Support Engineer",
    aliases: ["Technical Support Engineer", "Customer Support Engineer"],
  },
  {
    id: "sales_engineer",
    displayName: "Sales Engineer",
    aliases: ["Solutions Consultant", "Pre-Sales Engineer"],
  },
  {
    id: "data_architect",
    displayName: "Data Architect",
    aliases: ["Information Architect"],
  },
  {
    id: "nlp_engineer",
    displayName: "NLP Engineer",
    aliases: ["Natural Language Processing Engineer", "LLM Engineer"],
  },
  {
    id: "computer_vision_engineer",
    displayName: "Computer Vision Engineer",
    aliases: ["CV Engineer", "Vision ML Engineer"],
  },
  {
    id: "blockchain_developer",
    displayName: "Blockchain Developer",
    aliases: ["Web3 Developer", "Solidity Developer"],
  },
  {
    id: "embedded_engineer",
    displayName: "Embedded Software Engineer",
    aliases: ["Firmware Engineer", "Embedded Systems Engineer"],
  },
  {
    id: "game_developer",
    displayName: "Game Developer",
    aliases: ["Game Programmer"],
  },
  {
    id: "technical_writer",
    displayName: "Technical Writer",
    aliases: ["Documentation Engineer", "API Writer"],
  },
  {
    id: "data_product_manager",
    displayName: "Data Product Manager",
    aliases: ["Analytics Product Manager"],
  },
];

export const ROLE_CATALOG: RoleMaster[] = R;

const byId = new Map<string, RoleMaster>();
const normKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const aliasToId = new Map<string, string>();

for (const role of ROLE_CATALOG) {
  byId.set(role.id.toLowerCase(), role);
  aliasToId.set(normKey(role.displayName), role.id);
  for (const a of role.aliases) {
    aliasToId.set(normKey(a), role.id);
  }
}

export function resolveCieSuitableRoleMinConfidence(): number {
  const raw = process.env.CIE_SUITABLE_ROLE_MIN_CONFIDENCE?.trim();
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Lowercase slug from arbitrary title text (fallback canonical id). */
export function slugifyRole(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

export function getRoleById(roleId: string): RoleMaster | null {
  if (!roleId?.trim()) return null;
  return byId.get(roleId.trim().toLowerCase()) ?? null;
}

export function canonicalizeRoleName(name: string): {
  roleId: string;
  displayName: string;
  matched: boolean;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { roleId: "unknown_role", displayName: "Unknown", matched: false };
  }
  const nk = normKey(trimmed);
  const idHit = aliasToId.get(nk);
  if (idHit) {
    const master = byId.get(idHit.toLowerCase());
    if (master) {
      return { roleId: master.id, displayName: master.displayName, matched: true };
    }
  }
  const slug = slugifyRole(trimmed);
  if (byId.has(slug)) {
    const master = byId.get(slug)!;
    return { roleId: master.id, displayName: master.displayName, matched: true };
  }
  return { roleId: slug, displayName: trimmed, matched: false };
}

/** Lowercased display + alias strings for SQL legacy-string matching. */
export function roleMatchStringsForId(roleId: string): string[] {
  const master = getRoleById(roleId);
  if (!master) return [];
  const out = new Set<string>();
  out.add(normKey(master.displayName));
  for (const a of master.aliases) {
    out.add(normKey(a));
  }
  return Array.from(out);
}

/**
 * Typeahead: return role ids whose displayName or alias contains q (case-insensitive).
 */
export function findRoleIdsForQuery(q: string): string[] {
  const needle = normKey(q);
  if (!needle) return [];
  const hits: string[] = [];
  for (const role of ROLE_CATALOG) {
    if (normKey(role.displayName).includes(needle)) {
      hits.push(role.id);
      continue;
    }
    if (role.aliases.some((a) => normKey(a).includes(needle))) {
      hits.push(role.id);
    }
  }
  return hits;
}
