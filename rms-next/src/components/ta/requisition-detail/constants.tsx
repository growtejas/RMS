import React from "react";
import {
  Ban,
  CheckCircle,
  Clock,
  FileText,
  Gift,
  Phone,
  Search,
} from "lucide-react";

export const ITEM_STATUS_ICONS: Record<string, React.ReactNode> = {
  Pending: <Clock size={14} />,
  Sourcing: <Search size={14} />,
  Shortlisted: <FileText size={14} />,
  Interviewing: <Phone size={14} />,
  Offered: <Gift size={14} />,
  Fulfilled: <CheckCircle size={14} />,
  Cancelled: <Ban size={14} />,
};
