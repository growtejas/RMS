"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";

import { HrEmptyState } from "@/components/hr/HrEmptyState";
import { HrPaginationBar } from "@/components/hr/HrPaginationBar";
import { HrToolbarCard } from "@/components/hr/HrToolbarCard";
import { useHrEmployeesAggregateQuery } from "@/hooks/hr/use-hr-queries";

const PAGE_SIZE = 15;

const EmployeeList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);

  const employeesQuery = useHrEmployeesAggregateQuery(true);
  const employeeRows = employeesQuery.data;
  const isLoading = employeesQuery.isPending;
  const error =
    employeesQuery.error instanceof Error
      ? employeesQuery.error.message
      : employeesQuery.isError
        ? "Failed to load employees"
        : null;

  const statusOptions = useMemo(() => {
    const employees = employeeRows ?? [];
    return Array.from(new Set(employees.map((emp) => emp.status))).filter(
      Boolean,
    );
  }, [employeeRows]);

  const departmentOptions = useMemo(() => {
    const employees = employeeRows ?? [];
    return Array.from(new Set(employees.map((emp) => emp.department))).filter(
      (dept) => dept && dept !== "—",
    );
  }, [employeeRows]);

  const filteredEmployees = useMemo(() => {
    const employees = employeeRows ?? [];
    return employees.filter((emp) => {
      if (statusFilter && emp.status !== statusFilter) return false;
      if (departmentFilter && emp.department !== departmentFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        return (
          emp.name.toLowerCase().includes(query) ||
          emp.empId.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [employeeRows, statusFilter, departmentFilter, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, departmentFilter]);

  const pagedEmployees = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEmployees.slice(start, start + PAGE_SIZE);
  }, [filteredEmployees, page]);

  return (
    <>
      <HrToolbarCard>
        <div className="log-filters">
          <div className="filter-group">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name or employee ID..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div className="filter-grid">
            <div className="filter-item">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <label>Department</label>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="">All</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </HrToolbarCard>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Skills</th>
              <th>Status</th>
              <th>Profile</th>
            </tr>
          </thead>

          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5}>
                  <div className="tickets-empty-state">Loading employees…</div>
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

            {!isLoading && !error && filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6">
                    <HrEmptyState
                      icon={Users}
                      title="No employees found"
                      description="Try adjusting filters or your search keywords."
                    />
                  </td>
                </tr>
              )}

            {!isLoading &&
              !error &&
              pagedEmployees.map((emp) => (
                <tr key={emp.empId}>
                  <td>
                    <strong>{emp.name}</strong>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {emp.empId}
                    </div>
                  </td>

                  <td>{emp.department}</td>

                  <td>{emp.skillsCount}</td>

                  <td>
                    <span
                      className={`status-badge ${
                        emp.status === "Active" ? "active" : "inactive"
                      }`}
                    >
                      {emp.status}
                    </span>
                  </td>

                  <td>
                    {typeof emp.profileComplete === "number"
                      ? `${emp.profileComplete}%`
                      : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {!isLoading && !error && filteredEmployees.length > 0 && (
          <div className="mt-4 px-1">
            <HrPaginationBar
              page={page}
              pageSize={PAGE_SIZE}
              total={filteredEmployees.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default EmployeeList;
