import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageErrorBoundary } from '@/components/ErrorBoundary';

export default function WithNavLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main id="main-content" className="flex flex-1 flex-col">
        <PageErrorBoundary>{children}</PageErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
