// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider.js';

// React's act() refuses to run without this flag set on the global scope.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mockUserManager } = vi.hoisted(() => {
  return {
    mockUserManager: {
      getUser: vi.fn(),
      events: {
        addUserLoaded: vi.fn(),
        removeUserLoaded: vi.fn(),
        addUserUnloaded: vi.fn(),
        removeUserUnloaded: vi.fn(),
        addSilentRenewError: vi.fn(),
        removeSilentRenewError: vi.fn(),
      },
      signinRedirect: vi.fn(),
      signoutRedirect: vi.fn(),
    },
  };
});

vi.mock('./oidc.js', () => ({ userManager: mockUserManager }));

function Consumer() {
  const { status, accessToken } = useAuth();
  return (
    <>
      <div data-testid="status">{status}</div>
      <div data-testid="token">{accessToken ?? 'null'}</div>
    </>
  );
}

async function renderAuth(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    // Flush the microtask/macrotask queue so the mocked getUser() promise
    // resolves and the resulting setState is applied before we assert.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container, root };
}

function statusOf(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="status"]')?.textContent ?? null;
}

function tokenOf(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="token"]')?.textContent ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserManager.getUser.mockResolvedValue(null);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AuthProvider', () => {
  it('treats an expired stored user as signed-out', async () => {
    mockUserManager.getUser.mockResolvedValue({
      access_token: 'stale-token',
      expired: true,
    } as never);

    const { container } = await renderAuth();

    expect(statusOf(container)).toBe('signed-out');
  });

  it('updates the access token when oidc-client-ts fires addUserLoaded', async () => {
    mockUserManager.getUser.mockResolvedValue({
      access_token: 'old-token',
      expired: false,
    } as never);

    const { container } = await renderAuth();
    expect(tokenOf(container)).toBe('old-token');

    const onUserLoaded = mockUserManager.events.addUserLoaded.mock.calls[0]![0];
    await act(async () => {
      onUserLoaded({ access_token: 'new-token', expired: false });
    });

    // This is the actual bug: without a subscription, the token captured at
    // mount never changes even after the library silently renews it.
    expect(tokenOf(container)).toBe('new-token');
  });

  it('moves to signed-out when addUserUnloaded fires', async () => {
    mockUserManager.getUser.mockResolvedValue({
      access_token: 'tok',
      expired: false,
    } as never);

    const { container } = await renderAuth();
    expect(statusOf(container)).toBe('signed-in');

    const onUserUnloaded = mockUserManager.events.addUserUnloaded.mock.calls[0]![0];
    await act(async () => {
      onUserUnloaded();
    });

    expect(statusOf(container)).toBe('signed-out');
  });

  it('removes all event listeners on unmount', async () => {
    const { root } = await renderAuth();

    const loadedHandler = mockUserManager.events.addUserLoaded.mock.calls[0]![0];
    const unloadedHandler = mockUserManager.events.addUserUnloaded.mock.calls[0]![0];
    const renewErrorHandler = mockUserManager.events.addSilentRenewError.mock.calls[0]![0];

    await act(async () => {
      root.unmount();
    });

    expect(mockUserManager.events.removeUserLoaded).toHaveBeenCalledWith(loadedHandler);
    expect(mockUserManager.events.removeUserUnloaded).toHaveBeenCalledWith(unloadedHandler);
    expect(mockUserManager.events.removeSilentRenewError).toHaveBeenCalledWith(
      renewErrorHandler,
    );
  });
});
