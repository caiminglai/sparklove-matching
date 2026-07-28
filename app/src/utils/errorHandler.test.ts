/**
 * errorHandler 单元测试
 * 测试：handleApiError 的错误分类逻辑、safeAsync 的成功/失败包装
 * 策略：在 Node 环境中，mock 全局 alert 以捕获 showError 的调用
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock 全局 alert（Node 环境没有 alert）
const alertMock = vi.fn();
beforeEach(() => {
  alertMock.mockClear();
  globalThis.alert = alertMock;
});

describe('handleApiError', () => {
  it('AbortError 显示超时提示', async () => {
    const { handleApiError } = await import('./errorHandler');
    const err = new Error('test');
    err.name = 'AbortError';
    handleApiError(err);
    expect(alertMock).toHaveBeenCalledWith('请求超时，请检查网络连接');
  });

  it('fetch 相关网络错误', async () => {
    const { handleApiError } = await import('./errorHandler');
    handleApiError(new Error('Failed to fetch'));
    expect(alertMock).toHaveBeenCalledWith('网络连接失败，请检查网络');
  });

  it('network 小写关键字错误', async () => {
    const { handleApiError } = await import('./errorHandler');
    handleApiError(new Error('network error'));
    expect(alertMock).toHaveBeenCalledWith('网络连接失败，请检查网络');
  });

  it('普通 Error 显示 message', async () => {
    const { handleApiError } = await import('./errorHandler');
    handleApiError(new Error('自定义错误'));
    expect(alertMock).toHaveBeenCalledWith('自定义错误');
  });

  it('非 Error 类型使用 fallback', async () => {
    const { handleApiError } = await import('./errorHandler');
    handleApiError('string error', '默认提示');
    expect(alertMock).toHaveBeenCalledWith('默认提示');
  });

  it('默认 fallback 消息', async () => {
    const { handleApiError } = await import('./errorHandler');
    handleApiError(42);
    expect(alertMock).toHaveBeenCalledWith('操作失败，请稍后重试');
  });
});

describe('safeAsync', () => {
  it('成功时返回结果', async () => {
    const { safeAsync } = await import('./errorHandler');
    const result = await safeAsync(async () => 42);
    expect(result).toBe(42);
  });

  it('失败时返回 null，Error 类型显示 error.message', async () => {
    const { safeAsync } = await import('./errorHandler');
    const result = await safeAsync(async () => { throw new Error('boom'); }, '出错了');
    expect(result).toBeNull();
    // Error 实例走 error.message 而非 fallbackMessage
    expect(alertMock).toHaveBeenCalledWith('boom');
  });

  it('非 Error 类型使用 fallback', async () => {
    const { safeAsync } = await import('./errorHandler');
    const result = await safeAsync(async () => { throw 'string error'; }, '操作失败');
    expect(result).toBeNull();
    expect(alertMock).toHaveBeenCalledWith('操作失败');
  });
});
