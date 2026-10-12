import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from '../db/db.service';

export interface Policy {
  slotStepMin: number;
  minAdvanceMin: number;
  maxAdvanceDays: number;
  holdMin: number;
  autoConfirm: boolean;
  changeDeadlineMin: number;
  reminderOffsetsMin: number[];
}

interface PolicyRow {
  slot_step_min: number;
  min_advance_min: number;
  max_advance_days: number;
  hold_min: number;
  auto_confirm: boolean;
  change_deadline_min: number;
  reminder_offsets_min: number[];
}

function toPolicy(r: PolicyRow): Policy {
  return {
    slotStepMin: r.slot_step_min,
    minAdvanceMin: r.min_advance_min,
    maxAdvanceDays: r.max_advance_days,
    holdMin: r.hold_min,
    autoConfirm: r.auto_confirm,
    changeDeadlineMin: r.change_deadline_min,
    reminderOffsetsMin: r.reminder_offsets_min,
  };
}

@Injectable()
export class PoliciesService {
  constructor(private readonly db: DbService) {}

  async get(client: Queryable = this.db.pool): Promise<Policy> {
    const { rows } = await client.query<PolicyRow>('SELECT * FROM booking_policies WHERE id = 1');
    return toPolicy(rows[0]);
  }

  async update(p: Policy): Promise<Policy> {
    const row = await this.db.one<PolicyRow>(
      `UPDATE booking_policies
          SET slot_step_min = $1, min_advance_min = $2, max_advance_days = $3, hold_min = $4,
              auto_confirm = $5, change_deadline_min = $6, reminder_offsets_min = $7, updated_at = now()
        WHERE id = 1
        RETURNING *`,
      [
        p.slotStepMin,
        p.minAdvanceMin,
        p.maxAdvanceDays,
        p.holdMin,
        p.autoConfirm,
        p.changeDeadlineMin,
        [...new Set(p.reminderOffsetsMin)].sort((a, b) => b - a),
      ],
    );
    return toPolicy(row!);
  }
}
