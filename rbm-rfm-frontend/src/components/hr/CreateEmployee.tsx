import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { employeeService } from "../../api/employeeService";
import "../../styles/hr/create-employee.css";

// Types for our complex data structure
interface EmployeeListEntry {
  emp_id: string;
}

interface Skill {
  id: number;
  name: string;
  category: string;
}

interface Department {
  id: number;
  name: string;
}

interface Role {
  id: number;
  title: string;
}

interface Manager {
  id: number;
  full_name: string;
}

interface Location {
  id: number;
  name: string;
  city: string;
}

interface Contact {
  id?: number;
  type: "work" | "personal" | "emergency";
  email: string;
  phone: string;
  address: string;
}

interface EmployeeSkill {
  skill_id: number;
  proficiency_level: "Junior" | "Mid" | "Senior";
  years_experience: number;
}

interface Education {
  qualification: string;
  specialization: string;
  institution: string;
  year_completed: string;
}

const formatEmployeeId = (nextNumber: number) =>
  `RBM-${String(nextNumber).padStart(4, "0")}`;

const getNextEmployeeNumber = (entries: EmployeeListEntry[]) => {
  const taken = new Set<number>();
  entries.forEach((emp) => {
    const match = emp.emp_id?.match(/\d+/);
    const value = match ? Number(match[0]) : 0;
    if (Number.isFinite(value) && value > 0) {
      taken.add(value);
    }
  });

  let candidate = 1;
  while (taken.has(candidate)) {
    candidate += 1;
  }
  return candidate;
};

const getTodayDate = () =>
  new Date().toISOString().split("T")[0] ?? new Date().toISOString();

