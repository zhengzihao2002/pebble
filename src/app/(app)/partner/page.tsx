import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PartnerPage() {
  redirect('/partner/dashboard');
}
