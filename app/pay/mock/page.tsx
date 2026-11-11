import { notFound } from 'next/navigation';
import MockPay from '@/components/MockPay';
import { mockPaymentsEnabled } from '@/lib/payments';

// Stand-in for the Stripe checkout while no Stripe key is configured (development only).
export const dynamic = 'force-dynamic';

export default async function MockPayPage() {
  if (!(await mockPaymentsEnabled())) notFound();
  return (
    <main className="register">
      <div className="container">
        <MockPay />
      </div>
    </main>
  );
}
