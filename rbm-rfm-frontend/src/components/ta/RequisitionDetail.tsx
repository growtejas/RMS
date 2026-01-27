import React from "react";

interface RequisitionDetailProps {
  requisitionId?: string | null;
  onBack?: () => void;
}

const RequisitionDetail: React.FC<RequisitionDetailProps> = ({
  requisitionId,
  onBack,
}) => {
  return (
    <div className="admin-content-area">
      <div className="manager-header">
        <h2>Requisition Detail</h2>
        <p className="subtitle">Read-only requisition details</p>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <button className="action-button" type="button" onClick={onBack}>
          Back to Requisitions
        </button>
      </div>

      <div className="master-data-manager">
        <div className="data-manager-header">
          <h3>Requisition Summary</h3>
          <p className="subtitle">{requisitionId ?? "REQ-XXXX"}</p>
        </div>
        <div className="data-manager-content">
          <p>
            Details view placeholder for requisition{" "}
            {requisitionId ?? "REQ-XXXX"}.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RequisitionDetail;
