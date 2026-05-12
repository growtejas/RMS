# CI Job Failure Report

**Date:** 2026-05-12  
**Job ID:** 75532416663  
**Workflow:** CI  
**Status:** Failed  
**Repository:** growtejas/RMS  
**Commit:** be392c4ea2fe950c6d46900a2c67bdc640fe53e4

## Failure Summary

The CI build failed during the TypeScript compilation phase with a type error in the report filtering logic.

## Error Details

**File:** `src/app/api/reports/_shared.ts`  
**Line:** 48  
**Error Type:** TypeScript Compilation Error

```
Type error: Type 'Set<number>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.
```

### Error Context

```typescript
// Line 48 in src/app/api/reports/_shared.ts
const allowedReqIds = [...scope.requisitionIds];
```

The code attempts to spread a `Set<number>` object into an array using the spread operator (`...`). TypeScript's default compilation settings do not support iterating over `Set` objects in older ECMAScript targets without the `downlevelIteration` flag enabled.

## Root Cause

The `scope.requisitionIds` property is a `Set<number>`, and the spread operator requires either:
1. The `downlevelIteration` compiler flag to be enabled in `tsconfig.json`, OR
2. A TypeScript target of `es2015` or higher

## Recommended Solutions

### Option 1: Enable `downlevelIteration` (Recommended)

Update `tsconfig.json` to include the `downlevelIteration` compiler option:

```json
{
  "compilerOptions": {
    "downlevelIteration": true,
    "target": "es2020",
    "lib": ["es2020", "dom", "dom.iterable"],
    // ... other compiler options
  }
}
```

**Advantages:**
- Handles all Set/Map iterations throughout the codebase
- No code changes required
- Consistent approach if this pattern appears elsewhere

### Option 2: Explicit Array Conversion

Replace the spread operator with `Array.from()` on line 48:

```typescript
const allowedReqIds = Array.from(scope.requisitionIds);
```

**Advantages:**
- No compiler flag changes needed
- More explicit and readable
- Works with any TypeScript target

## Files Affected

- `src/app/api/reports/_shared.ts` - Lines 40-60 (applyInterviewerReportScope function)

## Affected Code Block

```typescript
export async function applyInterviewerReportScope(
  user: ApiUser,
  filters: ReportFilters,
): Promise<ReportFilters> {
  const scope = await getInterviewerScope(user);
  if (!scope.interviewerOnly) {
    return filters;
  }
  const allowedReqIds = [...scope.requisitionIds];  // ← ERROR ON THIS LINE
  if (allowedReqIds.length === 0) {
    return { ...filters, requisitionIds: [-1] };
  }
  if (filters.requisitionIds.length === 0) {
    return { ...filters, requisitionIds: allowedReqIds };
  }
  const allowedSet = new Set(allowedReqIds);
  return {
    ...filters,
    requisitionIds: filters.requisitionIds.filter((id) => allowedSet.has(id)),
  };
}
```

## Next Steps

1. Choose one of the recommended solutions above
2. Apply the fix to the codebase
3. Run the CI pipeline to verify the build passes
4. Commit and push the changes

## Build Log Reference

- **Build Stage:** Production build compilation with type checking
- **Duration:** ~1 minute 36 seconds
- **Exit Code:** 1 (Failure)

The build successfully compiled initially, but failed during the linting and type validity check phase.
