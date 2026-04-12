'use client';

/**
 * ESVA Error Boundary Components
 * ─────────────────────────────
 * React Error Boundaries (must be class components).
 *
 * PART 1: Base ErrorBoundary class
 * PART 2: PageErrorBoundary (full-page with ESVA branding)
 * PART 3: SectionErrorBoundary (inline for calculator/search)
 * PART 4: withErrorBoundary HOC
 */

import React, { Component, type ReactNode, type ErrorInfo, type ComponentType } from 'react';
import { reportError } from '@/lib/logger';

// ─── PART 1: Base ErrorBoundary ─────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      source: 'ErrorBoundary',
      extra: { componentStack: errorInfo.componentStack ?? '' },
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <DefaultFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

function DefaultFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <p className="text-lg font-semibold text-red-600">
        문제가 발생했습니다
      </p>
      {error && (
        <p className="max-w-md text-sm text-gray-500">
          {error.message}
        </p>
      )}
      <button
        type="button"
        onClick={onReset}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        다시 시도
      </button>
    </div>
  );
}

// ─── PART 2: PageErrorBoundary ──────────────────────────────────

function PageFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4"
    >
      <div className="flex flex-col items-center gap-2">
        <span className="text-3xl font-bold tracking-tight text-blue-600">
          ESA
        </span>
        <div className="h-px w-12 bg-gray-300" />
      </div>
      <p className="text-xl font-semibold text-gray-900">
        문제가 발생했습니다
      </p>
      <p className="max-w-sm text-sm text-gray-500">
        페이지를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      {error && process.env.NODE_ENV === 'development' && (
        <pre className="max-w-lg overflow-auto rounded bg-gray-100 p-3 text-xs text-red-700">
          {error.message}
        </pre>
      )}
      <button
        type="button"
        onClick={onReset}
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        다시 시도
      </button>
    </div>
  );
}

export class PageErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      source: 'PageErrorBoundary',
      extra: { componentStack: errorInfo.componentStack ?? '' },
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <PageFallback error={this.state.error} onReset={this.handleReset} />
      );
    }
    return this.props.children;
  }
}

// ─── PART 3: SectionErrorBoundary ───────────────────────────────

function SectionFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-center"
    >
      <p className="text-sm font-medium text-red-800">
        이 섹션을 불러올 수 없습니다
      </p>
      {error && process.env.NODE_ENV === 'development' && (
        <p className="text-xs text-red-600">{error.message}</p>
      )}
      <button
        type="button"
        onClick={onReset}
        className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        다시 시도
      </button>
    </div>
  );
}

export class SectionErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      source: 'SectionErrorBoundary',
      extra: { componentStack: errorInfo.componentStack ?? '' },
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <SectionFallback error={this.state.error} onReset={this.handleReset} />
      );
    }
    return this.props.children;
  }
}

// ─── PART 4: withErrorBoundary HOC ──────────────────────────────

/**
 * HOC to wrap any component with an ErrorBoundary.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  fallback?: ReactNode,
): ComponentType<P> {
  const displayName =
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component';

  function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  return WithErrorBoundary;
}
