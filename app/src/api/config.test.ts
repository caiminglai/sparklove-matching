/**
 * API 配置工具函数单元测试
 * 测试：normalizeAvatarUrl 头像路径规范化、getBasePath 基础路径获取、安全请求
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock window.location
const mockLocation = {
  pathname: '/jzxr/',
};

beforeEach(() => {
  // 设置全局 window.location
  Object.defineProperty(globalThis, 'window', {
    value: { location: mockLocation },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getBasePath', () => {
  // 动态导入以使用 mock 的 window
  it('jzxr 子路径返回 /jzxr', async () => {
    mockLocation.pathname = '/jzxr/users';
    const { getBasePath } = await import('./config');
    expect(getBasePath()).toBe('/jzxr');
  });

  it('根路径部署返回空字符串', async () => {
    mockLocation.pathname = '/users';
    const { getBasePath } = await import('./config');
    expect(getBasePath()).toBe('');
  });

  it('首页路径返回 /jzxr', async () => {
    mockLocation.pathname = '/jzxr';
    const { getBasePath } = await import('./config');
    expect(getBasePath()).toBe('/jzxr');
  });
});

describe('normalizeAvatarUrl', () => {
  it('null 返回 null', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl(null)).toBeNull();
  });

  it('undefined 返回 null', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl(undefined)).toBeNull();
  });

  it('空字符串返回 null', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('')).toBeNull();
  });

  it('完整 http URL 原样返回', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('https://example.com/avatar.jpg')).toBe('https://example.com/avatar.jpg');
  });

  it('data: URI 原样返回', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('/uploads/avatars/ 路径添加 basePath', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('/uploads/avatars/test.jpg')).toBe('/jzxr/uploads/avatars/test.jpg');
  });

  it('/avatars/ 路径添加 basePath', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('/avatars/test.jpg')).toBe('/jzxr/avatars/test.jpg');
  });

  it('纯文件名自动补全路径', async () => {
    mockLocation.pathname = '/jzxr';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('test.jpg')).toBe('/jzxr/uploads/avatars/test.jpg');
  });

  it('根路径部署时不添加前缀', async () => {
    mockLocation.pathname = '/users';
    const { normalizeAvatarUrl } = await import('./config');
    expect(normalizeAvatarUrl('/uploads/avatars/test.jpg')).toBe('/uploads/avatars/test.jpg');
    expect(normalizeAvatarUrl('test.jpg')).toBe('/uploads/avatars/test.jpg');
  });
});

describe('createSecureRequest', () => {
  it('非法端点抛出错误', async () => {
    mockLocation.pathname = '/jzxr';
    const { createSecureRequest } = await import('./config');
    expect(() => createSecureRequest('../etc/passwd')).toThrow('Invalid endpoint');
    expect(() => createSecureRequest('<script>')).toThrow('Invalid endpoint');
  });
});
