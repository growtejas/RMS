// components/tickets/TicketDetail.tsx
import React, { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Users,
  Target,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileText,
  MessageSquare,
  History,
  Download,
  Printer,
  ExternalLink,
  Shield,
  Lock,
  Eye,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";

interface TicketDetailsProps {
  ticketId?: string | null;
  onBack?: () => void;
}

const TicketDetail: React.FC<TicketDetailsProps> = ({ ticketId, onBack }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const effectiveTicketId = ticketId ?? id;

  // Mock ticket data
  const ticket = {
    id: "1",
    ticketId: "REQ-2024-001",
    projectName: "E-Commerce Platform",
    projectCode: "ECOM-2024",
    projectManager: "Rajesh Kumar",
    requiredSkill: "Python",
    skillLevel: "Senior",
    requiredCount: 2,
    status: "Open",
    assignedTA: "-",
    daysOpen: 15,
    priority: "High",
    hrIndicator: "bench-available",
    aging: "15 days",
    createdAt: "2024-01-01",
    slaHours: 72,
    benchAvailable: 3,

    // Detailed information
    description: `Need 2 Senior Python developers with Django/Flask experience for our new E-commerce platform migration project. 
    Must have experience with microservices architecture and AWS services. 
    Project duration: 6 months with possible extension.`,

    requirements: [
      "5+ years Python experience",
      "Strong Django/Flask framework knowledge",
      "AWS services (EC2, S3, RDS)",
      "Docker & Kubernetes",
      "Microservices architecture",
      "Agile/Scrum methodology",
    ],

    timeline: [
      { date: "2024-01-01", event: "Ticket Created", user: "System" },
      { date: "2024-01-03", event: "Initial Review", user: "HR Team" },
      { date: "2024-01-05", event: "Skills Analysis", user: "HR Analytics" },
    ],

    notes: [
      {
        date: "2024-01-02",
        user: "HR Manager",
        text: "Bench analysis shows 3 available resources with matching skills",
      },
      {
        date: "2024-01-04",
        user: "TA Lead",
        text: "External sourcing initiated for backup candidates",
      },
    ],
  };

  return (
    <div className="admin-content-area">
      {/* Header with Back Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => (onBack ? onBack() : navigate("/hr/tickets"))}
            className="action-button"
          >
            <ArrowLeft size={16} />
            Back to Tickets
          </button>
          <div className="header-title">
            <h1>Ticket Detail</h1>
            <p>Project Resource Requisition - Read Only View</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-500 flex items-center gap-1">
            <Eye size={14} />
            HR Read-Only View
          </div>
          <button className="action-button">
            <Download size={16} />
          </button>
          <button className="action-button">
            <Printer size={16} />
          </button>
        </div>
      </div>

      {/* Ticket Status Banner */}
      <div className="p-4 mb-6 rounded-lg border flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold font-mono">
            {effectiveTicketId ?? ticket.ticketId}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`ticket-status ${ticket.status.toLowerCase().replace(" ", "-")}`}
            >
              {ticket.status}
            </span>
            <span
              className={`priority-indicator priority-${ticket.priority.toLowerCase()}`}
            >
              {ticket.priority} Priority
            </span>
            <span
              className={`aging-indicator ${ticket.daysOpen <= 7 ? "aging-0-7" : ticket.daysOpen <= 30 ? "aging-8-30" : "aging-30-plus"}`}
            >
              {ticket.daysOpen} days open
            </span>
          </div>
        </div>
        <div className="text-sm text-slate-600">
          Created: {ticket.createdAt}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Ticket Details */}
        <div className="lg:col-span-2">
          <div className="master-data-manager">
            <div className="data-manager-header mb-6">
              <h2>Requirement Details</h2>
              <p className="subtitle">
                Complete project resource requirement information
              </p>
            </div>

            {/* Basic Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Project Information
                </label>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Project Name:</span>
                    <span className="font-medium">{ticket.projectName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Project Code:</span>
                    <span className="font-mono">{ticket.projectCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Project Manager:</span>
                    <span className="font-medium">{ticket.projectManager}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Resource Requirements
                </label>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Required Skill:</span>
                    <span className="font-medium">
                      {ticket.requiredSkill} ({ticket.skillLevel})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Required Count:</span>
                    <span className="font-bold text-lg">
                      {ticket.requiredCount} resources
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Assigned TA:</span>
                    <span
                      className={
                        ticket.assignedTA === "-"
                          ? "text-slate-400"
                          : "font-medium"
                      }
                    >
                      {ticket.assignedTA}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Detailed Description
              </label>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-slate-700 whitespace-pre-line">
                  {ticket.description}
                </p>
              </div>
            </div>

            {/* Requirements */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Mandatory Requirements
              </label>
              <div className="space-y-2">
                {ticket.requirements.map((req, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mt-0.5">
                      <CheckCircle size={12} />
                    </div>
                    <span className="text-slate-700">{req}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* HR Indicators & Analysis */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-800">HR Analysis</h3>
                  <p className="text-sm text-blue-700">
                    Internal resource availability assessment
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <CheckCircle size={16} />
                    </div>
                    <div>
                      <div className="font-semibold">Bench Availability</div>
                      <div className="text-sm text-slate-600">
                        Internal resources ready for allocation
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold text-green-600">
                      {ticket.benchAvailable} resources
                    </div>
                    <div className="text-sm text-slate-500">
                      Available with matching skills
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <Clock size={16} />
                    </div>
                    <div>
                      <div className="font-semibold">Onboarding Pipeline</div>
                      <div className="text-sm text-slate-600">
                        Candidates with required skills
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold text-amber-600">
                      2 candidates
                    </div>
                    <div className="text-sm text-slate-500">
                      In final onboarding stage
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Timeline & Notes */}
        <div className="space-y-6">
          {/* Timeline */}
          <div className="audit-log-viewer">
            <div className="viewer-header">
              <h2>Activity Timeline</h2>
              <p className="subtitle">Ticket progression history</p>
            </div>

            <div className="space-y-4 mt-4">
              {ticket.timeline.map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <Calendar size={14} />
                    </div>
                    {idx !== ticket.timeline.length - 1 && (
                      <div className="w-0.5 h-full bg-slate-200 mt-2"></div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{item.event}</div>
                    <div className="text-sm text-slate-500">
                      {item.date} • {item.user}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="audit-log-viewer">
            <div className="viewer-header">
              <h2>Notes & Comments</h2>
              <p className="subtitle">HR and TA communications</p>
            </div>

            <div className="space-y-4 mt-4">
              {ticket.notes.map((note, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">{note.user}</div>
                    <div className="text-xs text-slate-500">{note.date}</div>
                  </div>
                  <p className="text-sm text-slate-700">{note.text}</p>
                </div>
              ))}

              {/* Read-only notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700">
                  <Lock size={14} />
                  <span className="text-sm font-medium">HR Read-Only Mode</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  As HR, you can view but not edit ticket details. Contact TA
                  team for updates.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions for HR */}
          <div className="audit-log-viewer">
            <div className="viewer-header">
              <h2>HR Actions</h2>
              <p className="subtitle">Support activities for this ticket</p>
            </div>

            <div className="space-y-3 mt-4">
              <button className="action-button w-full justify-center text-left">
                <Users size={16} />
                View Bench Resources
              </button>
              <button className="action-button w-full justify-center text-left">
                <Target size={16} />
                Skills Gap Analysis
              </button>
              <button className="action-button w-full justify-center text-left">
                <MessageSquare size={16} />
                Contact TA Team
              </button>
              <button className="action-button primary w-full justify-center">
                <ExternalLink size={16} />
                Update Onboarding Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Trail Footer */}
      <div className="mt-6 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Shield size={14} />
            <span>Audit Trail: This ticket is tracked for compliance</span>
          </div>
          <div>Last viewed by HR: Today, 10:30 AM</div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
