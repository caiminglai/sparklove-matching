/**
 * 表单草稿自动保存 Hook（基于 services/draft.service 的白名单落盘）
 *
 * 只做三件事：
 *   1. 表单值变化时按最小间隔（DRAFT_WRITE_INTERVAL_MS）节流写盘，并在最后一次变化后尾随补写一次，
 *      保证「用户停下手」时的内容一定落盘；不引入任何防抖库。
 *   2. 提供 restore()：读取草稿（含 7 天 TTL 清理），命中时记录恢复时间，供页面展示提示与「放弃草稿」入口。
 *   3. 提供 afterSubmit() / discard()：提交成功或用户主动放弃时必须清掉草稿。
 */

import { useEffect, useRef, useState } from 'react';
import {
  DRAFT_WRITE_INTERVAL_MS,
  clearDraft,
  loadDraft,
  saveDraft,
  shouldWriteDraft,
  type DraftFormId,
} from '../services/draft.service';

export interface UseFormDraftResult {
  /** 本次进入页面时是否恢复了草稿（记录草稿的保存时间，null 表示没有恢复过） */
  restoredAt: number | null;
  /** 最近一次成功落盘的时间 */
  lastSavedAt: number | null;
  /** 读取草稿并返回可合并进表单的字段值；无草稿 / 已过期返回 null */
  restore: () => Record<string, string> | null;
  /** 提交成功后调用：清掉草稿 */
  afterSubmit: () => void;
  /** 用户主动放弃草稿：清掉草稿与提示状态 */
  discard: () => void;
}

export function useFormDraft(
  formId: DraftFormId,
  values: Record<string, unknown>,
  enabled: boolean,
): UseFormDraftResult {
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    if (shouldWriteDraft(now, lastWriteRef.current)) {
      lastWriteRef.current = now;
      if (saveDraft(formId, values, now)) setLastSavedAt(now);
    }
    // 尾随补写：处于节流窗口内的最后一次输入也要落盘（values 变化会重置这个定时器）
    const timer = setTimeout(() => {
      const ts = Date.now();
      lastWriteRef.current = ts;
      if (saveDraft(formId, values, ts)) setLastSavedAt(ts);
    }, DRAFT_WRITE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [formId, values, enabled]);

  const restore = () => {
    const draft = loadDraft(formId);
    if (!draft) return null;
    setRestoredAt(draft.savedAt);
    return draft.values;
  };

  const afterSubmit = () => {
    clearDraft(formId);
    setRestoredAt(null);
    setLastSavedAt(null);
    lastWriteRef.current = 0;
  };

  const discard = () => {
    clearDraft(formId);
    setRestoredAt(null);
    setLastSavedAt(null);
    lastWriteRef.current = 0;
  };

  return { restoredAt, lastSavedAt, restore, afterSubmit, discard };
}
