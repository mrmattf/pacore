import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

export interface OperatorRequest extends Request {
  user?: {
    id: string;
    email?: string;
    isOperator?: boolean;
    [key: string]: any;
  };
}

/**
 * Express middleware: requires the authenticated user to have is_operator = true in their JWT.
 * Returns 403 if the user is not an operator.
 */
export function requireOperator(req: OperatorRequest, res: Response, next: NextFunction): void {
  if (!req.user?.isOperator) {
    res.status(403).json({ error: 'Operator access required' });
    return;
  }
  next();
}

/**
 * Verifies that operatorId has an entry in operator_customers for orgId.
 * Throws a 403 response error if not found.
 */
export async function assertOperatorOwnsOrg(
  operatorId: string,
  orgId: string,
  db: Pool,
  res: Response,
): Promise<boolean> {
  const result = await db.query(
    'SELECT id FROM operator_customers WHERE operator_id = $1 AND org_id = $2',
    [operatorId, orgId],
  );
  if (result.rows.length === 0) {
    res.status(403).json({ error: 'Access denied — this customer is not assigned to you' });
    return false;
  }
  return true;
}

/**
 * Verifies operator owns the org AND the org is still in concierge mode.
 * Blocks write actions when the customer has transitioned to self_managed.
 */
export async function assertOperatorWriteAccess(
  operatorId: string,
  orgId: string,
  db: Pool,
  res: Response,
): Promise<boolean> {
  const owns = await assertOperatorOwnsOrg(operatorId, orgId, db, res);
  if (!owns) return false;

  const result = await db.query(
    'SELECT management_mode FROM customer_profiles WHERE org_id = $1',
    [orgId],
  );
  if (result.rows[0]?.management_mode === 'self_managed') {
    res.status(403).json({ error: 'This customer is self-managed — operator write access is disabled' });
    return false;
  }
  return true;
}
