'use client';
import { use } from 'react';
import { EmployeeProfilePage } from '@/screens/admin/EmployeeProfile';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EmployeeProfilePage id={id} />;
}
