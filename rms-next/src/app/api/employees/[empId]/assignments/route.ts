import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { HttpError } from "@/lib/http/http-error";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import {
  createAssignment,
  listAssignments,
} from "@/lib/services/org-assignment-service";
import { assignmentCreateBody } from "@/lib/validators/org-assignments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { empId: string } };

/** GET /api/employees/{empId}/assignments */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(
      user,
      "HR",
      "Admin",
      "Manager",
      "Employee",
    );
    if (denied) {
      return denied;
    }

    const data = await listAssignments(params.empId);
    return NextResponse.json(data);
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/employees/[empId]/assignments]");
  }
}

/** POST /api/employees/{empId}/assignments */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const parsed = await parseFastapiJsonBody(request, assignmentCreateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    try {
      const data = await createAssignment(params.empId, {
        department_id: parsed.data.department_id,
        manager_id: parsed.data.manager_id,
        location_id: parsed.data.location_id,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
      });
      return NextResponse.json(data);
    } catch (err) {
      if (err instanceof Error && /foreign key|violates foreign key/i.test(err.message)) {
        throw new HttpError(
          400,
          "Invalid department, location, manager, or employee reference",
        );
      }
      throw err;
    }
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/employees/[empId]/assignments]");
  }
}
