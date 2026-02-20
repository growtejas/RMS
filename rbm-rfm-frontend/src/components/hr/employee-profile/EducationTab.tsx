import React, { useState } from "react";
import { EmployeeEducation } from "./types";

type EducationTabProps = {
  education: EmployeeEducation[];
  onAdd: (payload: {
    qualification: string;
    specialization?: string | null;
    institution?: string | null;
    year_completed?: number | null;
  }) => Promise<void>;
  onUpdate: (
    eduId: number,
    payload: Partial<EmployeeEducation>,
  ) => Promise<void>;
  onDelete: (eduId: number) => Promise<void>;
  isSaving: boolean;
};

const EducationTab: React.FC<EducationTabProps> = ({
  education,
  onAdd,
  onUpdate,
  onDelete,
  isSaving,
}) => {
  const [formState, setFormState] = useState({
    qualification: "",
    specialization: "",
    institution: "",
    year_completed: "",
  });

  const handleAdd = async () => {
    if (!formState.qualification.trim()) return;
    await onAdd({
      qualification: formState.qualification.trim(),
      specialization: formState.specialization.trim() || null,
      institution: formState.institution.trim() || null,
      year_completed: formState.year_completed
        ? Number(formState.year_completed)
        : null,
    });
    setFormState({
      qualification: "",
      specialization: "",
      institution: "",
      year_completed: "",
    });
  };

  return (
    <div className="form-section active">
      <div className="section-header">
        <h2>
          <span className="section-icon">4</span> Education
        </h2>
        <p className="section-subtitle">Qualifications and institutions.</p>
      </div>
      <div className="section-content">
        {education.length === 0 && (
          <div className="education-empty">
            <p>No education records found.</p>
          </div>
        )}

        <div className="education-list">
          {education.map((edu) => (
            <div key={edu.edu_id} className="education-item">
              <input
                value={edu.qualification}
                readOnly
                disabled
                placeholder="Qualification"
              />
              <input
                value={edu.institution ?? ""}
                onChange={(event) =>
                  onUpdate(edu.edu_id, { institution: event.target.value })
                }
                placeholder="Institution"
                disabled={isSaving}
              />
              <input
                value={edu.specialization ?? ""}
                onChange={(event) =>
                  onUpdate(edu.edu_id, { specialization: event.target.value })
                }
                placeholder="Specialization"
                disabled={isSaving}
              />
              <input
                className="year-input"
                value={edu.year_completed ?? ""}
                onChange={(event) =>
                  onUpdate(edu.edu_id, {
                    year_completed: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                placeholder="Year"
                disabled={isSaving}
              />
              <button
                type="button"
                className="remove-contact-button"
                onClick={() => onDelete(edu.edu_id)}
                disabled={isSaving}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="section-divider" />

        <div className="section-header-row">
          <h3>Add Education</h3>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Degree / Qualification</label>
            <input
              value={formState.qualification}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  qualification: event.target.value,
                }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="form-field">
            <label>Specialization</label>
            <input
              value={formState.specialization}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  specialization: event.target.value,
                }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="form-field">
            <label>Institution</label>
            <input
              value={formState.institution}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  institution: event.target.value,
                }))
              }
              disabled={isSaving}
            />
          </div>
          <div className="form-field">
            <label>Year completed</label>
            <input
              value={formState.year_completed}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  year_completed: event.target.value,
                }))
              }
              placeholder="e.g. 2020"
              disabled={isSaving}
            />
          </div>
        </div>
        <div className="form-actions-row">
          <button
            type="button"
            className="add-item-button"
            onClick={handleAdd}
            disabled={isSaving || !formState.qualification.trim()}
          >
            {isSaving ? "Saving..." : "Add Education"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EducationTab);
