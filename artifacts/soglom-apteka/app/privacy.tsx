import React from 'react';
import LegalDocumentScreen from '@/components/LegalDocumentScreen';
import { useApp } from '@/context/AppContext';
import { getPrivacyDoc } from '@/lib/legalContent';

export default function PrivacyScreen() {
  const { language } = useApp();
  return <LegalDocumentScreen doc={getPrivacyDoc(language)} />;
}