const CreateEmployee: React.FC = () => {
  // Step navigation
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Basic employee info
  const [empId, setEmpId] = useState(formatEmployeeId(1));
  const [fullName, setFullName] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [doj, setDoj] = useState("");

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([
    { type: "work", email: "", phone: "", address: "" },
  ]);

  // Skills & Education
  const [skills, setSkills] = useState<EmployeeSkill[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [skillSearch, setSkillSearch] = useState("");

  // Utilization & Deployment
  const [availabilityPct, setAvailabilityPct] = useState<number>(100);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(getTodayDate());
  const [managerId, setManagerId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  // Restricted Data
  const [bankDetails, setBankDetails] = useState("");
  const [taxId, setTaxId] = useState("");

  // Dropdown data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);

  // Fetch dropdown data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [employeesRes, skillsRes, departmentsRes, locationsRes] =
          await Promise.all([
            apiClient.get<EmployeeListEntry[]>("/employees/employees"),
            apiClient.get<{ skill_id: number; skill_name: string }[]>(
              "/skills/",
            ),
            apiClient.get<{ department_id: number; department_name: string }[]>(
              "/departments/",
            ),
            apiClient.get<
              { location_id: number; city?: string; country?: string }[]
            >("/locations/"),
          ]);

        const employeeList = employeesRes.data ?? [];
        const nextNumber = getNextEmployeeNumber(employeeList);
        setEmpId(formatEmployeeId(nextNumber));

        const skills = (skillsRes.data ?? []).map((skill) => ({
          id: skill.skill_id,
          name: skill.skill_name,
          category: "General",
        }));
        const departments = (departmentsRes.data ?? []).map((dept) => ({
          id: dept.department_id,
          name: dept.department_name,
        }));
        const locations = (locationsRes.data ?? []).map((loc) => ({
          id: loc.location_id,
          name: [loc.city, loc.country].filter(Boolean).join(", ") || "—",
          city: loc.city ?? "—",
        }));

        setAvailableSkills(skills);
        setDepartments(departments);
        setRoles([]);
        setManagers([]);
        setLocations(locations);
      } catch (err) {
        setError("Failed to load initial data. Please refresh the page.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Step validation
  const isStep1Valid = useMemo(() => {
    return fullName.trim().length > 0 && departmentId;
  }, [fullName, departmentId]);

  const isStep2Valid = useMemo(() => {
    // At least one contact with valid email
    const hasValidContact = contacts.some((contact) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return contact.email && emailRegex.test(contact.email);
    });
    return hasValidContact;
  }, [contacts]);

  const isStep3Valid = useMemo(() => {
    return availabilityPct >= 0 && availabilityPct <= 100;
  }, [availabilityPct]);

  // Step navigation handlers
  const goToNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Contact management
  const addContact = () => {
    setContacts([
      ...contacts,
      { type: "work", email: "", phone: "", address: "" },
    ]);
  };

  const updateContact = (
    index: number,
    field: "type" | "email" | "phone" | "address",
    value: string,
  ) => {
    const updatedContacts: Contact[] = [...contacts];
    const current =
      updatedContacts[index] ??
      ({ type: "work", email: "", phone: "", address: "" } as Contact);
    if (field === "type") {
      updatedContacts[index] = {
        ...current,
        type: value as Contact["type"],
      };
    } else {
      updatedContacts[index] = {
        ...current,
        [field]: value,
      };
    }
    setContacts(updatedContacts);
  };

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  // Skills management
  const addSkill = async (
    skillId: number,
    proficiency: "Junior" | "Mid" | "Senior",
    years: number,
  ) => {
    if (skills.some((s) => s.skill_id === skillId)) {
      setError("This skill has already been added");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const isValidSkill = await employeeService.verifySkill(skillId);
    if (!isValidSkill) {
      setError("Selected skill is no longer available.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setSkills([
      ...skills,
      {
        skill_id: skillId,
        proficiency_level: proficiency,
        years_experience: years,
      },
    ]);
    setSkillSearch("");
    setShowSkillDropdown(false);
  };

  const removeSkill = (skillId: number) => {
    setSkills(skills.filter((s) => s.skill_id !== skillId));
  };

  const updateSkillYears = (skillId: number, years: number) => {
    setSkills(
      skills.map((skill) =>
        skill.skill_id === skillId
          ? { ...skill, years_experience: years }
          : skill,
      ),
    );
  };

  // Education management
  const addEducation = () => {
    setEducation([
      ...education,
      {
        qualification: "",
        specialization: "",
        institution: "",
        year_completed: "",
      },
    ]);
  };

  const updateEducation = (
    index: number,
    field: keyof Education,
    value: string,
  ) => {
    const updatedEducation: Education[] = [...education];
    updatedEducation[index] = {
      ...updatedEducation[index],
      [field]: value,
    } as Education;
    setEducation(updatedEducation);
  };

  const removeEducation = (index: number) => {
    setEducation(education.filter((_, i) => i !== index));
  };

  // Filter skills based on search
  const filteredSkills = useMemo(() => {
    return availableSkills
      .filter((skill) =>
        skill.name.toLowerCase().includes(skillSearch.toLowerCase()),
      )
      .slice(0, 5); // Limit to 5 results for dropdown
  }, [availableSkills, skillSearch]);

  // Form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isStep1Valid || !isStep2Valid || !isStep3Valid) {
      setError("Please complete all required fields in the previous steps");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const workEmail = contacts.find((c) => c.type === "work")?.email.trim();
      if (!workEmail) {
        setError("Work email is required to onboard an employee.");
        return;
      }

      const validation = await employeeService.validate(empId, workEmail);
      if (validation.data.emp_id_exists) {
        setError("Employee ID already exists. Please refresh and try again.");
        return;
      }
      if (validation.data.work_email_exists) {
        setError("Work email already exists. Please use a different email.");
        return;
      }

      const onboardingData = {
        emp_id: empId,
        full_name: fullName.trim(),
        rbm_email: workEmail,
        dob: dob || null,
        gender: gender || null,
        doj: doj || null,
        contacts: contacts.map((contact) => ({
          type: contact.type,
          email: contact.email.trim() || undefined,
          phone: contact.phone.trim() || undefined,
          address: contact.address.trim() || undefined,
        })),
        skills: skills.map((skill) => ({
          skill_id: skill.skill_id,
          proficiency_level: skill.proficiency_level,
          years_experience: skill.years_experience,
        })),
        education: education.map((edu) => ({
          qualification: edu.qualification.trim() || undefined,
          specialization: edu.specialization.trim() || undefined,
          institution: edu.institution.trim() || undefined,
          year_completed: edu.year_completed
            ? parseInt(edu.year_completed)
            : null,
        })),
        availability: {
          availability_pct: availabilityPct,
          effective_from: effectiveFrom,
        },
        finance:
          bankDetails || taxId
            ? {
                bank_details: bankDetails,
                tax_id: taxId,
              }
            : null,
      };

      await employeeService.onboard(onboardingData);

      // Get next employee ID for reset
      const response = await apiClient.get<EmployeeListEntry[]>(
        "/employees/employees",
      );
      const list = response.data ?? [];
      const nextNumber = getNextEmployeeNumber(list);
      const nextId = formatEmployeeId(nextNumber);

      setSuccess(`Employee ${empId} successfully onboarded across all modules`);

      // Reset form with new ID
      setEmpId(nextId);
      setFullName("");
      setDepartmentId("");
      setRoleId("");
      setDob("");
      setGender("");
      setDoj("");
      setContacts([{ type: "work", email: "", phone: "", address: "" }]);
      setSkills([]);
      setEducation([]);
      setAvailabilityPct(100);
      setEffectiveFrom(getTodayDate());
      setManagerId("");
      setLocationId("");
      setBankDetails("");
      setTaxId("");
      setCurrentStep(1);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create employee. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="create-employee-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading employee data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-employee-container">
      <div className="create-employee-header">
        <h1>Create New Employee</h1>
        <p>
          Complete the onboarding process by filling in all required information
          across the following steps.
        </p>
      </div>

      {/* Stepper Navigation */}
      <div className="employee-stepper">
        <div className={`stepper-step ${currentStep >= 1 ? "active" : ""}`}>
          <div className="step-indicator">1</div>
          <div className="step-label">Core Profile</div>
          <div className="step-description">Basic Information</div>
        </div>
        <div className={`stepper-step ${currentStep >= 2 ? "active" : ""}`}>
          <div className="step-indicator">2</div>
          <div className="step-label">Skills & Contacts</div>
          <div className="step-description">Qualifications & Contacts</div>
        </div>
        <div className={`stepper-step ${currentStep >= 3 ? "active" : ""}`}>
          <div className="step-indicator">3</div>
          <div className="step-label">Deployment</div>
          <div className="step-description">Utilization & Assignment</div>
        </div>
        <div className={`stepper-step ${currentStep >= 4 ? "active" : ""}`}>
          <div className="step-indicator">4</div>
          <div className="step-label">Financial</div>
          <div className="step-description">Restricted Data</div>
        </div>
      </div>

      {/* Error & Success Messages */}
      {error && (
        <div
          className="tickets-empty-state"
          style={{
            color: "var(--error)",
            marginBottom: "20px",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
            borderColor: "var(--error)",
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="tickets-empty-state"
          style={{
            color: "var(--success)",
            marginBottom: "20px",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            borderColor: "var(--success)",
          }}
        >
          <span className="status-badge active" style={{ marginRight: "8px" }}>
            Success
          </span>
          {success}
        </div>
      )}

      <form className="employee-form-container" onSubmit={handleSubmit}>
        {/* Step 1: Core Profile */}
        <div className={`form-section ${currentStep === 1 ? "active" : ""}`}>
          <div className="section-header">
            <h2>
              <span className="section-icon">👤</span> Core Employee Profile
            </h2>
            <p className="section-subtitle">
              Enter basic employee information and department assignment
            </p>
          </div>
          <div className="section-content">
            <div className="form-grid">
              <div className="form-field auto-generated-field">
                <label>Employee ID</label>
                <input
                  type="text"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="RBM-0001"
                />
              </div>

              <div className="form-field">
                <label>Full Name *</label>
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>Department *</label>
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                  required
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Role *</label>
                <select
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  required
                >
                  <option value="">Select role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Date of Birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                />
              </div>

              <div className="form-field">
                <label>Gender</label>
                <select
                  value={gender}
                  onChange={(event) => setGender(event.target.value)}
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-field">
                <label>Date of Joining</label>
                <input
                  type="date"
                  value={doj}
                  onChange={(event) => setDoj(event.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                marginTop: "20px",
              }}
            >
              Employee status will be set to <strong>Onboarding</strong>{" "}
              automatically.
            </div>
          </div>
        </div>

        {/* Step 2: Skills & Contacts */}
        <div className={`form-section ${currentStep === 2 ? "active" : ""}`}>
          <div className="section-header">
            <h2>
              <span className="section-icon">🎓</span> Skills & Contact
              Information
            </h2>
            <p className="section-subtitle">
              Add employee skills and contact details
            </p>
          </div>
          <div className="section-content">
            {/* Skills Matrix */}
            <div className="dynamic-section">
              <div className="dynamic-header">
                <h3>Skills Matrix</h3>
                <div className="section-info">
                  {skills.length} skill(s) added
                </div>
              </div>

              <div className="skills-matrix">
                {/* Skill Search and Add */}
                <div className="skill-select">
                  <div className="searchable-dropdown">
                    <input
                      type="text"
                      placeholder="Search skills..."
                      value={skillSearch}
                      onChange={(e) => {
                        setSkillSearch(e.target.value);
                        setShowSkillDropdown(true);
                      }}
                      onFocus={() => setShowSkillDropdown(true)}
                    />
                    {showSkillDropdown && filteredSkills.length > 0 && (
                      <div className="dropdown-options">
                        {filteredSkills.map((skill) => (
                          <div
                            key={skill.id}
                            className="dropdown-option"
                            onClick={() => void addSkill(skill.id, "Junior", 1)}
                          >
                            {skill.name}{" "}
                            <span style={{ color: "var(--text-tertiary)" }}>
                              ({skill.category})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Added Skills List */}
                {skills.map((skillItem, index) => {
                  const skill = availableSkills.find(
                    (s) => s.id === skillItem.skill_id,
                  );
                  return (
                    <div key={skillItem.skill_id} className="skill-item">
                      <div>
                        <strong>{skill?.name}</strong>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {skill?.category}
                        </div>
                      </div>

                      <div className="proficiency-selector">
                        {(["Junior", "Mid", "Senior"] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`proficiency-badge ${level.toLowerCase()} ${skillItem.proficiency_level === level ? "selected" : ""}`}
                            onClick={() =>
                              setSkills(
                                skills.map((s) =>
                                  s.skill_id === skillItem.skill_id
                                    ? { ...s, proficiency_level: level }
                                    : s,
                                ),
                              )
                            }
                          >
                            {level}
                          </button>
                        ))}
                      </div>

                      <div className="years-input">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={skillItem.years_experience}
                          onChange={(e) =>
                            updateSkillYears(
                              skillItem.skill_id,
                              parseInt(e.target.value) || 0,
                            )
                          }
                          placeholder="Years"
                        />
                      </div>

                      <button
                        type="button"
                        className="remove-contact-button"
                        onClick={() => removeSkill(skillItem.skill_id)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Education History */}
            <div className="dynamic-section">
              <div className="dynamic-header">
                <h3>Education History</h3>
                <button
                  type="button"
                  className="add-item-button"
                  onClick={addEducation}
                >
                  + Add Education
                </button>
              </div>

              <div className="education-list">
                {education.map((edu, index) => (
                  <div key={index} className="education-item">
                    <input
                      type="text"
                      placeholder="Qualification (e.g., B.Tech, MBA)"
                      value={edu.qualification}
                      onChange={(e) =>
                        updateEducation(index, "qualification", e.target.value)
                      }
                    />
                    <input
                      type="text"
                      placeholder="Specialization"
                      value={edu.specialization}
                      onChange={(e) =>
                        updateEducation(index, "specialization", e.target.value)
                      }
                    />
                    <input
                      type="text"
                      placeholder="Institution"
                      value={edu.institution}
                      onChange={(e) =>
                        updateEducation(index, "institution", e.target.value)
                      }
                    />
                    <input
                      type="text"
                      placeholder="Year"
                      value={edu.year_completed}
                      onChange={(e) =>
                        updateEducation(index, "year_completed", e.target.value)
                      }
                      className="year-input"
                    />
                    <button
                      type="button"
                      className="remove-contact-button"
                      onClick={() => removeEducation(index)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Matrix */}
            <div className="dynamic-section">
              <div className="dynamic-header">
                <h3>Contact Information</h3>
                <button
                  type="button"
                  className="add-item-button"
                  onClick={addContact}
                >
                  + Add Contact
                </button>
              </div>

              <div className="contact-matrix">
                {contacts.map((contact, index) => (
                  <div key={index} className="contact-card">
                    <div className="contact-card-header">
                      <select
                        value={contact.type}
                        onChange={(e) =>
                          updateContact(index, "type", e.target.value as any)
                        }
                        className="contact-type-badge"
                        style={{
                          padding: "4px 12px",
                          borderRadius: "20px",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        <option value="work">Work Contact</option>
                        <option value="personal">Personal Contact</option>
                        <option value="emergency">Emergency Contact</option>
                      </select>
                      <button
                        type="button"
                        className="remove-contact-button"
                        onClick={() => removeContact(index)}
                        disabled={contacts.length === 1}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="contact-fields-grid">
                      <div className="form-field">
                        <label>Email *</label>
                        <input
                          type="email"
                          placeholder="email@example.com"
                          value={contact.email}
                          onChange={(e) =>
                            updateContact(index, "email", e.target.value)
                          }
                          required={contact.type === "work"}
                        />
                      </div>

                      <div className="form-field">
                        <label>Phone</label>
                        <input
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={contact.phone}
                          onChange={(e) =>
                            updateContact(index, "phone", e.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>Address</label>
                        <input
                          type="text"
                          placeholder="Full address"
                          value={contact.address}
                          onChange={(e) =>
                            updateContact(index, "address", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Utilization & Deployment */}
        <div className={`form-section ${currentStep === 3 ? "active" : ""}`}>
          <div className="section-header">
            <h2>
              <span className="section-icon">📊</span> Utilization & Deployment
            </h2>
            <p className="section-subtitle">
              Set availability and initial assignment details
            </p>
          </div>
          <div className="section-content">
            <div className="utilization-grid">
              <div className="availability-card">
                <div className="availability-header">
                  <div className="availability-icon">📅</div>
                  <div>
                    <h3 style={{ margin: 0 }}>Availability Tracker</h3>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-tertiary)",
                        margin: "4px 0 0 0",
                      }}
                    >
                      Current utilization percentage
                    </p>
                  </div>
                </div>

                <div className="availability-slider">
                  <div className="slider-container">
                    <div className="availability-percent">
                      {availabilityPct}%
                    </div>
                    <div className="slider-track">
                      <div
                        className="slider-fill"
                        style={{ width: `${availabilityPct}%` }}
                      ></div>
                      <div
                        className="slider-thumb"
                        style={{ left: `${availabilityPct}%` }}
                        onMouseDown={(e) => {
                          const track =
                            e.currentTarget.parentElement?.parentElement;
                          if (!track) return;

                          const handleMove = (moveEvent: MouseEvent) => {
                            const rect = track.getBoundingClientRect();
                            const percent = Math.max(
                              0,
                              Math.min(
                                100,
                                ((moveEvent.clientX - rect.left) / rect.width) *
                                  100,
                              ),
                            );
                            setAvailabilityPct(Math.round(percent));
                          };

                          const handleUp = () => {
                            document.removeEventListener(
                              "mousemove",
                              handleMove,
                            );
                            document.removeEventListener("mouseup", handleUp);
                          };

                          document.addEventListener("mousemove", handleMove);
                          document.addEventListener("mouseup", handleUp);
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="slider-labels">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="form-field">
                  <label>Effective From</label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                  />
                </div>
              </div>

              <div className="deployment-card">
                <h3 style={{ margin: "0 0 20px 0" }}>Initial Assignment</h3>
                <div className="deployment-fields">
                  <div className="form-field">
                    <label>Reporting Manager</label>
                    <select
                      value={managerId}
                      onChange={(e) => setManagerId(e.target.value)}
                    >
                      <option value="">Select manager</option>
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Work Location</label>
                    <select
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                    >
                      <option value="">Select location</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({location.city})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Restricted Data */}
        <div className={`form-section ${currentStep === 4 ? "active" : ""}`}>
          <div className="section-header">
            <h2>
              <span className="section-icon">🔒</span> Restricted Financial Data
            </h2>
            <p className="section-subtitle">
              Confidential banking and tax information (HR Restricted)
            </p>
          </div>
          <div className="section-content">
            <div className="restricted-section">
              <div className="restricted-header">
                <div className="restricted-icon">⚠️</div>
                <h3>Restricted Access Area</h3>
              </div>
              <p className="restricted-note">
                This information is encrypted and accessible only to authorized
                HR personnel.
              </p>

              <div className="form-grid">
                <div className="form-field encrypted-field">
                  <label>Bank Account Details</label>
                  <input
                    type="text"
                    placeholder="Enter encrypted bank details"
                    value={bankDetails}
                    onChange={(e) => setBankDetails(e.target.value)}
                  />
                </div>

                <div className="form-field encrypted-field">
                  <label>Tax Identification Number</label>
                  <input
                    type="text"
                    placeholder="Enter encrypted tax ID"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-tertiary)",
                  marginTop: "20px",
                  padding: "12px",
                  backgroundColor: "rgba(0,0,0,0.02)",
                  borderRadius: "8px",
                }}
              >
                <strong>Note:</strong> All financial data is encrypted at rest
                and in transit. Access logs are maintained for audit purposes.
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <div className="stepper-buttons">
            {currentStep > 1 && (
              <button
                type="button"
                className="previous-button"
                onClick={goToPreviousStep}
                disabled={isSubmitting}
              >
                ← Previous
              </button>
            )}

            {currentStep < totalSteps ? (
              <button
                type="button"
                className="next-button"
                onClick={goToNextStep}
                disabled={
                  (currentStep === 1 && !isStep1Valid) ||
                  (currentStep === 2 && !isStep2Valid) ||
                  (currentStep === 3 && !isStep3Valid)
                }
              >
                Next Step →
              </button>
            ) : (
              <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div
                      className="spinner"
                      style={{
                        width: "16px",
                        height: "16px",
                        borderWidth: "2px",
                      }}
                    ></div>
                    Creating Employee...
                  </>
                ) : (
                  "Create Employee"
                )}
              </button>
            )}
          </div>

          <div className="progress-info">
            <span>
              Step {currentStep} of {totalSteps}
            </span>
            <span style={{ color: "var(--text-quaternary)" }}>•</span>
            <span>
              {Math.round((currentStep / totalSteps) * 100)}% Complete
            </span>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateEmployee;
