"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";

import { HrEmptyState } from "@/components/hr/HrEmptyState";
import { HrPaginationBar } from "@/components/hr/HrPaginationBar";
import { HrToolbarCard } from "@/components/hr/HrToolbarCard";
import { useHrSkillsSummaryQuery } from "@/hooks/hr/use-hr-queries";

const PAGE_SIZE = 15;

const SkillsOverview: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const skillsQuery = useHrSkillsSummaryQuery(true);
  const skillsRows = skillsQuery.data;
  const isLoading = skillsQuery.isPending;
  const error =
    skillsQuery.error instanceof Error
      ? skillsQuery.error.message
      : skillsQuery.isError
        ? "Failed to load skills"
        : null;

  const filteredSkills = useMemo(() => {
    const skillsData = skillsRows ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return skillsData;
    return skillsData.filter((skill) =>
      skill.skillName.toLowerCase().includes(q),
    );
  }, [skillsRows, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const pagedSkills = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredSkills.slice(start, start + PAGE_SIZE);
  }, [filteredSkills, page]);

  return (
    <>
      <HrToolbarCard>
        <div className="log-filters">
          <div className="filter-group">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search skill (e.g. React, Java, QA)..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </div>
      </HrToolbarCard>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Total Employees</th>
              <th>Junior</th>
              <th>Mid</th>
              <th>Senior</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5}>
                  <div className="tickets-empty-state">Loading skills…</div>
                </td>
              </tr>
            )}

            {!isLoading && error && (
              <tr>
                <td colSpan={5}>
                  <div
                    className="tickets-empty-state"
                    style={{ color: "var(--error)" }}
                  >
                    {error}
                  </div>
                </td>
              </tr>
            )}

            {!isLoading &&
              !error &&
              pagedSkills.map((skill) => (
                <tr key={skill.skillId}>
                  <td>
                    <strong>{skill.skillName}</strong>
                  </td>

                  <td>{skill.totalEmployees}</td>

                  <td>{skill.proficiency.junior}</td>

                  <td>{skill.proficiency.mid}</td>

                  <td>{skill.proficiency.senior}</td>
                </tr>
              ))}

            {!isLoading && !error && filteredSkills.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6">
                  <HrEmptyState
                    icon={Layers}
                    title="No skills match your search"
                    description="Try a different keyword or clear the search box."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!isLoading && !error && filteredSkills.length > 0 && (
          <div className="mt-4 px-1">
            <HrPaginationBar
              page={page}
              pageSize={PAGE_SIZE}
              total={filteredSkills.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default SkillsOverview;
