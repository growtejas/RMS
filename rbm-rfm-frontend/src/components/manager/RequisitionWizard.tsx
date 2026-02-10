/**
 * ============================================================================
 * RequisitionWizard — 3-Step Requisition Creation Wizard
 * ============================================================================
 *
 * A controlled wizard component for creating requisitions.
 * Follows backend Workflow Engine V2 rules:
 *   - Creates requisition in DRAFT state only
 *   - All transitions via workflow endpoints
 *   - No client-side status mutations
 *   - Backend is single source of truth
 */

import React from "react";
import { Check, Circle } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
}

export interface RequisitionWizardProps {
  steps: WizardStep[];
  activeStep: number;
  children: React.ReactNode;
  onStepClick?: (stepIndex: number) => void;
  allowStepNavigation?: boolean;
  completedSteps?: Set<number>;
}

export interface StepIndicatorProps {
  step: WizardStep;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isClickable: boolean;
  onClick: () => void;
  totalSteps: number;
}

// ============================================================================
// STEP INDICATOR
// ============================================================================

const StepIndicator: React.FC<StepIndicatorProps> = ({
  step,
  index,
  isActive,
  isCompleted,
  isClickable,
  onClick,
  totalSteps,
}) => {
  const stepNumber = index + 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flex: index < totalSteps - 1 ? 1 : "none",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!isClickable}
        aria-current={isActive ? "step" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 16px",
          borderRadius: "8px",
          border: "none",
          background: isActive
            ? "var(--primary-accent, #3b82f6)"
            : isCompleted
              ? "var(--success, #10b981)"
              : "var(--bg-tertiary, #f3f4f6)",
          color: isActive || isCompleted ? "white" : "var(--text-secondary)",
          cursor: isClickable ? "pointer" : "default",
          transition: "all 0.2s ease",
          opacity: isClickable ? 1 : 0.7,
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isActive
              ? "rgba(255,255,255,0.2)"
              : isCompleted
                ? "rgba(255,255,255,0.2)"
                : "var(--bg-secondary, #e5e7eb)",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          {isCompleted ? <Check size={14} /> : stepNumber}
        </span>
        <div style={{ textAlign: "left" }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: "13px",
              whiteSpace: "nowrap",
            }}
          >
            {step.label}
          </div>
          {step.description && (
            <div
              style={{
                fontSize: "11px",
                opacity: 0.8,
                whiteSpace: "nowrap",
              }}
            >
              {step.description}
            </div>
          )}
        </div>
      </button>

      {/* Connector line */}
      {index < totalSteps - 1 && (
        <div
          style={{
            flex: 1,
            height: "2px",
            margin: "0 8px",
            background: isCompleted
              ? "var(--success, #10b981)"
              : "var(--border-subtle, #e5e7eb)",
            transition: "background 0.3s ease",
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// WIZARD NAVIGATION CONTEXT
// ============================================================================

interface WizardContextValue {
  activeStep: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

const WizardContext = React.createContext<WizardContextValue | null>(null);

export function useWizardContext(): WizardContextValue {
  const context = React.useContext(WizardContext);
  if (!context) {
    throw new Error("useWizardContext must be used within RequisitionWizard");
  }
  return context;
}

// ============================================================================
// MAIN WIZARD COMPONENT
// ============================================================================

export const RequisitionWizard: React.FC<RequisitionWizardProps> = ({
  steps,
  activeStep,
  children,
  onStepClick,
  allowStepNavigation = false,
  completedSteps = new Set(),
}) => {
  const handleStepClick = (index: number) => {
    if (!allowStepNavigation || !onStepClick) return;
    // Can only go to completed steps or the next incomplete step
    if (completedSteps.has(index) || index === activeStep + 1) {
      onStepClick(index);
    }
  };

  const contextValue: WizardContextValue = {
    activeStep,
    totalSteps: steps.length,
    isFirstStep: activeStep === 0,
    isLastStep: activeStep === steps.length - 1,
    canGoBack: activeStep > 0,
    canGoForward: activeStep < steps.length - 1,
  };

  return (
    <WizardContext.Provider value={contextValue}>
      <div className="requisition-wizard">
        {/* Step Indicators */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "32px",
            padding: "16px 24px",
            background: "var(--bg-secondary, #f8fafc)",
            borderRadius: "12px",
            border: "1px solid var(--border-subtle, #e2e8f0)",
          }}
        >
          {steps.map((step, index) => (
            <StepIndicator
              key={step.id}
              step={step}
              index={index}
              isActive={index === activeStep}
              isCompleted={completedSteps.has(index)}
              isClickable={
                allowStepNavigation &&
                (completedSteps.has(index) || index <= activeStep)
              }
              onClick={() => handleStepClick(index)}
              totalSteps={steps.length}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="wizard-content">{children}</div>
      </div>
    </WizardContext.Provider>
  );
};

// ============================================================================
// WIZARD STEP CONTENT WRAPPER
// ============================================================================

export interface WizardStepContentProps {
  stepIndex: number;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const WizardStepContent: React.FC<WizardStepContentProps> = ({
  stepIndex,
  children,
  title,
  subtitle,
}) => {
  const { activeStep } = useWizardContext();

  if (stepIndex !== activeStep) {
    return null;
  }

  return (
    <div className="wizard-step-content">
      {(title || subtitle) && (
        <div className="data-manager-header" style={{ marginBottom: "24px" }}>
          {title && <h3>{title}</h3>}
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
};

// ============================================================================
// WIZARD NAVIGATION BUTTONS
// ============================================================================

export interface WizardNavigationProps {
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canProceed: boolean;
  isSubmitting: boolean;
  submitLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  renderExtraButtons?: () => React.ReactNode;
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
  onBack,
  onNext,
  onSubmit,
  canProceed,
  isSubmitting,
  submitLabel = "Submit for Approval",
  nextLabel,
  backLabel = "Back",
  renderExtraButtons,
}) => {
  const { isFirstStep, isLastStep, activeStep, totalSteps } =
    useWizardContext();

  // Generate default next label with step info
  const defaultNextLabel = `Continue to Step ${activeStep + 2}`;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: "32px",
        paddingTop: "24px",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <button
        type="button"
        className="action-button"
        onClick={onBack}
        disabled={isFirstStep}
        style={{
          opacity: isFirstStep ? 0.5 : 1,
          cursor: isFirstStep ? "not-allowed" : "pointer",
        }}
      >
        ← {backLabel}
      </button>

      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        {renderExtraButtons?.()}

        {!isLastStep ? (
          <button
            type="button"
            className="action-button primary"
            onClick={onNext}
            disabled={!canProceed}
            style={{ minWidth: "160px" }}
          >
            {nextLabel ?? defaultNextLabel} →
          </button>
        ) : (
          <button
            type="button"
            className="action-button primary"
            onClick={onSubmit}
            disabled={!canProceed || isSubmitting}
            style={{
              minWidth: "180px",
              background:
                canProceed && !isSubmitting
                  ? "linear-gradient(135deg, var(--success), #059669)"
                  : "var(--bg-tertiary)",
            }}
          >
            {isSubmitting ? "Submitting..." : submitLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default RequisitionWizard;
