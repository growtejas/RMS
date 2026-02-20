import React, { useMemo, useState } from "react";
import type { ProficiencyLevel, SkillInput, SkillOption } from "./types";

const LEVELS: { label: string; value: ProficiencyLevel }[] = [
  { label: "Junior", value: "Junior" },
  { label: "Mid", value: "Mid" },
  { label: "Senior", value: "Senior" },
];

type SkillSelectorProps = {
  catalog: SkillOption[];
  selectedSkills: SkillInput[];
  onAdd: (payload: SkillInput) => void;
  isDisabled: boolean;
};

const SkillSelector: React.FC<SkillSelectorProps> = ({
  catalog,
  selectedSkills,
  onAdd,
  isDisabled,
}) => {
  const [search, setSearch] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [level, setLevel] = useState<ProficiencyLevel>("Junior");
  const [years, setYears] = useState("1");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const availableSkills = useMemo(() => {
    const taken = new Set(selectedSkills.map((skill) => skill.skill_id));
    return catalog.filter((skill) => !taken.has(skill.skill_id));
  }, [catalog, selectedSkills]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return availableSkills.slice(0, 50);
    return availableSkills.filter((skill) =>
      skill.skill_name.toLowerCase().includes(query),
    );
  }, [availableSkills, search]);

  const selectedSkill = useMemo(
    () => availableSkills.find((s) => s.skill_id === selectedSkillId),
    [availableSkills, selectedSkillId],
  );

  const handleAdd = () => {
    if (!selectedSkillId) return;
    onAdd({
      skill_id: selectedSkillId,
      proficiency_level: level,
      years_experience: Number(years) || 0,
    });
    setSelectedSkillId(null);
    setSearch("");
    setYears("1");
    setDropdownOpen(false);
  };

  const handleSelectSkill = (skillId: number) => {
    setSelectedSkillId(skillId);
    const skill = availableSkills.find((s) => s.skill_id === skillId);
    if (skill) setSearch(skill.skill_name);
    setDropdownOpen(false);
  };

  return (
    <div className="skill-selector">
      <div className="add-skill-dropdown-row">
        <div className="form-field add-skill-dropdown-wrap">
          <label>Add Skill</label>
          <div className="searchable-dropdown">
            <input
              placeholder="Select or search a skill..."
              value={selectedSkill ? selectedSkill.skill_name : search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (!selectedSkillId) setDropdownOpen(true);
                else setSelectedSkillId(null);
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => {
                setTimeout(() => setDropdownOpen(false), 150);
              }}
              disabled={isDisabled}
            />
            <span className="dropdown-chevron" aria-hidden>
              ▼
            </span>
            {dropdownOpen && (
              <div className="dropdown-options">
                {filteredOptions.length === 0 ? (
                  <div className="dropdown-option dropdown-empty">
                    {availableSkills.length === 0
                      ? "All skills added"
                      : "No matching skills"}
                  </div>
                ) : (
                  filteredOptions.map((skill) => (
                    <button
                      key={skill.skill_id}
                      type="button"
                      className={`dropdown-option ${
                        selectedSkillId === skill.skill_id ? "selected" : ""
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSkill(skill.skill_id);
                      }}
                      disabled={isDisabled}
                    >
                      <span>{skill.skill_name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="form-field add-skill-proficiency">
          <label>Proficiency</label>
          <select
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as ProficiencyLevel)
            }
            disabled={isDisabled}
          >
            {LEVELS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field add-skill-years">
          <label>Years</label>
          <input
            type="number"
            min={0}
            max={50}
            value={years}
            onChange={(event) => setYears(event.target.value)}
            disabled={isDisabled}
            placeholder="0"
          />
        </div>

        <div className="form-field add-skill-button-wrap">
          <label>&nbsp;</label>
          <button
            type="button"
            className="add-item-button"
            onClick={handleAdd}
            disabled={isDisabled || !selectedSkillId}
          >
            Add Skill
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SkillSelector);
