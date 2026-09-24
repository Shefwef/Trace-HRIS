'use client';
import { useState, useEffect, useMemo } from 'react';
import { Check, X, Pencil, Plus, Trash2, Paperclip, Info } from 'lucide-react';
import { avatarColorFor, initials } from '@/lib/session';
import {
  useApproveLeave,
  useLeaveDetail,
  useRejectLeave,
  type LeaveBundleItemSummary,
} from '@/lib/hooks';
import {
  defaultAllocationFor,
  computeDurationFromAllocation,
  slotLabel,
  type AllocationEntry,
  type AllocationSlot,
} from '@/lib/leave';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Field, TextArea, TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { fmtDate, leaveTypeLabel, cx } from '../../lib/utils';
import type { LeaveType } from '../../lib/types';
import './LeaveReviewDrawer.css';

const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

interface Props {
  requestId: string | null;
  onClose: () => void;
}

function summariseItems(items: LeaveBundleItemSummary[]) {
  const perType = items.map((i) => ({ leaveType: i.leaveType, days: i.durationDays }));
  const total = perType.reduce((s, i) => s + i.days, 0);
  return { perType, total };
}

interface TypeBalanceImpact {
  leaveType: LeaveType;
  before: number;
  after: number;
}

/** Build the default allocation for a leave item — prefers the employee's
 *  submitted per-day breakdown, falls back to expanding the range. */
function initialAllocFor(item: LeaveBundleItemSummary): AllocationEntry[] {
  if (item.perDayAllocation && item.perDayAllocation.length > 0) {
    return [...item.perDayAllocation]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date, slot: e.slot as AllocationSlot }));
  }
  return defaultAllocationFor({
    startDate: item.startDate,
    endDate: item.endDate,
    isHalfDay: item.isHalfDay,
    halfDaySlot: item.halfDaySlot,
  });
}

