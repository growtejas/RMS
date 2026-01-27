// components/hr/SkillsOverview.tsx
import React from "react";

interface SkillCapability {
  skillName: string;
  totalEmployees: number;
  proficiency: {
    junior: number;
    mid: number;
    senior: number;
  };
}

const skillsData: SkillCapability[] = [
  {
    skillName: "React",
    totalEmployees: 18,
    proficiency: { junior: 6, mid: 8, senior: 4 },
  },
  {
    skillName: "TypeScript",
    totalEmployees: 14,
    proficiency: { junior: 4, mid: 6, senior: 4 },
  },
  {
    skillName: "Node.js",
    totalEmployees: 11,
    proficiency: { junior: 3, mid: 5, senior: 3 },
  },
  {
    skillName: "QA Automation",
    totalEmployees: 9,
    proficiency: { junior: 2, mid: 5, senior: 2 },
  },
];

const SkillsOverview: React.FC = () => {
  return (
    <>
      {/* Page Header
      <div className="manager-header">
        <h2>Skills & Capability Overview</h2>
        <p className="subtitle">
          Organization-wide visibility into employee skills and proficiency.
        </p>
      </div> */}

      {/* Search */}
      <div className="log-filters">
        <div className="filter-group">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search skill (e.g. React, Java, QA)..."
            />
          </div>
        </div>
      </div>

      {/* Skills Table */}
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
            {skillsData.map((skill) => (
              <tr key={skill.skillName}>
                <td>
                  <strong>{skill.skillName}</strong>
                </td>

                <td>{skill.totalEmployees}</td>

                <td>{skill.proficiency.junior}</td>

                <td>{skill.proficiency.mid}</td>

                <td>{skill.proficiency.senior}</td>
              </tr>
            ))}

            {skillsData.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">No skills found.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default SkillsOverview;
