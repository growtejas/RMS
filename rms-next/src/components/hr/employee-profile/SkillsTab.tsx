import React, { useCallback } from "react";
import SkillSelector from "../create-employee/SkillSelector";
import type { SkillInput } from "../create-employee/types";
import { EmployeeSkill, SkillCatalog } from "./types";

type SkillsTabProps = {
  skills: EmployeeSkill[];
  catalog: SkillCatalog[];
  onAdd: (payload: {
    skill_id: number;
    proficiency_level: string;
    years_experience: number;
  }) => Promise<void>;
  onRemove: (skillId: number) => Promise<void>;
  isSaving: boolean;
};

const SkillsTab: React.FC<SkillsTabProps> = ({
  skills,
  catalog,
  onAdd,
  onRemove,
  isSaving,
}) => {
  const selectedSkills: SkillInput[] = skills.map((s) => ({
    skill_id: s.skill_id,
    proficiency_level: (s.proficiency_level as SkillInput["proficiency_level"]) ?? "Junior",
    years_experience: s.years_experience ?? 0,
  }));

  const handleAdd = useCallback(
    (payload: SkillInput) =>
      onAdd({
        skill_id: payload.skill_id,
        proficiency_level: payload.proficiency_level,
        years_experience: payload.years_experience,
      }),
    [onAdd],
  );

  const getSkillName = (skillId: number) =>
    catalog.find((s) => s.skill_id === skillId)?.skill_name ?? `Skill #${skillId}`;

  return (
    <div className="form-section active">
      <div className="section-header">
        <h2>
          <span className="section-icon">2</span> Skills
        </h2>
        <p className="section-subtitle">Skills, proficiency, and experience.</p>
      </div>
      <div className="section-content">
        <div className="skills-matrix">
          <h3>Current skills</h3>
          {skills.length === 0 && (
            <div className="skills-loading">No skills added yet.</div>
          )}
          {skills.map((skill) => (
            <div key={skill.skill_id} className="skill-item">
              <div>
                <strong>{getSkillName(skill.skill_id)}</strong>
              </div>
              <div>{skill.proficiency_level ?? "—"}</div>
              <div>{skill.years_experience ?? 0} years</div>
              <button
                type="button"
                className="remove-contact-button"
                onClick={() => onRemove(skill.skill_id)}
                disabled={isSaving}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="section-divider" />

        <SkillSelector
          catalog={catalog}
          selectedSkills={selectedSkills}
          onAdd={handleAdd}
          isDisabled={isSaving}
        />
      </div>
    </div>
  );
};

export default React.memo(SkillsTab);