export function LeaveReviewDrawer({ requestId, onClose }: Props) {
  const { data: request } = useLeaveDetail(requestId);
  const approve = useApproveLeave();
  const reject = useRejectLeave();

  const [note, setNote] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Per-item modify state. Keyed by leaveRequest.id so a bundle can have each
  // type modified independently.
  const [itemModify, setItemModify] = useState<Record<string, boolean>>({});
  const [itemAllocs, setItemAllocs] = useState<Record<string, AllocationEntry[]>>({});
  const [itemNewDate, setItemNewDate] = useState<Record<string, string>>({});

  // Build the list of items to iterate — a single-type row becomes a one-item
  // list; a bundle exposes every sibling.
  const items: LeaveBundleItemSummary[] = useMemo(() => {
    if (!request) return [];
    if (request.bundleItems && request.bundleItems.length > 0) return request.bundleItems;
    return [{
      id: request.id,
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      isHalfDay: request.isHalfDay,
      halfDaySlot: request.halfDaySlot,
      durationDays: request.durationDays,
      status: request.status,
      perDayAllocation: request.perDayAllocation,
    }];
  }, [request]);

  // Seed per-item allocation state whenever the request changes (opening a
  // new row or a refetch).
  useEffect(() => {
    if (!request) return;
    const nextAllocs: Record<string, AllocationEntry[]> = {};
    for (const it of items) nextAllocs[it.id] = initialAllocFor(it);
    setItemAllocs(nextAllocs);
    setItemModify({});
    setItemNewDate({});
  }, [request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!requestId) {
      setNote('');
      setRejectReason('');
      setShowApprove(false);
      setShowReject(false);
    }
  }, [requestId]);

  // Effective duration per item: modified allocation length, else the item's
  // original durationDays.
  const durationFor = useMemo(() => {
    return (itemId: string): number => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return 0;
      if (itemModify[itemId] && itemAllocs[itemId]) {
        return computeDurationFromAllocation(itemAllocs[itemId]);
      }
      return item.durationDays;
    };
  }, [items, itemModify, itemAllocs]);

  const totalRequested = useMemo(
    () => items.reduce((s, i) => s + durationFor(i.id), 0),
    [items, durationFor],
  );

  // Balance impact per leave type — sums every pending item's modified (or
  // original) duration against its own balance.
  const balanceImpact: TypeBalanceImpact[] = useMemo(() => {
    if (!request || !request.balancePreview) return [];
    const bp = request.balancePreview;
    const beforeOf = (t: LeaveType) =>
      t === 'CASUAL' ? bp.casualLeft : t === 'SICK' ? bp.sickLeft : bp.replacementLeft;

    const perType = new Map<LeaveType, number>();
    for (const it of items) {
      if (it.status !== 'PENDING') continue;
      perType.set(it.leaveType, (perType.get(it.leaveType) ?? 0) + durationFor(it.id));
    }
    return [...perType.entries()].map(([leaveType, deduct]) => ({
      leaveType,
      before: beforeOf(leaveType),
      after: beforeOf(leaveType) - deduct,
    }));
  }, [request, items, durationFor]);

  if (!requestId || !request) {
    return <Drawer open={!!requestId} onClose={onClose}>{null}</Drawer>;
  }

  const employee = request.employee;
  if (!employee) return null;

  const isBundle = items.length > 1;
  const calc = summariseItems(items);

  const earliestStart = items.reduce((min, i) => (i.startDate < min ? i.startDate : min), items[0].startDate);
  const latestEnd     = items.reduce((max, i) => (i.endDate > max ? i.endDate : max), items[0].endDate);

  const empInitials = initials(employee.fullName);
  const empColor = avatarColorFor(employee.id);

  // Any per-item edit that actually changes the row.
  const anyItemModified = items.some((it) => {
    if (!itemModify[it.id]) return false;
    return durationFor(it.id) !== it.durationDays
      || (itemAllocs[it.id]?.length ?? 0) !== it.durationDays
      || (itemAllocs[it.id]?.some((e) => e.slot !== 'FULL') ?? false);
  });

  function updateSlot(itemId: string, idx: number, slot: AllocationSlot) {
    setItemAllocs((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map((e, i) => (i === idx ? { ...e, slot } : e)),
    }));
  }
  function removeEntry(itemId: string, idx: number) {
    setItemAllocs((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((_, i) => i !== idx),
    }));
  }
  function addEntry(itemId: string, date: string) {
    if (!date) return;
    setItemAllocs((prev) => {
      const cur = prev[itemId] ?? [];
      if (cur.some((e) => e.date === date)) return prev;
      return {
        ...prev,
        [itemId]: [...cur, { date, slot: 'FULL' as AllocationSlot }].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
    });
    setItemNewDate((prev) => ({ ...prev, [itemId]: '' }));
  }

  // Submit payload: send bundleAllocations for every modified item so the
  // server applies each item's edits independently.
  function buildBundleAllocations(): Record<string, AllocationEntry[]> | undefined {
    const map: Record<string, AllocationEntry[]> = {};
    for (const it of items) {
      if (itemModify[it.id]) map[it.id] = itemAllocs[it.id] ?? [];
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }

  const targetItem = items.find((i) => i.id === request.id) ?? items[0];

  return (
    <>
      <Drawer
        open={!!requestId}
        onClose={onClose}
        title="Request details"
        subtitle={`Submitted ${fmtDate(request.createdAt, 'd MMM yyyy · h:mm a')}`}
      >
        <div className="lrd">
          {/* Employee header */}
          <div className="lrd-emp">
            <Avatar
              initials={empInitials}
              color={empColor}
              size="lg"
              imageUrl={employee.avatarUrl}
              alt={employee.fullName}
            />
            <div>
              <div className="lrd-emp-name">{employee.fullName}</div>
              <div className="lrd-emp-role">
                {employee.designation ?? ''}
                {employee.designation && employee.department ? ' · ' : ''}
                {employee.department ?? ''}
              </div>
              <div className="lrd-emp-id mono">{employee.email}</div>
            </div>
            <div className="lrd-emp-status">
              <Badge variant={request.status === 'PENDING' ? 'warning' : request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'default'}>
                {request.status === 'PENDING' ? 'Pending approval' : request.status.toLowerCase()}
              </Badge>
            </div>
          </div>

          {/* Request details */}
          <div className="lrd-facts">
            <div className="lrd-fact">
              <span className="lrd-fact-label">Request type</span>
              <span className="lrd-fact-value">
                {isBundle
                  ? <>Combined leave request <span className="lrd-fact-sub">({items.length} types)</span></>
                  : leaveTypeLabel(request.leaveType)
                }
              </span>
            </div>
            <div className="lrd-fact">
              <span className="lrd-fact-label">Start date</span>
              <span className="lrd-fact-value">{fmtDate(earliestStart, 'd MMM yyyy')}</span>
            </div>
            <div className="lrd-fact">
              <span className="lrd-fact-label">End date</span>
              <span className="lrd-fact-value">{fmtDate(latestEnd, 'd MMM yyyy')}</span>
            </div>
            <div className="lrd-fact">
              <span className="lrd-fact-label">Reason</span>
              <span className="lrd-fact-value">{request.reason}</span>
            </div>
            {request.description && (
              <div className="lrd-fact">
                <span className="lrd-fact-label">Description</span>
                <span className="lrd-fact-value lrd-fact-multiline">{request.description}</span>
              </div>
            )}
            {request.attachmentUrl && (
              <div className="lrd-fact">
                <span className="lrd-fact-label">Attachment</span>
                <a href={request.attachmentUrl} target="_blank" rel="noopener noreferrer" className="lrd-attach">
                  <Paperclip size={14} /> View attachment
                </a>
              </div>
            )}
          </div>

          {/* Leave calculation */}
          <div className="lrd-card">
            <div className="lrd-card-title">Leave calculation</div>
            <div className="lrd-calc-rows">
              {items.map((it) => (
                <div key={it.id} className="lrd-calc-row">
                  <span className="lrd-calc-name">
                    <Badge variant={leaveVariant[it.leaveType]}>{leaveTypeLabel(it.leaveType)}</Badge>
                  </span>
                  <span className="lrd-calc-days">
                    {durationFor(it.id)} {durationFor(it.id) === 1 ? 'day' : 'days'}
                    {itemModify[it.id] && durationFor(it.id) !== it.durationDays && (
                      <span className="lrd-calc-was"> (was {it.durationDays})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="lrd-calc-total">
              <span>Total requested</span>
              <strong>{totalRequested} {totalRequested === 1 ? 'day' : 'days'}</strong>
            </div>
            {isBundle && (
              <div className="lrd-info-note">
                <Info size={12} /> Each leave type is deducted from its own balance.
              </div>
            )}
          </div>

          {/* Modify allocation — per item */}
          {request.status === 'PENDING' && (
            <div className="lrd-card">
              <div className="lrd-card-title">Modify allocation</div>
              {items.map((it) => (
                <ItemModifyEditor
                  key={it.id}
                  item={it}
                  showTypeHeader={isBundle}
                  modify={!!itemModify[it.id]}
                  alloc={itemAllocs[it.id] ?? []}
                  newDate={itemNewDate[it.id] ?? ''}
                  onToggle={(v) => setItemModify((prev) => ({ ...prev, [it.id]: v }))}
                  onSlot={(idx, slot) => updateSlot(it.id, idx, slot)}
                  onRemove={(idx) => removeEntry(it.id, idx)}
                  onNewDate={(d) => setItemNewDate((prev) => ({ ...prev, [it.id]: d }))}
                  onAdd={() => addEntry(it.id, itemNewDate[it.id] ?? '')}
                />
              ))}
              {anyItemModified && (
                <div className="lrd-info-note">
                  <Info size={12} /> Add a short note below explaining what you changed and why.
                </div>
              )}
            </div>
          )}

          {/* Balance impact */}
          {request.status === 'PENDING' && balanceImpact.length > 0 && (
            <div className="lrd-card">
              <div className="lrd-card-title">Balance impact</div>
              <div className="lrd-impact-grid">
                {balanceImpact.map((imp) => (
                  <div
                    key={imp.leaveType}
                    className={cx('lrd-impact', `lrd-impact-${leaveVariant[imp.leaveType]}`, imp.after < 0 && 'lrd-impact-warn')}
                  >
                    <div className="lrd-impact-label">{leaveTypeLabel(imp.leaveType)}</div>
                    <div className="lrd-impact-row">
                      <span className="lrd-impact-side">
                        <strong>{imp.before}</strong>
                        <em>days<br/>before</em>
                      </span>
                      <span className="lrd-impact-arrow">→</span>
                      <span className="lrd-impact-side">
                        <strong>{Math.max(0, imp.after)}</strong>
                        <em>days<br/>after</em>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.status === 'PENDING' && (
            <Field
              label="Note to requester"
              hint={anyItemModified ? 'Required — explain what you changed and why.' : 'Optional — visible to the employee alongside your decision.'}
            >
              <TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Enjoy your break — coverage is confirmed."
                rows={3}
              />
            </Field>
          )}

          {request.status !== 'PENDING' && (
            <div className={cx('lrd-decided', `lrd-decided-${request.status.toLowerCase()}`)}>
              <div className="lrd-decided-title">
                {request.status === 'APPROVED' && `Approved (${targetItem.durationDays} d)`}
                {request.status === 'REJECTED' && 'Rejected'}
                {request.status === 'CANCELLED' && 'Cancelled'}
                {request.reviewedAt && ` · ${fmtDate(request.reviewedAt, 'd MMM yyyy')}`}
              </div>
              {request.adminNote && <div className="lrd-decided-note">&quot;{request.adminNote}&quot;</div>}
            </div>
          )}
        </div>

        {request.status === 'PENDING' && (
          <div className="lrd-actions">
            <Button
              variant="secondary"
              leadingIcon={<X size={16} />}
              onClick={() => setShowReject(true)}
              className="lrd-reject"
            >
              Reject
            </Button>
            <Button
              variant="success"
              leadingIcon={<Check size={16} />}
              onClick={() => setShowApprove(true)}
              disabled={items.some((it) => durationFor(it.id) <= 0)}
              fullWidth
            >
              {isBundle
                ? `Approve request (${totalRequested} d)`
                : anyItemModified
                  ? `Approve (${durationFor(targetItem.id)} d)`
                  : 'Approve request'}
            </Button>
          </div>
        )}
      </Drawer>

      <Modal
        open={showApprove}
        onClose={() => setShowApprove(false)}
        title={isBundle ? 'Approve this combined request?' : (anyItemModified ? 'Approve with adjustments?' : 'Approve this leave request?')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button
              variant="success"
              loading={approve.isPending}
              onClick={() => {
                approve.mutate(
                  {
                    id: request.id,
                    note: note || undefined,
                    bundleAllocations: buildBundleAllocations(),
                  },
                  {
                    onSuccess: () => {
                      setShowApprove(false);
                      onClose();
                    },
                  }
                );
              }}
            >
              Yes, approve
            </Button>
          </>
        }
      >
        {isBundle ? (
          <p>
            This will approve <strong>{employee.fullName}&apos;s</strong> combined request across{' '}
            <strong>{items.length} leave types</strong> ({totalRequested} total day{totalRequested === 1 ? '' : 's'}).
            {anyItemModified && ' Your allocation changes will be applied.'}
          </p>
        ) : anyItemModified ? (
          <p>
            You&apos;re approving <strong>{employee.fullName}&apos;s</strong>{' '}
            {leaveTypeLabel(request.leaveType).toLowerCase()} for{' '}
            <strong>{durationFor(targetItem.id)} day{durationFor(targetItem.id) === 1 ? '' : 's'}</strong> (originally requested {targetItem.durationDays}).
          </p>
        ) : (
          <p>
            This will deduct <strong>{targetItem.durationDays} day{targetItem.durationDays === 1 ? '' : 's'}</strong> from{' '}
            <strong>{employee.fullName}&apos;s</strong> {leaveTypeLabel(request.leaveType).toLowerCase()} balance.
          </p>
        )}
      </Modal>

      <Modal
        open={showReject}
        onClose={() => setShowReject(false)}
        title={isBundle ? 'Reject this combined request?' : 'Reject this leave request'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={rejectReason.trim().length < 4}
              loading={reject.isPending}
              onClick={() => {
                reject.mutate(
                  {
                    id: request.id,
                    note: rejectReason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setShowReject(false);
                      setRejectReason('');
                      onClose();
                    },
                  }
                );
              }}
            >
              Reject request
            </Button>
          </>
        }
      >
        {isBundle && (
          <p style={{ marginBottom: 12 }}>
            All {items.length} leave types in this combined request will be rejected together.
          </p>
        )}
        <Field label="Reason (required)" required hint="Shared with the employee so they understand the decision.">
          <TextArea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Team release week — please pick a different range."
            autoFocus
          />
        </Field>
      </Modal>
    </>
  );
}

// ─── Per-item modify editor ────────────────────────────────

function ItemModifyEditor({
  item, showTypeHeader, modify, alloc, newDate,
  onToggle, onSlot, onRemove, onNewDate, onAdd,
}: {
  item: LeaveBundleItemSummary;
  showTypeHeader: boolean;
  modify: boolean;
  alloc: AllocationEntry[];
  newDate: string;
  onToggle: (v: boolean) => void;
  onSlot: (idx: number, slot: AllocationSlot) => void;
  onRemove: (idx: number) => void;
  onNewDate: (d: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="lrd-item-modify">
      <div className="lrd-item-modify-head">
        {showTypeHeader && (
          <span className="lrd-item-modify-title">
            <Badge variant={leaveVariant[item.leaveType]}>{leaveTypeLabel(item.leaveType)}</Badge>
            <span className="lrd-item-modify-days">{item.durationDays} d requested</span>
          </span>
        )}
        <button
          className={cx('lrd-modify-toggle', modify && 'lrd-modify-toggle-active')}
          onClick={() => onToggle(!modify)}
          type="button"
        >
          <Pencil size={12} />
          {modify ? 'Cancel changes' : 'Modify'}
        </button>
      </div>

      {!modify ? (
        <p className="lrd-alloc-hint">
          Approve as requested — <strong>{item.durationDays} day{item.durationDays === 1 ? '' : 's'}</strong>.
        </p>
      ) : (
        <div className="lrd-alloc-editor">
          {alloc.length === 0 && (
            <div className="lrd-alloc-empty">No days selected. Add a date below.</div>
          )}
          {alloc.map((entry, i) => (
            <div key={entry.date + i} className="lrd-alloc-row">
              <span className="lrd-alloc-date">{fmtDate(entry.date, 'EEE, d MMM')}</span>
              <select
                className="lrd-alloc-select"
                value={entry.slot}
                onChange={(e) => onSlot(i, e.target.value as AllocationSlot)}
              >
                <option value="FULL">{slotLabel('FULL')}</option>
                <option value="HALF_MORNING">{slotLabel('HALF_MORNING')}</option>
                <option value="HALF_AFTERNOON">{slotLabel('HALF_AFTERNOON')}</option>
              </select>
              <button
                className="lrd-alloc-remove"
                onClick={() => onRemove(i)}
                aria-label="Remove day"
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="lrd-alloc-add">
            <TextInput
              type="date"
              value={newDate}
              onChange={(e) => onNewDate(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Plus size={14} />}
              disabled={!newDate}
              onClick={onAdd}
            >
              Add day
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
